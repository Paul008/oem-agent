#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import puppeteer from 'puppeteer'

import { launchQaBrowser, readNext, settlePage } from './lib/qa-browser.mjs'

const DEFAULT_PAGE_ID = 'nissan-au-ariya'
const DEFAULT_WORKER_BASE = 'https://oem-agent.adme-dev.workers.dev'
const DEFAULT_DASHBOARD_BASE = 'https://oem-dashboard.pages.dev'
const DEFAULT_DEALER_BASE = 'https://northern-nissan.engagr.com.au'
const DEFAULT_TIMEOUT_MS = 45_000
const DEFAULT_SETTLE_MS = 2_000
const ARTIFACT_ROOT = 'artifacts/model-page-publication'
const IFRAME_HEIGHT_TOLERANCE_PX = 16
const SCREENSHOT_DIMENSION_TOLERANCE_PX = 16
const SCREENSHOT_DIMENSION_TOLERANCE_RATIO = 0.02
const VIEWPORTS = Object.freeze({
  desktop: Object.freeze({ width: 1440, height: 1100, isMobile: false, hasTouch: false }),
  tablet: Object.freeze({ width: 1024, height: 900, isMobile: false, hasTouch: true }),
  mobile: Object.freeze({ width: 390, height: 844, isMobile: true, hasTouch: true }),
})
const CAPTURE_TARGETS = Object.freeze(['editor-candidate', 'direct-body', 'dealer'])
const SAFE_RESPONSE_HEADERS = Object.freeze([
  'cache-control',
  'content-type',
  'etag',
  'x-oem-candidate-revision',
  'x-oem-published-revision',
  'x-oem-page-version',
])
const DOCUMENT_RESOURCE_TYPES = new Set(['document', 'image', 'font', 'stylesheet', 'script'])
const FIXTURE_BODY = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:16px Arial,sans-serif;background:#fff;color:#111}.hero{height:420px;background:linear-gradient(135deg,#d8b17b,#283647);display:grid;place-items:center;color:#fff}.body{padding:32px}.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.card{border:1px solid #ccc;padding:18px}details{margin:20px 0}
</style></head><body data-oem-publication-body="true" data-oem-revision="22"><section class="hero" data-oem-region-id="ride" data-oem-published-renderer="tailwind" data-oem-interaction-kind="none"><h1>Nissan ARIYA</h1></section><main class="body"><details data-oem-region-id="faq" data-oem-published-renderer="clone" data-oem-interaction-kind="accordion"><summary>Range</summary><p>Up to 504 kilometres.</p></details></main></body></html>`

function numericArg(value, option, { min = 0 } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min)
    throw new Error(`${option} must be a number >= ${min}`)
  return parsed
}

function positiveIntegerArg(value, option) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${option} must be a positive integer`)
  return parsed
}

function normalizeBase(value, option) {
  let url
  try {
    url = new URL(value)
  }
  catch {
    throw new Error(`${option} must be an absolute http(s) origin`)
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error(`${option} must use http or https`)
  if (url.username || url.password)
    throw new Error(`${option} must not include credentials`)
  if (url.pathname !== '/' || url.search || url.hash)
    throw new Error(`${option} must be an origin without a path`)
  return url.origin
}

function parsePageId(value) {
  const match = /^([a-z0-9]+)-([a-z]{2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(value)
  if (!match)
    throw new Error('--page-id must use the form oem-country-model')
  return { pageId: value, modelSlug: match[3] }
}

function safeRunId(value) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value))
    throw new Error('--run-id must contain only letters, numbers, dots, underscores, or hyphens')
  return value
}

function deriveUrls({ pageId, modelSlug, workerBase, dashboardBase, dealerBase }) {
  const encodedPageId = encodeURIComponent(pageId)
  return {
    history: `${workerBase}/api/v1/oem-agent/admin/pages/${encodedPageId}/publication/history`,
    candidateHtmlBase: `${workerBase}/api/v1/oem-agent/admin/pages/${encodedPageId}/publication/candidate-html`,
    manifest: `${workerBase}/api/v1/oem-agent/pages/${encodedPageId}/production-manifest`,
    publishedBodyBase: `${workerBase}/api/v1/oem-agent/pages/${encodedPageId}/production-body-html`,
    publish: `${workerBase}/api/v1/oem-agent/admin/pages/${encodedPageId}/publication/publish`,
    rollback: `${workerBase}/api/v1/oem-agent/admin/pages/${encodedPageId}/publication/rollback`,
    editor: `${dashboardBase}/preview/${encodedPageId}`,
    dealer: `${dealerBase}/models/${encodeURIComponent(modelSlug)}`,
  }
}

export function parsePublicationArgs(argv, env = process.env) {
  const options = {
    pageId: DEFAULT_PAGE_ID,
    workerBase: DEFAULT_WORKER_BASE,
    dashboardBase: DEFAULT_DASHBOARD_BASE,
    dealerBase: DEFAULT_DEALER_BASE,
    mutate: false,
    confirmProduction: false,
    publish: false,
    rollback: false,
    rollbackRevision: null,
    viewports: ['desktop', 'tablet', 'mobile'],
    viewportDefinitions: VIEWPORTS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    settleMs: DEFAULT_SETTLE_MS,
    threshold: 0.1,
    maxMismatch: 0.35,
    json: false,
    fixture: false,
    help: false,
    browserExecutable: env.PUPPETEER_EXECUTABLE_PATH || '',
    authorizationEnv: 'OEM_PUBLICATION_AUTHORIZATION',
    runId: env.OEM_PUBLICATION_RUN_ID || `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}Z`,
  }

  let explicitViewports = false
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--') {
      continue
    }
    if (arg === '--page-id') {
      options.pageId = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--worker-base') {
      options.workerBase = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--dashboard-base') {
      options.dashboardBase = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--dealer-base') {
      options.dealerBase = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--viewport') {
      if (!explicitViewports) {
        options.viewports = []
        explicitViewports = true
      }
      options.viewports.push(readNext(argv, index, arg))
      index++
    }
    else if (arg === '--timeout-ms') {
      options.timeoutMs = numericArg(readNext(argv, index, arg), arg, { min: 1 })
      index++
    }
    else if (arg === '--settle-ms') {
      options.settleMs = numericArg(readNext(argv, index, arg), arg)
      index++
    }
    else if (arg === '--threshold') {
      options.threshold = numericArg(readNext(argv, index, arg), arg)
      index++
    }
    else if (arg === '--max-mismatch') {
      options.maxMismatch = numericArg(readNext(argv, index, arg), arg)
      index++
    }
    else if (arg === '--browser-executable') {
      options.browserExecutable = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--authorization-env') {
      options.authorizationEnv = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--run-id') {
      options.runId = readNext(argv, index, arg)
      index++
    }
    else if (arg === '--rollback') {
      options.rollback = true
      options.rollbackRevision = positiveIntegerArg(readNext(argv, index, arg), arg)
      index++
    }
    else if (arg === '--publish') {
      options.publish = true
    }
    else if (arg === '--mutate') {
      options.mutate = true
    }
    else if (arg === '--confirm-production') {
      options.confirmProduction = true
    }
    else if (arg === '--fixture') {
      options.fixture = true
    }
    else if (arg === '--json') {
      options.json = true
    }
    else if (arg === '--help' || arg === '-h') {
      options.help = true
    }
    else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  if (options.publish && options.rollback)
    throw new Error('Choose either --publish or --rollback, not both')
  if ((options.publish || options.rollback) && (!options.mutate || !options.confirmProduction))
    throw new Error('publish or rollback requires --mutate and --confirm-production')
  if (options.mutate && !options.publish && !options.rollback)
    throw new Error('--mutate requires --publish or --rollback REVISION')
  if (options.fixture && options.mutate)
    throw new Error('--fixture cannot be combined with mutation flags')
  if (options.threshold > 1 || options.maxMismatch > 1)
    throw new Error('--threshold and --max-mismatch must be between 0 and 1')
  if (options.viewports.length === 0)
    throw new Error('At least one --viewport is required')
  for (const viewport of options.viewports) {
    if (!VIEWPORTS[viewport])
      throw new Error(`Unknown viewport "${viewport}". Use desktop, tablet, or mobile`)
  }

  const parsedPage = parsePageId(options.pageId)
  options.runId = safeRunId(options.runId)
  options.workerBase = normalizeBase(options.workerBase, '--worker-base')
  options.dashboardBase = normalizeBase(options.dashboardBase, '--dashboard-base')
  options.dealerBase = normalizeBase(options.dealerBase, '--dealer-base')
  options.urls = deriveUrls({
    pageId: parsedPage.pageId,
    modelSlug: parsedPage.modelSlug,
    workerBase: options.workerBase,
    dashboardBase: options.dashboardBase,
    dealerBase: options.dealerBase,
  })
  options.modelSlug = parsedPage.modelSlug
  options.artifactDir = join(ARTIFACT_ROOT, options.runId)
  return options
}

