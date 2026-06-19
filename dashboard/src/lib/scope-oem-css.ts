export interface ScopeOemCssOptions {
  /**
   * Convert `#id` selectors to `[data-oem-id="id"]` so the same OEM page can be
   * split into multiple sections without duplicate IDs on the same document.
   * @default true
   */
  rewriteIds?: boolean
  /**
   * Prefix `@keyframes` names and their references to avoid collisions between
   * sections that define animations with the same name.
   * @default true
   */
  prefixKeyframes?: boolean
  /**
   * How to handle `html`, `body`, and `:root` selectors.
   * - `'scope'`: rewrite them to target the section wrapper
   * - `'remove'`: drop rules that only target these selectors
   * @default 'scope'
   */
  rootSelectorMode?: 'scope' | 'remove'
}

function scopeClassForSection(sectionId: string): string {
  return `.oem-section-${sectionId.replace(/[^\w-]/g, '-')}`
}

function keyframesPrefixForSection(scopeClass: string): string {
  return scopeClass.replace(/^\./, '')
}

function isRootSelector(selector: string): boolean {
  return /^html$/i.test(selector) || /^body$/i.test(selector) || /^:root$/i.test(selector)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isKeyframesName(name: string): boolean {
  return /^(?:-webkit-|-moz-|-o-)?keyframes$/i.test(name)
}

function isScopeContainerName(name: string): boolean {
  return /^(?:media|supports|layer|container|document|scope)$/i.test(name)
}

interface CssItem {
  type: 'rule' | 'at-rule'
  name?: string
  prelude: string
  body: string | null
  children?: CssItem[]
  rewrittenPrelude?: string
}

function skipWhitespaceAndComments(css: string, start: number): number {
  let i = start
  let inString: string | null = null
  while (i < css.length) {
    const ch = css[i]
    const next = css[i + 1]
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < css.length) {
        if (css[i] === '*' && css[i + 1] === '/') {
          i += 2
          break
        }
        i++
      }
      continue
    }
    if (ch === '"' || ch === '\'') {
      inString = ch
      i++
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    break
  }
  return i
}

function consumeBlock(css: string, start: number): { content: string, end: number } {
  let depth = 0
  let inString: string | null = null
  let inComment = false
  for (let i = start; i < css.length; i++) {
    const ch = css[i]
    const next = css[i + 1]
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '/' && next === '*') {
      inComment = true
      i++
      continue
    }
    if (ch === '"' || ch === '\'') {
      inString = ch
      continue
    }
    if (ch === '{') {
      depth++
    }
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        return { content: css.slice(start + 1, i), end: i + 1 }
      }
    }
  }
  return { content: css.slice(start + 1), end: css.length }
}

function parseTopLevel(css: string): CssItem[] {
  const items: CssItem[] = []
  let i = 0
  while (i < css.length) {
    i = skipWhitespaceAndComments(css, i)
    if (i >= css.length)
      break

    if (css[i] === '@') {
      let j = i + 1
      while (j < css.length && /[\w-]/.test(css[j])) j++
      const name = css.slice(i + 1, j).toLowerCase()
      i = j
      i = skipWhitespaceAndComments(css, i)
      const preludeStart = i
      let hasBlock = false
      let inString: string | null = null
      let inComment = false
      for (; i < css.length; i++) {
        const ch = css[i]
        const next = css[i + 1]
        if (inComment) {
          if (ch === '*' && next === '/') {
            inComment = false
            i++
          }
          continue
        }
        if (inString) {
          if (ch === '\\') {
            i++
            continue
          }
          if (ch === inString) {
            inString = null
          }
          continue
        }
        if (ch === '/' && next === '*') {
          inComment = true
          i++
          continue
        }
        if (ch === '"' || ch === '\'') {
          inString = ch
          continue
        }
        if (ch === ';') {
          break
        }
        if (ch === '{') {
          hasBlock = true
          break
        }
      }
      const prelude = css.slice(preludeStart, i).trim()
      if (hasBlock) {
        const block = consumeBlock(css, i)
        i = block.end
        items.push({ type: 'at-rule', name, prelude, body: block.content })
      }
      else {
        if (css[i] === ';')
          i++
        items.push({ type: 'at-rule', name, prelude, body: null })
      }
    }
    else {
      const preludeStart = i
      let inString: string | null = null
      let inComment = false
      for (; i < css.length; i++) {
        const ch = css[i]
        const next = css[i + 1]
        if (inComment) {
          if (ch === '*' && next === '/') {
            inComment = false
            i++
          }
          continue
        }
        if (inString) {
          if (ch === '\\') {
            i++
            continue
          }
          if (ch === inString) {
            inString = null
          }
          continue
        }
        if (ch === '/' && next === '*') {
          inComment = true
          i++
          continue
        }
        if (ch === '"' || ch === '\'') {
          inString = ch
          continue
        }
        if (ch === '{')
          break
      }
      const prelude = css.slice(preludeStart, i).trim()
      const block = consumeBlock(css, i)
      i = block.end
      items.push({ type: 'rule', prelude, body: block.content })
    }
  }
  return items
}

