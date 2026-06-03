import { disableClonePreviewNavigation } from './clone-preview-html'

export interface CloneStudioHtmlOptions {
  rendered: string
  title: string
  baseHref: string
  selectedRegionId: string | null
}

const HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi

export function buildCloneStudioHtml(options: CloneStudioHtmlOptions): string {
  const { bodyHtml, headParts } = extractHeadParts(options.rendered)
  const rendered = disableClonePreviewNavigation(bodyHtml)
  const selectedRegion = JSON.stringify(options.selectedRegionId).replace(/</g, '\\u003C')

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
  var MESSAGE_READY = 'clone-studio:ready'
  var MESSAGE_SELECT_REGION = 'clone-studio:select-region'
  var MESSAGE_DOM_UPDATED = 'clone-studio:dom-updated'
  var MESSAGE_PATCH_FIELD = 'clone-studio:patch-field'
  var REGION_SELECTOR = '[data-oem-region-id]'
  var selectedRegion = null
  var hoverRegion = null

  function post(type, extra) {
    var message = {
      source: 'clone-studio',
      type: type,
      html: getBodyHtml(),
      bodyHtml: getBodyHtml(),
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

    return clone.innerHTML
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

  function closestAnchor(target) {
    if (!target || !target.closest)
      return null

    return target.closest('a')
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
    if (target.tagName === 'SOURCE') {
      target.setAttribute('srcset', String(value || ''))
      return
    }

    if (target.tagName === 'IMG') {
      target.setAttribute('src', String(value || ''))
      if (target.hasAttribute('srcset'))
        target.setAttribute('srcset', String(value || ''))
      return
    }

    target.style.backgroundImage = value ? 'url("' + String(value).replace(/"/g, '%22') + '")' : ''
  }

  function patchLink(target, value, message) {
    var anchor = target.tagName === 'A' ? target : target.querySelector('a')
    if (!anchor)
      anchor = target

    anchor.setAttribute('href', String(value || ''))
    anchor.setAttribute('data-oem-preview-href', String(value || ''))

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
      target.innerHTML = String(value == null ? '' : value)
    else
      target.textContent = String(value == null ? '' : value)

    return true
  }

  document.addEventListener('mousemove', function (event) {
    setHoverRegion(closestRegion(event.target))
  }, true)

  document.addEventListener('mouseleave', function () {
    setHoverRegion(null)
  }, true)

  document.addEventListener('click', function (event) {
    var target = event.target
    var anchor = closestAnchor(target)
    var region = closestRegion(target)

    if (anchor)
      event.preventDefault()

    if (region) {
      event.preventDefault()
      event.stopPropagation()
      selectRegion(region, true)
    }
  }, true)

  window.addEventListener('message', function (event) {
    var message = event.data || {}

    if (message.type === MESSAGE_SELECT_REGION) {
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

function extractHeadParts(rendered: string): { bodyHtml: string, headParts: string[] } {
  const headParts: string[] = []
  const bodyHtml = rendered.replace(HEAD_PART_PATTERN, (match: string) => {
    headParts.push(match)
    return ''
  })

  return { bodyHtml, headParts }
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
