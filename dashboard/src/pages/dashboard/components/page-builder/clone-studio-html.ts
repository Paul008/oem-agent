import { disableClonePreviewNavigation } from './clone-preview-html'

export interface CloneStudioHtmlOptions {
  rendered: string
  title: string
  baseHref: string
  selectedRegionId: string | null
  bridgeToken?: string
}

const HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi

export function buildCloneStudioHtml(options: CloneStudioHtmlOptions): string {
  const { bodyHtml, headParts } = extractHeadParts(options.rendered)
  const rendered = disableClonePreviewNavigation(bodyHtml)
  const selectedRegion = safeJson(options.selectedRegionId)
  const bridgeToken = safeJson(options.bridgeToken ?? createCloneStudioBridgeToken())

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtmlAttribute(options.baseHref)}">
  <title>${escapeHtmlText(options.title)}</title>
  ${headParts.join('\n  ')}
  <style>
    html {
      min-height: 100%;
      background: #ffffff;
    }

    body {
      min-height: 100%;
      margin: 0;
    }

    [data-clone-studio-hover] {
      cursor: pointer;
      outline: 2px solid rgba(37, 99, 235, 0.55);
      outline-offset: -2px;
    }

    [data-clone-studio-selected] {
      cursor: pointer;
      outline: 3px solid rgba(14, 165, 233, 0.95);
      outline-offset: -3px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.82);
    }

    @media (min-width: 1024px) {
      img,
      picture,
      video,
      canvas,
      svg {
        max-width: 100%;
      }

      img,
      video {
        height: auto;
      }
    }
  </style>
  <script>
    window.__CLONE_STUDIO_SELECTED_REGION__ = ${selectedRegion};
  </script>