function redactUrl(value) {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    return url.toString()
  }
  catch {
    return String(value || '')
  }
}

function safeResponseHeaders(headersRecord) {
  const headers = {}
  for (const name of SAFE_RESPONSE_HEADERS) {
    const value = headersRecord?.[name]
    if (value != null)
      headers[name] = value
  }
  return headers
}

export function responseEvidence(response, requestedUrl) {
  if (!response) {
    return {
      requestedUrl: redactUrl(requestedUrl),
      finalUrl: '',
      status: 0,
      cacheControl: '',
      headers: {},
    }
  }
  // Puppeteer's HTTPResponse#headers returns a lowercase plain record.
  const headers = safeResponseHeaders(response.headers())
  return {
    requestedUrl: redactUrl(requestedUrl),
    finalUrl: redactUrl(response.url()),
    status: response.status(),
    cacheControl: headers['cache-control'] || '',
    headers,
  }
}

function revisionFromHeaders(headers) {
  const raw = headers?.['x-oem-candidate-revision'] || headers?.['x-oem-published-revision']
  const revision = Number(raw)
  return Number.isInteger(revision) && revision > 0 ? revision : null
}

function requestHeaders(options, env = process.env) {
  const authorization = env[options.authorizationEnv]
  if (!authorization)
    return {}
  return {
    Authorization: /^(Bearer|Basic)\s/i.test(authorization) ? authorization : `Bearer ${authorization}`,
  }
}

export async function fetchKnown(url, options, init = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS)
  const {
    accept = 'application/json',
    authorize = false,
    headers: suppliedHeaders = {},
    signal: suppliedSignal,
    ...fetchInit
  } = init
  if (authorize && !isAuthorizedProgrammaticAdminUrl(url, options))
    throw new Error(`Authorization requested for ${url}, which is not an authorized publication admin endpoint`)
  const signal = suppliedSignal ? AbortSignal.any([suppliedSignal, timeoutSignal]) : timeoutSignal
  const response = await fetchImpl(url, {
    ...fetchInit,
    redirect: 'error',
    signal,
    headers: {
      Accept: accept,
      ...(authorize ? requestHeaders(options, deps.env) : {}),
      ...suppliedHeaders,
    },
  })
  const headers = safeResponseHeaders(Object.fromEntries(SAFE_RESPONSE_HEADERS.map(name => [name, response.headers.get(name)])))
  const evidence = {
    requestedUrl: redactUrl(url),
    finalUrl: redactUrl(response.url),
    status: response.status,
    cacheControl: headers['cache-control'] || '',
    headers,
  }
  if (!response.ok) {
    const body = (await response.text()).slice(0, 500)
    throw Object.assign(new Error(`${init.method || 'GET'} ${url} failed: ${response.status} ${body}`), { evidence })
  }
  return { response, evidence }
}

function isAuthorizedProgrammaticAdminUrl(url, options) {
  const urls = options.urls || {}
  if ([urls.history, urls.publish, urls.rollback].some(allowed => allowed && sameKnownDocument(allowed, url)))
    return true
  if (!urls.candidateHtmlBase)
    return false
  try {
    const candidate = new URL(url)
    const base = new URL(urls.candidateHtmlBase)
    const revision = candidate.searchParams.get('revision')
    return candidate.origin === base.origin
      && candidate.pathname === base.pathname
      && candidate.searchParams.size === 1
      && /^\d+$/.test(revision || '')
      && Number(revision) > 0
  }
  catch {
    return false
  }
}

async function fetchJsonKnown(url, options, init = {}) {
  const result = await fetchKnown(url, options, init)
  return { ...result, value: await result.response.json() }
}

async function fetchTextKnown(url, options) {
  const result = await fetchKnown(url, options, { accept: 'text/html' })
  return { ...result, value: await result.response.text() }
}

async function collectAudit(frame) {
  return frame.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.01
    }
    const selector = (element) => {
      const id = element.id ? `#${element.id}` : ''
      const classes = String(element.className || '').split(/\s+/).filter(Boolean).slice(0, 2).map(item => `.${item}`).join('')
      return `${element.tagName.toLowerCase()}${id}${classes}`
    }
    const countUnique = (selectors) => new Set(selectors.flatMap(value => [...document.querySelectorAll(value)]).filter(visible)).size
    const regionRenderers = [...document.querySelectorAll('[data-oem-region-id][data-oem-published-renderer]')].map(element => ({
      regionId: element.getAttribute('data-oem-region-id') || '',
      renderer: element.getAttribute('data-oem-published-renderer') || '',
      interactionKind: element.getAttribute('data-oem-interaction-kind') || 'none',
    }))
    const images = [...document.images].filter(visible)
    const root = document.documentElement
    const body = document.body
    const iframe = document.querySelector('iframe[src*="production-body-html"], iframe[title*="model page" i], iframe[title*="candidate" i]')
    const resizeScript = document.querySelector('script[data-oem-embed-resize]')?.textContent || ''
    const revisionValues = [
      document.body?.getAttribute('data-oem-revision'),
      document.querySelector('[data-oem-publication-revision]')?.getAttribute('data-oem-publication-revision'),
      new URL(location.href).searchParams.get('revision'),
      resizeScript.match(/["']revision["']\s*:\s*(\d+)/)?.[1],
    ]
    const documentRevision = revisionValues.map(Number).find(value => Number.isInteger(value) && value > 0) || null

    return {
      documentUrl: location.href,
      documentRevision,
      title: document.title,
      horizontalOverflowPx: Math.max(0, root.scrollWidth - root.clientWidth),
      scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight || 0),
      iframeHeight: iframe ? Math.round(iframe.getBoundingClientRect().height) : null,
      iframeUrl: iframe?.src || null,
      platformHeroCount: countUnique([
        '[data-platform-region="hero"]', '[data-oem-platform-region="hero"]', '[data-testid*="hero" i]', '.hero-banner',
      ]),
      platformBodyCount: iframe ? 1 : 0,
      brokenImages: images.filter(image => !image.complete || image.naturalWidth <= 0).map(image => ({
        selector: selector(image),
        url: image.currentSrc || image.src,
      })).slice(0, 25),
      regionRenderers,
      variantCount: countUnique([
        '[data-model-variant]', '[data-variant-id]', '[data-testid*="variant" i]', '.variant-card',
        '[data-platform-region="variants"] article', '[data-platform-region="variants"] li',
      ]),
      inventoryCount: countUnique([
        '[data-inventory-card]', '[data-vehicle-id]', '[data-testid*="inventory" i]', '.inventory-card', '.vehicle-card',
        '[data-platform-region="inventory"] article', '[data-platform-region="inventory"] li',
      ]),
    }
  })
}

