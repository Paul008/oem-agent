import { disableClonePreviewNavigation } from './clone-preview-html'

export interface CloneStudioHtmlOptions {
  rendered: string
  title: string
  baseHref: string
  selectedRegionId: string | null
  bridgeToken?: string
}

export type CloneStudioUrlContext = 'link' | 'media'

const HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi
const LINK_URL_ATTRIBUTE_NAMES = new Set(['href', 'action', 'formaction', 'cite', 'manifest'])
const MEDIA_URL_ATTRIBUTE_NAMES = new Set(['src', 'poster', 'data', 'xlink:href'])
const SAFE_HEAD_LINK_REL_NAMES = new Set(['stylesheet', 'preconnect', 'dns-prefetch', 'preload'])
const SAFE_HEAD_PRELOAD_AS_NAMES = new Set(['style', 'font', 'image'])

export function buildCloneStudioHtml(options: CloneStudioHtmlOptions): string {
  const { bodyHtml, headParts } = extractHeadParts(options.rendered)
  const sanitizedHeadParts = sanitizeCloneStudioHeadParts(headParts)
  const rendered = stripClonePreviewInlineHandlers(disableClonePreviewNavigation(sanitizeCloneStudioHtml(bodyHtml)))
  const selectedRegion = safeJson(options.selectedRegionId)
  const bridgeToken = safeJson(options.bridgeToken ?? createCloneStudioBridgeToken())

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <base href="${escapeHtmlAttribute(options.baseHref)}">
  <title>${escapeHtmlText(options.title)}</title>
  ${sanitizedHeadParts.join('\n  ')}
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

    return sanitizeHtml(stripPreviewScaffolding(clone.innerHTML))
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

  function decodeHtmlEntities(value) {
    return String(value)
      .replace(/&#x([0-9a-f]+);?/gi, function (_match, code) {
        return String.fromCharCode(parseInt(code, 16))
      })
      .replace(/&#([0-9]+);?/g, function (_match, code) {
        return String.fromCharCode(parseInt(code, 10))
      })
      .replace(/&colon;/gi, ':')
  }

  function cssCodePoint(code) {
    return code > 0 && code <= 1114111 ? String.fromCodePoint(code) : ''
  }

  function decodeCssEscapes(value) {
    return String(value).replace(/\\\\([0-9a-fA-F]{1,6})(?:\\r\\n|[\\t\\n\\f\\r ])?|\\\\([^\\r\\n])/g, function (_match, hex, escapedChar) {
      if (!hex)
        return escapedChar || ''

      if (hex.length >= 6) {
        var fullCode = parseInt(hex, 16)
        if (Number.isFinite(fullCode))
          return cssCodePoint(fullCode)
      }

      if (hex.length >= 2) {
        var shortCode = parseInt(hex.slice(0, 2), 16)
        if (shortCode >= 32 && shortCode <= 126)
          return cssCodePoint(shortCode) + hex.slice(2)
      }

      var code = parseInt(hex, 16)
      return Number.isFinite(code) ? cssCodePoint(code) : ''
    })
  }

  function isSafeRasterDataImage(normalizedUrl) {
    return /^data:image\\/(?:png|jpe?g|gif|webp|avif)(?:;[^,]*)?,/.test(normalizedUrl)
  }

  function isRelativeUrl(url, context) {
    if (url.indexOf('//') === 0)
      return false

    if (context === 'link' && url.charAt(0) === '#')
      return true

    return url.charAt(0) === '/'
      || url.indexOf('./') === 0
      || url.indexOf('../') === 0
      || url.charAt(0) === '?'
      || /^[a-z0-9._~-]/i.test(url)
  }

  function sanitizeUrl(value, context) {
    var url = String(value == null ? '' : value).trim()
    var normalizedUrl = decodeHtmlEntities(url).replace(/[\\s\\x00-\\x1F\\x7F]+/g, '').toLowerCase()
    var policy = context === 'media' ? 'media' : 'link'

    if (!url)
      return ''

    if (normalizedUrl.indexOf('http://') === 0 || normalizedUrl.indexOf('https://') === 0)
      return url

    if (policy === 'media' && isSafeRasterDataImage(normalizedUrl))
      return url

    if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl))
      return ''

    if (isRelativeUrl(url, policy))
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

        var sanitizedUrl = sanitizeUrl(match[1], 'media')
        return sanitizedUrl ? sanitizedUrl + match[2] : ''
      })
      .filter(Boolean)
      .join(', ')
  }

  function sanitizeStyle(value) {
    var style = decodeCssEscapes(String(value || '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''))

    if (/expression\\s*\\(|@import|-moz-binding|javascript\\s*:|vbscript\\s*:/i.test(style))
      style = style
        .replace(/@import[^;]*;?/gi, '')
        .replace(/expression\\s*\\([^)]*\\)/gi, '')
        .replace(/-moz-binding\\s*:[^;]*;?/gi, '')
        .replace(/javascript\\s*:/gi, '')
        .replace(/vbscript\\s*:/gi, '')

    return style.replace(/url\\((["']?)(.*?)\\1\\)/gi, function (_match, _quote, url) {
      var sanitizedUrl = sanitizeUrl(decodeCssEscapes(url), 'media')
      return sanitizedUrl ? 'url("' + sanitizedUrl.replace(/"/g, '%22') + '")' : ''
    })
  }

  function escapeHtmlAttributeValue(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function urlPolicyForAttribute(name) {
    var lowerName = String(name).toLowerCase()
    return lowerName === 'src' || lowerName === 'poster' || lowerName === 'data' || lowerName === 'xlink:href' ? 'media' : 'link'
  }

  function sanitizeHtml(value) {
    if (typeof DOMParser !== 'undefined')
      return sanitizeHtmlWithDom(value)

    return sanitizeHtmlFallback(value)
  }

  function sanitizeHtmlWithDom(value) {
    var parser = new DOMParser()
    var doc = parser.parseFromString('<body>' + String(value == null ? '' : value) + '</body>', 'text/html')
    var removable = doc.body.querySelectorAll('script, iframe, object, embed, base, meta, link')

    for (var i = 0; i < removable.length; i++)
      removable[i].parentNode.removeChild(removable[i])

    var elements = doc.body.querySelectorAll('*')
    for (var j = 0; j < elements.length; j++)
      sanitizeElementAttributes(elements[j])

    return doc.body.innerHTML
  }

  function sanitizeElementAttributes(element) {
    var attrs = Array.prototype.slice.call(element.attributes || [])

    for (var i = 0; i < attrs.length; i++) {
      var attr = attrs[i]
      var name = String(attr.name)
      var lowerName = name.toLowerCase()

      if (lowerName.indexOf('on') === 0 || lowerName === 'srcdoc') {
        element.removeAttribute(name)
        continue
      }

      if (lowerName === 'style') {
        var sanitizedStyle = sanitizeStyle(attr.value)
        if (sanitizedStyle)
          element.setAttribute(name, sanitizedStyle)
        else
          element.removeAttribute(name)
        continue
      }

      if (lowerName === 'srcset') {
        element.setAttribute(name, sanitizeSrcset(attr.value))
        continue
      }

      if (isLinkUrlAttribute(lowerName)) {
        element.setAttribute(name, sanitizeUrl(attr.value, 'link'))
        continue
      }

      if (isMediaUrlAttribute(lowerName))
        element.setAttribute(name, sanitizeUrl(attr.value, 'media'))
    }
  }

  function isLinkUrlAttribute(name) {
    return name === 'href' || name === 'action' || name === 'formaction' || name === 'cite' || name === 'manifest'
  }

  function isMediaUrlAttribute(name) {
    return name === 'src' || name === 'poster' || name === 'data' || name === 'xlink:href'
  }

  function sanitizeHtmlFallback(value) {
    var html = String(value == null ? '' : value)
    html = html.replace(/<\\s*(script|iframe|object|embed)\\b[\\s\\S]*?<\\/\\s*\\1\\s*>/gi, '')
    html = html.replace(/<\\s*(script|iframe|object|embed|base|meta|link)\\b[^>]*\\/?\\s*>/gi, '')
    html = html.replace(/<script\\b[^>]*>[\\s\\S]*?<\\/script>/gi, '')
    html = html.replace(/<script\\b[^>]*\\/?\\s*>/gi, '')
    html = html.replace(/\\son[a-z0-9:-]+\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)/gi, '')
    html = html.replace(/\\ssrcdoc\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)/gi, '')
    html = html.replace(/\\s(href|src|poster|action|formaction|cite|manifest|data|xlink:href)\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))/gi, function (_match, name, doubleQuotedUrl, singleQuotedUrl, unquotedUrl) {
      var url = doubleQuotedUrl != null ? doubleQuotedUrl : singleQuotedUrl != null ? singleQuotedUrl : unquotedUrl
      return ' ' + name + '="' + escapeHtmlAttributeValue(sanitizeUrl(url, urlPolicyForAttribute(name))) + '"'
    })
    html = html.replace(/\\ssrcset\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))/gi, function (_match, doubleQuotedSrcset, singleQuotedSrcset, unquotedSrcset) {
      var srcset = doubleQuotedSrcset != null ? doubleQuotedSrcset : singleQuotedSrcset != null ? singleQuotedSrcset : unquotedSrcset
      return ' srcset="' + escapeHtmlAttributeValue(sanitizeSrcset(srcset)) + '"'
    })
    html = html.replace(/\\sstyle\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))/gi, function (_match, doubleQuotedStyle, singleQuotedStyle, unquotedStyle) {
      var style = doubleQuotedStyle != null ? doubleQuotedStyle : singleQuotedStyle != null ? singleQuotedStyle : unquotedStyle
      return ' style="' + escapeHtmlAttributeValue(sanitizeStyle(style)) + '"'
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
    var sanitizedUrl = sanitizeUrl(value, 'media')

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

    var sanitizedUrl = sanitizeUrl(value, 'link')
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

  function stopBlockedEvent(event) {
    event.preventDefault()
    event.stopPropagation()

    if (event.stopImmediatePropagation)
      event.stopImmediatePropagation()
  }

  function handleNavigationEvent(event) {
    var target = event.target
    var region = closestRegion(target)
    var shouldBlock = event.type === 'click' || isNavigationElement(target)

    if (shouldBlock)
      stopBlockedEvent(event)

    if (region) {
      if (!shouldBlock)
        stopBlockedEvent(event)
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
    stopBlockedEvent(event)
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

export function serializeCloneStudioBodyForTest(html: string): string {
  return serializeCloneStudioBody(html)
}

export function sanitizeCloneStudioUrlForTest(value: unknown, context: CloneStudioUrlContext = 'link'): string {
  return sanitizeCloneStudioUrl(value, context)
}

export function sanitizeCloneStudioHtmlForTest(value: unknown): string {
  return sanitizeCloneStudioHtml(value)
}

export interface CloneStudioBlockedEventForTest {
  preventDefault: () => void
  stopPropagation: () => void
  stopImmediatePropagation?: () => void
}

export function stopCloneStudioBlockedEventForTest(event: CloneStudioBlockedEventForTest): void {
  stopCloneStudioBlockedEvent(event)
}

function extractHeadParts(rendered: string): { bodyHtml: string, headParts: string[] } {
  const headParts: string[] = []
  const bodyHtml = rendered.replace(HEAD_PART_PATTERN, (match: string) => {
    headParts.push(match)
    return ''
  })

  return { bodyHtml, headParts }
}

function sanitizeCloneStudioHeadParts(headParts: string[]): string[] {
  return headParts
    .map((part: string) => sanitizeCloneStudioHeadPart(part))
    .filter((part: string) => part.length > 0)
}

function sanitizeCloneStudioHeadPart(part: string): string {
  if (/^<link\b/i.test(part))
    return sanitizeCloneStudioHeadLink(part)

  if (/^<style\b/i.test(part))
    return sanitizeCloneStudioHeadStyle(part)

  return ''
}

function sanitizeCloneStudioHeadLink(part: string): string {
  const attrs = parseCloneStudioTagAttributes(part)
  const relTokens = (attrs.get('rel') ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)

  if (relTokens.length === 0 || relTokens.some((rel: string) => !SAFE_HEAD_LINK_REL_NAMES.has(rel)))
    return ''

  const preloadAs = (attrs.get('as') ?? '').toLowerCase()
  if (relTokens.includes('preload') && !SAFE_HEAD_PRELOAD_AS_NAMES.has(preloadAs))
    return ''

  const href = sanitizeCloneStudioUrl(attrs.get('href') ?? '', 'link')
  if (!href)
    return ''

  const attrPairs: Array<[string, string]> = [
    ['rel', relTokens.join(' ')],
    ['href', href],
  ]
  const optionalAttrs = ['media', 'as', 'type', 'crossorigin', 'integrity', 'referrerpolicy']

  for (const name of optionalAttrs) {
    const value = attrs.get(name)
    if (value != null)
      attrPairs.push([name, value])
  }

  return `<link${formatCloneStudioAttributes(attrPairs)}>`
}

function sanitizeCloneStudioHeadStyle(part: string): string {
  const match = part.match(/^<style\b[^>]*>([\s\S]*?)<\/style>$/i)
  if (!match)
    return ''

  const css = neutralizeCssForStyleElement(sanitizeCloneStudioStyle(match[1])).trim()
  if (!css)
    return ''

  return `<style>${css}</style>`
}

function neutralizeCssForStyleElement(css: string): string {
  return css
    .replace(/</g, '\\3C ')
    .replace(/>/g, '\\3E ')
}

function parseCloneStudioTagAttributes(tag: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const attrSource = tag
    .replace(/^<\s*[a-z0-9:-]+\b/i, '')
    .replace(/\/?\s*>\s*$/i, '')
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>/]+)))?/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(attrSource)) != null) {
    const name = match[1]?.toLowerCase()
    if (!name)
      continue

    attrs.set(name, match[2] ?? match[3] ?? match[4] ?? '')
  }

  return attrs
}

