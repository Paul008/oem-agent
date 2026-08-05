import { describe, expect, it } from 'vitest'

import {
  atomicWriteFile,
  authorizeBrowserRequest,
  conditionalRestorationDecision,
  evaluatePublicationReport,
  fetchKnown,
  finalizePublicationReport,
  installRequestConfinement,
  inspectOuterDocumentSafety,
  isSafeInteractionDescriptor,
  isTaskArtifactName,
  parsePublicationArgs,
  resetTaskArtifactInventory,
  renderPublicationMarkdown,
  responseEvidence,
  sameKnownDocument,
} from './model-page-publication-battle-test.mjs'

describe('parsePublicationArgs', () => {
  it('defaults to a read-only ARIYA comparison at the required viewports', () => {
    expect(parsePublicationArgs([])).toMatchObject({
      pageId: 'nissan-au-ariya',
      mutate: false,
      publish: false,
      rollback: false,
      viewports: ['desktop', 'tablet', 'mobile'],
      viewportDefinitions: {
        desktop: { width: 1440, height: 1100 },
        tablet: { width: 1024, height: 900 },
        mobile: { width: 390, height: 844 },
      },
    })
  })

  it.each([
    ['--publish'],
    ['--rollback', '21'],
    ['--publish', '--mutate'],
    ['--rollback', '21', '--confirm-production'],
  ])('requires both confirmation flags before mutation: %s', (...args) => {
    expect(() => parsePublicationArgs(args)).toThrow('requires --mutate and --confirm-production')
  })

  it('derives only known URLs from explicit bases and the page ID', () => {
    const options = parsePublicationArgs([
      '--worker-base', 'http://127.0.0.1:8787/',
      '--dashboard-base', 'http://127.0.0.1:4173/',
      '--dealer-base', 'http://127.0.0.1:3000/',
    ])

    expect(options.urls).toEqual({
      history: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/history',
      candidateHtmlBase: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/candidate-html',
      manifest: 'http://127.0.0.1:8787/api/v1/oem-agent/pages/nissan-au-ariya/production-manifest',
      publishedBodyBase: 'http://127.0.0.1:8787/api/v1/oem-agent/pages/nissan-au-ariya/production-body-html',
      publish: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/publish',
      rollback: 'http://127.0.0.1:8787/api/v1/oem-agent/admin/pages/nissan-au-ariya/publication/rollback',
      editor: 'http://127.0.0.1:4173/preview/nissan-au-ariya',
      dealer: 'http://127.0.0.1:3000/models/ariya',
    })
  })

  it('rejects credentials and path-bearing bases', () => {
    expect(() => parsePublicationArgs(['--worker-base', 'https://user:secret@example.com']))
      .toThrow('must not include credentials')
    expect(() => parsePublicationArgs(['--dealer-base', 'https://example.com/sneaky']))
      .toThrow('must be an origin without a path')
  })

  it('supports a deterministic fixture report without a browser or network', () => {
    const options = parsePublicationArgs(['--fixture', '--run-id', 'fixture-run'])
    expect(options.fixture).toBe(true)
    expect(options.runId).toBe('fixture-run')
    expect(options.artifactDir).toBe('artifacts/model-page-publication/fixture-run')
  })
})