function splitSelectors(selectorList: string): string[] {
  const parts: string[] = []
  let start = 0
  let depthParen = 0
  let depthBracket = 0
  let inString: string | null = null
  for (let i = 0; i < selectorList.length; i++) {
    const ch = selectorList[i]
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '"' || ch === '\'') {
      inString = ch
      continue
    }
    if (ch === '[') {
      depthBracket++
    }
    else if (ch === ']') {
      depthBracket--
    }
    else if (ch === '(') {
      depthParen++
    }
    else if (ch === ')') {
      depthParen--
    }
    else if (ch === ',' && depthBracket === 0 && depthParen === 0) {
      parts.push(selectorList.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(selectorList.slice(start).trim())
  return parts.filter(Boolean)
}

function scopeSelector(selector: string, scopeClass: string, rewriteIds: boolean): string | null {
  const trimmed = selector.trim()
  if (isRootSelector(trimmed)) {
    return scopeClass
  }
  let scoped = trimmed
  if (rewriteIds) {
    scoped = scoped.replace(/#([\w-]+)/g, '[data-oem-id="$1"]')
  }
  return `${scopeClass} ${scoped}`
}

function rewriteAnimationValue(value: string, keyframeNames: Map<string, string>): string {
  let result = value
  for (const [original, prefixed] of keyframeNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(original)}\\b`, 'g')
    result = result.replace(pattern, prefixed)
  }
  return result
}

function rewriteDeclarations(body: string, keyframeNames: Map<string, string>): string {
  if (keyframeNames.size === 0)
    return body

  const decls: string[] = []
  let start = 0
  let inString: string | null = null
  let inComment = false
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    const next = body[i + 1]
    if (inComment) {
      if (ch === '*' && next === '/') {
        inComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === inString) {
        inString = null
      }
      continue
    }
    if (ch === '/' && next === '*') {
      inComment = true
      i++
      continue
    }
    if (ch === '"' || ch === '\'') {
      inString = ch
      continue
    }
    if (ch === ';') {
      const piece = body.slice(start, i).trim()
      if (piece)
        decls.push(piece)
      start = i + 1
    }
  }
  const tail = body.slice(start).trim()
  if (tail)
    decls.push(tail)

  const rewritten = decls.map((decl) => {
    const colonIdx = decl.indexOf(':')
    if (colonIdx < 0)
      return decl
    const prop = decl.slice(0, colonIdx).trim()
    let value = decl.slice(colonIdx + 1).trim()
    if (/^animation(?:-name)?$/i.test(prop)) {
      value = rewriteAnimationValue(value, keyframeNames)
    }
    return `${prop}: ${value}`
  })

  return rewritten.length ? `${rewritten.join('; ')};` : ''
}

function emitRule(
  item: CssItem,
  scopeClass: string,
  options: Required<ScopeOemCssOptions>,
  keyframeNames: Map<string, string>,
): string | null {
  const selectors = splitSelectors(item.prelude)

  if (options.rootSelectorMode === 'remove') {
    const onlyRoot = selectors.length > 0 && selectors.every(s => isRootSelector(s.trim()))
    if (onlyRoot)
      return null
  }

  const mapped = selectors
    .map(selector => scopeSelector(selector, scopeClass, options.rewriteIds))
    .filter((s): s is string => s !== null)

  if (mapped.length === 0)
    return null

  let body = options.prefixKeyframes ? rewriteDeclarations(item.body ?? '', keyframeNames) : (item.body ?? '')
  body = body.trim()
  return `${mapped.join(', ')} { ${body} }`
}

function collectKeyframes(
  item: CssItem,
  keyframesPrefix: string,
  keyframeNames: Map<string, string>,
): void {
  if (item.type === 'at-rule' && isKeyframesName(item.name ?? '')) {
    const original = item.prelude.trim()
    if (original && !original.startsWith(`${keyframesPrefix}-`)) {
      const prefixed = `${keyframesPrefix}-${original}`
      keyframeNames.set(original, prefixed)
      item.rewrittenPrelude = prefixed
    }
  }
  else if (item.type === 'at-rule' && isScopeContainerName(item.name ?? '') && item.body !== null) {
    item.children = parseTopLevel(item.body)
    for (const child of item.children) collectKeyframes(child, keyframesPrefix, keyframeNames)
  }
}

function emitItem(
  item: CssItem,
  scopeClass: string,
  options: Required<ScopeOemCssOptions>,
  keyframeNames: Map<string, string>,
): string | null {
  if (item.type === 'rule') {
    return emitRule(item, scopeClass, options, keyframeNames)
  }

  const name = item.name ?? ''
  if (isKeyframesName(name)) {
    const prelude = item.rewrittenPrelude ?? item.prelude
    const body = (item.body ?? '').trim()
    return prelude
      ? `@${name} ${prelude} { ${body} }`
      : `@${name} { ${body} }`
  }

  if (isScopeContainerName(name) && item.body !== null) {
    const children = item.children ?? parseTopLevel(item.body)
    const bodyCss = children
      .map(child => emitItem(child, scopeClass, options, keyframeNames))
      .filter(Boolean)
      .join(' ')
    return `@${name} ${item.prelude} { ${bodyCss} }`
  }

  if (item.body === null) {
    return item.prelude
      ? `@${name} ${item.prelude};`
      : `@${name};`
  }

  const body = (item.body ?? '').trim()
  return item.prelude
    ? `@${name} ${item.prelude} { ${body} }`
    : `@${name} { ${body} }`
}

export interface ScopeOemCssResult {
  css: string
  keyframeNames: Record<string, string>
}

/**
 * Scope captured OEM CSS so it only applies inside a single section wrapper.
 * Returns the scoped CSS plus the map of renamed @keyframes.
 */
export function scopeOemCssWithMetadata(
  css: string,
  sectionId: string,
  options: ScopeOemCssOptions = {},
): ScopeOemCssResult {
  const resolved: Required<ScopeOemCssOptions> = {
    rewriteIds: options.rewriteIds ?? true,
    prefixKeyframes: options.prefixKeyframes ?? true,
    rootSelectorMode: options.rootSelectorMode ?? 'scope',
  }

  const scopeClass = scopeClassForSection(sectionId)
  const keyframesPrefix = keyframesPrefixForSection(scopeClass)
  const keyframeNames = new Map<string, string>()

  const items = parseTopLevel(css)
  for (const item of items) collectKeyframes(item, keyframesPrefix, keyframeNames)

  const output = items
    .map(item => emitItem(item, scopeClass, resolved, keyframeNames))
    .filter(Boolean)
    .join(' ')

  return {
    css: output.trim(),
    keyframeNames: Object.fromEntries(keyframeNames),
  }
}

/**
 * Scope captured OEM CSS so it only applies inside a single section wrapper.
 *
 * Example:
 * ```ts
 * const scoped = scopeOemCss('.hero { color: red; }', 'abc123')
 * // '.oem-section-abc123 .hero { color: red; }'
 * ```
 */
export function scopeOemCss(
  css: string,
  sectionId: string,
  options: ScopeOemCssOptions = {},
): string {
  return scopeOemCssWithMetadata(css, sectionId, options).css
}