function formatCloneStudioAttributes(attrs: Array<[string, string]>): string {
  return attrs
    .map(([name, value]: [string, string]) => ` ${name}="${escapeHtmlAttribute(value)}"`)
    .join('')
}

function serializeCloneStudioBody(html: string): string {
  return sanitizeCloneStudioHtml(stripCloneStudioScaffolding(html))
}

function stripClonePreviewInlineHandlers(html: string): string {
  return html.replace(/\sonclick\s*=\s*(["'])return false\1/gi, '')
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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match: string, code: string) => {
      return String.fromCharCode(Number.parseInt(code, 16))
    })
    .replace(/&#([0-9]+);?/g, (_match: string, code: string) => {
      return String.fromCharCode(Number.parseInt(code, 10))
    })
    .replace(/&colon;/gi, ':')
}

function cssCodePoint(code: number): string {
  return code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ''
}

function decodeCssEscapes(value: string): string {
  return value.replace(/\\([0-9a-fA-F]{1,6})(?:\r\n|[\t\n\f\r ])?|\\([^\r\n])/g, (_match: string, hex?: string, escapedChar?: string) => {
    if (!hex)
      return escapedChar ?? ''

    if (hex.length >= 6) {
      const fullCode = Number.parseInt(hex, 16)
      if (Number.isFinite(fullCode))
        return cssCodePoint(fullCode)
    }

    if (hex.length >= 2) {
      const shortCode = Number.parseInt(hex.slice(0, 2), 16)
      if (shortCode >= 32 && shortCode <= 126)
        return `${cssCodePoint(shortCode)}${hex.slice(2)}`
    }

    const code = Number.parseInt(hex, 16)
    return Number.isFinite(code) ? cssCodePoint(code) : ''
  })
}