async function exerciseInteractions(frame) {
  return frame.evaluate(async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 80))
    const visible = (element) => {
      if (!element)
        return false
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden'
    }
    const snapshot = (root) => ({
      open: root.matches('details') ? root.open : null,
      expanded: [...root.querySelectorAll('[aria-expanded]')].map(item => item.getAttribute('aria-expanded')).join('|'),
      selected: [...root.querySelectorAll('[aria-selected]')].map(item => item.getAttribute('aria-selected')).join('|'),
      hidden: [...root.querySelectorAll('[hidden], [aria-hidden]')].map(item => `${item.hidden}:${item.getAttribute('aria-hidden')}`).join('|'),
      scrollLeft: root.scrollLeft,
      value: [...root.querySelectorAll('input[type="range"]')].map(item => item.value).join('|'),
    })
    const changed = (before, after) => JSON.stringify(before) !== JSON.stringify(after)
    const descriptor = control => ({
      tagName: control.tagName,
      type: control.getAttribute('type') || '',
      href: control.getAttribute('href') || '',
      formAction: control.getAttribute('formaction') || '',
      target: control.getAttribute('target') || '',
      formAssociated: Boolean(control.form || control.closest('form')),
    })
    const safeControl = (control) => {
      const value = descriptor(control)
      const tagName = String(value.tagName || '').toUpperCase()
      const type = String(value.type || '').toLowerCase()
      if (tagName === 'A' || tagName === 'AREA' || value.href || value.formAction || value.target || value.formAssociated)
        return false
      if (tagName === 'BUTTON')
        return type === '' || type === 'button'
      if (tagName === 'INPUT')
        return type === 'range'
      return !['FORM', 'SELECT', 'TEXTAREA'].includes(tagName)
    }
    const definitions = {
      accordion: {
        roots: 'details, [data-oem-interaction-kind="accordion"]',
        control: root => root.matches('details') ? root.querySelector('summary') : root.querySelector('button,[role="button"],[aria-expanded]'),
      },
      tabs: {
        roots: '[data-oem-interaction-kind="tabs"], [role="tablist"]',
        control: root => [...root.querySelectorAll('[role="tab"]')].find(item => item.getAttribute('aria-selected') !== 'true') || root.querySelector('[role="tab"]'),
      },
      modal: {
        roots: '[data-oem-interaction-kind="modal"], [aria-haspopup="dialog"], [data-modal-target]',
        control: root => root.matches('button,[role="button"]') ? root : root.querySelector('button,[role="button"],[aria-haspopup="dialog"]'),
      },
      carousel: {
        roots: '[data-oem-interaction-kind="carousel"], [data-carousel], [role="region"][aria-roledescription="carousel"]',
        control: root => root.querySelector('button[aria-label*="next" i],button[data-next],button:last-of-type'),
      },
      slider: {
        roots: '[data-oem-interaction-kind="slider"], input[type="range"]',
        control: root => root.matches('input[type="range"]') ? root : root.querySelector('input[type="range"],button[aria-label*="next" i]'),
      },
    }
    const results = []
    for (const [kind, definition] of Object.entries(definitions)) {
      const observedUrls = [{ stage: `${kind}:before`, url: location.href }]
      const roots = [...new Set([...document.querySelectorAll(definition.roots)])].filter(visible).slice(0, 8)
      let attempted = 0
      let passed = 0
      let blocked = 0
      const details = []
      for (const root of roots) {
        const control = definition.control(root)
        if (!control || !visible(control) || !safeControl(control)) {
          blocked++
          details.push('unsafe or unavailable control was not invoked')
          continue
        }
        attempted++
        const before = snapshot(root)
        const beforeUrl = location.href
        observedUrls.push({ stage: `${kind}:control-${attempted}:before`, url: beforeUrl })
        if (kind === 'slider' && control.matches('input[type="range"]')) {
          const min = Number(control.min || 0)
          const max = Number(control.max || 100)
          control.value = String(Number(control.value) === max ? min : max)
          control.dispatchEvent(new Event('input', { bubbles: true }))
          control.dispatchEvent(new Event('change', { bubbles: true }))
        }
        else {
          control.click()
        }
        await wait()
        const after = snapshot(root)
        const navigationChanged = location.href !== beforeUrl
        observedUrls.push({ stage: `${kind}:control-${attempted}:after`, url: location.href })
        const dialogVisible = kind === 'modal' && [...document.querySelectorAll('[role="dialog"],dialog')].some(visible)
        const didPass = !navigationChanged && (changed(before, after) || dialogVisible)
        if (didPass)
          passed++
        details.push(navigationChanged ? 'document URL changed' : didPass ? 'state changed' : 'no observable state change')
      }
      observedUrls.push({ stage: `${kind}:after`, url: location.href })
      results.push({ kind, found: roots.length, attempted, passed, blocked, details, observedUrls })
    }
    return results
  })
}

function normalizedDocumentUrl(value) {
  const url = new URL(value)
  url.hash = ''
  url.searchParams.sort()
  return url.href
}

export function sameKnownDocument(expected, actual) {
  try {
    return normalizedDocumentUrl(expected) === normalizedDocumentUrl(actual)
  }
  catch {
    return false
  }
}

export function inspectOuterDocumentSafety(page, expectedUrl, observations = {}) {
  const candidates = [
    { stage: 'page-final', url: page.url() },
    ...(observations.outerAuditUrl ? [{ stage: 'outer-audit', url: observations.outerAuditUrl }] : []),
    ...(observations.probeUrls || []),
  ]
  return candidates
    .filter(candidate => !sameKnownDocument(expectedUrl, candidate.url))
    .map(candidate => ({ ...candidate, expectedUrl }))
}

export function authorizeBrowserRequest(url, authorizedUrls) {
  return Object.values(authorizedUrls || {}).some(allowed => sameKnownDocument(allowed, url))
}

export function isSafeInteractionDescriptor(descriptor) {
  const tagName = String(descriptor?.tagName || '').toUpperCase()
  const type = String(descriptor?.type || '').toLowerCase()
  if (tagName === 'A' || tagName === 'AREA' || descriptor?.href || descriptor?.formAction || descriptor?.target)
    return false
  if (descriptor?.formAssociated)
    return false
  if (tagName === 'BUTTON')
    return type === '' || type === 'button'
  if (tagName === 'INPUT')
    return type === 'range'
  return !['FORM', 'SELECT', 'TEXTAREA'].includes(tagName)
}

function boundedPush(collection, value, limit = 100) {
  if (collection.length < limit)
    collection.push(value)
}

export async function installRequestConfinement(page, options) {
  const allowedDocumentUrls = options.allowedDocumentUrls || []
  const records = options.records || []
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
  await page.setRequestInterception(true)
  page.on('request', async (request) => {
    const method = String(request.method()).toUpperCase()
    const url = request.url()
    if (!safeMethods.has(method)) {
      boundedPush(records, { method, url: redactUrl(url), reason: 'non-idempotent-request' })
      await request.abort('blockedbyclient')
      return
    }
    if (request.isNavigationRequest() && !allowedDocumentUrls.some(allowed => sameKnownDocument(allowed, url))) {
      boundedPush(records, { method, url: redactUrl(url), reason: 'unexpected-navigation' })
      await request.abort('blockedbyclient')
      return
    }
    if (authorizeBrowserRequest(url, options.authorizedUrls)) {
      await request.continue({ headers: { ...request.headers(), ...options.authorizationHeaders } })
      return
    }
    await request.continue()
  })
  return records
}