describe('evaluatePublicationReport', () => {
  it('blocks revision disagreement, absent platform inventory, CSP errors, overflow and failed interactions', () => {
    const result = evaluatePublicationReport({
      startingRevision: 21,
      expectedRevision: 22,
      mutation: { requested: false, restoration: { attempted: false, verified: false } },
      captures: [{
        target: 'dealer',
        viewport: 'desktop',
        revision: 21,
        response: { status: 200 },
        audit: {
          horizontalOverflowPx: 12,
          failedAssets: [],
          consoleErrors: ['Refused to execute script because of CSP'],
          regionRenderers: [],
          interactions: [{ kind: 'accordion', found: 1, attempted: 1, passed: 0 }],
          variantCount: 0,
          inventoryCount: 0,
          iframeHeight: 100,
        },
      }],
      comparisons: [],
    })

    expect(result.blocking.map(finding => finding.code)).toEqual(expect.arrayContaining([
      'revision-mismatch',
      'horizontal-overflow',
      'csp-error',
      'interaction-failed',
      'variants-missing',
      'inventory-missing',
    ]))
    expect(result.passed).toBe(false)
  })

  it('treats an unverified rollback restoration as blocking', () => {
    const result = evaluatePublicationReport({
      startingRevision: 21,
      expectedRevision: 22,
      mutation: {
        requested: true,
        restoration: { attempted: true, verified: false, error: 'revision stayed at 22' },
      },
      captures: [],
      comparisons: [],
    })

    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'rollback-restoration-failed' }))
  })

  it('records a concurrent publication during restoration as its own blocking finding', () => {
    const result = evaluatePublicationReport({
      mutation: {
        requested: true,
        restoration: {
          attempted: false,
          verified: false,
          concurrentTransition: true,
          error: 'published revision changed from 22 to 23',
        },
      },
      captures: [],
      comparisons: [],
    })

    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'concurrent-transition' }))
  })

  it('passes consistent captures and blocks an unknown rendered revision', () => {
    const capture = {
      target: 'direct-body',
      viewport: 'mobile',
      revision: 22,
      response: { status: 200 },
      audit: {
        horizontalOverflowPx: 0,
        failedAssets: [],
        brokenImages: [],
        consoleErrors: [],
        interactions: [{ kind: 'accordion', found: 1, attempted: 1, passed: 1 }],
      },
    }
    expect(evaluatePublicationReport({
      expectedRevision: 22,
      mutation: { requested: false },
      captures: [capture],
      comparisons: [{ pair: 'editor-vs-direct', viewport: 'mobile', mismatchPercent: 0.01 }],
    }).passed).toBe(true)

    expect(evaluatePublicationReport({
      expectedRevision: 22,
      mutation: { requested: false },
      captures: [{ ...capture, revision: null }],
      comparisons: [],
    }).blocking).toContainEqual(expect.objectContaining({ code: 'revision-mismatch' }))
  })

  it('uses phase-specific expected revisions and blocks undersized dealer iframes', () => {
    const result = evaluatePublicationReport({
      mutation: { requested: false },
      captures: [
        {
          target: 'direct-body', phase: 'pre-publish', viewport: 'desktop', revision: 22, expectedRevision: 22,
          response: { status: 200 }, audit: { failedAssets: [], brokenImages: [], consoleErrors: [], interactions: [] },
        },
        {
          target: 'dealer', phase: 'pre-publish', viewport: 'desktop', revision: 21, expectedRevision: 21,
          response: { status: 200 },
          audit: {
            failedAssets: [], brokenImages: [], consoleErrors: [], interactions: [], horizontalOverflowPx: 0,
            platformHeroCount: 1, platformBodyCount: 1, variantCount: 4, inventoryCount: 8,
            iframeHeight: 700, renderedBodyHeight: 900,
          },
        },
      ],
      comparisons: [],
    })

    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'iframe-height-mismatch' }))
    expect(result.blocking).not.toContainEqual(expect.objectContaining({ code: 'revision-mismatch' }))
  })

  it('blocks material screenshot dimension mismatches before channel comparison can hide them', () => {
    const result = evaluatePublicationReport({
      mutation: { requested: false },
      captures: [],
      comparisons: [{
        pair: 'editor-vs-direct', viewport: 'desktop', mismatchPercent: 0,
        leftSize: { width: 1440, height: 900 }, rightSize: { width: 1440, height: 1400 },
      }],
    })

    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'screenshot-dimension-mismatch' }))
  })

  it('preserves a primary failure alongside rollback and restoration-capture failures', () => {
    const result = evaluatePublicationReport({
      mutation: {
        requested: true,
        restoration: { attempted: true, verified: false, error: 'rollback API failed' },
      },
      captures: [{
        target: 'dealer', phase: 'restored', viewport: 'desktop', expectedRevision: 21, revision: 22,
        response: { status: 0 }, error: 'restoration capture failed',
        audit: { failedAssets: [], consoleErrors: [], interactions: [] },
      }],
      comparisons: [],
    })

    expect(result.blocking.map(item => item.code)).toEqual(expect.arrayContaining([
      'capture-failed', 'revision-mismatch', 'rollback-restoration-failed',
    ]))
  })

  it('blocks History API document URL mutations recorded without a network request', () => {
    const result = evaluatePublicationReport({
      mutation: { requested: false },
      captures: [{
        target: 'editor-candidate', phase: 'pre-publish', viewport: 'desktop', expectedRevision: 22, revision: 22,
        response: { status: 200 },
        audit: {
          failedAssets: [], brokenImages: [], consoleErrors: [], interactions: [],
          documentUrlViolations: [{ stage: 'tabs:before', url: 'https://dashboard.example/preview/page' }],
        },
      }],
      comparisons: [],
    })
    expect(result.blocking).toContainEqual(expect.objectContaining({ code: 'document-url-mutation' }))
  })
})

