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
  const stylesheetLinkTags = buildOemStylesheetLinkTags(options.stylesheetUrls, sanitizedHeadParts)
  sanitizedHeadParts.push(...stylesheetLinkTags)
  const proxiedHeadParts = sanitizedHeadParts
    .map(part => proxyCloneStudioHeadAssetUrls(part, options.baseHref, mediaBase))
    .map(part => rewriteProxiedMediaUrls(part, mediaBase))
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
  ${proxiedHeadParts.join('\n  ')}
  <style>
    html {
      min-height: 100%;
      background: #ffffff;
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    body {
      min-height: 100%;
      margin: 0;
      overflow-wrap: anywhere;
    }

    html,
    body {
      width: 100%;
      min-width: 0;
      max-width: 100%;
      overflow-x: clip !important;
    }

    img,
    picture,
    video,
    canvas,
    svg {
      max-width: 100% !important;
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
     * OEM responsive image classes (e.g. AEM .imgdesktop/.imgmobile) are often toggled by scripts
     * that the clone strips for safety. Default to desktop as the reliable fallback; the bridge marks
     * real desktop/mobile pairs so mobile viewports hide the desktop partner only when a mobile
     * counterpart exists.
     */
    img.imgdesktop,
    img.dsktoponly,
    .imgdesktop,
    .dsktoponly,
    [data-clone-studio-responsive-variant="desktop"] {
      display: block !important;
    }

    img.imgmobile,
    img.mobonly,
    img.mobileonly,
    .imgmobile,
    .mobonly,
    .mobileonly,
    [data-clone-studio-responsive-variant="mobile"] {
      display: none !important;
    }

    @media (max-width: 1023.98px) {
      img.imgmobile,
      img.mobonly,
      img.mobileonly,
      .imgmobile,
      .mobonly,
      .mobileonly,
      [data-clone-studio-responsive-variant="mobile"] {
        display: block !important;
      }

      [data-clone-studio-responsive-variant="desktop"][data-clone-studio-responsive-paired="true"] {
        display: none !important;
      }
    }

    @media (min-width: 1024px) {
      [data-clone-studio-responsive-variant="mobile"][data-clone-studio-responsive-paired="true"] {
        display: none !important;
      }
    }

    /*
     * OEM text variants sometimes keep the only available copy inside onlydesktop wrappers while
     * the mobile equivalent is absent from the captured HTML. Hide desktop text on mobile only when
     * the bridge finds a real paired mobile text node.
     */
    [data-clone-studio-responsive-content-variant="desktop"] {
      display: block !important;
    }

    [data-clone-studio-responsive-content-variant="mobile"] {
      display: none !important;
    }

    @media (max-width: 1023.98px) {
      [data-clone-studio-responsive-content-variant="mobile"] {
        display: block !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"][data-clone-studio-responsive-content-paired="true"] {
        display: none !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) {
        display: block !important;
      }

      /*
       * When mobile-only OEM text was not captured, the remaining desktop wrapper still carries
       * desktop-oriented Ford/AEM display classes. Scale those unpaired blocks to the source mobile
       * typography family without changing paired responsive content.
       */
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"])[class*="display1-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h1[class*="display1-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h1 [class*="display1-medium"] {
        font-size: 1.75rem !important;
        line-height: 2.125rem !important;
        letter-spacing: 0 !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"])[class*="display2-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) [class*="display2-medium"] {
        font-size: 2.125rem !important;
        line-height: 2.5rem !important;
        letter-spacing: 0 !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h2[class*="display3-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h2 [class*="display3-medium"] {
        font-size: 1.5rem !important;
        line-height: 2rem !important;
        letter-spacing: 0 !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h3[class*="display3-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h3 [class*="display3-medium"] {
        font-size: 1.75rem !important;
        line-height: 2.125rem !important;
        letter-spacing: 0 !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h2[class*="heading1-medium"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) h2 [class*="heading1-medium"] {
        font-size: 1.5rem !important;
        line-height: 2rem !important;
        letter-spacing: 0 !important;
      }

      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) [class*="body3-regular-gray5"],
      [data-clone-studio-responsive-content-variant="desktop"]:not([data-clone-studio-responsive-content-paired="true"]) [class*="body3-medium-gray5"] {
        font-size: 0.625rem !important;
        line-height: 1rem !important;
        letter-spacing: 0 !important;
      }
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
      display: flex !important;
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

    [data-clone-studio-carousel-window-size="2"] .slick-slide,
    [data-clone-studio-carousel-window-size="2"] .swiper-slide,
    [data-clone-studio-carousel-window-size="2"] .splide__slide,
    [data-clone-studio-carousel-window-size="2"] .carousel-item {
      width: 50% !important;
      max-width: 50% !important;
    }

    [data-clone-studio-carousel-window-size="3"] .slick-slide,
    [data-clone-studio-carousel-window-size="3"] .swiper-slide,
    [data-clone-studio-carousel-window-size="3"] .splide__slide,
    [data-clone-studio-carousel-window-size="3"] .carousel-item {
      width: 33.333333% !important;
      max-width: 33.333333% !important;
    }

    @media (max-width: 767.98px) {
      [data-clone-studio-carousel-window-size] .slick-slide,
      [data-clone-studio-carousel-window-size] .swiper-slide,
      [data-clone-studio-carousel-window-size] .splide__slide,
      [data-clone-studio-carousel-window-size] .carousel-item {
        width: 100% !important;
        max-width: 100% !important;
      }
    }

    /*
     * AEM pages store mobile column behaviour in framework CSS/JS. When the cloned page is shown
     * without OEM scripts, phone-width split blocks can retain desktop floats/offsets. Keep this
     * scoped to narrow frames and AEM grid columns so desktop fidelity is unchanged.
     */
    @media (max-width: 767.98px) {
      .aem-Grid {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      .aem-Grid > [class*="aem-GridColumn"] {
        float: none !important;
        clear: both !important;
        left: auto !important;
        right: auto !important;
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
        margin-left: 0 !important;
        margin-right: 0 !important;
      }

      .aem-Grid > [class*="aem-GridColumn--offset--"] {
        margin-left: 0 !important;
      }

      .aem-Grid > .imagevideoTile,
      .aem-Grid > .richtext,
      .aem-Grid .cmp-image,
      .aem-Grid .imageContainer {
        width: 100% !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      .aem-Grid .cmp-richtext {
        width: auto !important;
        max-width: 100% !important;
        min-width: 0 !important;
      }

      .aem-Grid > .imagevideoTile,
      .aem-Grid > .richtext,
      .aem-Grid .imageContainer {
        padding: 0 !important;
        margin: 0 !important;
      }

      .aem-Grid .imagevideoTile img {
        width: 100% !important;
        height: auto !important;
      }
    }

    @media (min-width: 1024px) {
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
  var BASE_HREF = ${safeJson(options.baseHref || '')}
  var MEDIA_BASE = ${safeJson(mediaBase)}
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
  var carouselResizeTimer = null

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

    stripResponsiveVariantMarkers(clone)
    stripResponsiveContentMarkers(clone)
    stripResponsiveConfigMarkers(clone)
    stripInteractivityControlMarkers(clone)

    return sanitizeHtml(stripPreviewScaffolding(clone.innerHTML))
  }

  function getRegionHtml(element) {
    if (!element)
      return ''

    var clone = element.cloneNode(true)
    var bridgeNodes = clone.querySelectorAll ? clone.querySelectorAll('[data-clone-studio-bridge]') : []
    var markedRegions = clone.querySelectorAll ? clone.querySelectorAll('[data-clone-studio-hover], [data-clone-studio-selected]') : []

    if (clone.removeAttribute) {
      clone.removeAttribute('data-clone-studio-hover')
      clone.removeAttribute('data-clone-studio-selected')
    }

    for (var i = 0; i < bridgeNodes.length; i++) {
      if (bridgeNodes[i].parentNode)
        bridgeNodes[i].parentNode.removeChild(bridgeNodes[i])
    }

    for (var j = 0; j < markedRegions.length; j++) {
      markedRegions[j].removeAttribute('data-clone-studio-hover')
      markedRegions[j].removeAttribute('data-clone-studio-selected')
    }

    stripResponsiveVariantMarkers(clone)
    stripResponsiveContentMarkers(clone)
    stripResponsiveConfigMarkers(clone)
    stripInteractivityControlMarkers(clone)

    return sanitizeHtml(stripPreviewScaffolding(clone.outerHTML || ''))
  }

  function stripResponsiveVariantMarkers(root) {
    if (!root || !root.querySelectorAll)
      return

    var nodes = root.querySelectorAll('[data-clone-studio-responsive-variant], [data-clone-studio-responsive-paired], [data-clone-studio-responsive-recovering], [data-clone-studio-generated-responsive-image]')
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-clone-studio-responsive-variant')
      nodes[i].removeAttribute('data-clone-studio-responsive-paired')
      nodes[i].removeAttribute('data-clone-studio-responsive-recovering')
      nodes[i].removeAttribute('data-clone-studio-generated-responsive-image')
    }
  }

  function stripResponsiveContentMarkers(root) {
    if (!root || !root.querySelectorAll)
      return

    var nodes = root.querySelectorAll('[data-clone-studio-responsive-content-variant], [data-clone-studio-responsive-content-paired]')
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].removeAttribute('data-clone-studio-responsive-content-variant')
      nodes[i].removeAttribute('data-clone-studio-responsive-content-paired')
    }
  }

  function stripResponsiveConfigMarkers(root) {
    if (!root || !root.querySelectorAll)
      return

    var nodes = root.querySelectorAll('[data-clone-studio-responsive-config-id]')
    for (var i = 0; i < nodes.length; i++)
      nodes[i].removeAttribute('data-clone-studio-responsive-config-id')
  }

  function stripInteractivityControlMarkers(root) {
    if (!root || !root.querySelectorAll)
      return

    if (root.removeAttribute)
      root.removeAttribute('data-clone-studio-interactive-control')

    var nodes = root.querySelectorAll('[data-clone-studio-interactive-control]')
    for (var i = 0; i < nodes.length; i++)
      nodes[i].removeAttribute('data-clone-studio-interactive-control')
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

    var hasGallery = matchesAny(element, '[data-gallery], .gallery, [class*="gallery"]')
      || (element.querySelector && element.querySelector('[data-gallery], .gallery, [class*="gallery"], [data-thumbnail], [data-thumb], [class*="thumb"]'))
    if (hasGallery && galleryImagesFor(element).length > 1)
      return 'gallery'

    var hasTablist = matchesAny(element, '[role="tablist"]')
      || (element.querySelector && element.querySelector('[role="tablist"]'))
    if (hasTablist)
      return 'tabs'

    var hasTabControls = matchesAny(element, '[data-tabs], .nav-tabs, .tab-list, .tablist, [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target]')
      || (element.querySelector && element.querySelector('[data-tabs], .nav-tabs, .tab-list, .tablist, [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target]'))
    if (hasTabControls && tabPanelsFor(element).length > 1)
      return 'tabs'

    var hasDropdown = matchesAny(element, '[data-dropdown], [data-disclosure], [data-menu], .dropdown, [class*="dropdown"], [aria-haspopup], [data-bs-toggle="dropdown"], [data-toggle="dropdown"], [data-dropdown-trigger], [data-disclosure-trigger], [data-menu-trigger]')
      || (element.querySelector && element.querySelector('[data-dropdown], [data-disclosure], [data-menu], .dropdown, [class*="dropdown"], [aria-haspopup], [data-bs-toggle="dropdown"], [data-toggle="dropdown"], [data-dropdown-trigger], [data-disclosure-trigger], [data-menu-trigger]'))
    if (hasDropdown && !isPageChromeInteractivityRegion(element))
      return 'dropdown'

    var hasAccordion = matchesAny(element, '[data-cmp-is="accordion"], .accordion, [class*="accordion"], [class*="accordian"], [data-cmp-hook-accordion="item"], [data-cmp-hook-accordion="panel"]')
      || (element.querySelector && element.querySelector('[data-cmp-is="accordion"], .accordion, [class*="accordion"], [class*="accordian"], .cmp-accordion__button, .cmp-accordion__title, .accordion-button, [aria-expanded][aria-controls], [data-cmp-hook-accordion="item"], [data-cmp-hook-accordion="panel"]'))
    if (hasAccordion)
      return 'accordion'

    var looksTabbish = /(^|\\s|-)tabs?($|\\s|-)/i.test(className)
      || matchesAny(element, '[class*="tab"]')
    if (looksTabbish) {
      var panels = tabPanelsFor(element)
      if (panels.length > 1)
        return 'tabs'
    }

    return ''
  }

  function regionPayload(element) {
    if (!element)
      return null

    var id = ensureRegionId(element)
    var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 }

    return {
      id: id,
      label: regionLabel(element),
      selector: selectorForElement(element),
      tag: String(element.tagName || '').toLowerCase(),
      type_hint: classifyRegion(element),
      classes: element.getAttribute ? element.getAttribute('class') || '' : '',
      viewport_left: rect.left || 0,
      viewport_top: rect.top || 0,
      left: (rect.left || 0) + (window.scrollX || 0),
      top: (rect.top || 0) + (window.scrollY || 0),
      width: rect.width || 0,
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

  function patchTextStyle(target, message) {
    if (!target || !target.style)
      return

    var property = String(message.property || '').trim().toLowerCase()
    var value = String(message.value == null ? '' : message.value).trim().toLowerCase()

    if (property === 'text-align') {
      if (value !== 'left' && value !== 'center' && value !== 'right')
        return
      target.style.textAlign = value
      return
    }

    if (property === 'font-weight') {
      if (value !== 'normal' && value !== '400' && value !== '500' && value !== '600' && value !== '700' && value !== 'bold')
        return
      target.style.fontWeight = value
      return
    }

    if (property === 'color') {
      if (!isPlausibleCssColor(value))
        return
      target.style.color = value
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
    else if (kind === 'style')
      patchTextStyle(target, message)
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

    return setPanelVisibility(panels, targetIndex)
  }

  function initializeCarouselWindowSize(regionEl) {
    var panels = collectPanels(regionEl)
    if (!regionEl || !regionEl.setAttribute || !panels.length)
      return 1

    var count = detectedCarouselWindowSize(regionEl, panels)
    regionEl.setAttribute('data-clone-studio-carousel-window-size', String(count))
    return count
  }

  function detectedCarouselWindowSize(regionEl, panels) {
    if (!panels || !panels.length)
      return 1

    if (isMobileCarouselViewport())
      return 1

    var active = 0
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i]
      if (!panel)
        continue
      if ((panel.classList && panel.classList.contains('slick-active'))
        || (panel.getAttribute && panel.getAttribute('aria-hidden') === 'false'))
        active++
    }

    if (active > 1)
      return Math.max(1, Math.min(active, 3, panels.length))

    if (regionEl && regionEl.classList && (regionEl.classList.contains('brandcard-wrapper') || regionEl.classList.contains('brandcard-carousel')))
      return Math.min(3, panels.length)

    return 1
  }

  function isMobileCarouselViewport() {
    if (window.matchMedia) {
      try { return window.matchMedia('(max-width: 767.98px)').matches }
      catch (_error) {}
    }
    return (window.innerWidth || 0) > 0 && (window.innerWidth || 0) < 768
  }

  function carouselWindowSize(regionEl, panels) {
    if (isMobileCarouselViewport())
      return 1

    var stored = regionEl && regionEl.getAttribute ? Number(regionEl.getAttribute('data-clone-studio-carousel-window-size') || 0) : 0
    if (stored > 0)
      return Math.max(1, Math.min(stored, panels.length || stored))

    return initializeCarouselWindowSize(regionEl)
  }

  function switchCarouselPanels(regionId, regionEl, index) {
    var region = regionEl || findRegionById(regionId)
    if (!region)
      return false

    var panels = collectPanels(region)
    if (!panels.length)
      return false

    var windowSize = carouselWindowSize(region, panels)
    var maxIndex = Math.max(0, panels.length - windowSize)
    var targetIndex = typeof index === 'number' && index >= 0 ? index : 0
    if (targetIndex > maxIndex)
      targetIndex = maxIndex

    return setPanelWindowVisibility(panels, targetIndex, windowSize)
  }

  function carouselActiveIndex(panels) {
    if (!panels || !panels.length)
      return 0

    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i]
      if (panel && panel.classList && panel.classList.contains('slick-current'))
        return i
    }

    for (var j = 0; j < panels.length; j++) {
      var candidate = panels[j]
      if (!candidate)
        continue

      if (candidate.classList && (candidate.classList.contains('slick-active') || candidate.classList.contains('active') || candidate.classList.contains('is-active')))
        return j
      if (candidate.getAttribute && candidate.getAttribute('aria-hidden') === 'false')
        return j
    }

    return 0
  }

  function installCarouselResizeHandler() {
    if (window.__CLONE_STUDIO_CAROUSEL_RESIZE_BOUND__)
      return

    window.__CLONE_STUDIO_CAROUSEL_RESIZE_BOUND__ = true
    window.addEventListener('resize', function () {
      if (carouselResizeTimer)
        window.clearTimeout(carouselResizeTimer)
      carouselResizeTimer = window.setTimeout(refreshCarouselWindows, 120)
    }, false)
  }

  function refreshCarouselWindows() {
    carouselResizeTimer = null
    var regions = document.querySelectorAll('.swiper, .slick, [class*="carousel"], [class*="slider"]')

    for (var i = 0; i < regions.length; i++) {
      if (classifyRegion(regions[i]) !== 'carousel')
        continue

      var panels = collectPanels(regions[i])
      if (!panels.length)
        continue

      regions[i].removeAttribute('data-clone-studio-carousel-window-size')
      initializeCarouselWindowSize(regions[i])
      switchCarouselPanels(ensureRegionId(regions[i]), regions[i], carouselActiveIndex(panels))
    }
  }

  function setPanelVisibility(panels, targetIndex) {
    if (!panels || !panels.length)
      return false

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

  function setPanelWindowVisibility(panels, targetIndex, windowSize) {
    if (!panels || !panels.length)
      return false

    var count = Math.max(1, Math.min(windowSize || 1, panels.length))
    for (var i = 0; i < panels.length; i++) {
      var panel = panels[i]
      if (!panel)
        continue

      var active = i >= targetIndex && i < targetIndex + count
      if (active) {
        panel.removeAttribute('hidden')
        if (panel.setAttribute)
          panel.setAttribute('aria-hidden', 'false')
        if (panel.style)
          panel.style.display = ''
        if (panel.classList) {
          panel.classList.add('is-active')
          panel.classList.add('active')
          panel.classList.add('slick-active')
          if (i === targetIndex)
            panel.classList.add('slick-current')
          else
            panel.classList.remove('slick-current')
        }
      }
      else {
        panel.setAttribute('hidden', 'hidden')
        if (panel.setAttribute)
          panel.setAttribute('aria-hidden', 'true')
        if (panel.style)
          panel.style.display = 'none'
        if (panel.classList) {
          panel.classList.remove('is-active')
          panel.classList.remove('active')
          panel.classList.remove('slick-active')
          panel.classList.remove('slick-current')
        }
      }
    }

    return true
  }

  function isResponsiveDesktopImage(node) {
    return !!node && node.classList && (node.classList.contains('imgdesktop') || node.classList.contains('dsktoponly'))
  }

  function isResponsiveMobileImage(node) {
    return !!node && node.classList && (node.classList.contains('imgmobile') || node.classList.contains('mobonly') || node.classList.contains('mobileonly'))
  }

  function markResponsiveImageVariants() {
    var candidates = document.querySelectorAll('.imgdesktop, .dsktoponly, .imgmobile, .mobonly, .mobileonly')
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i]

      if (isResponsiveDesktopImage(node))
        node.setAttribute('data-clone-studio-responsive-variant', 'desktop')
      else if (isResponsiveMobileImage(node))
        node.setAttribute('data-clone-studio-responsive-variant', 'mobile')
    }

    var variants = document.querySelectorAll('[data-clone-studio-responsive-variant]')
    for (var v = 0; v < variants.length; v++) {
      var parent = variants[v].parentNode
      if (isLocalResponsivePairContainer(parent))
        markResponsivePairInContainer(parent)
    }

    var containers = document.querySelectorAll('picture, [data-picture], .picture, .cmp-image, .responsive-image, [class*="responsive-image"], [class*="responsiveImage"], [class*="picture"]')
    for (var c = 0; c < containers.length; c++)
      markResponsivePairInContainer(containers[c])
  }

  function isLocalResponsivePairContainer(container) {
    if (!container || !container.querySelectorAll)
      return false

    var tag = container.tagName ? String(container.tagName).toLowerCase() : ''
    if (tag === 'body' || tag === 'html' || tag === 'main' || tag === 'section')
      return false

    return container.querySelectorAll('[data-clone-studio-responsive-variant]').length <= 4
  }

  function markResponsivePairInContainer(container) {
    if (!container || !container.querySelectorAll)
      return

    var desktopNodes = container.querySelectorAll('[data-clone-studio-responsive-variant="desktop"]')
    var mobileNodes = container.querySelectorAll('[data-clone-studio-responsive-variant="mobile"]')
    if (!desktopNodes.length || !mobileNodes.length)
      return

    for (var d = 0; d < desktopNodes.length; d++)
      desktopNodes[d].setAttribute('data-clone-studio-responsive-paired', 'true')
    for (var m = 0; m < mobileNodes.length; m++)
      mobileNodes[m].setAttribute('data-clone-studio-responsive-paired', 'true')
  }

  function recoverMissingResponsiveImagePairs() {
    var desktopNodes = document.querySelectorAll('[data-clone-studio-responsive-variant="desktop"]:not([data-clone-studio-responsive-paired="true"])')
    for (var i = 0; i < desktopNodes.length; i++) {
      var desktopNode = desktopNodes[i]
      var parent = desktopNode.parentNode
      if (!parent || !parent.querySelectorAll || desktopNode.getAttribute('data-clone-studio-responsive-recovering') === 'true')
        continue
      if (parent.querySelector('[data-clone-studio-responsive-variant="mobile"], .imgmobile, .mobonly, .mobileonly'))
        continue

      var candidates = mobileImageCandidatesFor(desktopNode)
      if (candidates.length)
        installRecoveredMobileImage(desktopNode, candidates)
    }
  }

  function mobileImageCandidatesFor(desktopNode) {
    var candidates = []
    var explicitAttrs = [
      'data-mobile-image-url',
      'data-image-mobile-url',
      'data-mobile-src',
      'data-src-mobile',
      'data-mob-src',
      'data-mob-image-url',
      'data-mobile',
      'data-small-src'
    ]

    for (var i = 0; i < explicitAttrs.length; i++)
      addResponsiveImageCandidate(candidates, desktopNode.getAttribute(explicitAttrs[i]))

    var source = responsiveDesktopSource(desktopNode)
    if (source) {
      addDerivedResponsiveImageCandidate(candidates, source, source.replace(/-desktop-new(\\.[a-z0-9]+)([?#].*)?$/i, '-new-mbl$1$2'))
      addDerivedResponsiveImageCandidate(candidates, source, source.replace(/-desktop(\\.[a-z0-9]+)([?#].*)?$/i, '-mobile$1$2'))
      addDerivedResponsiveImageCandidate(candidates, source, source.replace(/desktop/ig, 'mobile'))
      addResponsiveImageCandidate(candidates, source)
    }

    return candidates
  }

  function responsiveDesktopSource(desktopNode) {
    var attrs = ['data-image-url', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'src']
    for (var i = 0; i < attrs.length; i++) {
      var value = desktopNode.getAttribute(attrs[i])
      if (value && String(value).trim())
        return String(value).trim()
    }
    return ''
  }

  function addResponsiveImageCandidate(candidates, value) {
    var candidate = String(value || '').trim()
    if (!candidate)
      return
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] === candidate)
        return
    }
    candidates.push(candidate)
  }

  function addDerivedResponsiveImageCandidate(candidates, source, value) {
    var candidate = String(value || '').trim()
    if (!candidate || candidate === String(source || '').trim())
      return
    addResponsiveImageCandidate(candidates, candidate)
  }

  function installRecoveredMobileImage(desktopNode, candidates) {
    var index = 0
    desktopNode.setAttribute('data-clone-studio-responsive-recovering', 'true')

    function tryNextCandidate() {
      if (index >= candidates.length) {
        desktopNode.removeAttribute('data-clone-studio-responsive-recovering')
        return
      }

      var sourceCandidate = candidates[index++]
      var mobileUrl = proxiedResponsiveImageUrl(sourceCandidate)
      if (!mobileUrl) {
        tryNextCandidate()
        return
      }

      var probe = new Image()
      probe.onload = function () {
        if (!desktopNode.parentNode)
          return

        var mobileNode = desktopNode.cloneNode(false)
        mobileNode.setAttribute('src', mobileUrl)
        mobileNode.setAttribute('data-image-url', sourceCandidate)
        mobileNode.setAttribute('data-clone-studio-responsive-variant', 'mobile')
        mobileNode.setAttribute('data-clone-studio-responsive-paired', 'true')
        mobileNode.setAttribute('data-clone-studio-generated-responsive-image', 'true')
        mobileNode.removeAttribute('srcset')
        mobileNode.removeAttribute('sizes')
        mobileNode.removeAttribute('data-clone-studio-responsive-recovering')
        mobileNode.setAttribute('class', recoveredMobileClassName(desktopNode))

        desktopNode.setAttribute('data-clone-studio-responsive-paired', 'true')
        desktopNode.removeAttribute('data-clone-studio-responsive-recovering')
        if (desktopNode.nextSibling)
          desktopNode.parentNode.insertBefore(mobileNode, desktopNode.nextSibling)
        else
          desktopNode.parentNode.appendChild(mobileNode)
        markResponsivePairInContainer(desktopNode.parentNode)
      }
      probe.onerror = tryNextCandidate
      probe.src = mobileUrl
    }

    tryNextCandidate()
  }

  function recoveredMobileClassName(desktopNode) {
    var className = String(desktopNode.getAttribute('class') || '')
      .replace(/\\bimgdesktop\\b/g, '')
      .replace(/\\bdsktoponly\\b/g, '')
      .replace(/\\s+/g, ' ')
      .trim()

    if (!/(^|\\s)imgmobile(\\s|$)/.test(className))
      className = (className ? className + ' ' : '') + 'imgmobile'

    return className
  }

  function proxiedResponsiveImageUrl(rawUrl) {
    var absolute = absoluteCloneStudioUrl(rawUrl)
    if (!absolute)
      return ''

    if (/^https?:\\/\\//i.test(absolute)) {
      if (MEDIA_BASE && absolute.indexOf(MEDIA_BASE + '/media/') === 0)
        return sanitizeUrl(absolute, 'media')

      var oemId = mediaProxyOemIdForUrl(absolute)
      var encoded = encodeBase64Url(absolute)
      if (MEDIA_BASE && oemId && encoded)
        return MEDIA_BASE + '/media/' + oemId + '/' + encoded
    }

    return sanitizeUrl(absolute, 'media')
  }

  function absoluteCloneStudioUrl(rawUrl) {
    var value = String(rawUrl || '').trim()
    if (!value)
      return ''
    if (/^(?:data|blob):/i.test(value))
      return ''

    try {
      return new URL(value, BASE_HREF || document.baseURI || window.location.href).href
    }
    catch (_error) {
      return value
    }
  }

  function mediaProxyOemIdForUrl(url) {
    try {
      var host = new URL(url).hostname.toLowerCase()
      if (host === 'www.ford.com.au' || host === 'www.gpas-cache.ford.com')
        return 'ford-au'
      if (host === 'www.hyundai.com')
        return 'hyundai-au'
      if (host === 'www.mazda.com.au')
        return 'mazda-au'
      if (host === 'www.isuzuute.com.au' || host === 'cdn-iua.dataweavers.io')
        return 'isuzu-au'
      if (host === 'www.kia.com' || host === 'kia.com')
        return 'kia-au'
      if (host === 'www.nissan.com.au' || host === 'www-asia.nissan-cdn.net' || host === 'ms-prd.apn.mediaserver.heliosnissan.net')
        return 'nissan-au'
      if (host === 'www.subaru.com.au' || host === 'cdn-image-handler.oem-production.subaru.com.au')
        return 'subaru-au'
      if (host === 'www.gwmanz.com')
        return 'gwm-au'
      if (host === 'www.suzuki.com.au' || host === 'cdn.suzuki.com.au')
        return 'suzuki-au'
      if (host === 'www.renault.com.au')
        return 'renault-au'
      if (host === 'www.fotonaustralia.com.au')
        return 'foton-au'
      if (host === 'www.gacgroup.com' || host === 'eu-www-resouce-cdn.gacgroup.com' || host === 'eu-www-resource-cdn.gacgroup.com')
        return 'gac-au'
      if (host === 'kgm.com.au' || host === 'payloadb.therefinerydesign.com')
        return 'kgm-au'
      if (host === 'www.mitsubishi-motors.com.au' || host === 'configurator.mitsubishi-motors.com.au')
        return 'mitsubishi-au'
    }
    catch (_error) {}

    return ''
  }

  function encodeBase64Url(value) {
    try {
      return btoa(unescape(encodeURIComponent(String(value))))
        .replace(/\\+/g, '-')
        .replace(/\\//g, '_')
        .replace(/=+$/g, '')
    }
    catch (_error) {
      return ''
    }
  }

  function isResponsiveDesktopContent(node) {
    return !!node && node.classList && (
      node.classList.contains('onlydesktop')
      || node.classList.contains('onlyDesktop')
    )
  }

  function isResponsiveMobileContent(node) {
    return !!node && node.classList && (
      node.classList.contains('onlymobile')
      || node.classList.contains('onlyMobile')
    )
  }

  function markResponsiveContentVariants() {
    var candidates = document.querySelectorAll('.onlydesktop, .onlyDesktop, .onlymobile, .onlyMobile')
    for (var i = 0; i < candidates.length; i++) {
      var node = candidates[i]

      if (isResponsiveDesktopContent(node))
        node.setAttribute('data-clone-studio-responsive-content-variant', 'desktop')
      else if (isResponsiveMobileContent(node))
        node.setAttribute('data-clone-studio-responsive-content-variant', 'mobile')
    }

    var variants = document.querySelectorAll('[data-clone-studio-responsive-content-variant]')
    for (var v = 0; v < variants.length; v++) {
      var parent = variants[v].parentNode
      if (isLocalResponsiveContentPairContainer(parent))
        markResponsiveContentPairInContainer(parent)
    }
  }

  function isLocalResponsiveContentPairContainer(container) {
    if (!container || !container.querySelectorAll)
      return false

    var tag = container.tagName ? String(container.tagName).toLowerCase() : ''
    if (tag === 'body' || tag === 'html' || tag === 'main' || tag === 'section')
      return false

    return container.querySelectorAll('[data-clone-studio-responsive-content-variant]').length <= 6
  }

  function markResponsiveContentPairInContainer(container) {
    if (!container || !container.querySelectorAll)
      return

    var desktopNodes = container.querySelectorAll('[data-clone-studio-responsive-content-variant="desktop"]')
    var mobileNodes = container.querySelectorAll('[data-clone-studio-responsive-content-variant="mobile"]')
    if (!desktopNodes.length || !mobileNodes.length)
      return

    for (var d = 0; d < desktopNodes.length; d++)
      desktopNodes[d].setAttribute('data-clone-studio-responsive-content-paired', 'true')
    for (var m = 0; m < mobileNodes.length; m++)
      mobileNodes[m].setAttribute('data-clone-studio-responsive-content-paired', 'true')
  }

  function responsiveConfigValue(value, unit) {
    var raw = String(value == null ? '' : value).trim()
    if (!raw)
      return ''
    if (/^-?\\d+(?:\\.\\d+)?(?:px|%|rem|em|vh|vw)$/i.test(raw))
      return raw
    if (!/^-?\\d+(?:\\.\\d+)?$/.test(raw))
      return ''
    return raw + unit
  }

  function responsiveSpacingDeclaration(prop, config) {
    if (!config)
      return ''

    var prefix = prop === 'padding' ? 'padding' : 'margin'
    var unit = config[prefix + 'By'] === '%' ? '%' : 'px'
    var top = responsiveConfigValue(config[prefix + 'Top'], unit)
    var right = responsiveConfigValue(config[prefix + 'Right'], unit)
    var bottom = responsiveConfigValue(config[prefix + 'Bottom'], unit)
    var left = responsiveConfigValue(config[prefix + 'Left'], unit)

    if (!top && !right && !bottom && !left)
      return ''

    return prop + ':' + (top || '0') + ' ' + (right || '0') + ' ' + (bottom || '0') + ' ' + (left || '0') + ' !important;'
  }

  function responsiveBackgroundDeclaration(element) {
    if (!element || !element.getAttribute)
      return ''

    var color = element.getAttribute('data-mobilebg')
    if (!color || !isPlausibleCssColor(color))
      return ''

    return 'background-color:' + color + ' !important;'
  }

  function responsiveRadiusDeclaration(element) {
    if (!element || !element.getAttribute)
      return ''

    var left = element.getAttribute('data-leftroundmob')
    var right = element.getAttribute('data-rightroundmob')
    if (left !== 'false' && right !== 'false')
      return ''

    var declarations = []
    if (left === 'false') {
      declarations.push('border-top-left-radius:0 !important;')
      declarations.push('border-bottom-left-radius:0 !important;')
    }
    if (right === 'false') {
      declarations.push('border-top-right-radius:0 !important;')
      declarations.push('border-bottom-right-radius:0 !important;')
    }
    return declarations.join('')
  }

  function installResponsiveConfigRules() {
    if (!document || !document.querySelectorAll)
      return

    var previous = document.querySelector('[data-clone-studio-responsive-config-style]')
    if (previous && previous.parentNode)
      previous.parentNode.removeChild(previous)

    var nodes = document.querySelectorAll('[data-config]')
    var rules = []
    var generated = 1

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i]
      var raw = node.getAttribute('data-config')
      if (!raw)
        continue

      var config = null
      try { config = JSON.parse(raw) }
      catch (_error) { config = null }
      if (!config)
        continue

      var declarations = [
        responsiveSpacingDeclaration('padding', config.mobilePadding),
        responsiveSpacingDeclaration('margin', config.mobileMargin),
        responsiveBackgroundDeclaration(node),
        responsiveRadiusDeclaration(node)
      ].filter(Boolean).join('')

      if (!declarations)
        continue

      var id = node.getAttribute('data-clone-studio-responsive-config-id')
      if (!id) {
        id = String(generated++)
        node.setAttribute('data-clone-studio-responsive-config-id', id)
      }

      rules.push('[data-clone-studio-responsive-config-id="' + id + '"]{' + declarations + '}')
    }

    if (!rules.length)
      return

    var style = document.createElement('style')
    style.setAttribute('data-clone-studio-responsive-config-style', 'true')
    style.setAttribute('data-clone-studio-bridge', 'true')
    style.textContent = '@media (max-width: 767.98px){' + rules.join('') + '}'
    document.head.appendChild(style)
  }

  function enableInteractivity() {
    // Trusted, event-driven navigation for tabs/carousels/accordions/galleries/dropdowns in the read-only preview. OEM scripts are
    // stripped by the sanitizer, so we wire CLICK navigation against the bridge's own panel-switching
    // primitive (switchPanel), disclosure toggles, or image swaps. No timers/auto-advance — those are
    // throttled in the sandbox.
    var candidates = document.querySelectorAll('.swiper, .slick, [class*="carousel"], [class*="slider"], [data-gallery], .gallery, [class*="gallery"], [data-thumbnail], [data-thumb], [class*="thumb"], [role="tablist"], .tabs, [class*="tab"], [data-tabs], .nav-tabs, .tab-list, .tablist, [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target], [data-dropdown], [data-disclosure], [data-menu], .dropdown, [class*="dropdown"], [aria-haspopup], [data-bs-toggle="dropdown"], [data-toggle="dropdown"], [data-dropdown-trigger], [data-disclosure-trigger], [data-menu-trigger], [data-cmp-is="accordion"], .accordion, [class*="accordion"], [class*="accordian"], [data-cmp-hook-accordion="item"], [data-cmp-hook-accordion="panel"], [aria-expanded][aria-controls]')

    // Wire each region inside its OWN function call so every click handler closes over per-call
    // params (regionId/regionEl/kind) -- never a shared loop var. With ES5 var, a loop variable is
    // function-scoped and mutated on every iteration; a handler that closed over the loop var directly
    // would, at click time, see the LAST region value and switch the wrong region. Routing through
    // wireRegion() gives each region a fresh scope, so the captured values are stable.
    for (var i = 0; i < candidates.length; i++)
      wireRegion(candidates[i])

    installCarouselResizeHandler()
  }

  function wireRegion(regionEl) {
    var kind = classifyRegion(regionEl)
    if (kind !== 'tabs' && kind !== 'carousel' && kind !== 'accordion' && kind !== 'gallery' && kind !== 'dropdown')
      return

    var regionId = ensureRegionId(regionEl)
    var wired = false

    if (kind === 'tabs')
      wired = wireTabRegion(regionId, regionEl)
    else if (kind === 'accordion')
      wired = wireAccordionRegion(regionId, regionEl)
    else if (kind === 'gallery')
      wired = wireGalleryRegion(regionId, regionEl)
    else if (kind === 'dropdown')
      wired = wireDropdownRegion(regionId, regionEl)
    else
      wired = wireCarouselRegion(regionId, regionEl)

    if (kind === 'accordion' || kind === 'gallery' || kind === 'dropdown')
      return

    // slick/swiper inject their arrows via JS, which the sanitizer strips — so a multi-panel region
    // can have slide panels but NO usable existing controls. When nothing was wired, inject our own
    // trusted prev/next/dot bar so the panels stay navigable. Only inject for >1 panel.
    if (!wired && collectPanels(regionEl).length > 1)
      injectControlBar(regionId, regionEl, collectPanels(regionEl).length)

    if (kind === 'carousel') {
      initializeCarouselWindowSize(regionEl)
      switchCarouselPanels(regionId, regionEl, 0)
      return
    }

    // Normalize to exactly one visible panel on load (avoids all-visible / all-hidden states).
    switchPanel(regionId, 0)
  }

  function injectControlBar(regionId, regionEl, panelCount) {
    // Trusted, bridge-owned navigation overlaid on a region whose OEM controls were stripped. Every
    // node carries data-clone-studio-bridge so getBodyHtml() removes it (defense-in-depth: this only
    // runs in the read-only preview, which is never serialized). Inline styles only — clone CSS unknown.
    var state = { index: 0 }
    var dots = []
    var isCarousel = classifyRegion(regionEl) === 'carousel'
    var positionCount = panelCount

    if (isCarousel) {
      var initialPanels = collectPanels(regionEl)
      var initialWindowSize = carouselWindowSize(regionEl, initialPanels)
      positionCount = Math.max(1, initialPanels.length - initialWindowSize + 1)
    }

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
      var panels = collectPanels(regionEl)
      var total = panels.length
      if (!total)
        return
      var maxIndex = total - 1
      if (isCarousel)
        maxIndex = Math.max(0, total - carouselWindowSize(regionEl, panels))
      var next = index < 0 ? 0 : index > maxIndex ? maxIndex : index
      state.index = next
      if (isCarousel)
        switchCarouselPanels(regionId, regionEl, next)
      else
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

    for (var i = 0; i < positionCount; i++) {
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
      markInteractivityControl(triggers[t])
      triggers[t].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()

        var index = interactivityIndexOf(triggers, event.currentTarget)
        if (index < 0)
          index = 0
        var activeIndex = switchTabPanel(regionId, regionEl, event.currentTarget, index)
        if (activeIndex < 0)
          activeIndex = index
        setTabActiveState(triggers, activeIndex)
      }, true)
    }

    return true
  }

  function switchTabPanel(regionId, regionEl, trigger, index) {
    var panels = tabPanelsFor(regionEl)
    if (!panels.length)
      return switchPanel(regionId, index) ? index : -1

    var targetPanel = tabTargetPanel(regionEl, trigger)
    var targetIndex = targetPanel ? interactivityIndexOf(panels, targetPanel) : -1
    if (targetIndex < 0)
      targetIndex = typeof index === 'number' && index >= 0 && index < panels.length ? index : 0

    setPanelVisibility(panels, targetIndex)
    return targetIndex
  }

  function wireCarouselRegion(regionId, regionEl) {
    // Carousel next/prev controls drive a responsive panel window; desktop can retain the source
    // multi-card active count while mobile collapses to a single card.
    var controls = carouselControlsFor(regionEl)
    var state = { index: 0 }
    initializeCarouselWindowSize(regionEl)

    function step(delta) {
      var total = collectPanels(regionEl).length
      if (!total)
        return
      var windowSize = carouselWindowSize(regionEl, collectPanels(regionEl))
      var maxIndex = Math.max(0, total - windowSize)
      var next = state.index + delta
      if (next < 0)
        next = 0
      if (next > maxIndex)
        next = maxIndex
      state.index = next
      switchCarouselPanels(regionId, regionEl, next)
      setCarouselControlState(controls, state.index, maxIndex)
    }

    for (var n = 0; n < controls.next.length; n++) {
      markInteractivityControl(controls.next[n])
      controls.next[n].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()
        step(1)
      }, true)
    }

    for (var p = 0; p < controls.prev.length; p++) {
      markInteractivityControl(controls.prev[p])
      controls.prev[p].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()
        step(-1)
      }, true)
    }

    setCarouselControlState(controls, 0, Math.max(0, collectPanels(regionEl).length - carouselWindowSize(regionEl, collectPanels(regionEl))))
    // Report whether any real OEM controls were found; when none, the caller injects a trusted bar.
    return controls.next.length > 0 || controls.prev.length > 0
  }

  function setCarouselControlState(controls, index, maxIndex) {
    if (!controls)
      return

    for (var n = 0; n < controls.next.length; n++)
      setCarouselControlDisabled(controls.next[n], index >= maxIndex)

    for (var p = 0; p < controls.prev.length; p++)
      setCarouselControlDisabled(controls.prev[p], index <= 0)
  }

  function setCarouselControlDisabled(control, disabled) {
    if (!control || !control.setAttribute)
      return

    control.setAttribute('aria-disabled', disabled ? 'true' : 'false')
    if (control.classList) {
      if (disabled)
        control.classList.add('slick-disabled')
      else
        control.classList.remove('slick-disabled')
    }
  }

  function wireGalleryRegion(regionId, regionEl) {
    // Gallery thumbnails drive a main-image swap in read-only preview. The regionId param keeps the
    // same wire* signature used by other kinds; gallery swapping is local to regionEl.
    var parts = galleryPartsFor(regionEl)
    if (!parts.main || !parts.items.length)
      return false

    for (var g = 0; g < parts.items.length; g++) {
      markInteractivityControl(parts.items[g].control)
      parts.items[g].control.addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()

        switchGalleryImage(regionEl, event.currentTarget)
      }, true)
    }

    return true
  }

  function wireDropdownRegion(regionId, regionEl) {
    // Dropdown/disclosure TRIGGERS: explicit dropdown toggles only. This intentionally skips page
    // header/nav chrome and does not wire broad [aria-expanded] controls that may be accordions.
    var triggers = dropdownTriggersFor(regionEl)
    if (!triggers.length)
      return false

    for (var d = 0; d < triggers.length; d++) {
      markInteractivityControl(triggers[d])
      normalizeDropdownTrigger(regionEl, triggers[d])
      triggers[d].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()

        toggleDropdownPanel(regionEl, event.currentTarget)
      }, true)
    }

    return true
  }

  function wireAccordionRegion(regionId, regionEl) {
    // Accordion TRIGGERS: ARIA disclosures, AEM cmp-accordion buttons, Bootstrap buttons, or common
    // accordion item controls. The regionId param keeps the same wire* signature used by other kinds.
    var triggers = accordionTriggersFor(regionEl)
    if (!triggers.length)
      return false

    for (var a = 0; a < triggers.length; a++) {
      markInteractivityControl(triggers[a])
      normalizeAccordionTrigger(regionEl, triggers[a])
      triggers[a].addEventListener('click', function (event) {
        event.preventDefault()
        event.stopPropagation()
        if (event.stopImmediatePropagation)
          event.stopImmediatePropagation()

        toggleAccordionPanel(regionEl, event.currentTarget)
      }, true)
    }

    return true
  }

  function accordionTriggersFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    var selector = '[aria-expanded][aria-controls], .cmp-accordion__button, .cmp-accordion__title, .accordion-button, .trigger.disclosure, [class*="accordion-title"], [class*="accordion__title"], [data-cmp-hook-accordion="button"], [role="button"][aria-controls]'
    var triggers = []

    if (regionEl.matches && regionEl.matches(selector))
      triggers.push(regionEl)

    var explicit = regionEl.querySelectorAll(selector)
    for (var i = 0; i < explicit.length; i++) {
      if (interactivityIndexOf(triggers, explicit[i]) === -1)
        triggers.push(explicit[i])
    }

    var items = regionEl.querySelectorAll('.cmp-accordion__item, .accordion-item, [data-cmp-hook-accordion="item"], [data-accordion-item], .accordion-disclosure')
    for (var j = 0; j < items.length; j++) {
      var controls = items[j].querySelectorAll('button, a, [role="button"], .cmp-accordion__title, .trigger.disclosure, [class*="accordion-title"], [class*="accordion__title"], .accordion-heading-wrapper h1, .accordion-heading-wrapper h2, .accordion-heading-wrapper h3, .accordion-heading-wrapper h4, .accordion-heading-wrapper h5, .accordion-heading-wrapper h6')
      for (var c = 0; c < controls.length; c++) {
        if (interactivityIndexOf(triggers, controls[c]) !== -1)
          continue
        if (accordionPanelFor(regionEl, controls[c])) {
          triggers.push(controls[c])
          break
        }
      }
    }

    return triggers
  }

  function normalizeAccordionTrigger(regionEl, trigger) {
    var panel = accordionPanelFor(regionEl, trigger)
    if (!panel)
      return

    var item = accordionItemFor(trigger)
    if (item && accordionShouldForceStartCollapsed(regionEl, trigger, item)) {
      setAccordionExpanded(trigger, panel, false)
      return
    }

    if (item && item.getAttribute && item.getAttribute('data-cmp-expanded') === 'true') {
      setAccordionExpanded(trigger, panel, true)
      return
    }

    if (trigger.hasAttribute && trigger.hasAttribute('aria-expanded')) {
      setAccordionExpanded(trigger, panel, trigger.getAttribute('aria-expanded') === 'true')
      return
    }

    if (panel.hasAttribute && panel.hasAttribute('hidden')) {
      setAccordionExpanded(trigger, panel, false)
      return
    }

    if (item && accordionShouldStartCollapsed(regionEl, trigger, item)) {
      setAccordionExpanded(trigger, panel, false)
      return
    }

    if (panel.classList && (panel.classList.contains('show') || panel.classList.contains('open') || panel.classList.contains('active') || panel.classList.contains('is-active')))
      setAccordionExpanded(trigger, panel, true)
  }

  function accordionShouldForceStartCollapsed(regionEl, trigger, item) {
    if (!item)
      return false

    var scope = accordionScopeFor(regionEl, trigger)
    if (!scope || !scope.getAttribute)
      return false

    var view = scope.getAttribute('data-view') || ''
    return /disclosure/i.test(view)
  }

  function toggleAccordionPanel(regionEl, trigger) {
    var panel = accordionPanelFor(regionEl, trigger)
    if (!panel)
      return false

    var shouldOpen = !isAccordionExpanded(trigger, panel)
    var scope = accordionScopeFor(regionEl, trigger)
    if (shouldOpen && accordionSingleExpansion(scope, trigger))
      closeOtherAccordionPanels(scope, trigger)

    setAccordionExpanded(trigger, panel, shouldOpen)
    return true
  }

  function accordionPanelFor(regionEl, trigger) {
    if (!trigger)
      return null

    var controls = trigger.getAttribute ? trigger.getAttribute('aria-controls') : ''
    if (controls) {
      var controlId = String(controls).split(/\\s+/)[0]
      var controlled = document.getElementById ? document.getElementById(controlId) : null
      if (controlled)
        return controlled
    }

    var item = accordionItemFor(trigger)
    if (item && item.querySelector) {
      var panel = item.querySelector('.cmp-accordion__panel, [data-cmp-hook-accordion="panel"], .accordion-collapse, .collapse, .accordion-panel, .accordion-content, [role="region"]')
      if (panel)
        return panel
    }

    var next = trigger.nextElementSibling
    if (next)
      return next

    return null
  }

  function accordionItemFor(trigger) {
    if (!trigger || !trigger.closest)
      return null

    return trigger.closest('.cmp-accordion__item, .accordion-item, [data-cmp-hook-accordion="item"], [data-accordion-item], .accordion-disclosure')
  }

  function accordionScopeFor(regionEl, trigger) {
    if (trigger && trigger.closest) {
      var scoped = trigger.closest('.cmp-disclosure-accordion, [data-cmp-is="accordion"], [data-cmp-single-expansion], [data-accordion-single], [data-single-expansion], .accordion')
      if (scoped)
        return scoped
    }

    return regionEl
  }

  function accordionVisualBlockFor(trigger, item) {
    if (!trigger || !trigger.closest)
      return null

    var block = trigger.closest('.block')
    if (block && (!item || item.contains(block)))
      return block

    return null
  }

  function accordionShouldStartCollapsed(regionEl, trigger, item) {
    if (!item)
      return false

    if (item.getAttribute && item.getAttribute('data-cmp-expanded') === 'true')
      return false

    var scope = accordionScopeFor(regionEl, trigger)
    if (!scope || !scope.getAttribute)
      return false

    var desktop = scope.getAttribute('data-expand-collapse-option-desktop') || ''
    var mobile = scope.getAttribute('data-expand-collapse-option-mobile') || ''
    return /collapseall/i.test(desktop) || /collapseall/i.test(mobile)
  }

  function accordionSingleExpansion(regionEl, trigger) {
    if (!regionEl || !regionEl.getAttribute)
      return false

    if (regionEl.getAttribute('data-cmp-single-expansion') === 'true'
      || regionEl.getAttribute('data-accordion-single') === 'true'
      || regionEl.getAttribute('data-single-expansion') === 'true')
      return true

    var panel = accordionPanelFor(regionEl, trigger)
    return !!(panel && panel.getAttribute && (panel.getAttribute('data-bs-parent') || panel.getAttribute('data-parent')))
  }

  function closeOtherAccordionPanels(regionEl, activeTrigger) {
    var triggers = accordionTriggersFor(regionEl)
    var activePanel = accordionPanelFor(regionEl, activeTrigger)

    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i] === activeTrigger)
        continue

      var panel = accordionPanelFor(regionEl, triggers[i])
      if (!panel || panel === activePanel)
        continue

      setAccordionExpanded(triggers[i], panel, false)
    }
  }

  function isAccordionExpanded(trigger, panel) {
    if (trigger && trigger.getAttribute && trigger.getAttribute('aria-expanded') === 'true')
      return true

    if (!panel)
      return false

    if (panel.hasAttribute && panel.hasAttribute('hidden'))
      return false
    if (panel.getAttribute && panel.getAttribute('aria-hidden') === 'true')
      return false
    if (panel.style && panel.style.display === 'none')
      return false
    if (panel.classList && (panel.classList.contains('show') || panel.classList.contains('open') || panel.classList.contains('active') || panel.classList.contains('is-active')))
      return true
    var item = accordionItemFor(trigger)
    if (item && item.getAttribute && item.getAttribute('data-cmp-expanded') === 'true')
      return true

    return false
  }

  function setAccordionExpanded(trigger, panel, expanded) {
    if (trigger && trigger.setAttribute)
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false')

    if (trigger && trigger.classList) {
      if (expanded) {
        trigger.classList.add('active')
        trigger.classList.add('is-active')
        trigger.classList.add('open')
        trigger.classList.remove('collapsed')
      }
      else {
        trigger.classList.remove('active')
        trigger.classList.remove('is-active')
        trigger.classList.remove('open')
        trigger.classList.add('collapsed')
      }
    }

    var item = accordionItemFor(trigger)
    var visualBlock = accordionVisualBlockFor(trigger, item)
    if (item && item.classList) {
      if (expanded) {
        item.classList.add('active')
        item.classList.add('is-active')
        item.classList.add('open')
      }
      else {
        item.classList.remove('active')
        item.classList.remove('is-active')
        item.classList.remove('open')
      }
    }
    if (visualBlock && visualBlock.classList) {
      if (expanded) {
        visualBlock.classList.add('active')
        visualBlock.classList.add('is-active')
        visualBlock.classList.add('open')
      }
      else {
        visualBlock.classList.remove('active')
        visualBlock.classList.remove('is-active')
        visualBlock.classList.remove('open')
      }
    }
    if (item && item.setAttribute)
      item.setAttribute('data-cmp-expanded', expanded ? 'true' : 'false')

    if (!panel)
      return

    if (expanded) {
      panel.removeAttribute('hidden')
      if (panel.setAttribute)
        panel.setAttribute('aria-hidden', 'false')
      if (panel.style)
        panel.style.removeProperty('display')
      if (panel.classList) {
        panel.classList.add('show')
        panel.classList.add('open')
        panel.classList.add('active')
        panel.classList.add('is-active')
      }
    }
    else {
      panel.setAttribute('hidden', 'hidden')
      if (panel.setAttribute)
        panel.setAttribute('aria-hidden', 'true')
      if (panel.style)
        panel.style.setProperty('display', 'none', 'important')
      if (panel.classList) {
        panel.classList.remove('show')
        panel.classList.remove('open')
        panel.classList.remove('active')
        panel.classList.remove('is-active')
      }
    }
  }

  function markInteractivityControl(element) {
    if (element && element.setAttribute)
      element.setAttribute('data-clone-studio-interactive-control', 'true')
  }

  function isPageChromeInteractivityRegion(element) {
    if (!element || !element.closest)
      return false

    return !!element.closest('header, nav, [role="navigation"]')
  }

  function dropdownTriggersFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    var selector = '[aria-haspopup], [data-bs-toggle="dropdown"], [data-toggle="dropdown"], [data-dropdown-trigger], [data-disclosure-trigger], [data-menu-trigger], .dropdown-toggle, [class*="dropdown-toggle"]'
    var triggers = []

    if (regionEl.matches && regionEl.matches(selector) && isDropdownTrigger(regionEl))
      triggers.push(regionEl)

    var explicit = regionEl.querySelectorAll(selector)
    for (var i = 0; i < explicit.length; i++) {
      if (isDropdownTrigger(explicit[i]))
        addUniqueInteractivityNode(triggers, explicit[i])
    }

    var containers = regionEl.querySelectorAll('[data-dropdown], [data-disclosure], [data-menu], .dropdown, [class*="dropdown"]')
    for (var c = 0; c < containers.length; c++) {
      if (isPageChromeInteractivityRegion(containers[c]))
        continue
      var controls = containers[c].querySelectorAll('button, a, [role="button"]')
      for (var j = 0; j < controls.length; j++) {
        if (isDropdownTrigger(controls[j]) || dropdownPanelFor(containers[c], controls[j])) {
          addUniqueInteractivityNode(triggers, controls[j])
          break
        }
      }
    }

    return triggers
  }

  function isDropdownTrigger(trigger) {
    if (!trigger || !trigger.getAttribute)
      return false

    if (isPageChromeInteractivityRegion(trigger))
      return false

    if (matchesAny(trigger, '[role="tab"], [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target], .accordion-button, .cmp-accordion__button, [data-cmp-hook-accordion="button"]'))
      return false

    if (matchesAny(trigger, '[aria-haspopup], [data-bs-toggle="dropdown"], [data-toggle="dropdown"], [data-dropdown-trigger], [data-disclosure-trigger], [data-menu-trigger], .dropdown-toggle, [class*="dropdown-toggle"]'))
      return true

    return false
  }

  function normalizeDropdownTrigger(regionEl, trigger) {
    var panel = dropdownPanelFor(regionEl, trigger)
    if (!panel)
      return

    if (trigger.hasAttribute && trigger.hasAttribute('aria-expanded')) {
      setDropdownExpanded(trigger, panel, trigger.getAttribute('aria-expanded') === 'true')
      return
    }

    if (panel.hasAttribute && panel.hasAttribute('hidden')) {
      setDropdownExpanded(trigger, panel, false)
      return
    }

    if (panel.getAttribute && panel.getAttribute('aria-hidden') === 'true') {
      setDropdownExpanded(trigger, panel, false)
      return
    }

    if (panel.style && panel.style.display === 'none') {
      setDropdownExpanded(trigger, panel, false)
      return
    }

    if (panel.classList && (panel.classList.contains('show') || panel.classList.contains('open') || panel.classList.contains('active') || panel.classList.contains('is-active'))) {
      setDropdownExpanded(trigger, panel, true)
      return
    }

    setDropdownExpanded(trigger, panel, false)
  }

  function toggleDropdownPanel(regionEl, trigger) {
    var panel = dropdownPanelFor(regionEl, trigger)
    if (!panel)
      return false

    var shouldOpen = !isDropdownExpanded(trigger, panel)
    if (shouldOpen)
      closeOtherDropdownPanels(regionEl, trigger)

    setDropdownExpanded(trigger, panel, shouldOpen)
    return true
  }

  function dropdownPanelFor(regionEl, trigger) {
    if (!trigger)
      return null

    var target = dropdownTargetValue(trigger)
    if (target) {
      var targeted = findDropdownPanelByTarget(regionEl, target)
      if (targeted)
        return targeted
    }

    var container = dropdownContainerFor(trigger)
    if (container && container.querySelector) {
      var panel = container.querySelector('[data-dropdown-menu], [data-disclosure-panel], [data-menu-panel], .dropdown-menu, [class*="dropdown-menu"], [role="menu"], [class*="submenu"]')
      if (panel && panel !== trigger)
        return panel
    }

    var next = trigger.nextElementSibling
    if (next && matchesAny(next, '[data-dropdown-menu], [data-disclosure-panel], [data-menu-panel], .dropdown-menu, [class*="dropdown-menu"], [role="menu"], [class*="submenu"], ul, ol, div'))
      return next

    return null
  }

  function dropdownTargetValue(trigger) {
    if (!trigger || !trigger.getAttribute)
      return ''

    var value = trigger.getAttribute('aria-controls')
      || trigger.getAttribute('aria-owns')
      || trigger.getAttribute('data-dropdown-target')
      || trigger.getAttribute('data-disclosure-target')
      || trigger.getAttribute('data-menu-target')
      || trigger.getAttribute('data-bs-target')
      || trigger.getAttribute('data-target')
      || trigger.getAttribute('href')
      || ''

    return String(value || '').trim()
  }

  function findDropdownPanelByTarget(regionEl, value) {
    if (!value)
      return null

    var raw = String(value).split(/\\s+/)[0]
    var hashIndex = raw.indexOf('#')
    if (hashIndex > 0)
      raw = raw.slice(hashIndex)
    var id = raw.charAt(0) === '#' ? raw.slice(1) : raw

    if (id && raw.charAt(0) !== '.' && raw.charAt(0) !== '[') {
      var byId = document.getElementById ? document.getElementById(id) : null
      if (byId)
        return byId
    }

    var scopes = [regionEl]
    if (regionEl && regionEl.parentNode && regionEl.parentNode.querySelector)
      scopes.push(regionEl.parentNode)

    if (raw.charAt(0) === '#' || raw.charAt(0) === '.' || raw.charAt(0) === '[') {
      for (var s = 0; s < scopes.length; s++) {
        try {
          var selected = scopes[s].querySelector(raw)
          if (selected)
            return selected
        }
        catch (_selectorError) {}
      }
    }

    return null
  }

  function dropdownContainerFor(trigger) {
    if (!trigger || !trigger.closest)
      return null

    return trigger.closest('[data-dropdown], [data-disclosure], [data-menu], .dropdown, [class*="dropdown"]')
  }

  function closeOtherDropdownPanels(regionEl, activeTrigger) {
    var triggers = dropdownTriggersFor(regionEl)

    for (var i = 0; i < triggers.length; i++) {
      if (triggers[i] === activeTrigger)
        continue

      var panel = dropdownPanelFor(regionEl, triggers[i])
      if (!panel)
        continue

      setDropdownExpanded(triggers[i], panel, false)
    }
  }

  function isDropdownExpanded(trigger, panel) {
    if (trigger && trigger.getAttribute && trigger.getAttribute('aria-expanded') === 'true')
      return true

    if (!panel)
      return false

    if (panel.hasAttribute && panel.hasAttribute('hidden'))
      return false
    if (panel.getAttribute && panel.getAttribute('aria-hidden') === 'true')
      return false
    if (panel.style && panel.style.display === 'none')
      return false
    if (panel.classList && (panel.classList.contains('show') || panel.classList.contains('open') || panel.classList.contains('active') || panel.classList.contains('is-active')))
      return true

    return false
  }

  function setDropdownExpanded(trigger, panel, expanded) {
    if (trigger && trigger.setAttribute)
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false')

    setDropdownNodeExpanded(trigger, expanded)
    setDropdownNodeExpanded(dropdownContainerFor(trigger), expanded)

    if (!panel)
      return

    if (expanded) {
      panel.removeAttribute('hidden')
      if (panel.setAttribute)
        panel.setAttribute('aria-hidden', 'false')
      if (panel.style)
        panel.style.display = ''
    }
    else {
      panel.setAttribute('hidden', 'hidden')
      if (panel.setAttribute)
        panel.setAttribute('aria-hidden', 'true')
      if (panel.style)
        panel.style.display = 'none'
    }

    setDropdownNodeExpanded(panel, expanded)
  }

  function setDropdownNodeExpanded(node, expanded) {
    if (!node || !node.classList)
      return

    if (expanded) {
      node.classList.add('show')
      node.classList.add('open')
      node.classList.add('active')
      node.classList.add('is-active')
      node.classList.remove('collapsed')
    }
    else {
      node.classList.remove('show')
      node.classList.remove('open')
      node.classList.remove('active')
      node.classList.remove('is-active')
      node.classList.add('collapsed')
    }
  }

  function galleryImagesFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    var found = regionEl.querySelectorAll('img')
    var images = []
    for (var i = 0; i < found.length; i++) {
      if (found[i] && found[i].getAttribute && imageSourceFor(found[i]))
        images.push(found[i])
    }

    return images
  }

  function galleryPartsFor(regionEl) {
    var images = galleryImagesFor(regionEl)
    var main = galleryMainImageFor(regionEl, images)
    var items = []

    for (var i = 0; i < images.length; i++) {
      var image = images[i]
      if (image === main)
        continue

      var control = galleryControlFor(image)
      if (!control)
        control = image

      if (!isGalleryThumbnail(regionEl, image, control))
        continue

      addUniqueGalleryItem(items, control, image)
    }

    if (!items.length && matchesAny(regionEl, '[data-gallery], .gallery, [class*="gallery"]')) {
      for (var j = 0; j < images.length; j++) {
        if (images[j] === main)
          continue
        addUniqueGalleryItem(items, galleryControlFor(images[j]) || images[j], images[j])
      }
    }

    return { main: main, items: items }
  }

  function addUniqueGalleryItem(items, control, image) {
    if (!control || !image)
      return

    for (var i = 0; i < items.length; i++) {
      if (items[i].control === control)
        return
    }

    items.push({ control: control, image: image })
  }

  function galleryMainImageFor(regionEl, images) {
    if (!images || !images.length)
      return null

    var explicit = regionEl && regionEl.querySelector ? regionEl.querySelector('[data-gallery-main] img, img[data-gallery-main], .gallery-main img, .gallery__main img, [class*="gallery-main"] img, [class*="main-image"] img, img[class*="main-image"]') : null
    if (explicit)
      return explicit

    var best = images[0]
    var bestArea = -1
    for (var i = 0; i < images.length; i++) {
      var image = images[i]
      var area = imageNaturalArea(image)
      if (area > bestArea) {
        best = image
        bestArea = area
      }
    }

    return best
  }

  function imageNaturalArea(image) {
    if (!image)
      return 0

    var width = Number(image.naturalWidth || image.getAttribute('width') || 0)
    var height = Number(image.naturalHeight || image.getAttribute('height') || 0)
    if (width > 0 && height > 0)
      return width * height

    if (image.getBoundingClientRect) {
      var rect = image.getBoundingClientRect()
      return (rect.width || 0) * (rect.height || 0)
    }

    return 0
  }

  function galleryControlFor(image) {
    if (!image || !image.closest)
      return image

    var control = image.closest('a, button, [role="button"], [data-gallery-thumb], [data-thumbnail], [data-thumb], [class*="thumb"]') || image
    if (control !== image && control.querySelectorAll && control.querySelectorAll('img').length > 1)
      return image

    return control
  }

  function isGalleryThumbnail(regionEl, image, control) {
    if (!image)
      return false

    if (matchesAny(image, '[data-gallery-thumb], [data-thumbnail], [data-thumb], [class*="thumb"]')
      || matchesAny(control, '[data-gallery-thumb], [data-thumbnail], [data-thumb], [class*="thumb"]'))
      return true

    return matchesAny(regionEl, '[data-gallery], .gallery, [class*="gallery"]')
  }

  function switchGalleryImage(regionEl, control) {
    var parts = galleryPartsFor(regionEl)
    if (!parts.main)
      return false

    var thumb = galleryImageFromControl(control)
    if (!thumb)
      return false

    var url = galleryUrlFor(control, thumb)
    if (!url)
      return false

    setMainGalleryImage(parts.main, url, thumb)
    setGalleryActiveState(parts.items, control)
    return true
  }

  function galleryImageFromControl(control) {
    if (!control)
      return null
    if (String(control.tagName || '').toLowerCase() === 'img')
      return control
    if (control.querySelector)
      return control.querySelector('img')
    return null
  }

  function galleryUrlFor(control, image) {
    var controlUrl = galleryUrlFromAttributes(control, true)
    if (controlUrl)
      return controlUrl

    var imageUrl = galleryUrlFromAttributes(image, false)
    if (imageUrl)
      return imageUrl

    return imageSourceFor(image)
  }

  function galleryUrlFromAttributes(element, hrefAllowed) {
    if (!element || !element.getAttribute)
      return ''

    var attrs = ['data-full-src', 'data-full', 'data-large-src', 'data-large', 'data-image', 'data-image-url', 'data-src', 'data-gallery-src']
    for (var i = 0; i < attrs.length; i++) {
      var value = element.getAttribute(attrs[i])
      if (value && looksGalleryImageUrl(value))
        return value
    }

    if (hrefAllowed) {
      var href = element.getAttribute('href')
      if (href && looksGalleryImageUrl(href))
        return href
    }

    return ''
  }

  function imageSourceFor(image) {
    if (!image || !image.getAttribute)
      return ''

    return image.currentSrc
      || image.getAttribute('src')
      || image.getAttribute('data-src')
      || image.getAttribute('data-image-url')
      || ''
  }

  function looksGalleryImageUrl(value) {
    var url = String(value || '').trim()
    if (!url || url === '#' || /^javascript:/i.test(url))
      return false

    return /\.(avif|gif|jpe?g|png|svg|webp)(\\?|#|$)/i.test(url)
      || /\\/media\\//i.test(url)
      || /\\/content\\/dam\\//i.test(url)
      || /^data:image\\//i.test(url)
  }

  function setMainGalleryImage(main, url, thumb) {
    if (!main || !main.setAttribute)
      return

    main.setAttribute('src', url)
    main.removeAttribute('srcset')
    main.removeAttribute('sizes')

    var alt = thumb && thumb.getAttribute ? thumb.getAttribute('alt') : ''
    if (alt)
      main.setAttribute('alt', alt)

    var picture = main.parentNode && String(main.parentNode.tagName || '').toLowerCase() === 'picture' ? main.parentNode : null
    if (picture && picture.querySelectorAll) {
      var sources = picture.querySelectorAll('source')
      for (var i = 0; i < sources.length; i++) {
        sources[i].setAttribute('srcset', url)
        sources[i].removeAttribute('sizes')
      }
    }
  }

  function setGalleryActiveState(items, activeControl) {
    for (var i = 0; i < items.length; i++) {
      var control = items[i].control
      var image = items[i].image
      var active = control === activeControl

      setGalleryNodeActive(control, active)
      if (image !== control)
        setGalleryNodeActive(image, active)
    }
  }

  function setGalleryNodeActive(node, active) {
    if (!node || !node.classList)
      return

    if (active) {
      node.classList.add('active')
      node.classList.add('is-active')
    }
    else {
      node.classList.remove('active')
      node.classList.remove('is-active')
    }
  }

  function interactivityIndexOf(list, node) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === node)
        return i
    }
    return -1
  }

  function addUniqueInteractivityNode(list, node) {
    if (node && interactivityIndexOf(list, node) === -1)
      list.push(node)
  }

  function tabPanelsFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    var panelSelector = '[role="tabpanel"], .tab-pane, [data-tab-panel], [data-tab-content], [data-tab-id], [class*="tab-panel"], [class*="tabpanel"]'
    var scopes = [regionEl]
    if (regionEl.parentNode && regionEl.parentNode.querySelectorAll)
      scopes.push(regionEl.parentNode)

    var panels = []
    for (var s = 0; s < scopes.length; s++) {
      var found = scopes[s].querySelectorAll(panelSelector)
      for (var i = 0; i < found.length; i++)
        addUniqueInteractivityNode(panels, found[i])
      if (panels.length)
        return panels
    }

    return panels
  }

  function tabTargetPanel(regionEl, trigger) {
    var targetValue = tabTargetValue(trigger)
    if (!targetValue)
      return null

    return findTabPanelByTarget(regionEl, targetValue)
  }

  function tabTargetValue(trigger) {
    if (!trigger || !trigger.getAttribute)
      return ''

    var value = trigger.getAttribute('aria-controls')
      || trigger.getAttribute('data-tab-target')
      || trigger.getAttribute('data-bs-target')
      || trigger.getAttribute('data-target')
      || trigger.getAttribute('href')
      || trigger.getAttribute('data-tab')
      || ''

    return String(value || '').trim()
  }

  function findTabPanelByTarget(regionEl, value) {
    if (!value)
      return null

    var raw = String(value).split(/\\s+/)[0]
    var hashIndex = raw.indexOf('#')
    if (hashIndex > 0)
      raw = raw.slice(hashIndex)
    var id = raw.charAt(0) === '#' ? raw.slice(1) : raw

    if (id && raw.charAt(0) !== '.' && raw.charAt(0) !== '[') {
      var byId = document.getElementById ? document.getElementById(id) : null
      if (byId)
        return byId
    }

    var scopes = [regionEl]
    if (regionEl && regionEl.parentNode && regionEl.parentNode.querySelector)
      scopes.push(regionEl.parentNode)

    if (raw.charAt(0) === '#' || raw.charAt(0) === '.' || raw.charAt(0) === '[') {
      for (var s = 0; s < scopes.length; s++) {
        try {
          var selected = scopes[s].querySelector(raw)
          if (selected)
            return selected
        }
        catch (_selectorError) {}
      }
    }

    var attrSelector = '[data-tab-panel="' + escapeAttributeSelectorValue(id) + '"], [data-tab-content="' + escapeAttributeSelectorValue(id) + '"], [data-tab-id="' + escapeAttributeSelectorValue(id) + '"]'
    for (var a = 0; a < scopes.length; a++) {
      try {
        var attrMatch = scopes[a].querySelector(attrSelector)
        if (attrMatch)
          return attrMatch
      }
      catch (_attrError) {}
    }

    return null
  }

  function tabTriggersFor(regionEl) {
    if (!regionEl || !regionEl.querySelectorAll)
      return []

    // Prefer explicit ARIA/data tabs, then interactive children of tab lists.
    var explicit = regionEl.querySelectorAll('[role="tab"], [aria-controls], [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target]')
    var explicitTriggers = []
    for (var e = 0; e < explicit.length; e++) {
      var explicitTrigger = explicit[e]
      var explicitlyTab = matchesAny(explicitTrigger, '[role="tab"], [data-bs-toggle="tab"], [data-toggle="tab"], [data-tab], [data-tab-target], [class*="tab"]')
      var looksAccordion = matchesAny(explicitTrigger, '[aria-expanded][aria-controls], .accordion-button, .cmp-accordion__button, [data-cmp-hook-accordion="button"]')
      if (looksAccordion && !explicitlyTab)
        continue
      addUniqueInteractivityNode(explicitTriggers, explicitTrigger)
    }
    if (explicitTriggers.length)
      return explicitTriggers

    var lists = regionEl.querySelectorAll('[role="tablist"], .tabs, [class*="tab"], [data-tabs], .nav-tabs, .tab-list, .tablist')
    var triggers = []
    var listEls = lists.length ? Array.prototype.slice.call(lists) : (regionEl.matches && regionEl.matches('[role="tablist"], .tabs, [class*="tab"], [data-tabs], .nav-tabs, .tab-list, .tablist') ? [regionEl] : [])

    for (var i = 0; i < listEls.length; i++) {
      var children = listEls[i].querySelectorAll('button, a, li, [role="tab"], [data-tab], [data-tab-target], [class*="tab"]')
      for (var j = 0; j < children.length; j++) {
        var child = children[j]
        // Skip the panels themselves; only collect tab-like controls.
        if (matchesAny(child, '[role="tabpanel"], .tab-content, .tab-pane, [data-tab-panel], [data-tab-content], [class*="tab-panel"], [class*="tabpanel"]'))
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

    var nextSel = '.swiper-button-next, .slick-next, .brand-next, [aria-label*="next" i], [class*="next"]'
    var prevSel = '.swiper-button-prev, .slick-prev, .brand-previous, [aria-label*="prev" i], [aria-label*="previous" i], [class*="prev"], [class*="previous"]'
    var scopes = carouselControlScopes(regionEl)
    var next = []
    var prev = []

    for (var i = 0; i < scopes.length; i++) {
      var scope = scopes[i]
      if (!scope || !scope.querySelectorAll)
        continue

      var nextNodes = scope.querySelectorAll(nextSel)
      for (var n = 0; n < nextNodes.length; n++)
        addUniqueInteractivityNode(next, nextNodes[n])

      var prevNodes = scope.querySelectorAll(prevSel)
      for (var p = 0; p < prevNodes.length; p++)
        addUniqueInteractivityNode(prev, prevNodes[p])
    }

    return {
      next: next,
      prev: prev
    }
  }

  function carouselControlScopes(regionEl) {
    var scopes = [regionEl]

    addSiblingCarouselControlScopes(scopes, regionEl)

    var parent = regionEl.parentElement
    var depth = 0
    while (parent && depth < 3) {
      var slideCount = parent.querySelectorAll ? parent.querySelectorAll('.slick-slide, .swiper-slide, .splide__slide, .carousel-item').length : 0
      if (slideCount > collectPanels(regionEl).length)
        break

      addUniqueInteractivityNode(scopes, parent)
      addSiblingCarouselControlScopes(scopes, parent)

      parent = parent.parentElement
      depth++
    }

    return scopes
  }

  function addSiblingCarouselControlScopes(scopes, node) {
    if (!node)
      return

    var previous = node.previousElementSibling
    var prevSteps = 0
    while (previous && prevSteps < 2) {
      if (isCarouselScopeBoundary(previous))
        break
      addUniqueInteractivityNode(scopes, previous)
      previous = previous.previousElementSibling
      prevSteps++
    }

    var next = node.nextElementSibling
    var nextSteps = 0
    while (next && nextSteps < 2) {
      if (isCarouselScopeBoundary(next))
        break
      addUniqueInteractivityNode(scopes, next)
      next = next.nextElementSibling
      nextSteps++
    }
  }

  function isCarouselScopeBoundary(node) {
    if (!node)
      return false

    if (classifyRegion(node) === 'carousel')
      return true

    return !!(node.querySelector && node.querySelector('.slick-slide, .swiper-slide, .splide__slide, .carousel-item'))
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
        region: regionPayload(edit.el),
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
    // Trusted bridge-injected controls (prev/next/dot bar, etc.) carry data-clone-studio-bridge;
    // trusted OEM controls wired by the read-only interactivity layer carry
    // data-clone-studio-interactive-control. The document-level navigation guard runs at capture
    // phase BEFORE the control's own capture-phase click handler, so without this exemption
    // stopImmediatePropagation() would swallow the click and the control would never switch/toggle.
    return !!(target && target.closest && target.closest('[data-clone-studio-bridge], [data-clone-studio-interactive-control]'))
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
      regionHtml: getRegionHtml(region),
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
      var patchedRegionId = message.regionId || message.selectedRegionId || null
      if (patchField(message)) {
        var patchedRegion = findRegionById(patchedRegionId)
        post(MESSAGE_DOM_UPDATED, { regionId: patchedRegionId, region: regionPayload(patchedRegion) })
      }
      return
    }

    if (message.type === MESSAGE_SET_HEIGHT) {
      var heightRegionId = message.regionId || message.selectedRegionId || message.id
      if (setRegionHeight(heightRegionId, message.value)) {
        var heightRegion = findRegionById(heightRegionId)
        post(MESSAGE_DOM_UPDATED, { regionId: heightRegionId, region: regionPayload(heightRegion) })
      }
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
      dupClone.removeAttribute('data-oem-region-id')
      var dupNested = dupClone.querySelectorAll('[data-oem-region-id]')
      for (var di = 0; di < dupNested.length; di++)
        dupNested[di].removeAttribute('data-oem-region-id')
      dupSource.parentNode.insertBefore(dupClone, dupSource.nextSibling)
      post(MESSAGE_DOM_UPDATED, { regionId: ensureRegionId(dupClone), newRegion: regionPayload(dupClone) })
      return
    }
  })

  selectRegion(findRegionById(window.__CLONE_STUDIO_SELECTED_REGION__), false)
  applyRegionOverrides(window.__CLONE_STUDIO_REGION_OVERRIDES__)
  markResponsiveImageVariants()
  recoverMissingResponsiveImagePairs()
  markResponsiveContentVariants()
  installResponsiveConfigRules()

  // Read-only preview only: make dynamic clone widgets clickable via the trusted bridge layer. The editor
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