async function createCapturePage(browser, viewport) {
  const page = await browser.newPage()
  const failedAssets = []
  const consoleErrors = []
  await page.setViewport({ ...VIEWPORTS[viewport], deviceScaleFactor: 1 })
  page.on('requestfailed', (request) => {
    if (DOCUMENT_RESOURCE_TYPES.has(request.resourceType())) {
      failedAssets.push({
        url: redactUrl(request.url()),
        type: request.resourceType(),
        reason: request.failure()?.errorText || 'request failed',
      })
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 400 && DOCUMENT_RESOURCE_TYPES.has(response.request().resourceType())) {
      failedAssets.push({
        url: redactUrl(response.url()),
        type: response.request().resourceType(),
        status: response.status(),
      })
    }
  })
  page.on('console', (message) => {
    if (message.type() === 'error' || /content security policy|\bcsp\b/i.test(message.text()))
      consoleErrors.push(message.text().slice(0, 1_000))
  })
  page.on('pageerror', error => consoleErrors.push(String(error).slice(0, 1_000)))
  return { page, failedAssets, consoleErrors }
}

async function selectRenderedFrame(page, target) {
  if (target === 'direct-body')
    return page.mainFrame()
  const selectors = target === 'editor-candidate'
    ? ['iframe[title="Candidate model page preview"]', 'iframe[src*="candidate-html"]']
    : ['iframe[src*="production-body-html"]', 'iframe[title*="model page" i]']
  for (const selector of selectors) {
    const handle = await page.$(selector)
    const frame = handle ? await handle.contentFrame() : null
    if (frame)
      return frame
  }
  return page.mainFrame()
}

async function screenshotFrame(page, frame, path) {
  if (frame === page.mainFrame()) {
    await page.screenshot({ path, fullPage: true, type: 'png' })
    return
  }
  const html = await frame.$('html')
  if (html)
    await html.screenshot({ path, type: 'png' })
  else
    await page.screenshot({ path, fullPage: true, type: 'png' })
}

async function captureBrowserTarget(browser, options, input) {
  const {
    target,
    viewport,
    requestedUrl,
    expectedRevision,
    phase = 'pre-publish',
    attempt = 1,
    allowedFrameUrls = [],
    authorizedUrls = {},
    fixtureHtml = null,
  } = input
  const { page, failedAssets, consoleErrors } = await createCapturePage(browser, viewport)
  const attemptSuffix = attempt > 1 ? `-attempt-${attempt}` : ''
  const artifactStem = `${target}-${phase}-${viewport}${attemptSuffix}`
  const screenshotPath = join(options.artifactDir, `${artifactStem}.png`)
  const contextScreenshotPath = join(options.artifactDir, `${artifactStem}-context.png`)
  const blockedRequests = []
  page.on('popup', (popup) => {
    boundedPush(blockedRequests, { method: 'GET', url: redactUrl(popup.url()), reason: 'unexpected-navigation' })
    popup.close().catch(() => null)
  })
  let response = null
  try {
    if (fixtureHtml != null) {
      await page.setContent(fixtureHtml, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs })
    }
    else {
      await installRequestConfinement(page, {
        allowedDocumentUrls: [requestedUrl, ...allowedFrameUrls],
        authorizedUrls,
        authorizationHeaders: requestHeaders(options),
        records: blockedRequests,
      })
      response = await page.goto(requestedUrl, { waitUntil: 'networkidle2', timeout: options.timeoutMs })
    }
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' }).catch(() => null)
    await settlePage(page, options.settleMs)
    const settledPageUrl = page.url()
    const settledOuterAudit = await collectAudit(page.mainFrame())
    const frame = await selectRenderedFrame(page, target)
    const interactions = await exerciseInteractions(frame)
    await settlePage(page, Math.min(250, options.settleMs))
    const [contentAudit, outerAudit] = await Promise.all([
      collectAudit(frame),
      frame === page.mainFrame() ? null : collectAudit(page.mainFrame()),
    ])
    const audit = {
      ...contentAudit,
      horizontalOverflowPx: Math.max(contentAudit.horizontalOverflowPx || 0, outerAudit?.horizontalOverflowPx || 0),
      iframeHeight: outerAudit?.iframeHeight ?? contentAudit.iframeHeight,
      iframeUrl: frame === page.mainFrame() ? null : contentAudit.documentUrl,
      renderedBodyHeight: contentAudit.scrollHeight,
      platformHeroCount: Math.max(contentAudit.platformHeroCount || 0, outerAudit?.platformHeroCount || 0),
      platformBodyCount: frame === page.mainFrame() ? 0 : Math.max(1, outerAudit?.platformBodyCount || 0),
      variantCount: Math.max(contentAudit.variantCount || 0, outerAudit?.variantCount || 0),
      inventoryCount: Math.max(contentAudit.inventoryCount || 0, outerAudit?.inventoryCount || 0),
      outerDocument: outerAudit
        ? {
            documentUrl: outerAudit.documentUrl,
            horizontalOverflowPx: outerAudit.horizontalOverflowPx,
            scrollHeight: outerAudit.scrollHeight,
          }
        : null,
    }
    audit.failedAssets = failedAssets
    audit.consoleErrors = consoleErrors
    audit.blockedRequests = blockedRequests
    audit.interactions = interactions
    await page.screenshot({ path: contextScreenshotPath, fullPage: true, type: 'png' })
    await screenshotFrame(page, frame, screenshotPath)
    if (fixtureHtml == null) {
      const outerAuditUrl = (outerAudit || contentAudit).documentUrl
      const preProbeViolations = inspectOuterDocumentSafety({ url: () => settledPageUrl }, requestedUrl, {
        outerAuditUrl: settledOuterAudit.documentUrl,
      })
      const finalOuterViolations = inspectOuterDocumentSafety(page, requestedUrl, { outerAuditUrl })
      const frameExpectedUrl = frame === page.mainFrame() ? requestedUrl : allowedFrameUrls[0]
      const probeViolations = interactions
        .flatMap(interaction => interaction.observedUrls || [])
        .filter(observation => !frameExpectedUrl || !sameKnownDocument(frameExpectedUrl, observation.url))
        .map(observation => ({ ...observation, expectedUrl: frameExpectedUrl || '(missing frame allowlist)' }))
      audit.documentUrlViolations = [...preProbeViolations, ...finalOuterViolations, ...probeViolations]
    }
    else {
      audit.documentUrlViolations = []
    }
    const responseRecord = fixtureHtml != null
      ? { requestedUrl: `fixture:${target}`, finalUrl: `fixture:${target}`, status: 200, cacheControl: 'no-store', headers: {} }
      : responseEvidence(response, requestedUrl)
    return {
      target,
      phase,
      attempt,
      viewport,
      expectedRevision,
      revision: revisionFromHeaders(responseRecord.headers) ?? contentAudit.documentRevision ?? null,
      response: responseRecord,
      screenshotPath,
      contextScreenshotPath,
      audit,
      unexpectedNavigation: fixtureHtml == null && !sameKnownDocument(requestedUrl, responseRecord.finalUrl),
      unexpectedFrameNavigation: fixtureHtml == null
        && frame !== page.mainFrame()
        && !allowedFrameUrls.some(url => sameKnownDocument(url, contentAudit.documentUrl)),
    }
  }
  catch (error) {
    await page.screenshot({ path: contextScreenshotPath, fullPage: true, type: 'png' }).catch(() => null)
    return {
      target,
      phase,
      attempt,
      viewport,
      expectedRevision,
      revision: null,
      response: error?.evidence || responseEvidence(response, requestedUrl),
      screenshotPath: null,
      contextScreenshotPath,
      audit: { failedAssets, consoleErrors, blockedRequests, interactions: [], regionRenderers: [], variantCount: 0, inventoryCount: 0 },
      error: error instanceof Error ? error.message : String(error),
    }
  }
  finally {
    await page.close()
  }
}

