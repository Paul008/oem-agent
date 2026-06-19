import type { ScopeOemCssOptions } from './scope-oem-css'

import { scopeOemCssWithMetadata } from './scope-oem-css'

export interface ScopeOemSectionInput {
  html: string
  css?: string
}

export interface ScopeOemSectionResult {
  html: string
  css: string
  scopeClass: string
  keyframeNames: Record<string, string>
}

function scopeClassForSection(sectionId: string): string {
  return `oem-section-${sectionId.replace(/[^\w-]/g, '-')}`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function rewriteIds(html: string): string {
  return html.replace(/\bid\s*=\s*(["'])([^"']*)\1/gi, 'data-oem-id=$1$2$1')
}

function rewriteKeyframesInStyleValue(
  value: string,
  keyframeNames: Record<string, string>,
): string {
  return value.split(';').map((declaration) => {
    const trimmed = declaration.trim()
    if (!trimmed)
      return declaration

    const match = trimmed.match(/^(?:-webkit-)?(animation(?:-name)?)\s*:\s*(\S.*)$/i)
    if (!match)
      return declaration

    const [, property, rawValue] = match
    let replacedValue = rawValue
    for (const [original, prefixed] of Object.entries(keyframeNames)) {
      const pattern = new RegExp(`\\b${escapeRegExp(original)}\\b`, 'g')
      replacedValue = replacedValue.replace(pattern, prefixed)
    }
    if (replacedValue === rawValue)
      return declaration

    return `${property}: ${replacedValue}`
  }).join(';')
}

function rewriteInlineAnimations(
  html: string,
  keyframeNames: Record<string, string>,
): string {
  if (!Object.keys(keyframeNames).length)
    return html

  const styleAttrRegex = /\sstyle\s*=\s*(["'])([^"']*)\1/gi
  return html.replace(styleAttrRegex, (match, _quote, value) => {
    const replaced = rewriteKeyframesInStyleValue(value, keyframeNames)
    if (replaced === value)
      return match
    return match.replace(value, replaced)
  })
}

/**
 * Scope captured OEM HTML + CSS so they apply only inside a per-section wrapper.
 *
 * - Prefixes all CSS selectors with `.oem-section-{id}`.
 * - Rewrites `#id` selectors to `[data-oem-id="id"]` and mirrors that change in
 *   the HTML so IDs do not collide between sections.
 * - Prefixes `@keyframes` names in the CSS and updates inline animation
 *   declarations in the HTML.
 *
 * The caller is responsible for placing the returned `scopeClass` on an ancestor
 * element (or wrapping `html` in an element with that class) so the scoped CSS
 * selectors match.
 */
export function scopeOemSection(
  input: ScopeOemSectionInput,
  sectionId: string,
  options: ScopeOemCssOptions = {},
): ScopeOemSectionResult {
  const scopeClass = scopeClassForSection(sectionId)
  const rewriteIdsEnabled = options.rewriteIds ?? true

  let scopedHtml = input.html
  let scopedCss = ''
  let keyframeNames: Record<string, string> = {}

  if (input.css?.trim()) {
    const result = scopeOemCssWithMetadata(input.css, sectionId, options)
    scopedCss = result.css
    keyframeNames = result.keyframeNames
  }

  if (rewriteIdsEnabled)
    scopedHtml = rewriteIds(scopedHtml)

  if (Object.keys(keyframeNames).length > 0)
    scopedHtml = rewriteInlineAnimations(scopedHtml, keyframeNames)

  return {
    html: scopedHtml,
    css: scopedCss,
    scopeClass,
    keyframeNames,
  }
}