function proxyCloneStudioHeadAssetUrls(html: string, baseHref: string, mediaBase: string): string {
  if (!mediaBase)
    return html

  if (/^<link\b/i.test(html)) {
    return html.replace(/\bhref=(["'])(.*?)\1/i, (match: string, quote: string, rawUrl: string) => {
      const proxied = proxyCloneStudioExternalAssetUrl(rawUrl, baseHref, mediaBase)
      return proxied ? `href=${quote}${escapeHtmlAttribute(proxied)}${quote}` : match
    })
  }

  if (/^<style\b/i.test(html)) {
    return html.replace(/url\((["']?)([^"')]+)\1\)/gi, (match: string, quote: string, rawUrl: string) => {
      const proxied = proxyCloneStudioExternalAssetUrl(rawUrl, baseHref, mediaBase)
      return proxied ? `url(${quote || '"'}${proxied}${quote || '"'})` : match
    })
  }

  return html
}

function proxyCloneStudioExternalAssetUrl(rawUrl: string, baseHref: string, mediaBase: string): string {
  const value = String(rawUrl ?? '').trim()
  if (!value || /^(?:data|blob|javascript|mailto|tel):/i.test(value) || value.startsWith('#'))
    return ''

  let absolute: string
  try {
    absolute = new URL(value, baseHref || undefined).href
  }
  catch {
    return ''
  }

  if (absolute.startsWith(`${mediaBase}/media/`))
    return absolute

  const oemId = cloneStudioMediaProxyOemIdForUrl(absolute)
  const encoded = encodeCloneStudioBase64Url(absolute)
  if (!oemId || !encoded)
    return ''

  return `${mediaBase}/media/${oemId}/${encoded}`
}

function cloneStudioMediaProxyOemIdForUrl(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (host === 'www.ford.com.au' || host === 'www.gpas-cache.ford.com')
      return 'ford-au'
    if (host === 'www.hyundai.com')
      return 'hyundai-au'
    if (host === 'www.mazda.com.au')
      return 'mazda-au'
    if (host === 'www.isuzuute.com.au' || host === 'cdn-iua.dataweavers.io')
      return 'isuzu-au'
    if (host === 'www.kia.com' || host === 'kia.com')
      return 'kia-au'
    if (host === 'www.nissan.com.au' || host === 'www-asia.nissan-cdn.net' || host === 'ms-prd.apn.mediaserver.heliosnissan.net')
      return 'nissan-au'
    if (host === 'www.subaru.com.au' || host === 'cdn-image-handler.oem-production.subaru.com.au')
      return 'subaru-au'
    if (host === 'www.gwmanz.com')
      return 'gwm-au'
    if (host === 'www.suzuki.com.au' || host === 'cdn.suzuki.com.au')
      return 'suzuki-au'
    if (host === 'www.renault.com.au')
      return 'renault-au'
    if (host === 'www.fotonaustralia.com.au')
      return 'foton-au'
    if (host === 'www.gacgroup.com' || host === 'eu-www-resouce-cdn.gacgroup.com' || host === 'eu-www-resource-cdn.gacgroup.com')
      return 'gac-au'
    if (host === 'kgm.com.au' || host === 'payloadb.therefinerydesign.com')
      return 'kgm-au'
    if (host === 'www.mitsubishi-motors.com.au' || host === 'configurator.mitsubishi-motors.com.au')
      return 'mitsubishi-au'
  }
  catch {}

  return ''
}

function encodeCloneStudioBase64Url(value: string): string {
  try {
    return btoa(unescape(encodeURIComponent(String(value))))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
  }
  catch {
    return ''
  }
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