async function compareScreenshots(browser, leftPath, rightPath, diffPath, threshold) {
  const page = await browser.newPage()
  try {
    const [left, right] = await Promise.all([readFile(leftPath), readFile(rightPath)])
    const result = await page.evaluate(async ({ leftData, rightData, threshold }) => {
      const load = async (data) => {
        const image = new Image()
        image.src = data
        await image.decode()
        return image
      }
      const [leftImage, rightImage] = await Promise.all([load(leftData), load(rightData)])
      const width = Math.min(leftImage.naturalWidth, rightImage.naturalWidth)
      const height = Math.min(leftImage.naturalHeight, rightImage.naturalHeight)
      const draw = (image) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        return context.getImageData(0, 0, width, height)
      }
      const leftPixels = draw(leftImage)
      const rightPixels = draw(rightImage)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      const diff = context.createImageData(width, height)
      const limit = Math.round(threshold * 255)
      let changed = 0
      let totalDelta = 0
      for (let index = 0; index < leftPixels.data.length; index += 4) {
        const delta = Math.max(
          Math.abs(leftPixels.data[index] - rightPixels.data[index]),
          Math.abs(leftPixels.data[index + 1] - rightPixels.data[index + 1]),
          Math.abs(leftPixels.data[index + 2] - rightPixels.data[index + 2]),
          Math.abs(leftPixels.data[index + 3] - rightPixels.data[index + 3]),
        )
        totalDelta += delta
        if (delta > limit) {
          changed++
          diff.data[index] = 255
          diff.data[index + 1] = 32
          diff.data[index + 2] = 32
          diff.data[index + 3] = 220
        }
        else {
          const gray = Math.round((leftPixels.data[index] + leftPixels.data[index + 1] + leftPixels.data[index + 2]) / 3)
          diff.data[index] = gray
          diff.data[index + 1] = gray
          diff.data[index + 2] = gray
          diff.data[index + 3] = 80
        }
      }
      context.putImageData(diff, 0, 0)
      return {
        mismatchPercent: width && height ? changed / (width * height) : 1,
        averageChannelDelta: width && height ? totalDelta / (width * height) : 255,
        comparedSize: { width, height },
        leftSize: { width: leftImage.naturalWidth, height: leftImage.naturalHeight },
        rightSize: { width: rightImage.naturalWidth, height: rightImage.naturalHeight },
        diffData: canvas.toDataURL('image/png'),
      }
    }, {
      leftData: `data:image/png;base64,${left.toString('base64')}`,
      rightData: `data:image/png;base64,${right.toString('base64')}`,
      threshold,
    })
    await writeFile(diffPath, Buffer.from(result.diffData.replace(/^data:image\/png;base64,/, ''), 'base64'))
    delete result.diffData
    return { ...result, diffPath }
  }
  finally {
    await page.close()
  }
}

function addFinding(collection, code, message, capture) {
  collection.push({
    code,
    message,
    ...(capture ? { target: capture.target, phase: capture.phase, viewport: capture.viewport } : {}),
  })
}

function materialDimensionMismatch(leftSize, rightSize) {
  if (!leftSize || !rightSize)
    return false
  return ['width', 'height'].some((dimension) => {
    const left = Number(leftSize[dimension]) || 0
    const right = Number(rightSize[dimension]) || 0
    const delta = Math.abs(left - right)
    const ratio = delta / Math.max(1, left, right)
    return delta > SCREENSHOT_DIMENSION_TOLERANCE_PX && ratio > SCREENSHOT_DIMENSION_TOLERANCE_RATIO
  })
}

export function evaluatePublicationReport(report) {
  const blocking = []
  const warnings = []
  for (const capture of report.captures || []) {
    if (capture.error)
      addFinding(blocking, 'capture-failed', `${capture.target}/${capture.viewport}: ${capture.error}`, capture)
    if (capture.unexpectedNavigation)
      addFinding(blocking, 'unexpected-navigation', `${capture.target}/${capture.viewport} left its explicitly configured document URL`, capture)
    if (capture.unexpectedFrameNavigation)
      addFinding(blocking, 'unexpected-frame-navigation', `${capture.target}/${capture.viewport} loaded an iframe outside the explicit derived URL allowlist`, capture)
    if (capture.response?.status !== 200)
      addFinding(blocking, 'document-response-failed', `${capture.target}/${capture.viewport} returned HTTP ${capture.response?.status || 0}`, capture)
    const expectedRevision = capture.expectedRevision ?? report.expectedRevision
    if (expectedRevision && capture.revision !== expectedRevision)
      addFinding(blocking, 'revision-mismatch', `${capture.target}/${capture.phase || 'capture'}/${capture.viewport} rendered revision ${capture.revision ?? 'unknown'}; expected ${expectedRevision}`, capture)
    if ((capture.audit?.failedAssets || []).length > 0)
      addFinding(blocking, 'failed-assets', `${capture.target}/${capture.viewport} has ${capture.audit.failedAssets.length} failed asset request(s)`, capture)
    if ((capture.audit?.brokenImages || []).length > 0)
      addFinding(blocking, 'broken-images', `${capture.target}/${capture.viewport} has ${capture.audit.brokenImages.length} broken visible image(s)`, capture)
    if ((capture.audit?.horizontalOverflowPx || 0) > 4)
      addFinding(blocking, 'horizontal-overflow', `${capture.target}/${capture.viewport} overflows horizontally by ${capture.audit.horizontalOverflowPx}px`, capture)
    if ((capture.audit?.blockedRequests || []).length > 0)
      addFinding(blocking, 'blocked-side-effect-attempt', `${capture.target}/${capture.viewport} attempted ${capture.audit.blockedRequests.length} blocked write/navigation request(s)`, capture)
    if ((capture.audit?.documentUrlViolations || []).length > 0)
      addFinding(blocking, 'document-url-mutation', `${capture.target}/${capture.viewport} changed or dropped required document query state ${capture.audit.documentUrlViolations.length} time(s)`, capture)
    for (const error of capture.audit?.consoleErrors || []) {
      addFinding(/content security policy|\bcsp\b/i.test(error) ? blocking : warnings, /content security policy|\bcsp\b/i.test(error) ? 'csp-error' : 'console-error', `${capture.target}/${capture.viewport}: ${error}`, capture)
    }
    for (const interaction of capture.audit?.interactions || []) {
      if ((interaction.blocked || 0) > 0)
        addFinding(blocking, 'unsafe-interaction-control', `${capture.target}/${capture.viewport} ${interaction.kind}: ${interaction.blocked} unsafe control(s) were not invoked`, capture)
      if (interaction.found > 0 && (interaction.attempted === 0 || interaction.passed < interaction.attempted))
        addFinding(blocking, 'interaction-failed', `${capture.target}/${capture.viewport} ${interaction.kind}: ${interaction.passed}/${interaction.attempted} safe checks passed`, capture)
    }
    if (capture.target === 'dealer' && (capture.audit?.platformHeroCount || 0) === 0)
      addFinding(blocking, 'platform-hero-missing', `${capture.target}/${capture.viewport} has no platform hero`, capture)
    if (capture.target === 'dealer' && (capture.audit?.platformBodyCount || 0) === 0)
      addFinding(blocking, 'platform-body-missing', `${capture.target}/${capture.viewport} has no embedded publication body`, capture)
    if (capture.target === 'dealer' && (capture.audit?.variantCount || 0) === 0)
      addFinding(blocking, 'variants-missing', `${capture.target}/${capture.viewport} has no variant cards`, capture)
    if (capture.target === 'dealer' && (capture.audit?.inventoryCount || 0) === 0)
      addFinding(blocking, 'inventory-missing', `${capture.target}/${capture.viewport} has no inventory cards`, capture)
    if (capture.target === 'dealer'
      && Number.isFinite(capture.audit?.iframeHeight)
      && Number.isFinite(capture.audit?.renderedBodyHeight)
      && capture.audit.iframeHeight + IFRAME_HEIGHT_TOLERANCE_PX < capture.audit.renderedBodyHeight) {
      addFinding(blocking, 'iframe-height-mismatch', `${capture.target}/${capture.viewport} iframe is ${capture.audit.iframeHeight}px for a ${capture.audit.renderedBodyHeight}px body (tolerance ${IFRAME_HEIGHT_TOLERANCE_PX}px)`, capture)
    }
  }
  for (const comparison of report.comparisons || []) {
    if (comparison.error)
      addFinding(blocking, 'pixel-comparison-failed', `${comparison.viewport} ${comparison.pair}: ${comparison.error}`)
    else if (materialDimensionMismatch(comparison.leftSize, comparison.rightSize))
      addFinding(blocking, 'screenshot-dimension-mismatch', `${comparison.viewport} ${comparison.pair} screenshot dimensions differ materially (${comparison.leftSize.width}x${comparison.leftSize.height} vs ${comparison.rightSize.width}x${comparison.rightSize.height})`)
    else if (comparison.mismatchPercent > (report.maxMismatch ?? 0.35))
      addFinding(blocking, 'visual-mismatch', `${comparison.viewport} ${comparison.pair} differs by ${(comparison.mismatchPercent * 100).toFixed(2)}%`)
    else if (comparison.mismatchPercent >= 0.2)
      addFinding(warnings, 'visual-mismatch-warning', `${comparison.viewport} ${comparison.pair} differs by ${(comparison.mismatchPercent * 100).toFixed(2)}%`)
  }
  if (report.mutation?.restoration?.concurrentTransition)
    addFinding(blocking, 'concurrent-transition', report.mutation.restoration.error || 'Production changed outside the battle-test transition; restoration was not attempted')
  if (report.mutation?.requested && !report.mutation?.restoration?.verified)
    addFinding(blocking, 'rollback-restoration-failed', `Starting revision was not restored${report.mutation?.restoration?.error ? `: ${report.mutation.restoration.error}` : ''}`)
  for (const error of report.finalizationErrors || [])
    addFinding(blocking, error.code, error.message)
  return { blocking, warnings, passed: blocking.length === 0 }
}

