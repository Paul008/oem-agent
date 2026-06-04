import { disableClonePreviewNavigation } from './clone-preview-html'

export interface CloneStudioHtmlOptions {
  rendered: string
  title: string
  baseHref: string
  selectedRegionId: string | null
  bridgeToken?: string
  /**
   * Absolute origin that serves proxied `/media/...` assets (the OEM-agent worker/media host).
   * Root-relative proxied URLs are rewritten against this so they don't resolve against the
   * OEM source `<base href>` (e.g. ford.com.au), where they would 404.
   */
  mediaBase?: string
  /**
   * OEM stylesheet URLs to load independently of the editable body. Edited clone HTML is serialized
   * body-only (head `<link>`s are stripped), so styling must be sourced from this structured list to
   * survive edits. Only absolute http(s) URLs are emitted; entries already in the captured head are
   * not duplicated.
   */
  stylesheetUrls?: string[]
  /**
   * Persisted per-region visible-height crops. Each entry pins a region (by the same id scheme the
   * bridge assigns via `data-oem-region-id`) to a max-height with `overflow:hidden` so a saved crop
   * renders on load. Live adjustments arrive separately via `clone-studio:set-height` messages.
   */
  regionOverrides?: Array<{ id: string, height_override?: number }>
  /**
   * When false, the bridge is locked to read-only: double-click does not begin an inline edit and
   * the context-menu message is never emitted, so a viewer cannot get an editable caret or menu.
   * Defaults to true (the editor leaves it enabled).
   */
  editable?: boolean
}

export type CloneStudioUrlContext = 'link' | 'media'

const HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi
const LINK_URL_ATTRIBUTE_NAMES = new Set(['href', 'action', 'formaction', 'cite', 'manifest'])
const MEDIA_URL_ATTRIBUTE_NAMES = new Set(['src', 'poster', 'data', 'xlink:href'])
const SAFE_HEAD_LINK_REL_NAMES = new Set(['stylesheet', 'preconnect', 'dns-prefetch', 'preload'])
const SAFE_HEAD_PRELOAD_AS_NAMES = new Set(['style', 'font', 'image'])