function isSafeRasterDataImage(normalizedUrl: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|avif)(?:;[^,]*)?,/.test(normalizedUrl)
}

function isRelativeUrl(url: string, context: CloneStudioUrlContext): boolean {
  if (url.startsWith('//'))
    return false

  if (context === 'link' && url.startsWith('#'))
    return true

  return url.startsWith('/')
    || url.startsWith('./')
    || url.startsWith('../')
    || url.startsWith('?')
    || /^[a-z0-9._~-]/i.test(url)
}

function sanitizeCloneStudioUrl(value: unknown, context: CloneStudioUrlContext = 'link'): string {
  const url = String(value ?? '').trim()
  const normalizedUrl = decodeHtmlEntities(url).replace(/[\s\u0000-\u001F\u007F]+/g, '').toLowerCase()

  if (!url)
    return ''

  if (normalizedUrl.startsWith('http://') || normalizedUrl.startsWith('https://'))
    return url

  if (context === 'media' && isSafeRasterDataImage(normalizedUrl))
    return url

  if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedUrl))
    return ''

  if (isRelativeUrl(url, context))
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

      const sanitizedUrl = sanitizeCloneStudioUrl(match[1], 'media')
      return sanitizedUrl ? `${sanitizedUrl}${match[2]}` : ''
    })
    .filter(Boolean)
    .join(', ')
}