describe('browser safety seams', () => {
  it('reads Puppeteer response headers from its lowercase record shape', () => {
    const evidence = responseEvidence({
      url: () => 'https://worker.example/body?revision=22',
      status: () => 200,
      headers: () => ({
        'cache-control': 'public, max-age=300',
        'x-oem-published-revision': '22',
        'set-cookie': 'must-not-be-recorded',
      }),
    }, 'https://worker.example/body?revision=22')

    expect(evidence.cacheControl).toBe('public, max-age=300')
    expect(evidence.headers['x-oem-published-revision']).toBe('22')
    expect(evidence.headers).not.toHaveProperty('set-cookie')
  })

  it('matches the complete explicit document URL including query parameters', () => {
    expect(sameKnownDocument('https://example.com/body?revision=22', 'https://example.com/body?revision=22')).toBe(true)
    expect(sameKnownDocument('https://example.com/body?revision=22', 'https://example.com/body')).toBe(false)
    expect(sameKnownDocument('https://example.com/preview?id=x&view=candidate', 'https://example.com/preview?id=x&view=production')).toBe(false)
  })

  it('detects on-load and pre-probe History API query mutations on a fake page', () => {
    const expected = 'https://dashboard.example/preview/nissan-au-ariya?view=candidate'
    expect(inspectOuterDocumentSafety({
      url: () => 'https://dashboard.example/preview/nissan-au-ariya?view=production',
    }, expected, {
      outerAuditUrl: 'https://dashboard.example/preview/nissan-au-ariya?view=production',
      probeUrls: [
        { stage: 'accordion:before', url: expected },
        { stage: 'accordion:after', url: 'https://dashboard.example/preview/nissan-au-ariya' },
      ],
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: 'page-final' }),
      expect.objectContaining({ stage: 'outer-audit' }),
      expect.objectContaining({ stage: 'accordion:after' }),
    ]))
  })

  it('authorizes only exact Worker history and candidate HTML requests', () => {
    const allowed = {
      history: 'https://worker.example/admin/page/publication/history',
      candidateHtml: 'https://worker.example/admin/page/publication/candidate-html?revision=22',
    }
    expect(authorizeBrowserRequest(allowed.history, allowed)).toBe(true)
    expect(authorizeBrowserRequest(allowed.candidateHtml, allowed)).toBe(true)
    expect(authorizeBrowserRequest('https://dashboard.example/preview/page', allowed)).toBe(false)
    expect(authorizeBrowserRequest('https://dealer.example/models/ariya', allowed)).toBe(false)
    expect(authorizeBrowserRequest('https://worker.example/admin/page/publication/candidate-html?revision=23', allowed)).toBe(false)
    expect(authorizeBrowserRequest('https://worker.example/assets/app.js', allowed)).toBe(false)
  })

  it('blocks write requests and external navigation before they can continue', async () => {
    const handlers = {}
    const page = {
      setRequestInterception: async () => {},
      on: (event, handler) => { handlers[event] = handler },
    }
    const records = []
    await installRequestConfinement(page, {
      allowedDocumentUrls: ['https://dealer.example/models/ariya'],
      authorizedUrls: {},
      authorizationHeaders: {},
      records,
    })

    const fakeRequest = ({ method, url, navigation = false }) => {
      const calls = []
      return {
        calls,
        method: () => method,
        url: () => url,
        headers: () => ({}),
        isNavigationRequest: () => navigation,
        abort: async () => calls.push('abort'),
        continue: async () => calls.push('continue'),
      }
    }
    const write = fakeRequest({ method: 'POST', url: 'https://dealer.example/lead' })
    const navigation = fakeRequest({ method: 'GET', url: 'https://evil.example/', navigation: true })
    const asset = fakeRequest({ method: 'GET', url: 'https://cdn.example/image.jpg' })
    await handlers.request(write)
    await handlers.request(navigation)
    await handlers.request(asset)

    expect(write.calls).toEqual(['abort'])
    expect(navigation.calls).toEqual(['abort'])
    expect(asset.calls).toEqual(['continue'])
    expect(records.map(record => record.reason)).toEqual(['non-idempotent-request', 'unexpected-navigation'])
  })

  it('allows common untyped interaction buttons outside forms while rejecting submit/navigation controls', () => {
    expect(isSafeInteractionDescriptor({ tagName: 'A', href: '/buy' })).toBe(false)
    expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: true, type: 'button' })).toBe(false)
    expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: true, type: '' })).toBe(false)
    for (const kind of ['accordion', 'tabs', 'carousel', 'modal']) {
      expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: false, type: '', kind })).toBe(true)
    }
    expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: false, type: 'submit' })).toBe(false)
    expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: false, type: 'button' })).toBe(true)
    expect(isSafeInteractionDescriptor({ tagName: 'INPUT', formAssociated: false, type: 'range' })).toBe(true)
    expect(isSafeInteractionDescriptor({ tagName: 'BUTTON', formAssociated: false, type: 'button', target: '_blank' })).toBe(false)
  })
})