</head>
<body>
${rendered}
<script data-clone-studio-bridge="true">
(function () {
  var BRIDGE_TOKEN = ${bridgeToken}
  var MESSAGE_READY = 'clone-studio:ready'
  var MESSAGE_SELECT = 'clone-studio:select'
  var MESSAGE_SELECT_REGION = 'clone-studio:select-region'
  var MESSAGE_DOM_UPDATED = 'clone-studio:dom-updated'
  var MESSAGE_PATCH_FIELD = 'clone-studio:patch-field'
  var REGION_SELECTOR = '[data-oem-region-id]'
  var selectedRegion = null
  var hoverRegion = null

  function post(type, extra) {
    var bodyHtml = getBodyHtml()
    var message = {
      source: 'clone-studio',
      type: type,
      bridgeToken: BRIDGE_TOKEN,
      html: bodyHtml,
      bodyHtml: bodyHtml,
      selectedRegionId: selectedRegion ? selectedRegion.getAttribute('data-oem-region-id') : null
    }

    if (extra) {
      for (var key in extra)
        message[key] = extra[key]
    }

    window.parent.postMessage(message, '*')
  }

  function getBodyHtml() {
    var clone = document.body.cloneNode(true)
    var bridgeScripts = clone.querySelectorAll('script[data-clone-studio-bridge]')
    var markedRegions = clone.querySelectorAll('[data-clone-studio-hover], [data-clone-studio-selected]')

    for (var i = 0; i < bridgeScripts.length; i++)
      bridgeScripts[i].parentNode.removeChild(bridgeScripts[i])

    for (var j = 0; j < markedRegions.length; j++) {
      markedRegions[j].removeAttribute('data-clone-studio-hover')
      markedRegions[j].removeAttribute('data-clone-studio-selected')
    }

    return stripPreviewScaffolding(clone.innerHTML)
  }

  function stripPreviewScaffolding(html) {
    return String(html || '').replace(/<a\\b[^>]*>/gi, restorePreviewAnchor)
  }

  function restorePreviewAnchor(tag) {
    var originalHref = readHtmlAttribute(tag, 'data-oem-preview-href')
    var originalOnclick = readHtmlAttribute(tag, 'data-oem-preview-onclick')
    var nextTag = tag

    nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-link')
    nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-href')
    nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-onclick')
    nextTag = nextTag.replace(/\\sonclick\\s*=\\s*(["'])return false\\1/gi, '')

    if (originalHref != null)
      nextTag = setHtmlAttribute(nextTag, 'href', originalHref)
    else
      nextTag = nextTag.replace(/\\shref\\s*=\\s*(["'])#oem-preview-disabled\\1/gi, '')

    if (originalOnclick != null)
      nextTag = setHtmlAttribute(nextTag, 'onclick', originalOnclick)

    return nextTag
  }

  function readHtmlAttribute(tag, name) {
    var doubleMatch = String(tag).match(new RegExp('\\\\s' + escapeRegExp(name) + '\\\\s*=\\\\s*"([^"]*)"', 'i'))
    if (doubleMatch)
      return doubleMatch[1]

    var singleMatch = String(tag).match(new RegExp("\\\\s" + escapeRegExp(name) + "\\\\s*=\\\\s*'([^']*)'", "i"))
    return singleMatch ? singleMatch[1] : null
  }

  function removeHtmlAttribute(tag, name) {
    var doublePattern = new RegExp('\\\\s' + escapeRegExp(name) + '\\\\s*=\\\\s*"[^"]*"', 'gi')
    var singlePattern = new RegExp("\\\\s" + escapeRegExp(name) + "\\\\s*=\\\\s*'[^']*'", "gi")
    return String(tag).replace(doublePattern, '').replace(singlePattern, '')
  }

  function setHtmlAttribute(tag, name, value) {
    var escapedValue = String(value).replace(/"/g, '&quot;')
    var doublePattern = new RegExp('\\\\s' + escapeRegExp(name) + '\\\\s*=\\\\s*"[^"]*"', 'i')
    var singlePattern = new RegExp("\\\\s" + escapeRegExp(name) + "\\\\s*=\\\\s*'[^']*'", "i")

    if (doublePattern.test(tag))
      return String(tag).replace(doublePattern, ' ' + name + '="' + escapedValue + '"')

    if (singlePattern.test(tag))
      return String(tag).replace(singlePattern, ' ' + name + '="' + escapedValue + '"')

    return String(tag).replace(/>$/, ' ' + name + '="' + escapedValue + '">')
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&')
  }

  function sanitizeUrl(value) {
    var url = String(value == null ? '' : value).trim()
    var lowerUrl = url.toLowerCase()

    if (!url)
      return ''

    if (lowerUrl.indexOf('http://') === 0 || lowerUrl.indexOf('https://') === 0)
      return url

    if (url.charAt(0) === '#' || (url.charAt(0) === '/' && url.charAt(1) !== '/'))
      return url

    if (lowerUrl.indexOf('data:image/') === 0)
      return url

    return ''
  }

  function sanitizeSrcset(value) {
    return String(value == null ? '' : value)
      .split(',')
      .map(function (candidate) {
        var trimmed = candidate.trim()
        var match = trimmed.match(/^(\\S+)(.*)$/)
        if (!match)
          return ''

        var sanitizedUrl = sanitizeUrl(match[1])
        return sanitizedUrl ? sanitizedUrl + match[2] : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  function sanitizeStyle(value) {
    return String(value || '').replace(/url\\((["']?)(.*?)\\1\\)/gi, function (_match, _quote, url) {
      var sanitizedUrl = sanitizeUrl(url)
      return sanitizedUrl ? 'url("' + sanitizedUrl.replace(/"/g, '%22') + '")' : ''
    })
  }

  function sanitizeHtml(value) {
    var html = String(value == null ? '' : value)
    html = html.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
    html = html.replace(/<script\\b[^>]*\\/?\\s*>/gi, '')
    html = html.replace(/\\son[a-z0-9:-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)/gi, '')
    html = html.replace(/\\s(href|src|poster|action|xlink:href)\\s*=\\s*(["'])(.*?)\\2/gi, function (_match, name, quote, url) {
      return ' ' + name + '=' + quote + sanitizeUrl(url) + quote
    })
    html = html.replace(/\\ssrcset\\s*=\\s*(["'])(.*?)\\1/gi, function (_match, quote, srcset) {
      return ' srcset=' + quote + sanitizeSrcset(srcset) + quote
    })
    html = html.replace(/\\sstyle\\s*=\\s*(["'])(.*?)\\1/gi, function (_match, quote, style) {
      return ' style=' + quote + sanitizeStyle(style) + quote
    })
    return html
  }

  function escapeAttributeSelectorValue(value) {
    return String(value).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"')
  }

  function findRegionById(regionId) {
    if (regionId == null || regionId === '')
      return null

    var id = String(regionId)

    try {
      var escaped = window.CSS && window.CSS.escape ? window.CSS.escape(id) : escapeAttributeSelectorValue(id)
      var match = document.querySelector('[data-oem-region-id="' + escaped + '"]')
      if (match)
        return match
    }
    catch (_error) {}

    var regions = document.querySelectorAll(REGION_SELECTOR)
    for (var i = 0; i < regions.length; i++) {
      if (regions[i].getAttribute('data-oem-region-id') === id)
        return regions[i]
    }

    return null
  }

  function closestRegion(target) {
    if (!target || !target.closest)
      return null

    return target.closest(REGION_SELECTOR)
  }

  function isNavigationElement(target) {
    if (!target || !target.closest)
      return false

    return !!target.closest('a, area, img[usemap], map, button, form, input[type="submit"], input[type="image"], input[type="button"], [role="button"], [onclick], [data-oem-preview-link]')
  }

  function setHoverRegion(region) {
    if (hoverRegion === region)
      return

    if (hoverRegion)
      hoverRegion.removeAttribute('data-clone-studio-hover')

    hoverRegion = region

    if (hoverRegion && hoverRegion !== selectedRegion)
      hoverRegion.setAttribute('data-clone-studio-hover', 'true')
  }

  function selectRegion(region, shouldPost) {
    if (selectedRegion)
      selectedRegion.removeAttribute('data-clone-studio-selected')

    selectedRegion = region || null

    if (selectedRegion) {
      selectedRegion.setAttribute('data-clone-studio-selected', 'true')
      selectedRegion.removeAttribute('data-clone-studio-hover')
    }

    if (shouldPost) {
      post(MESSAGE_SELECT_REGION, {
        regionId: selectedRegion ? selectedRegion.getAttribute('data-oem-region-id') : null
      })
    }
  }

  function queryPatchTarget(root, selector) {
    if (!selector)
      return null

    try {
      return root.querySelector(selector) || document.querySelector(selector)
    }
    catch (_error) {
      return null
    }
  }

  function queryFieldTarget(root, field) {
    if (!field)
      return null

    var value = escapeAttributeSelectorValue(field)
    var selector = [
      '[data-oem-field="' + value + '"]',
      '[data-oem-field-key="' + value + '"]',
      '[data-clone-field="' + value + '"]',
      '[data-clone-studio-field="' + value + '"]',
      '[data-field="' + value + '"]'
    ].join(',')

    return queryPatchTarget(root, selector)
  }

  function resolvePatchTarget(message, region, kind) {
    var root = region || selectedRegion || document.body
    var explicitTarget = queryPatchTarget(root, message.selector)
    if (explicitTarget)
      return explicitTarget

    var fieldTarget = queryFieldTarget(root, message.field || message.fieldKey || message.key)
    if (fieldTarget)
      return fieldTarget

    if (kind === 'image')
      return root.querySelector('img, source, [data-oem-field*="image"], [data-field*="image"]') || root

    if (kind === 'link')
      return root.querySelector('a') || root

    if (kind === 'visibility')
      return root

    return root.querySelector('[contenteditable], h1, h2, h3, h4, h5, h6, p, span, small, li, a, button') || root
  }

  function inferFieldKind(message, target) {
    var explicitKind = message.kind || message.fieldKind || message.typeHint
    if (explicitKind)
      return String(explicitKind)

    var field = String(message.field || message.fieldKey || message.key || '').toLowerCase()
    if (field.indexOf('image') !== -1 || field.indexOf('img') !== -1 || field.indexOf('photo') !== -1)
      return 'image'
    if (field.indexOf('href') !== -1 || field.indexOf('link') !== -1 || field.indexOf('url') !== -1)
      return 'link'
    if (field.indexOf('visible') !== -1 || field.indexOf('visibility') !== -1 || field.indexOf('hidden') !== -1)
      return 'visibility'
    if (target && target.tagName === 'IMG')
      return 'image'
    if (target && target.tagName === 'A')
      return 'link'

    return message.html ? 'html' : 'text'
  }

  function booleanValue(value) {
    return value === true || value === 'true' || value === 1 || value === '1' || value === 'visible' || value === 'show'
  }

  function patchImage(target, value) {
    var sanitizedUrl = sanitizeUrl(value)

    if (target.tagName === 'SOURCE') {
      target.setAttribute('srcset', sanitizeSrcset(value))
      return
    }

    if (target.tagName === 'IMG') {
      target.setAttribute('src', sanitizedUrl)
      if (target.hasAttribute('srcset'))
        target.setAttribute('srcset', sanitizeSrcset(value))
      return
    }

    target.style.backgroundImage = sanitizedUrl ? 'url("' + sanitizedUrl.replace(/"/g, '%22') + '")' : ''
  }

  function patchLink(target, value, message) {
    var anchor = target.tagName === 'A' ? target : target.querySelector('a')
    if (!anchor)
      anchor = target

    var sanitizedUrl = sanitizeUrl(value)
    anchor.setAttribute('href', sanitizedUrl)
    anchor.setAttribute('data-oem-preview-href', sanitizedUrl)

    if (message.text != null)
      anchor.textContent = String(message.text)
  }

  function patchVisibility(target, value) {
    var isVisible = booleanValue(value)
    target.hidden = !isVisible

    if (isVisible) {
      target.style.removeProperty('display')
      target.removeAttribute('aria-hidden')
    }
    else {
      target.style.display = 'none'
      target.setAttribute('aria-hidden', 'true')
    }
  }

  function patchField(message) {
    var region = findRegionById(message.regionId || message.selectedRegionId)
    var kind = message.kind || message.fieldKind || message.typeHint || null
    var target = resolvePatchTarget(message, region, kind)
    var value = message.value

    if (!target)
      return false

    kind = inferFieldKind(message, target)

    if (kind === 'image')
      patchImage(target, value)
    else if (kind === 'link')
      patchLink(target, value, message)
    else if (kind === 'visibility')
      patchVisibility(target, value)
    else if (kind === 'html')
      target.innerHTML = sanitizeHtml(value)
    else
      target.textContent = String(value == null ? '' : value)

    return true
  }

  function handleNavigationEvent(event) {
    var target = event.target
    var region = closestRegion(target)

    if (event.type === 'click' || isNavigationElement(target))
      event.preventDefault()

    if (region) {
      event.preventDefault()
      event.stopPropagation()
      selectRegion(region, true)
    }
  }

  document.addEventListener('mousemove', function (event) {
    setHoverRegion(closestRegion(event.target))
  }, true)

  document.addEventListener('mouseleave', function () {
    setHoverRegion(null)
  }, true)

  document.addEventListener('click', handleNavigationEvent, true)
  document.addEventListener('auxclick', handleNavigationEvent, true)
  document.addEventListener('dblclick', handleNavigationEvent, true)
  document.addEventListener('submit', function (event) {
    event.preventDefault()
    event.stopPropagation()
  }, true)

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent)
      return

    var message = event.data || {}
    if (message.bridgeToken !== BRIDGE_TOKEN)
      return

    if (message.type === MESSAGE_SELECT || message.type === MESSAGE_SELECT_REGION) {
      selectRegion(findRegionById(message.regionId || message.selectedRegionId || message.id), true)
      return
    }

    if (message.type === MESSAGE_PATCH_FIELD) {
      if (patchField(message))
        post(MESSAGE_DOM_UPDATED, { regionId: message.regionId || message.selectedRegionId || null })
    }
  })

  selectRegion(findRegionById(window.__CLONE_STUDIO_SELECTED_REGION__), false)
  post(MESSAGE_READY)
})()
</script>
</body>
</html>`
}

export function stripCloneStudioScaffoldingForTest(html: string): string {
  return stripCloneStudioScaffolding(html)
}

export function sanitizeCloneStudioUrlForTest(value: unknown): string {
  return sanitizeCloneStudioUrl(value)
}

export function sanitizeCloneStudioHtmlForTest(value: unknown): string {
  return sanitizeCloneStudioHtml(value)
}

function extractHeadParts(rendered: string): { bodyHtml: string, headParts: string[] } {
  const headParts: string[] = []
  const bodyHtml = rendered.replace(HEAD_PART_PATTERN, (match: string) => {
    headParts.push(match)
    return ''
  })

  return { bodyHtml, headParts }
}

function stripCloneStudioScaffolding(html: string): string {
  return html.replace(/<a\b[^>]*>/gi, restorePreviewAnchor)
}

function restorePreviewAnchor(tag: string): string {
  const originalHref = readHtmlAttribute(tag, 'data-oem-preview-href')
  const originalOnclick = readHtmlAttribute(tag, 'data-oem-preview-onclick')
  let nextTag = tag

  nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-link')
  nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-href')
  nextTag = removeHtmlAttribute(nextTag, 'data-oem-preview-onclick')
  nextTag = nextTag.replace(/\sonclick\s*=\s*(["'])return false\1/gi, '')

  if (originalHref != null)
    nextTag = setHtmlAttribute(nextTag, 'href', originalHref)
  else
    nextTag = nextTag.replace(/\shref\s*=\s*(["'])#oem-preview-disabled\1/gi, '')

  if (originalOnclick != null)
    nextTag = setHtmlAttribute(nextTag, 'onclick', originalOnclick)

  return nextTag
}

function readHtmlAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  const match = tag.match(pattern)
  return match?.[2] ?? null
}

function removeHtmlAttribute(tag: string, name: string): string {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'gi')
  return tag.replace(pattern, '')
}

function setHtmlAttribute(tag: string, name: string, value: string): string {
  const escapedValue = value.replace(/"/g, '&quot;')
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i')

  if (pattern.test(tag))
    return tag.replace(pattern, ` ${name}="${escapedValue}"`)

  return tag.replace(/>$/, ` ${name}="${escapedValue}">`)
}

function sanitizeCloneStudioUrl(value: unknown): string {
  const url = String(value ?? '').trim()
  const lowerUrl = url.toLowerCase()

  if (!url)
    return ''

  if (lowerUrl.startsWith('http://') || lowerUrl.startsWith('https://'))
    return url

  if (url.startsWith('#') || (url.startsWith('/') && !url.startsWith('//')))
    return url

  if (lowerUrl.startsWith('data:image/'))
    return url

  return ''
}

function sanitizeCloneStudioSrcset(value: unknown): string {
  return String(value ?? '')
    .split(',')
    .map((candidate: string) => {
      const trimmed = candidate.trim()
      const match = trimmed.match(/^(\S+)(.*)$/)
      if (!match)
        return ''

      const sanitizedUrl = sanitizeCloneStudioUrl(match[1])
      return sanitizedUrl ? `${sanitizedUrl}${match[2]}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

function sanitizeCloneStudioStyle(value: string): string {
  return value.replace(/url\((["']?)(.*?)\1\)/gi, (_match: string, _quote: string, url: string) => {
    const sanitizedUrl = sanitizeCloneStudioUrl(url)
    return sanitizedUrl ? `url("${sanitizedUrl.replace(/"/g, '%22')}")` : ''
  })
}

function sanitizeCloneStudioHtml(value: unknown): string {
  let html = String(value ?? '')
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<script\b[^>]*\/?\s*>/gi, '')
  html = html.replace(/\son[a-z0-9:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/\s(href|src|poster|action|xlink:href)\s*=\s*(["'])(.*?)\2/gi, (_match: string, name: string, quote: string, url: string) => {
    return ` ${name}=${quote}${sanitizeCloneStudioUrl(url)}${quote}`
  })
  html = html.replace(/\ssrcset\s*=\s*(["'])(.*?)\1/gi, (_match: string, quote: string, srcset: string) => {
    return ` srcset=${quote}${sanitizeCloneStudioSrcset(srcset)}${quote}`
  })
  html = html.replace(/\sstyle\s*=\s*(["'])(.*?)\1/gi, (_match: string, quote: string, style: string) => {
    return ` style=${quote}${sanitizeCloneStudioStyle(style)}${quote}`
  })

  return html
}

function createCloneStudioBridgeToken(): string {
  const cryptoApi = globalThis.crypto

  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(4)
    cryptoApi.getRandomValues(values)
    return Array.from(values, (value: number) => value.toString(36)).join('')
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
}

function safeJson(value: string | null): string {
  return JSON.stringify(value).replace(/</g, '\\u003C')
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