export function buildCloneStudioHtml(options: CloneStudioHtmlOptions): string {
  const mediaBase = normalizeCloneStudioMediaBase(options.mediaBase)
  const { bodyHtml, headParts } = extractHeadParts(options.rendered)
  const sanitizedHeadParts = sanitizeCloneStudioHeadParts(headParts)
    .map(part => rewriteProxiedMediaUrls(part, mediaBase))
  const stylesheetLinkTags = buildOemStylesheetLinkTags(options.stylesheetUrls, sanitizedHeadParts)
  sanitizedHeadParts.push(...stylesheetLinkTags)
  const rendered = rewriteProxiedMediaUrls(
    stripClonePreviewInlineHandlers(disableClonePreviewNavigation(sanitizeCloneStudioHtml(
      stripSourceDocumentImagePlaceholders(bodyHtml, options.baseHref),
    ))),
    mediaBase,
  )
  const selectedRegion = safeJson(options.selectedRegionId)
  const editable = options.editable !== false
  const bridgeToken = safeJson(options.bridgeToken ?? createCloneStudioBridgeToken())
  const regionOverrides = safeJsonValue(normalizeCloneStudioRegionOverrides(options.regionOverrides))

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

    html,
    body {
      max-width: 100%;
      overflow-x: clip !important;
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

    /*
     * OEM responsive image classes (e.g. AEM .imgdesktop / .dsktoponly) are hidden by default and
     * revealed by OEM scripts that the clone strips for safety. The editor renders at desktop width,
     * so force the desktop variants visible and keep mobile-only variants hidden to avoid duplicates.
     */
    img.imgdesktop,
    img.dsktoponly,
    .imgdesktop > img,
    .dsktoponly > img {
      display: block !important;
    }

    img.imgmobile,
    img.mobonly,
    .imgmobile > img,
    .mobonly > img {
      display: none !important;
    }

    /*
     * Scroll-reveal libraries leave content transparent until OEM scripts add final-state classes.
     * Those scripts are stripped in Clone Studio, so keep the static desktop clone readable.
     */
    .animated,
    .animate__animated,
    .wow,
    .aos-init,
    [data-aos],
    [class*="fadeIn"] {
      opacity: 1 !important;
      visibility: visible !important;
      transform: none !important;
    }

    /*
     * Carousel tracks are often laid out at full multi-slide width; the OEM JS that clips and
     * positions them is stripped, so constrain common carousel libraries to the desktop frame.
     */
    .slick-list,
    .swiper,
    .swiper-container,
    .swiper-wrapper,
    .splide,
    .splide__track,
    .splide__list,
    .carousel,
    .carousel-inner,
    [class*="swiper"],
    [class*="carousel"],
    [class*="slider"] {
      max-width: 100% !important;
      overflow: hidden !important;
    }

    .slick-track,
    .swiper-wrapper,
    .splide__list,
    .carousel-inner {
      width: 100% !important;
      max-width: 100% !important;
      transform: none !important;
    }

    .slick-slide,
    .swiper-slide,
    .splide__slide,
    .carousel-item {
      width: 100% !important;
      max-width: 100% !important;
      flex-shrink: 0 !important;
    }

    @media (min-width: 1024px) {
      img,
      picture,
      video,
      canvas,
      svg {
        max-width: 100% !important;
      }

      img,
      video {
        height: auto !important;
      }
    }
  </style>
  <script>
    window.__CLONE_STUDIO_SELECTED_REGION__ = ${selectedRegion};
    window.__CLONE_STUDIO_REGION_OVERRIDES__ = ${regionOverrides};
    window.__CLONE_STUDIO_EDITABLE__ = ${editable ? 'true' : 'false'};
  </script>
</head>
<body>
${rendered}
<script data-clone-studio-bridge="true">
(function () {
  var BRIDGE_TOKEN = ${bridgeToken}
  var EDITABLE = window.__CLONE_STUDIO_EDITABLE__ !== false
  var MESSAGE_READY = 'clone-studio:ready'
  var MESSAGE_SELECT = 'clone-studio:select'
  var MESSAGE_SELECT_REGION = 'clone-studio:select-region'
  var MESSAGE_DOM_UPDATED = 'clone-studio:dom-updated'
  var MESSAGE_PATCH_FIELD = 'clone-studio:patch-field'
  var MESSAGE_CONTEXT_MENU = 'clone-studio:context-menu'
  var MESSAGE_BEGIN_EDIT = 'clone-studio:begin-edit'
  var MESSAGE_SET_HEIGHT = 'clone-studio:set-height'
  var MESSAGE_REGION_HEIGHT = 'clone-studio:region-height'
  var MESSAGE_SWITCH_PANEL = 'clone-studio:switch-panel'
  var MESSAGE_DUPLICATE_REGION = 'clone-studio:duplicate-region'
  var RESIZE_HANDLE_MIN_HEIGHT = 40
  var resizeHandle = null
  var resizeDrag = null
  var activeEdit = null
  var REGION_SELECTOR = '[data-oem-region-id]'
  var selectedRegion = null
  var hoverRegion = null
  var generatedRegionId = 1

  function post(type, extra) {
    var bodyHtml = getBodyHtml()
    var message = {
      source: 'clone-studio',
      type: type,
      bridgeToken: BRIDGE_TOKEN,
      html: bodyHtml,
      bodyHtml: bodyHtml,
      selectedRegionId: selectedRegion ? ensureRegionId(selectedRegion) : null
    }

    if (extra) {
      for (var key in extra)
        message[key] = extra[key]
    }

    window.parent.postMessage(message, '*')
  }

  function getBodyHtml() {
    var clone = document.body.cloneNode(true)
    // Strip ALL bridge scaffolding (the injected <script> AND the editor-only resize handle div),
    // not just script elements — otherwise the handle div leaks into the persisted clone HTML.
    var bridgeNodes = clone.querySelectorAll('[data-clone-studio-bridge]')
    var markedRegions = clone.querySelectorAll('[data-clone-studio-hover], [data-clone-studio-selected]')

    for (var i = 0; i < bridgeNodes.length; i++)
      bridgeNodes[i].parentNode.removeChild(bridgeNodes[i])

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

  function candidateFrom(eventTarget) {
    if (!eventTarget || !eventTarget.closest)
      return null

    return eventTarget.closest(REGION_SELECTOR)
      || eventTarget.closest('[data-oem-field], [data-oem-field-key], [data-clone-field], [data-clone-studio-field], [data-field], section, article, main, header, footer, nav, aside, figure, li, a, button, img, h1, h2, h3, h4, h5, h6, p, div')
  }

  function ensureRegionId(element) {
    if (!element || !element.getAttribute || !element.setAttribute)
      return null

    var existingId = element.getAttribute('data-oem-region-id')
    if (existingId)
      return existingId

    var id = null
    do {
      id = 'clone-region-' + generatedRegionId++
    } while (document.querySelector('[data-oem-region-id="' + escapeAttributeSelectorValue(id) + '"]'))

    element.setAttribute('data-oem-region-id', id)
    return id
  }

  function selectorForElement(element) {
    if (!element || !element.getAttribute)
      return ''

    var regionId = element.getAttribute('data-oem-region-id')
    if (regionId)
      return '[data-oem-region-id="' + escapeAttributeSelectorValue(regionId) + '"]'

    var fieldName = element.getAttribute('data-oem-field')
      || element.getAttribute('data-oem-field-key')
      || element.getAttribute('data-clone-field')
      || element.getAttribute('data-clone-studio-field')
      || element.getAttribute('data-field')

    if (fieldName)
      return '[data-oem-field="' + escapeAttributeSelectorValue(fieldName) + '"]'

    var id = element.getAttribute('id')
    if (id) {
      var escapedId = window.CSS && window.CSS.escape ? window.CSS.escape(id) : escapeAttributeSelectorValue(id)
      return '#' + escapedId
    }

    return String(element.tagName || '').toLowerCase()
  }

  function previewText(value) {
    var text = String(value || '').replace(/\\s+/g, ' ').trim()
    return text.length > 90 ? text.slice(0, 87) + '...' : text
  }

  function isTextBearingElement(element) {
    if (!element)
      return false

    var tag = String(element.tagName || '').toLowerCase()
    return !!element.isContentEditable
      || tag === 'h1'
      || tag === 'h2'
      || tag === 'h3'
      || tag === 'h4'
      || tag === 'h5'
      || tag === 'h6'
      || tag === 'p'
      || tag === 'span'
      || tag === 'small'
      || tag === 'li'
      || tag === 'a'
      || tag === 'button'
  }

  function addField(fields, field) {
    for (var i = 0; i < fields.length; i++) {
      if (fields[i].kind === field.kind && fields[i].selector === field.selector && fields[i].key === field.key)
        return
    }

    fields.push(field)
  }

  function matchingElements(root, selector) {
    var elements = []

    if (root && root.matches && root.matches(selector))
      elements.push(root)

    if (root && root.querySelectorAll) {
      var matches = root.querySelectorAll(selector)
      for (var i = 0; i < matches.length; i++)
        elements.push(matches[i])
    }

    return elements
  }

  function extractFields(element) {
    var fields = []
    if (!element)
      return fields

    var regionSelector = selectorForElement(element)
    var textTarget = isTextBearingElement(element)
      ? element
      : element.querySelector('[contenteditable], h1, h2, h3, h4, h5, h6, p, span, small, li, a, button')

    if (textTarget && previewText(textTarget.textContent)) {
      addField(fields, {
        key: 'text',
        label: 'Text',
        kind: 'text',
        selector: selectorForElement(textTarget) || regionSelector,
        value: textTarget.textContent || ''
      })
    }

    if (element.innerHTML && element.children && element.children.length) {
      addField(fields, {
        key: 'html',
        label: 'HTML',
        kind: 'html',
        selector: regionSelector,
        value: element.innerHTML
      })
    }

    var images = matchingElements(element, 'img[src], source[srcset]')
    for (var i = 0; i < images.length; i++) {
      addField(fields, {
        key: 'image',
        label: images[i].getAttribute('alt') || 'Image',
        kind: 'image',
        selector: selectorForElement(images[i]) || regionSelector,
        value: images[i].getAttribute('src') || images[i].getAttribute('srcset') || ''
      })
    }

    var links = matchingElements(element, 'a[href], area[href]')
    for (var j = 0; j < links.length; j++) {
      addField(fields, {
        key: 'link',
        label: previewText(links[j].textContent) || 'Link',
        kind: 'link',
        selector: selectorForElement(links[j]) || regionSelector,
        value: links[j].getAttribute('href') || '',
        text: links[j].textContent || ''
      })
    }

    var buttons = matchingElements(element, 'button, [role="button"], input[type="button"], input[type="submit"], input[type="image"]')
    for (var k = 0; k < buttons.length; k++) {
      addField(fields, {
        key: 'button',
        label: previewText(buttons[k].textContent || buttons[k].getAttribute('value')) || 'Button',
        kind: 'button',
        selector: selectorForElement(buttons[k]) || regionSelector,
        value: buttons[k].textContent || buttons[k].getAttribute('value') || '',
        href: buttons[k].getAttribute('formaction') || buttons[k].getAttribute('data-href') || ''
      })
    }

    addField(fields, {
      key: 'visibility',
      label: 'Visibility',
      kind: 'visibility',
      selector: regionSelector,
      value: !element.hidden && element.getAttribute('aria-hidden') !== 'true'
    })

    return fields
  }

  function regionLabel(element) {
    if (!element)
      return ''

    return previewText(element.getAttribute('aria-label')
      || element.getAttribute('alt')
      || element.getAttribute('title')
      || element.textContent
      || String(element.tagName || '').toLowerCase())
  }

  function matchesAny(element, selector) {
    if (!element || !element.matches)
      return false

    try {
      return element.matches(selector)
    }
    catch (_error) {
      return false
    }
  }

  function classifyRegion(element) {
    if (!element)
      return ''

    var className = element.getAttribute ? element.getAttribute('class') || '' : ''

    if (matchesAny(element, '.swiper, .slick, [class*="carousel"], [class*="slider"]'))
      return 'carousel'

    var hasTablist = matchesAny(element, '[role="tablist"]')
      || (element.querySelector && element.querySelector('[role="tablist"]'))
    if (hasTablist)
      return 'tabs'

    var looksTabbish = /(^|\\s|-)tabs?($|\\s|-)/i.test(className)
      || matchesAny(element, '[class*="tab"]')
    if (looksTabbish) {
      var panels = element.querySelectorAll ? element.querySelectorAll('[role="tabpanel"], .tab-content, .tab-pane') : []
      if (panels.length > 1)
        return 'tabs'
    }

    return ''
  }

  function regionPayload(element) {
    if (!element)
      return null

    var id = ensureRegionId(element)
    var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { top: 0, height: 0 }

    return {
      id: id,
      label: regionLabel(element),
      selector: selectorForElement(element),
      tag: String(element.tagName || '').toLowerCase(),
      type_hint: classifyRegion(element),
      classes: element.getAttribute ? element.getAttribute('class') || '' : '',
      top: (rect.top || 0) + (window.scrollY || 0),
      height: rect.height || 0,
      editable_fields: extractFields(element)
    }
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

  function selectRegion(region, shouldPost, shouldScroll) {
    if (selectedRegion)
      selectedRegion.removeAttribute('data-clone-studio-selected')

    selectedRegion = region || null

    if (selectedRegion) {
      ensureRegionId(selectedRegion)
      selectedRegion.setAttribute('data-clone-studio-selected', 'true')
      selectedRegion.removeAttribute('data-clone-studio-hover')

      if (shouldScroll && selectedRegion.scrollIntoView)
        selectedRegion.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    positionResizeHandle()

    if (shouldPost) {
      var selectedRegionId = selectedRegion ? ensureRegionId(selectedRegion) : null
      post(MESSAGE_SELECT_REGION, {
        regionId: selectedRegionId,
        id: selectedRegionId,
        region: regionPayload(selectedRegion)
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

    if (kind === 'image' || kind === 'alt')
      return root.querySelector('img, source, [data-oem-field*="image"], [data-field*="image"]') || root

    if (kind === 'link')
      return root.querySelector('a') || root

    if (kind === 'visibility' || kind === 'background')
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

  function patchAlt(target, value) {
    var img = target && target.tagName === 'IMG' ? target : (target && target.querySelector ? target.querySelector('img') : null)
    if (!img || !img.setAttribute)
      return
    img.setAttribute('alt', String(value == null ? '' : value))
  }

  function isPlausibleCssColor(value) {
    var color = String(value == null ? '' : value).trim()
    if (!color)
      return false
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color))
      return true
    if (/^rgba?\\(\\s*[0-9.]+\\s*,\\s*[0-9.]+\\s*,\\s*[0-9.]+\\s*(?:,\\s*[0-9.]+\\s*)?\\)$/i.test(color))
      return true
    if (/^[a-z]+$/i.test(color))
      return true
    return false
  }

  function patchBackground(target, value) {
    if (!target || !target.style)
      return
    var color = String(value == null ? '' : value).trim()
    if (!isPlausibleCssColor(color))
      return
    target.style.backgroundColor = color
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
    else if (kind === 'alt')
      patchAlt(target, value)
    else if (kind === 'background')
      patchBackground(target, value)
    else if (kind === 'link')
      patchLink(target, value, message)
    else if (kind === 'visibility')
      patchVisibility(target, value)
    else if (kind === 'html')
      target.innerHTML = sanitizeHtml(message.html != null ? message.html : value == null ? '' : value)
    else
      target.textContent = String(value == null ? '' : value)

    return true
  }

  function setRegionHeight(regionId, value) {
    var el = findRegionById(regionId)
    if (!el || !el.style)
      return false

    var height = typeof value === 'number' && value > 0 ? value : 0

    el.style.maxHeight = height ? height + 'px' : ''
    el.style.overflow = height ? 'hidden' : ''

    return true
  }

  function applyRegionOverrides(overrides) {
    if (!overrides || !overrides.length)
      return

    for (var i = 0; i < overrides.length; i++) {
      var override = overrides[i]
      if (override && override.id)
        setRegionHeight(override.id, override.height_override)
    }
  }

  function ensureResizeHandle() {
    // The drag handle is an editor-only affordance, so the read-only preview never creates it.
    if (!EDITABLE)
      return null

    if (resizeHandle)
      return resizeHandle

    var handle = document.createElement('div')
    // Mark as bridge scaffolding so getBodyHtml() strips it from any serialized/persisted HTML.
    handle.setAttribute('data-clone-studio-bridge', 'true')
    handle.setAttribute('data-clone-studio-resize-handle', 'true')
    handle.setAttribute('title', 'Drag to crop height · double-click to clear')
    handle.style.position = 'absolute'
    handle.style.height = '8px'
    handle.style.zIndex = '2147483646'
    handle.style.cursor = 'ns-resize'
    handle.style.background = 'rgba(14, 165, 233, 0.95)'
    handle.style.borderRadius = '4px'
    handle.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.85)'
    handle.style.display = 'none'
    handle.style.touchAction = 'none'

    handle.addEventListener('pointerdown', onResizePointerDown, false)
    handle.addEventListener('dblclick', onResizeDoubleClick, false)

    document.body.appendChild(handle)
    resizeHandle = handle
    return handle
  }

  function regionNaturalHeight(el) {
    if (!el)
      return 0

    // Temporarily clear the crop so scrollHeight reports the uncropped (natural) height, then restore.
    var prevMaxHeight = el.style ? el.style.maxHeight : ''
    var prevOverflow = el.style ? el.style.overflow : ''

    if (el.style) {
      el.style.maxHeight = ''
      el.style.overflow = ''
    }

    var natural = el.scrollHeight || el.offsetHeight || 0

    if (el.style) {
      el.style.maxHeight = prevMaxHeight
      el.style.overflow = prevOverflow
    }

    return natural
  }

  function positionResizeHandle() {
    if (!EDITABLE)
      return

    var handle = ensureResizeHandle()
    if (!handle)
      return

    if (!selectedRegion || !selectedRegion.getBoundingClientRect) {
      handle.style.display = 'none'
      return
    }

    var rect = selectedRegion.getBoundingClientRect()
    var width = Math.min(rect.width || 0, 120)
    if (width < 40)
      width = Math.max(rect.width || 0, 24)

    var left = (rect.left || 0) + (window.scrollX || 0) + ((rect.width || 0) - width) / 2
    var top = (rect.bottom || 0) + (window.scrollY || 0) - 4

    handle.style.width = width + 'px'
    handle.style.left = left + 'px'
    handle.style.top = top + 'px'
    handle.style.display = 'block'
  }

  function onResizePointerDown(event) {
    if (!EDITABLE || !selectedRegion)
      return

    event.preventDefault()
    event.stopPropagation()

    var rect = selectedRegion.getBoundingClientRect()
    resizeDrag = {
      regionId: ensureRegionId(selectedRegion),
      el: selectedRegion,
      // Region top in client coordinates; pointermove uses clientY so both share the same space.
      regionTop: rect.top || 0,
      naturalHeight: regionNaturalHeight(selectedRegion),
      height: rect.height || 0
    }

    if (resizeHandle && resizeHandle.setPointerCapture && event.pointerId != null) {
      try { resizeHandle.setPointerCapture(event.pointerId) }
      catch (_captureError) {}
    }

    document.addEventListener('pointermove', onResizePointerMove, true)
    document.addEventListener('pointerup', onResizePointerUp, true)
  }

  function clampResizeHeight(pointerY, regionTop, naturalHeight) {
    // Mirror clampRegionHeight from CloneStudioCanvas (kept inline; the bridge is ES5 string code).
    var raw = pointerY - regionTop
    var max = naturalHeight > 0 ? naturalHeight : raw
    return Math.max(RESIZE_HANDLE_MIN_HEIGHT, Math.min(raw, max))
  }

  function onResizePointerMove(event) {
    if (!resizeDrag)
      return

    var height = clampResizeHeight(event.clientY, resizeDrag.regionTop, resizeDrag.naturalHeight)
    resizeDrag.height = height
    setRegionHeight(resizeDrag.regionId, height)
    positionResizeHandle()
  }

  function onResizePointerUp(event) {
    document.removeEventListener('pointermove', onResizePointerMove, true)
    document.removeEventListener('pointerup', onResizePointerUp, true)

    if (!resizeDrag)
      return

    if (resizeHandle && resizeHandle.releasePointerCapture && event && event.pointerId != null) {
      try { resizeHandle.releasePointerCapture(event.pointerId) }
      catch (_releaseError) {}
    }

    var drag = resizeDrag
    resizeDrag = null
    post(MESSAGE_REGION_HEIGHT, { regionId: drag.regionId, height: drag.height })
    positionResizeHandle()
  }

  function onResizeDoubleClick(event) {
    if (!EDITABLE || !selectedRegion)
      return

    event.preventDefault()
    event.stopPropagation()

    var regionId = ensureRegionId(selectedRegion)
    // Clear the crop (height -> natural) locally and tell the parent to drop the persisted override.
    setRegionHeight(regionId, 0)
    post(MESSAGE_REGION_HEIGHT, { regionId: regionId, height: null })
    positionResizeHandle()
  }

  function collectPanels(region) {
    if (!region || !region.querySelectorAll)
      return []

    var found = region.querySelectorAll('[role="tabpanel"], .tab-content, .tab-pane, .swiper-slide, .slick-slide')
    var panels = []
    for (var i = 0; i < found.length; i++)
      panels.push(found[i])

    return panels
  }

  function switchPanel(regionId, index) {
    var region = findRegionById(regionId)
    if (!region)
      return false

    var panels = collectPanels(region)
    if (!panels.length)
      return false

    var targetIndex = typeof index === 'number' && index >= 0 && index < panels.length ? index : 0

    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i]
      if (!panel)
        continue

      if (i === targetIndex) {
        panel.removeAttribute('hidden')
        if (panel.style)
          panel.style.display = ''
        if (panel.classList) {
          panel.classList.add('is-active')
          panel.classList.add('active')
        }
      }
      else {
        panel.setAttribute('hidden', 'hidden')
        if (panel.style)
          panel.style.display = 'none'
        if (panel.classList) {
          panel.classList.remove('is-active')
          panel.classList.remove('active')
        }
      }
    }

    return true
  }

  function enableInteractivity() {
    // Trusted, event-driven navigation for tabs/carousels in the read-only preview. OEM scripts are
    // stripped by the sanitizer, so we wire CLICK navigation against the bridge's own panel-switching
    // primitive (switchPanel). No timers/auto-advance — those are throttled in the sandbox.
    var candidates = document.querySelectorAll('.swiper, .slick, [class*="carousel"], [class*="slider"], [role="tablist"], .tabs, [class*="tab"]')

    // Wire each region inside its OWN function call so every click handler closes over per-call
    // params (regionId/regionEl/kind) -- never a shared loop var. With ES5 var, a loop variable is
    // function-scoped and mutated on every iteration; a handler that closed over the loop var directly
    // would, at click time, see the LAST region value and switch the wrong region. Routing through
    // wireRegion() gives each region a fresh scope, so the captured values are stable.
    for (var i = 0; i < candidates.length; i++)
      wireRegion(candidates[i])
  }

  function wireRegion(regionEl) {
    var kind = classifyRegion(regionEl)
    if (kind !== 'tabs' && kind !== 'carousel')
      return

    var regionId = ensureRegionId(regionEl)
    var wired = false

    if (kind === 'tabs')
      wired = wireTabRegion(regionId, regionEl)
    else
      wired = wireCarouselRegion(regionId, regionEl)

    // slick/swiper inject their arrows via JS, which the sanitizer strips — so a multi-panel region
    // can have slide panels but NO usable existing controls. When nothing was wired, inject our own
    // trusted prev/next/dot bar so the panels stay navigable. Only inject for >1 panel.
    if (!wired && collectPanels(regionEl).length > 1)
      injectControlBar(regionId, regionEl, collectPanels(regionEl).length)

    // Normalize to exactly one visible panel on load (avoids all-visible / all-hidden states).
    switchPanel(regionId, 0)
  }

  function injectControlBar(regionId, regionEl, panelCount) {
    // Trusted, bridge-owned navigation overlaid on a region whose OEM controls were stripped. Every
    // node carries data-clone-studio-bridge so getBodyHtml() removes it (defense-in-depth: this only
    // runs in the read-only preview, which is never serialized). Inline styles only — clone CSS unknown.
    var state = { index: 0 }
    var dots = []

    var bar = document.createElement('div')
    bar.setAttribute('data-clone-studio-bridge', 'true')
    bar.style.position = 'absolute'
    bar.style.left = '0'
    bar.style.right = '0'
    bar.style.bottom = '8px'
    bar.style.zIndex = '2147483646'
    bar.style.display = 'flex'
    bar.style.alignItems = 'center'
    bar.style.justifyContent = 'center'
    bar.style.gap = '8px'
    bar.style.pointerEvents = 'none'

    if (regionEl.style) {
      var position = window.getComputedStyle ? window.getComputedStyle(regionEl).position : ''
      if (position === 'static' || !position)
        regionEl.style.position = 'relative'
    }

    function show(index) {
      var total = collectPanels(regionEl).length
      if (!total)
        return
      var next = index < 0 ? 0 : index > total - 1 ? total - 1 : index
      state.index = next
      switchPanel(regionId, next)
      for (var d = 0; d < dots.length; d++) {
        if (dots[d])
          dots[d].style.background = d === next ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.45)'
      }
    }

    function makeButton(label) {
      var button = document.createElement('button')
      button.setAttribute('data-clone-studio-bridge', 'true')
      button.setAttribute('type', 'button')
      button.textContent = label
      button.style.pointerEvents = 'auto'
      button.style.cursor = 'pointer'
      button.style.border = 'none'
      button.style.width = '32px'
      button.style.height = '32px'
      button.style.borderRadius = '999px'
      button.style.fontSize = '18px'
      button.style.lineHeight = '1'
      button.style.color = '#ffffff'
      button.style.background = 'rgba(15, 23, 42, 0.65)'
      button.style.boxShadow = '0 0 0 1px rgba(255, 255, 255, 0.4)'
      return button
    }

    function suppress(event) {
      event.preventDefault()
      event.stopPropagation()
      if (event.stopImmediatePropagation)
        event.stopImmediatePropagation()
    }

    var prev = makeButton('\\u2039')
    prev.addEventListener('click', function (event) {
      suppress(event)
      show(state.index - 1)
    }, true)

    var dotRow = document.createElement('div')
    dotRow.setAttribute('data-clone-studio-bridge', 'true')
    dotRow.style.display = 'flex'
    dotRow.style.alignItems = 'center'
    dotRow.style.gap = '6px'

    for (var i = 0; i < panelCount; i++) {
      (function (index) {
        var dot = document.createElement('button')
        dot.setAttribute('data-clone-studio-bridge', 'true')
        dot.setAttribute('type', 'button')
        dot.style.pointerEvents = 'auto'
        dot.style.cursor = 'pointer'
        dot.style.border = 'none'
        dot.style.padding = '0'
        dot.style.width = '10px'
        dot.style.height = '10px'
        dot.style.borderRadius = '999px'
        dot.style.background = index === 0 ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.45)'
        dot.style.boxShadow = '0 0 0 1px rgba(15, 23, 42, 0.55)'
        dot.addEventListener('click', function (event) {
          suppress(event)
          show(index)
        }, true)
        dots.push(dot)
        dotRow.appendChild(dot)
      })(i)
    }

    var next = makeButton('\\u203a')
    next.addEventListener('click', function (event) {
      suppress(event)
      show(state.index + 1)
    }, true)

    bar.appendChild(prev)
    bar.appendChild(dotRow)
    bar.appendChild(next)
    regionEl.appendChild(bar)

    return true
  }

  function wireTabRegion(regionId, regionEl) {
    // Tab TRIGGERS: [role="tab"], [aria-controls], or interactive children of [role="tablist"] / .tabs.
    var triggers = tabTriggersFor(regionEl)
    if (!triggers.length)
      return false

    for (var t = 0; t < triggers.length; t++) {
      triggers[t].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()

        var index = interactivityIndexOf(triggers, event.currentTarget)
        if (index < 0)
          index = 0
        switchPanel(regionId, index)
        setTabActiveState(triggers, index)
      }, true)
    }

    return true
  }

  function wireCarouselRegion(regionId, regionEl) {
    // Carousel next/prev controls drive switchPanel; index clamped within collectPanels length.
    var controls = carouselControlsFor(regionEl)
    var state = { index: 0 }

    function step(delta) {
      var total = collectPanels(regionEl).length
      if (!total)
        return
      var next = state.index + delta
      if (next < 0)
        next = 0
      if (next > total - 1)
        next = total - 1
      state.index = next
      switchPanel(regionId, next)
    }

    for (var n = 0; n < controls.next.length; n++) {
      controls.next[n].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()
        step(1)
      }, true)
    }

    for (var p = 0; p < controls.prev.length; p++) {
      controls.prev[p].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()
        step(-1)
      }, true)
    }

    // Report whether any real OEM controls were found; when none, the caller injects a trusted bar.
    return controls.next.length > 0 || controls.prev.length > 0
  }

  function interactivityIndexOf(list, node) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === node)
        return i
    }
    return -1
  }

  function tabTriggersFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    // Prefer explicit ARIA tabs, then aria-controls owners, then interactive children of a tablist/.tabs.
    var explicit = regionEl.querySelectorAll('[role="tab"], [aria-controls]')
    if (explicit.length)
      return Array.prototype.slice.call(explicit)

    var lists = regionEl.querySelectorAll('[role="tablist"], .tabs, [class*="tab"]')
    var triggers = []
    var listEls = lists.length ? Array.prototype.slice.call(lists) : (regionEl.matches && regionEl.matches('[role="tablist"], .tabs, [class*="tab"]') ? [regionEl] : [])

    for (var i = 0; i < listEls.length; i++) {
      var children = listEls[i].querySelectorAll('button, a, li, [class*="tab"]')
      for (var j = 0; j < children.length; j++) {
        var child = children[j]
        // Skip the panels themselves; only collect tab-like controls.
        if (matchesAny(child, '[role="tabpanel"], .tab-content, .tab-pane'))
          continue
        if (interactivityIndexOf(triggers, child) === -1)
          triggers.push(child)
      }
    }

    return triggers
  }

  function carouselControlsFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return { next: [], prev: [] }

    var nextSel = '.swiper-button-next, .slick-next, [aria-label*="next" i], [class*="next"]'
    var prevSel = '.swiper-button-prev, .slick-prev, [aria-label*="prev" i], [class*="prev"]'

    return {
      next: Array.prototype.slice.call(regionEl.querySelectorAll(nextSel)),
      prev: Array.prototype.slice.call(regionEl.querySelectorAll(prevSel))
    }
  }

  function setTabActiveState(triggers, activeIndex) {
    for (var i = 0; i < triggers.length; i++) {
      var trigger = triggers[i]
      var isActive = i === activeIndex
      if (trigger.classList) {
        if (isActive) {
          trigger.classList.add('active')
          trigger.classList.add('is-active')
        }
        else {
          trigger.classList.remove('active')
          trigger.classList.remove('is-active')
        }
      }
      if (trigger.setAttribute)
        trigger.setAttribute('aria-selected', isActive ? 'true' : 'false')
    }
  }

  function beginInlineEdit(region) {
    if (!region)
      return false

    // Reuse the shared text-target resolver so the editable element matches what patchField targets.
    var el = resolvePatchTarget({}, region, 'text')
    if (!el || !el.setAttribute)
      return false

    if (activeEdit && activeEdit.el === el) {
      try { el.focus() } catch (_focusError) {}
      return true
    }

    if (activeEdit)
      finishInlineEdit(true)

    var regionId = ensureRegionId(region)
    var originalText = el.textContent

    function onBlur() {
      finishInlineEdit(true)
    }

    function onKeydown(event) {
      if (event.key === 'Enter' || event.keyCode === 13) {
        event.preventDefault()
        finishInlineEdit(true)
      }
      else if (event.key === 'Escape' || event.keyCode === 27) {
        event.preventDefault()
        el.textContent = originalText
        finishInlineEdit(false)
      }
    }

    activeEdit = {
      el: el,
      regionId: regionId,
      originalText: originalText,
      onBlur: onBlur,
      onKeydown: onKeydown
    }

    el.setAttribute('contenteditable', 'plaintext-only')
    el.addEventListener('blur', onBlur, false)
    el.addEventListener('keydown', onKeydown, false)

    try { el.focus() } catch (_focusError) {}

    return true
  }

  function finishInlineEdit(commit) {
    if (!activeEdit)
      return

    var edit = activeEdit
    activeEdit = null

    edit.el.removeEventListener('blur', edit.onBlur, false)
    edit.el.removeEventListener('keydown', edit.onKeydown, false)
    edit.el.removeAttribute('contenteditable')

    if (edit.el.blur)
      edit.el.blur()

    if (commit) {
      // Post dom-updated (not patch-field) so the parent's onMessage dom-updated branch persists the
      // committed text. The shared post() helper already attaches the updated body HTML
      // (html/bodyHtml from getBodyHtml()), matching every other parent-initiated dom-updated post.
      post(MESSAGE_DOM_UPDATED, {
        regionId: edit.regionId,
        kind: 'text',
        committed: true
      })
    }
  }

  function stopBlockedEvent(event) {
    event.preventDefault()
    event.stopPropagation()

    if (event.stopImmediatePropagation)
      event.stopImmediatePropagation()
  }

  function isBridgeOwnedTarget(target) {
    // Trusted bridge-injected controls (prev/next/dot bar, etc.) carry data-clone-studio-bridge.
    // The document-level navigation guard runs at capture phase BEFORE the control's own capture-phase
    // click handler, so without this exemption stopImmediatePropagation() would swallow the click and
    // the control would never switch the panel. Let bridge-owned targets through untouched.
    return !!(target && target.closest && target.closest('[data-clone-studio-bridge]'))
  }

  function handleNavigationEvent(event) {
    var target = event.target
    if (isBridgeOwnedTarget(target))
      return

    var region = candidateFrom(target)
    var shouldBlock = event.type === 'click' || isNavigationElement(target)

    if (shouldBlock)
      stopBlockedEvent(event)

    if (region) {
      if (!shouldBlock)
        stopBlockedEvent(event)
      selectRegion(region, true)

      if (EDITABLE && event.type === 'dblclick')
        beginInlineEdit(region)
    }
  }

  document.addEventListener('mousemove', function (event) {
    setHoverRegion(candidateFrom(event.target))
  }, true)

  document.addEventListener('mouseleave', function () {
    setHoverRegion(null)
  }, true)

  if (EDITABLE) {
    // Keep the bottom-edge resize handle pinned to the selected region as the page scrolls/resizes.
    window.addEventListener('scroll', positionResizeHandle, true)
    window.addEventListener('resize', positionResizeHandle, false)
  }

  document.addEventListener('click', handleNavigationEvent, true)
  document.addEventListener('auxclick', handleNavigationEvent, true)
  document.addEventListener('dblclick', handleNavigationEvent, true)
  document.addEventListener('submit', function (event) {
    stopBlockedEvent(event)
  }, true)

  document.addEventListener('contextmenu', function (event) {
    var region = candidateFrom(event.target)
    if (!region)
      return

    stopBlockedEvent(event)
    selectRegion(region, true)

    // In read-only previews, suppress the editing context menu (plain selection is still allowed).
    if (!EDITABLE)
      return

    var payload = regionPayload(region)
    post(MESSAGE_CONTEXT_MENU, {
      regionId: payload ? payload.id : ensureRegionId(region),
      fields: payload ? payload.editable_fields : extractFields(region),
      typeHint: payload ? payload.type_hint : classifyRegion(region),
      x: event.clientX,
      y: event.clientY
    })
  }, true)

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent)
      return

    var message = event.data || {}
    if (message.bridgeToken !== BRIDGE_TOKEN)
      return

    if (message.type === MESSAGE_SELECT || message.type === MESSAGE_SELECT_REGION) {
      var targetRegion = findRegionById(message.regionId || message.selectedRegionId || message.id)
      selectRegion(targetRegion, true, true)
      return
    }

    if (message.type === MESSAGE_BEGIN_EDIT) {
      var editRegion = findRegionById(message.regionId || message.selectedRegionId || message.id)
      if (!editRegion)
        return
      selectRegion(editRegion, true)
      beginInlineEdit(editRegion)
      return
    }

    if (message.type === MESSAGE_PATCH_FIELD) {
      if (patchField(message))
        post(MESSAGE_DOM_UPDATED, { regionId: message.regionId || message.selectedRegionId || null })
      return
    }

    if (message.type === MESSAGE_SET_HEIGHT) {
      var heightRegionId = message.regionId || message.selectedRegionId || message.id
      if (setRegionHeight(heightRegionId, message.value))
        post(MESSAGE_DOM_UPDATED, { regionId: heightRegionId })
      return
    }

    if (message.type === MESSAGE_SWITCH_PANEL) {
      var panelRegionId = message.regionId || message.selectedRegionId || message.id
      if (switchPanel(panelRegionId, message.index))
        post(MESSAGE_DOM_UPDATED, { regionId: panelRegionId })
    }

    if (message.type === MESSAGE_DUPLICATE_REGION) {
      var dupRegionId = message.regionId || message.selectedRegionId || message.id
      var dupSource = findRegionById(dupRegionId)
      if (!dupSource || !dupSource.parentNode)
        return
      var dupClone = dupSource.cloneNode(true)
      // Strip the clone's own region id and every nested region id so ensureRegionId
      // re-assigns collision-free (descendants re-acquire ids lazily on interaction).
      if (dupClone.removeAttribute)
        dupClone.removeAttribute('data-oem-region-id')
      var dupNested = dupClone.querySelectorAll('[data-oem-region-id]')
      for (var di = 0; di < dupNested.length; di++)
        dupNested[di].removeAttribute('data-oem-region-id')
      dupSource.parentNode.insertBefore(dupClone, dupSource.nextSibling)
      ensureRegionId(dupClone)
      post(MESSAGE_DOM_UPDATED, { regionId: dupClone.getAttribute('data-oem-region-id'), newRegion: regionPayload(dupClone) })
      return
    }
  })

  selectRegion(findRegionById(window.__CLONE_STUDIO_SELECTED_REGION__), false)
  applyRegionOverrides(window.__CLONE_STUDIO_REGION_OVERRIDES__)

  // Read-only preview only: make tabs/carousels clickable via the trusted bridge layer. The editor
  // (EDITABLE) is unaffected — it keeps click for region selection and the context-menu panel actions.
  if (!EDITABLE)
    enableInteractivity()

  post(MESSAGE_READY)
})()
</script>
</body>
</html>`
}

export function stripCloneStudioScaffoldingForTest(html: string): string {
  return stripCloneStudioScaffolding(html)
}

interface CloneStudioStrippableNode {
  querySelectorAll: (selector: string) => ArrayLike<{ parentNode: { removeChild: (child: unknown) => void } | null }>
}

/**
 * Mirrors the bridge's getBodyHtml() removal step: strip ALL `[data-clone-studio-bridge]` elements
 * (the injected script AND the editor-only resize handle div), so neither leaks into serialized
 * clone HTML. Kept in sync with the inline bridge code by `getBodyHtml queries [data-clone-studio-bridge]`.
 */
export function stripCloneStudioBridgeNodesForTest(clone: CloneStudioStrippableNode): string[] {
  const bridgeNodes = clone.querySelectorAll('[data-clone-studio-bridge]')
  const queried: string[] = []
  for (let i = 0; i < bridgeNodes.length; i++) {
    const node = bridgeNodes[i]
    if (node.parentNode)
      node.parentNode.removeChild(node)
    queried.push('removed')
  }
  return queried
}

interface CloneStudioReassignNode {
  removeAttribute: (name: string) => void
  querySelectorAll: (selector: string) => ArrayLike<{ removeAttribute: (name: string) => void }>
}

// Strip the clone root's region id plus every nested region id. After this, ids re-acquire
// lazily and collision-free via ensureRegionId. The bridge duplicate-region handler runs the
// equivalent ES5 walk in the iframe — keep the two in sync.
export function reassignClonedRegionIdsForTest(clone: CloneStudioReassignNode): number {
  clone.removeAttribute('data-oem-region-id')
  const nested = clone.querySelectorAll('[data-oem-region-id]')
  for (let i = 0; i < nested.length; i++)
    nested[i].removeAttribute('data-oem-region-id')
  return nested.length
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

function buildOemStylesheetLinkTags(stylesheetUrls: string[] | undefined, existingHeadParts: string[]): string[] {
  if (!Array.isArray(stylesheetUrls) || stylesheetUrls.length === 0)
    return []

  const existingHrefs = new Set(
    existingHeadParts
      .flatMap(part => [...part.matchAll(/\bhref=["']([^"']+)["']/gi)].map(match => match[1])),
  )

  const seen = new Set<string>()
  const tags: string[] = []
  for (const url of stylesheetUrls) {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url.trim()))
      continue
    const href = url.trim()
    if (existingHrefs.has(href) || seen.has(href))
      continue
    seen.add(href)
    tags.push(`<link rel="stylesheet" href="${escapeHtmlAttribute(href)}">`)
  }
  return tags
}

function normalizeCloneStudioMediaBase(base: string | undefined): string {
  if (!base)
    return ''

  const trimmed = String(base).trim()
  if (!trimmed || !/^https?:\/\//i.test(trimmed))
    return ''

  return trimmed.replace(/\/+$/, '')
}

/**
 * Rewrite root-relative proxied asset URLs (`/media/...`) to absolute URLs against the media host.
 *
 * Proxied OEM assets are stored as root-relative `/media/...` paths, but the clone iframe sets
 * `<base href>` to the OEM source origin (e.g. ford.com.au), where those paths 404. Pinning them to
 * the media base lets them resolve regardless of the iframe's opaque (`allow-scripts`) origin while
 * leaving the OEM source base href intact for genuinely source-relative resources. Absolute URLs are
 * left untouched, so the rewrite is idempotent.
 */
function rewriteProxiedMediaUrls(html: string, mediaBase: string): string {
  if (!mediaBase)
    return html

  // Match `/media/` only at a value boundary (start, whitespace, quote, paren, comma, `;` from
  // an escaped quote, or `=`) so it never matches `//media` or `host/media/` inside an absolute URL.
  return String(html).replace(/(^|[\s"'(,;=])\/media\//g, (_match, boundary) => `${boundary}${mediaBase}/media/`)
}

function stripSourceDocumentImagePlaceholders(html: string, baseHref: string): string {
  const comparableBaseHref = normalizeCloneStudioComparableUrl(baseHref)
  if (!comparableBaseHref)
    return html

  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser()
    const doc = parser.parseFromString(`<body>${String(html ?? '')}</body>`, 'text/html')
    for (const image of Array.from(doc.body.querySelectorAll('img[src]'))) {
      if (isSourceDocumentImagePlaceholder(image, baseHref, comparableBaseHref))
        image.parentElement?.removeChild(image)
    }
    return doc.body.innerHTML
  }

  return String(html ?? '').replace(/<img\b[^>]*>/gi, (tag: string) => {
    const attrs = parseCloneStudioTagAttributes(tag)
    const src = attrs.get('src') ?? ''
    if (!src || hasRecoverableCloneStudioImageSource(attrs))
      return tag
    return isLikelySourceDocumentImageUrl(src, baseHref, comparableBaseHref) ? '' : tag
  })
}

function isSourceDocumentImagePlaceholder(image: Element, baseHref: string, comparableBaseHref: string): boolean {
  const src = image.getAttribute('src') ?? ''
  if (!src || hasRecoverableCloneStudioImageSource(image))
    return false

  return isLikelySourceDocumentImageUrl(src, baseHref, comparableBaseHref)
}

function isLikelySourceDocumentImageUrl(src: string, baseHref: string, comparableBaseHref: string): boolean {
  if (normalizeCloneStudioComparableUrl(src, baseHref) === comparableBaseHref)
    return true

  try {
    const parsed = new URL(src, baseHref)
    const base = new URL(baseHref)
    if (parsed.origin !== base.origin || parsed.search || parsed.hash)
      return false
    if (/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i.test(parsed.pathname))
      return false

    const basePath = normalizeCloneStudioComparablePath(base.pathname)
    const parsedPath = normalizeCloneStudioComparablePath(parsed.pathname)
    if (!basePath || basePath === '/' || !parsedPath.startsWith(`${basePath}/`))
      return false

    const lastSegment = parsedPath.split('/').filter(Boolean).pop() ?? ''
    return /^(?:19|20)\d{2}$/.test(lastSegment)
  }
  catch {
    return false
  }
}

function normalizeCloneStudioComparablePath(pathname: string): string {
  const normalized = String(pathname ?? '').replace(/\/+$/, '')
  return normalized || '/'
}

function hasRecoverableCloneStudioImageSource(source: Element | Map<string, string>): boolean {
  const read = (name: string) => source instanceof Map ? source.get(name) : source.getAttribute(name)
  const recoverableAttrs = ['srcset', 'data-srcset', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy']
  return recoverableAttrs.some(name => Boolean((read(name) ?? '').trim()))
}

function normalizeCloneStudioComparableUrl(url: string, baseHref?: string): string {
  const trimmed = String(url ?? '').trim()
  if (!trimmed)
    return ''

  try {
    const parsed = baseHref ? new URL(trimmed, baseHref) : new URL(trimmed)
    parsed.hash = ''
    parsed.search = ''
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/'
    return parsed.toString()
  }
  catch {
    return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '')
  }
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

function safeJsonValue(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003C')
}

function normalizeCloneStudioRegionOverrides(
  overrides: CloneStudioHtmlOptions['regionOverrides'],
): Array<{ id: string, height_override?: number }> {
  if (!Array.isArray(overrides))
    return []

  const normalized: Array<{ id: string, height_override?: number }> = []
  for (const override of overrides) {
    if (!override || typeof override.id !== 'string' || !override.id)
      continue

    const height = override.height_override
    if (typeof height === 'number' && Number.isFinite(height) && height > 0)
      normalized.push({ id: override.id, height_override: height })
  }

  return normalized
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