function tableValue(value) {
  return value == null || value === '' ? '—' : String(value).replace(/\|/g, '\\|')
}

export function renderPublicationMarkdown(report) {
  const lines = [
    `# Publication battle test: ${report.passed ? 'PASS' : 'FAIL'}`,
    '',
    `- Run: ${report.runId}`,
    `- Created: ${report.createdAt}`,
    `- Page: ${report.pageId}`,
    `- Starting revision: ${report.startingRevision ?? 'none'}`,
    '',
    '## Captures',
    '',
    '| Target | Phase | Viewport | HTTP | Expected | Revision | Cache-Control | Variants | Inventory | Screenshot |',
    '|---|---|---:|---:|---:|---:|---|---:|---:|---|',
  ]
  for (const capture of report.captures || []) {
    lines.push(`| ${tableValue(capture.target)} | ${tableValue(capture.phase)} | ${tableValue(capture.viewport)} | ${tableValue(capture.response?.status)} | ${tableValue(capture.expectedRevision)} | ${tableValue(capture.revision)} | ${tableValue(capture.response?.cacheControl)} | ${tableValue(capture.audit?.variantCount)} | ${tableValue(capture.audit?.inventoryCount)} | ${tableValue(capture.screenshotPath)} |`)
  }
  lines.push('', '## Pixel comparisons', '', '| Pair | Viewport | Mismatch | Diff |', '|---|---:|---:|---|')
  for (const comparison of report.comparisons || [])
    lines.push(`| ${tableValue(comparison.pair)} | ${tableValue(comparison.viewport)} | ${comparison.mismatchPercent == null ? '—' : `${(comparison.mismatchPercent * 100).toFixed(2)}%`} | ${tableValue(comparison.diffPath)} |`)
  lines.push('', '## Renderer region map', '')
  const renderers = (report.captures || []).find(capture => capture.target === 'direct-body')?.audit?.regionRenderers || []
  if (renderers.length === 0)
    lines.push('- No renderer metadata recorded.')
  else
    lines.push(...renderers.map(region => `- ${region.regionId}: ${region.renderer} (${region.interactionKind})`))
  lines.push('', '## Blocking findings', '')
  lines.push(...((report.blocking || []).length ? report.blocking.map(item => `- **${item.code}**: ${item.message}`) : ['- None.']))
  lines.push('', '## Warnings', '')
  lines.push(...((report.warnings || []).length ? report.warnings.map(item => `- **${item.code}**: ${item.message}`) : ['- None.']))
  if (report.mutation?.requested) {
    lines.push('', '## Mutation and restoration', '')
    lines.push(`- Operation: ${report.mutation.operation}`)
    lines.push(`- Starting revision restored: ${report.mutation.restoration?.verified ? 'yes' : 'no'}`)
  }
  return `${lines.join('\n')}\n`
}

export function isTaskArtifactName(name) {
  if (typeof name !== 'string' || name.includes('/') || name.includes('\\'))
    return false
  const withoutTemp = name.replace(/\.tmp-\d+$/, '')
  if (/^report\.(?:json|md)$/.test(withoutTemp))
    return true
  if (/^(?:editor-candidate|direct-body|dealer)-(?:desktop|tablet|mobile)(?:-context)?\.png$/.test(withoutTemp))
    return true
  if (/^(?:editor-candidate|direct-body|dealer)-(?:pre-publish|post-publish|restored)-(?:desktop|tablet|mobile)(?:-attempt-\d+)?(?:-context)?\.png$/.test(withoutTemp))
    return true
  return /^(?:editor-vs-direct|dealer-body-vs-direct)-(?:pre-publish|post-publish|restored)-(?:desktop|tablet|mobile)-diff\.png$/.test(withoutTemp)
    || /^(?:editor-vs-direct|dealer-body-vs-direct)-(?:desktop|tablet|mobile)-diff\.png$/.test(withoutTemp)
}

export async function resetTaskArtifactInventory(artifactDir, deps = {}) {
  const readdirImpl = deps.readdir || readdir
  const unlinkImpl = deps.unlink || unlink
  let names
  try {
    names = await readdirImpl(artifactDir)
  }
  catch (error) {
    if (error?.code === 'ENOENT')
      return
    throw error
  }
  await Promise.all(names.filter(isTaskArtifactName).map(name => unlinkImpl(join(artifactDir, name))))
}

export async function atomicWriteFile(path, content, deps = {}) {
  const writeFileImpl = deps.writeFile || writeFile
  const renameImpl = deps.rename || rename
  const unlinkImpl = deps.unlink || unlink
  const pid = deps.pid ?? process.pid
  const temporaryPath = `${path}.tmp-${pid}`
  try {
    await writeFileImpl(temporaryPath, content)
    await renameImpl(temporaryPath, path)
  }
  catch (error) {
    await unlinkImpl(temporaryPath).catch(() => null)
    throw error
  }
}