describe('artifact finalization seams', () => {
  it('restores only when production still matches the harness transition', () => {
    expect(conditionalRestorationDecision({
      currentPublishedRevision: 22,
      harnessPublishedRevision: 22,
      startingRevision: 21,
    })).toEqual({
      restore: true,
      requestBody: { targetRevision: 21, expectedPublishedRevision: 22 },
    })
  })

  it('blocks restoration without a rollback request after a concurrent publication', () => {
    expect(conditionalRestorationDecision({
      currentPublishedRevision: 23,
      harnessPublishedRevision: 22,
      startingRevision: 21,
    })).toMatchObject({
      restore: false,
      concurrentTransition: true,
    })
  })

  it('recognizes only task-owned artifact inventory names', () => {
    expect(isTaskArtifactName('report.json')).toBe(true)
    expect(isTaskArtifactName('dealer-restored-mobile-attempt-2.png')).toBe(true)
    expect(isTaskArtifactName('editor-vs-direct-desktop-diff.png')).toBe(true)
    expect(isTaskArtifactName('notes.txt')).toBe(false)
    expect(isTaskArtifactName('../report.json')).toBe(false)
  })

  it('atomically writes a temp file before renaming it over the destination', async () => {
    const calls = []
    await atomicWriteFile('/tmp/report.json', '{}', {
      writeFile: async (...args) => calls.push(['write', ...args]),
      rename: async (...args) => calls.push(['rename', ...args]),
      pid: 123,
    })

    expect(calls[0][0]).toBe('write')
    expect(calls[0][1]).toBe('/tmp/report.json.tmp-123')
    expect(calls[1]).toEqual(['rename', '/tmp/report.json.tmp-123', '/tmp/report.json'])
  })

  it('removes only recognized stale artifacts for a reused run ID', async () => {
    const removed = []
    await resetTaskArtifactInventory('/tmp/task-report', {
      readdir: async () => ['report.json', 'dealer-restored-mobile-attempt-2.png', 'notes.txt'],
      unlink: async path => removed.push(path),
    })
    expect(removed).toEqual([
      '/tmp/task-report/report.json',
      '/tmp/task-report/dealer-restored-mobile-attempt-2.png',
    ])
  })

  it('bounds Worker fetches with the configured abort timeout', async () => {
    await expect(fetchKnown('https://worker.example/history', {
      timeoutMs: 1,
      authorizationEnv: 'UNSET_TEST_AUTH',
    }, {}, {
      fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
      }),
    })).rejects.toMatchObject({ name: 'TimeoutError' })
  })

  it('keeps public fetches credential-free and authorizes only explicit admin calls', async () => {
    const options = parsePublicationArgs([], { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' })
    const requests = []
    const response = {
      ok: true,
      status: 200,
      url: options.urls.manifest,
      headers: { get: () => null },
    }
    const fetchImpl = async (url, init) => {
      requests.push({ url, headers: init.headers })
      return { ...response, url }
    }

    await fetchKnown(options.urls.manifest, options, {}, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })
    await fetchKnown(options.urls.publishedBodyBase + '?revision=22', options, {}, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })
    await fetchKnown(options.urls.history, options, { authorize: true }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })
    await fetchKnown(options.urls.candidateHtmlBase + '?revision=22', options, { authorize: true }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })
    await fetchKnown(options.urls.publish, options, { authorize: true, method: 'POST' }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })
    await fetchKnown(options.urls.rollback, options, { authorize: true, method: 'POST' }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } })

    expect(requests[0].headers).not.toHaveProperty('Authorization')
    expect(requests[1].headers).not.toHaveProperty('Authorization')
    for (const request of requests.slice(2))
      expect(request.headers.Authorization).toBe('Bearer secret-token')
    await expect(fetchKnown(options.urls.manifest, options, { authorize: true }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } }))
      .rejects.toThrow('not an authorized publication admin endpoint')
    await expect(fetchKnown(options.urls.candidateHtmlBase + '?revision=22&next=/admin', options, { authorize: true }, { fetchImpl, env: { OEM_PUBLICATION_AUTHORIZATION: 'secret-token' } }))
      .rejects.toThrow('not an authorized publication admin endpoint')
  })

  it('records browser close failure while still atomically writing both reports', async () => {
    const written = []
    const report = { runId: 'run', createdAt: 'now', pageId: 'nissan-au-ariya', captures: [], comparisons: [], mutation: { requested: false } }
    await finalizePublicationReport(report, {
      browser: { close: async () => { throw new Error('close failed') } },
      atomicWrite: async (path) => written.push(path),
      artifactDir: '/tmp/task-report',
    })

    expect(report.blocking).toContainEqual(expect.objectContaining({ code: 'browser-close-failed' }))
    expect(written).toEqual(['/tmp/task-report/report.json', '/tmp/task-report/report.md'])
  })
})