function sanitizeCloneStudioStyle(value: string): string {
  let style = decodeCssEscapes(value.replace(/\/\*[\s\S]*?\*\//g, ''))

  if (/expression\s*\(|@import|-moz-binding|javascript\s*:|vbscript\s*:/i.test(style)) {
    style = style
      .replace(/@import[^;]*;?/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, '')
      .replace(/-moz-binding\s*:[^;]*;?/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/vbscript\s*:/gi, '')
  }

  return style.replace(/url\((["']?)(.*?)\1\)/gi, (_match: string, _quote: string, url: string) => {
    const sanitizedUrl = sanitizeCloneStudioUrl(decodeCssEscapes(url), 'media')
    return sanitizedUrl ? `url("${sanitizedUrl.replace(/"/g, '%22')}")` : ''
  })
}

function urlPolicyForAttribute(name: string): CloneStudioUrlContext {
  const lowerName = name.toLowerCase()
  return lowerName === 'src' || lowerName === 'poster' || lowerName === 'data' || lowerName === 'xlink:href' ? 'media' : 'link'
}

function sanitizeCloneStudioHtml(value: unknown): string {
  if (typeof DOMParser !== 'undefined')
    return sanitizeCloneStudioHtmlWithDom(value)

  return sanitizeCloneStudioHtmlFallback(value)
}

function sanitizeCloneStudioHtmlWithDom(value: unknown): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<body>${String(value ?? '')}</body>`, 'text/html')
  const removable = doc.body.querySelectorAll('script, iframe, object, embed, base, meta, link')

  for (const element of Array.from(removable))
    element.parentNode?.removeChild(element)

  for (const element of Array.from(doc.body.querySelectorAll('*')))
    sanitizeCloneStudioElementAttributes(element)

  return doc.body.innerHTML
}

function sanitizeCloneStudioElementAttributes(element: Element): void {
  for (const attr of Array.from(element.attributes)) {
    const name = attr.name
    const lowerName = name.toLowerCase()

    if (lowerName.startsWith('on') || lowerName === 'srcdoc') {
      element.removeAttribute(name)
      continue
    }

    if (lowerName === 'style') {
      const sanitizedStyle = sanitizeCloneStudioStyle(attr.value)
      if (sanitizedStyle)
        element.setAttribute(name, sanitizedStyle)
      else
        element.removeAttribute(name)
      continue
    }

    if (lowerName === 'srcset') {
      element.setAttribute(name, sanitizeCloneStudioSrcset(attr.value))
      continue
    }

    if (isCloneStudioLinkUrlAttribute(lowerName)) {
      element.setAttribute(name, sanitizeCloneStudioUrl(attr.value, 'link'))
      continue
    }

    if (isCloneStudioMediaUrlAttribute(lowerName))
      element.setAttribute(name, sanitizeCloneStudioUrl(attr.value, 'media'))
  }
}

function isCloneStudioLinkUrlAttribute(name: string): boolean {
  return LINK_URL_ATTRIBUTE_NAMES.has(name)
}

function isCloneStudioMediaUrlAttribute(name: string): boolean {
  return MEDIA_URL_ATTRIBUTE_NAMES.has(name)
}

function sanitizeCloneStudioHtmlFallback(value: unknown): string {
  let html = String(value ?? '')
  html = html.replace(/<\s*(script|iframe|object|embed)\b[\s\S]*?<\/\s*\1\s*>/gi, '')
  html = html.replace(/<\s*(script|iframe|object|embed|base|meta|link)\b[^>]*\/?\s*>/gi, '')
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  html = html.replace(/<script\b[^>]*\/?\s*>/gi, '')
  html = html.replace(/\son[a-z0-9:-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  html = html.replace(/\s(href|src|poster|action|formaction|cite|manifest|data|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_match: string, name: string, doubleQuotedUrl?: string, singleQuotedUrl?: string, unquotedUrl?: string) => {
    const url = doubleQuotedUrl ?? singleQuotedUrl ?? unquotedUrl ?? ''
    return ` ${name}="${escapeHtmlAttribute(sanitizeCloneStudioUrl(url, urlPolicyForAttribute(name)))}"`
  })
  html = html.replace(/\ssrcset\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_match: string, doubleQuotedSrcset?: string, singleQuotedSrcset?: string, unquotedSrcset?: string) => {
    const srcset = doubleQuotedSrcset ?? singleQuotedSrcset ?? unquotedSrcset ?? ''
    return ` srcset="${escapeHtmlAttribute(sanitizeCloneStudioSrcset(srcset))}"`
  })
  html = html.replace(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_match: string, doubleQuotedStyle?: string, singleQuotedStyle?: string, unquotedStyle?: string) => {
    const style = doubleQuotedStyle ?? singleQuotedStyle ?? unquotedStyle ?? ''
    return ` style="${escapeHtmlAttribute(sanitizeCloneStudioStyle(style))}"`
  })

  return html
}

function stopCloneStudioBlockedEvent(event: CloneStudioBlockedEventForTest): void {
  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()
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