export async function finalizePublicationReport(report, deps = {}) {
  const browser = deps.browser
  const artifactDir = deps.artifactDir
  const atomicWrite = deps.atomicWrite || atomicWriteFile
  report.finalizationErrors ||= []
  if (browser) {
    try {
      await browser.close()
    }
    catch (error) {
      report.finalizationErrors.push({
        code: 'browser-close-failed',
        message: `Browser close failed: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
  }
  if (deps.mainError)
    report.executionError = deps.mainError
  const evaluation = evaluatePublicationReport(report)
  if (deps.mainError)
    evaluation.blocking.unshift({ code: 'execution-failed', message: deps.mainError })
  report.blocking = evaluation.blocking
  report.warnings = evaluation.warnings
  report.passed = evaluation.passed && !deps.mainError
  report.completedAt = new Date().toISOString()
  await atomicWrite(join(artifactDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await atomicWrite(join(artifactDir, 'report.md'), renderPublicationMarkdown(report))
  return report
}

function fixtureForTarget(target) {
  if (target === 'editor-candidate')
    return `<!doctype html><html><body style="margin:0"><iframe title="Candidate model page preview" style="border:0;width:100%;height:760px" srcdoc="${FIXTURE_BODY.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe></body></html>`
  if (target === 'dealer') {
    const publishedBody = FIXTURE_BODY.replace('data-oem-revision="22"', 'data-oem-revision="21"')
    return `<!doctype html><html><body style="margin:0"><section style="height:180px;background:#eee" data-platform-region="hero"><h1>ARIYA</h1></section><iframe title="OEM model page" style="border:0;width:100%;height:760px" srcdoc="${publishedBody.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe><section data-platform-region="variants"><article data-model-variant="engage">Engage</article></section><section data-platform-region="inventory"><article data-inventory-card="stock-1">In stock</article></section></body></html>`
  }
  return FIXTURE_BODY
}

async function publicationState(options) {
  if (options.fixture) {
    return {
      state: {
        published_revision: 21,
        candidate: { revision: 22, draft_version: 7, status: 'ready', validation_digest: 'fixture-validation' },
      },
      history: [],
      candidateValidation: null,
    }
  }
  return (await fetchJsonKnown(options.urls.history, options, { authorize: true })).value
}

async function publishedManifest(options) {
  if (options.fixture)
    return { pageId: options.pageId, revision: 22, bodyUrl: `${options.urls.publishedBodyBase}?revision=22` }
  return (await fetchJsonKnown(options.urls.manifest, options)).value
}

async function transition(options, url, body) {
  return (await fetchJsonKnown(url, options, {
    authorize: true,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })).value
}

async function verifyPublishedRevision(options, revision) {
  const manifest = await publishedManifest(options)
  if (manifest.revision !== revision)
    throw new Error(`published manifest revision ${manifest.revision ?? 'missing'} does not match ${revision}`)
  const exactUrl = `${options.urls.publishedBodyBase}?revision=${revision}`
  const body = await fetchTextKnown(exactUrl, options)
  const headerRevision = revisionFromHeaders(body.evidence.headers)
  if (headerRevision !== revision)
    throw new Error(`versioned body revision ${headerRevision ?? 'missing'} does not match ${revision}`)
  return { manifest, body: body.evidence }
}

function dealerCapturePassed(capture, expectedRevision) {
  const audit = capture.audit || {}
  return !capture.error
    && capture.response?.status === 200
    && capture.revision === expectedRevision
    && (audit.platformHeroCount || 0) > 0
    && (audit.platformBodyCount || 0) > 0
    && (audit.variantCount || 0) > 0
    && (audit.inventoryCount || 0) > 0
    && Number.isFinite(audit.iframeHeight)
    && Number.isFinite(audit.renderedBodyHeight)
    && audit.iframeHeight + IFRAME_HEIGHT_TOLERANCE_PX >= audit.renderedBodyHeight
    && (audit.blockedRequests || []).length === 0
}

export function conditionalRestorationDecision({
  currentPublishedRevision,
  harnessPublishedRevision,
  startingRevision,
}) {
  if (currentPublishedRevision === startingRevision)
    return { restore: false, alreadyRestored: true }
  if (currentPublishedRevision === harnessPublishedRevision) {
    return {
      restore: true,
      requestBody: {
        targetRevision: startingRevision,
        expectedPublishedRevision: harnessPublishedRevision,
      },
    }
  }
  return {
    restore: false,
    concurrentTransition: true,
    error: `published revision changed from ${harnessPublishedRevision} to ${currentPublishedRevision ?? 'none'}`,
  }
}

async function captureDealerPhase(browser, options, phase, revision) {
  const captures = []
  const bodyUrl = `${options.urls.publishedBodyBase}?revision=${revision}`
  for (const viewport of options.viewports) {
    let selected
    const failures = []
    for (let attempt = 1; attempt <= 3; attempt++) {
      selected = await captureBrowserTarget(browser, options, {
        target: 'dealer',
        phase,
        attempt,
        viewport,
        requestedUrl: options.urls.dealer,
        expectedRevision: revision,
        allowedFrameUrls: [bodyUrl],
      })
      if (dealerCapturePassed(selected, revision))
        break
      failures.push({
        attempt,
        error: selected.error || null,
        status: selected.response?.status || 0,
        revision: selected.revision,
        iframeUrl: selected.audit?.iframeUrl || null,
      })
      if (attempt < 3)
        await new Promise(resolve => setTimeout(resolve, Math.min(1_000, options.settleMs)))
    }
    selected.retryFailures = failures
    captures.push(selected)
  }
  return captures
}

async function exerciseMutation(browser, options, state, report) {
  const startingRevision = state?.state?.published_revision ?? null
  if (!startingRevision)
    throw new Error('Mutation is blocked because there is no starting published revision to restore')
  const candidate = state?.state?.candidate
  if (options.publish && (!candidate || candidate.status !== 'ready' || !candidate.validation_digest))
    throw new Error('Mutation is blocked because no ready candidate with validation digest exists')
  if (options.rollback && !state?.state?.history?.includes(options.rollbackRevision))
    throw new Error(`Mutation is blocked because rollback revision ${options.rollbackRevision} is absent from retained history`)
  report.mutation = {
    requested: true,
    operation: options.publish ? 'publish' : `rollback:${options.rollbackRevision}`,
    startingRevision,
    restoration: { attempted: false, verified: false },
  }
  let transitionAttempted = false
  try {
    if (options.publish) {
      transitionAttempted = true
      report.mutation.transition = await transition(options, options.urls.publish, {
        revision: candidate.revision,
        expectedDraftVersion: candidate.draft_version,
        validationDigest: candidate.validation_digest,
      })
      report.mutation.verification = await verifyPublishedRevision(options, candidate.revision)
      const dealerCaptures = await captureDealerPhase(browser, options, 'post-publish', candidate.revision)
      report.captures.push(...dealerCaptures)
      if (!dealerCaptures.every(capture => dealerCapturePassed(capture, candidate.revision)))
        throw new Error(`Dealer did not converge on published revision ${candidate.revision}`)
    }
    else {
      transitionAttempted = true
      report.mutation.transition = await transition(options, options.urls.rollback, {
        targetRevision: options.rollbackRevision,
        expectedPublishedRevision: startingRevision,
      })
      report.mutation.verification = await verifyPublishedRevision(options, options.rollbackRevision)
      const dealerCaptures = await captureDealerPhase(browser, options, 'post-publish', options.rollbackRevision)
      report.captures.push(...dealerCaptures)
      if (!dealerCaptures.every(capture => dealerCapturePassed(capture, options.rollbackRevision)))
        throw new Error(`Dealer did not converge on rollback target ${options.rollbackRevision}`)
    }
  }
  finally {
    if (transitionAttempted) {
      const restorationErrors = []
      const harnessPublishedRevision = options.publish ? candidate.revision : options.rollbackRevision
      let safeToCaptureRestoration = false
      try {
        const current = await publicationState(options)
        const decision = conditionalRestorationDecision({
          currentPublishedRevision: current?.state?.published_revision ?? null,
          harnessPublishedRevision,
          startingRevision,
        })
        if (decision.concurrentTransition) {
          report.mutation.restoration.concurrentTransition = true
          restorationErrors.push(decision.error)
        }
        else {
          if (decision.restore) {
            report.mutation.restoration.attempted = true
            await transition(options, options.urls.rollback, decision.requestBody)
          }
          await verifyPublishedRevision(options, startingRevision)
          safeToCaptureRestoration = true
        }
      }
      catch (error) {
        restorationErrors.push(error instanceof Error ? error.message : String(error))
      }
      if (safeToCaptureRestoration) {
        try {
          const restoredCaptures = await captureDealerPhase(browser, options, 'restored', startingRevision)
          report.captures.push(...restoredCaptures)
          if (!restoredCaptures.every(capture => dealerCapturePassed(capture, startingRevision)))
            restorationErrors.push(`Dealer did not restore revision ${startingRevision}`)
        }
        catch (error) {
          restorationErrors.push(`Restoration capture failed: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      report.mutation.restoration.verified = restorationErrors.length === 0
      if (restorationErrors.length > 0)
        report.mutation.restoration.error = restorationErrors.join('; ')
    }
  }
}

export async function runPublicationBattleTest(options) {
  await mkdir(options.artifactDir, { recursive: true })
  await resetTaskArtifactInventory(options.artifactDir)
  const report = {
    schemaVersion: 1,
    runId: options.runId,
    createdAt: new Date().toISOString(),
    pageId: options.pageId,
    mode: options.fixture ? 'fixture' : options.mutate ? 'mutation' : 'read-only',
    configuredUrls: Object.fromEntries(Object.entries(options.urls).map(([key, value]) => [key, redactUrl(value)])),
    viewports: options.viewports.map(name => ({ name, ...VIEWPORTS[name] })),
    captures: [],
    comparisons: [],
    mutation: { requested: false, restoration: { attempted: false, verified: false } },
    maxMismatch: options.maxMismatch,
  }
  let browser
  let mainError = null
  try {
    const state = await publicationState(options)
    report.publicationState = state
    report.startingRevision = state?.state?.published_revision ?? null
    const candidate = state?.state?.candidate
    const candidateRevision = candidate?.status === 'ready' ? candidate.revision : null
    const bodyRevision = candidateRevision ?? report.startingRevision
    const directUrl = candidateRevision
      ? `${options.urls.candidateHtmlBase}?revision=${candidate.revision}`
      : `${options.urls.publishedBodyBase}?revision=${report.startingRevision}`
    const editorUrl = `${options.urls.editor}?view=${candidateRevision ? 'candidate' : 'production'}`
    const dealerBodyUrl = `${options.urls.publishedBodyBase}?revision=${report.startingRevision}`
    const authorizedUrls = {
      history: options.urls.history,
      ...(candidateRevision ? { candidateHtml: `${options.urls.candidateHtmlBase}?revision=${candidateRevision}` } : {}),
    }

    browser = await launchQaBrowser(puppeteer, {
      browserExecutable: options.browserExecutable,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    })
    for (const viewport of options.viewports) {
      for (const target of CAPTURE_TARGETS) {
        const requestedUrl = target === 'editor-candidate' ? editorUrl : target === 'direct-body' ? directUrl : options.urls.dealer
        const fixtureHtml = options.fixture ? fixtureForTarget(target) : null
        const expectedRevision = target === 'dealer' ? report.startingRevision : bodyRevision
        const allowedFrameUrls = target === 'editor-candidate'
          ? [directUrl]
          : target === 'dealer'
            ? [dealerBodyUrl]
            : []
        const targetAuthorizedUrls = target === 'editor-candidate'
          ? authorizedUrls
          : target === 'direct-body' && candidateRevision
            ? { candidateHtml: directUrl }
            : {}
        report.captures.push(await captureBrowserTarget(browser, options, {
          target,
          phase: 'pre-publish',
          viewport,
          requestedUrl,
          expectedRevision,
          allowedFrameUrls,
          authorizedUrls: targetAuthorizedUrls,
          fixtureHtml,
        }))
      }
      const byTarget = Object.fromEntries(report.captures.filter(capture => capture.phase === 'pre-publish' && capture.viewport === viewport).map(capture => [capture.target, capture]))
      for (const [pair, leftTarget, rightTarget] of [
        ['editor-vs-direct', 'editor-candidate', 'direct-body'],
        ['dealer-body-vs-direct', 'dealer', 'direct-body'],
      ]) {
        const left = byTarget[leftTarget]
        const right = byTarget[rightTarget]
        const diffPath = join(options.artifactDir, `${pair}-pre-publish-${viewport}-diff.png`)
        if (!left?.screenshotPath || !right?.screenshotPath) {
          report.comparisons.push({ pair, phase: 'pre-publish', viewport, diffPath, error: 'one or both capture screenshots are unavailable' })
          continue
        }
        try {
          report.comparisons.push({ pair, phase: 'pre-publish', viewport, ...await compareScreenshots(browser, left.screenshotPath, right.screenshotPath, diffPath, options.threshold) })
        }
        catch (error) {
          report.comparisons.push({ pair, phase: 'pre-publish', viewport, diffPath, error: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    if (options.mutate)
      await exerciseMutation(browser, options, state, report)
  }
  catch (error) {
    mainError = error instanceof Error ? error.message : String(error)
  }
  finally {
    await finalizePublicationReport(report, {
      browser,
      mainError,
      artifactDir: options.artifactDir,
    })
  }
  return report
}

function helpText() {
  return `Usage: pnpm qa:publication -- [options]

Read-only defaults compare nissan-au-ariya on the configured production origins.
Use --fixture for a deterministic local pass with no network access.

  --page-id ID                 Publication page ID (default: nissan-au-ariya)
  --worker-base ORIGIN         Worker origin
  --dashboard-base ORIGIN      Dashboard origin
  --dealer-base ORIGIN         Dealer platform origin
  --viewport NAME              Repeat desktop/tablet/mobile (defaults to all three)
  --fixture                    Built-in, read-only, network-free browser fixture
  --run-id ID                  Deterministic artifact directory name
  --json                       Print JSON report
  --publish                    Publish the ready candidate (requires both confirmations)
  --rollback REVISION          Test rollback (requires both confirmations)
  --mutate                     Acknowledge mutation
  --confirm-production         Confirm the configured environment may be mutated
  --authorization-env NAME     Environment variable holding admin Authorization value
  --browser-executable PATH    Chrome/Chromium executable

Artifacts: artifacts/model-page-publication/$OEM_PUBLICATION_RUN_ID/
`
}

async function main() {
  const options = parsePublicationArgs(process.argv.slice(2))
  if (options.help) {
    console.log(helpText())
    return
  }
  const report = await runPublicationBattleTest(options)
  if (options.json)
    console.log(JSON.stringify(report, null, 2))
  else {
    console.log(`Publication battle test: ${report.passed ? 'PASS' : 'FAIL'}`)
    console.log(`Report: ${join(options.artifactDir, 'report.json')}`)
    console.log(`Evidence: ${join(options.artifactDir, 'report.md')}`)
    console.log(`Blocking findings: ${report.blocking.length}`)
  }
  if (!report.passed)
    process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}

export { VIEWPORTS }