describe('renderPublicationMarkdown', () => {
  it('lists revision evidence, viewports, screenshots and findings', () => {
    const markdown = renderPublicationMarkdown({
      runId: 'fixture-run',
      createdAt: '2026-08-04T00:00:00.000Z',
      pageId: 'nissan-au-ariya',
      passed: false,
      startingRevision: 21,
      expectedRevision: 22,
      captures: [{
        target: 'dealer',
        phase: 'pre-publish',
        viewport: 'mobile',
        expectedRevision: 22,
        revision: 22,
        screenshotPath: 'dealer-mobile.png',
        response: { status: 200, cacheControl: 'public, max-age=300' },
        audit: { variantCount: 4, inventoryCount: 8 },
      }],
      comparisons: [{ viewport: 'mobile', mismatchPercent: 0.05, diffPath: 'diff-mobile.png' }],
      blocking: [{ code: 'example', message: 'Example finding' }],
      warnings: [],
    })

    expect(markdown).toContain('Publication battle test: FAIL')
    expect(markdown).toContain('Starting revision: 21')
    expect(markdown).toContain('| dealer | pre-publish | mobile | 200 | 22 | 22 |')
    expect(markdown).toContain('dealer-mobile.png')
    expect(markdown).toContain('diff-mobile.png')
    expect(markdown).toContain('Example finding')
  })
})
