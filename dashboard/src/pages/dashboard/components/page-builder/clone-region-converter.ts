import type { Product, VariantColor } from '@/composables/use-oem-data'
import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'
import { tailwindRules } from '@/composables/capture-tailwind-rules'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[&<>"']/g, c => HTML_ESCAPES[c as keyof typeof HTML_ESCAPES] ?? c)
    .trim()
}

function toUsd(value: number | null | undefined): string {
  if (value == null)
    return ''
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
  }
  catch {
    return `$${value.toLocaleString()}`
  }
}

function buildProductFacts(product: Product, imageUrl: string) {
  const facts: string[] = []

  if (product.variant_code)
    facts.push(`<p><strong>Code:</strong> ${escapeText(product.variant_code)}</p>`)

  const priceParts: string[] = []
  if (product.price_raw_string)
    priceParts.push(escapeText(product.price_raw_string))
  else if (product.price_amount != null)
    priceParts.push(toUsd(product.price_amount))
  if (product.price_qualifier)
    priceParts.push(escapeText(product.price_qualifier))
  if (product.price_type && !product.price_qualifier)
    priceParts.push(escapeText(product.price_type))
  if (priceParts.length)
    facts.push(`<p><strong>Price:</strong> ${priceParts.join(' • ')}</p>`)

  if (product.availability)
    facts.push(`<p><strong>Availability:</strong> ${escapeText(product.availability)}</p>`)
  if (product.body_type)
    facts.push(`<p><strong>Body:</strong> ${escapeText(product.body_type)}</p>`)
  if (product.fuel_type)
    facts.push(`<p><strong>Fuel:</strong> ${escapeText(product.fuel_type)}</p>`)

  let specs = ''
  if (product.specs_json != null) {
    specs = typeof product.specs_json === 'string'
      ? product.specs_json
      : JSON.stringify(product.specs_json)
  }
  if (specs)
    facts.push(`<p><strong>Specs:</strong> ${escapeText(specs)}</p>`)

  const featureItems = Array.isArray(product.key_features) ? product.key_features : []
  const features = featureItems
    .map((feature: unknown) => `<li>${escapeText(feature)}</li>`)
    .join('')

  const lines = [
    `<p>${escapeText(product.title || 'Variant')}</p>`,
    ...facts,
    featureItems.length ? `<p><strong>Key features:</strong></p><ul class="list-disc ml-5 space-y-1">${features}</ul>` : '',
  ]
    .filter(Boolean)
    .join('')

  if (imageUrl)
    return `${lines}<div class="mt-3"><img src="${escapeText(imageUrl)}" alt="${escapeText(product.variant_name || product.title || 'Variant')}" class="max-w-full h-auto rounded-lg"></div>`

  return lines
}

export interface CatalogBindingInput {
  oemId: string
  modelSlug: string
  regionId?: string
  products: Product[]
  variantColors: VariantColor[]
}

export function buildCatalogSectionsFromModel(input: CatalogBindingInput): Record<string, any>[] {
  const colorsByProduct = new Map<string, VariantColor[]>()
  for (const c of input.variantColors ?? []) {
    const list = colorsByProduct.get(c.product_id) ?? []
    list.push(c)
    colorsByProduct.set(c.product_id, list)
  }

  const products = [...input.products].sort((a, b) => {
    const aLabel = escapeText(a.variant_name || a.title || '')
    const bLabel = escapeText(b.variant_name || b.title || '')
    return aLabel.localeCompare(bLabel)
  })

  const tabs = products.map((product) => {
    const variantColors = colorsByProduct.get(product.id) ?? []
    const chosenColor = variantColors.find(c => c.hero_image_url) ?? variantColors[0]
    const imageUrl = chosenColor?.hero_image_url || chosenColor?.swatch_url || ''

    return {
      label: product.variant_name || product.title || 'Variant',
      content_html: buildProductFacts(product, imageUrl),
      image_url: imageUrl || '',
      image_disclaimer: '',
      disclaimer: '',
    }
  })

  const commonBinding = {
    type: 'model-catalog',
    oem_id: input.oemId,
    model_slug: input.modelSlug,
    region_id: input.regionId || null,
    generated_at: new Date().toISOString(),
  }

  return [
    {
      type: 'tabs',
      title: products.length === 1 ? 'Model variant' : 'Model variants',
      category: 'Model variants',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs,
      default_tab: 0,
      _catalog_binding: commonBinding,
    },
    {
      type: 'color-picker',
      title: 'Colours',
      colors: [],
      _catalog_binding: commonBinding,
    },
  ]
}

interface BuildRawHtmlSectionFromCloneRegionOptions {
  css?: string | null
  tailwindRecipeArtifact?: any
  mode?: TailwindConversionMode
}

type TailwindConversionMode = 'exact' | 'token'

interface CapturedTailwindStats {
  computed_declarations: number
  mapped_declarations: number
  leftover_declarations: number
  unmatched_rules: number
  leftover_rules: number
  important_count: number
  calc_count: number
  unresolved_var_count: number
  variant_declarations: number
}

interface CapturedTailwindCompilation {
  html: string
  leftoverCss: string
  source: 'captured-region-css' | 'captured-computed-style' | 'raw-html'
  supportedDeclarations: number
  leftoverRules: number
  mode: TailwindConversionMode
  stats: CapturedTailwindStats
}

export function buildRawHtmlSectionFromCloneRegion(html: string | null | undefined, options: BuildRawHtmlSectionFromCloneRegionOptions = {}): Record<string, any> | null {
  const trimmed = typeof html === 'string' ? html.trim() : ''
  if (!trimmed)
    return null

  const compiled = compileCapturedRegionHtmlToTailwind(trimmed, options)
  const section: Record<string, any> = {
    type: 'content-block',
    title: '',
    content_html: '',
    _generated_html: compiled.html,
    animation: 'fade-in',
  }

  if (compiled.source !== 'raw-html') {
    section._tailwind_conversion = {
      source: compiled.source,
      mode: compiled.mode,
      supported_declarations: compiled.supportedDeclarations,
      leftover_rules: compiled.leftoverRules,
      stats: compiled.stats,
    }
  }

  if (compiled.leftoverCss)
    section._tailwind_leftover_css = compiled.leftoverCss

  return section
}

export interface BuildEditableSectionFromCloneRegionInput {
  html?: string | null
  tailwindRecipeArtifact?: any
  compileTailwindRecipeArtifact?: (artifact: any) => Promise<any>
}

export async function buildEditableSectionFromCloneRegion(input: BuildEditableSectionFromCloneRegionInput): Promise<Record<string, any> | null> {
  if (input.tailwindRecipeArtifact && input.compileTailwindRecipeArtifact) {
    try {
      const response = await input.compileTailwindRecipeArtifact(input.tailwindRecipeArtifact)
      const result = response?.result
      if (response?.success && result?.section && Number(result.confidence) >= 0.7)
        return result.section
    }
    catch {
      // Fall through to raw HTML conversion. The caller can still save the region.
    }
  }

  return buildRawHtmlSectionFromCloneRegion(input.html, {
    css: extractTailwindRecipeArtifactCss(input.tailwindRecipeArtifact),
    tailwindRecipeArtifact: input.tailwindRecipeArtifact,
  })
}

function compileCapturedRegionHtmlToTailwind(html: string, options: BuildRawHtmlSectionFromCloneRegionOptions): CapturedTailwindCompilation {
  const styleExtraction = extractStyleBlocks(html)
  const css = [styleExtraction.css, options.css].filter(Boolean).join('\n').trim()
  const mode = options.mode || 'exact'

  if (hasComputedStyleArtifact(options.tailwindRecipeArtifact)) {
    const computedResult = compileComputedStyleArtifactIntoHtml(styleExtraction.html, options.tailwindRecipeArtifact, mode)
    const cssResult = css
      ? compileCssRulesIntoHtml(computedResult.html, css, { mode, applyBaseUtilities: false })
      : emptyCssCompilation(computedResult.html, mode)
    const stats = mergeTailwindStats(computedResult.stats, cssResult.stats)
    return {
      html: cssResult.html.trim(),
      leftoverCss: cssResult.leftoverCss,
      source: 'captured-computed-style',
      supportedDeclarations: stats.mapped_declarations,
      leftoverRules: stats.leftover_rules,
      mode,
      stats,
    }
  }

  if (css) {
    const cssResult = compileCssRulesIntoHtml(styleExtraction.html, css, { mode, applyBaseUtilities: true })
    return {
      html: cssResult.html.trim(),
      leftoverCss: cssResult.leftoverCss,
      source: 'captured-region-css',
      supportedDeclarations: cssResult.stats.mapped_declarations,
      leftoverRules: cssResult.stats.leftover_rules,
      mode,
      stats: cssResult.stats,
    }
  }

  return {
    html: styleExtraction.html.trim(),
    leftoverCss: '',
    source: 'raw-html',
    supportedDeclarations: 0,
    leftoverRules: 0,
    mode,
    stats: createTailwindStats(),
  }
}

function extractStyleBlocks(html: string): { html: string, css: string } {
  const css: string[] = []
  const withoutStyles = String(html || '').replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_match, body) => {
    if (body)
      css.push(String(body).trim())
    return ''
  })

  return { html: withoutStyles.trim(), css: css.join('\n') }
}

function extractTailwindRecipeArtifactCss(artifact: any): string {
  if (!artifact || typeof artifact !== 'object')
    return ''

  const candidates = [
    artifact.css,
    artifact.captured_css,
    artifact.capturedCss,
    artifact.stylesheet,
    artifact.stylesheet_css,
    artifact.stylesheetCss,
    artifact.matching_css,
    artifact.matchingCss,
  ]

  return candidates
    .filter(value => typeof value === 'string' && value.trim())
    .join('\n')
}

function compileCssRulesIntoHtml(html: string, css: string, options: { mode: TailwindConversionMode, applyBaseUtilities: boolean }): { html: string, leftoverCss: string, stats: CapturedTailwindStats } {
  let nextHtml = html
  const leftoverCss: string[] = []
  const stats = createTailwindStats()

  for (const block of parseTopLevelCssBlocks(css)) {
    if (block.type === 'atrule') {
      countCssSignals(block.raw, stats)
      const mediaPrefix = mediaVariantPrefix(block.selector)
      if (mediaPrefix) {
        const mediaResult = compileNestedMediaRules(nextHtml, block.body, mediaPrefix, options, stats)
        nextHtml = mediaResult.html
        if (mediaResult.leftoverCss)
          leftoverCss.push(mediaResult.leftoverCss)
      }
      else {
        leftoverCss.push(block.raw)
        stats.leftover_rules += 1
      }
      continue
    }

    const result = applyCssRuleToHtml(nextHtml, block.selector, parseDeclarations(block.body), options, stats)
    nextHtml = result.html
    if (result.leftoverCss)
      leftoverCss.push(result.leftoverCss)
  }

  return {
    html: nextHtml,
    leftoverCss: leftoverCss.filter(Boolean).join('\n').trim(),
    stats,
  }
}

function emptyCssCompilation(html: string, _mode: TailwindConversionMode): { html: string, leftoverCss: string, stats: CapturedTailwindStats } {
  return { html, leftoverCss: '', stats: createTailwindStats() }
}

function compileNestedMediaRules(html: string, css: string, mediaPrefix: string, options: { mode: TailwindConversionMode, applyBaseUtilities: boolean }, stats: CapturedTailwindStats): { html: string, leftoverCss: string } {
  let nextHtml = html
  const leftoverCss: string[] = []
  const nestedOptions = { ...options, forcedVariantPrefix: mediaPrefix }

  for (const block of parseTopLevelCssBlocks(css)) {
    if (block.type === 'atrule') {
      leftoverCss.push(block.raw)
      stats.leftover_rules += 1
      continue
    }

    const result = applyCssRuleToHtml(nextHtml, block.selector, parseDeclarations(block.body), nestedOptions, stats)
    nextHtml = result.html
    if (result.leftoverCss)
      leftoverCss.push(result.leftoverCss)
  }

  return { html: nextHtml, leftoverCss: leftoverCss.join('\n').trim() }
}

function applyCssRuleToHtml(
  html: string,
  selector: string,
  declarations: Array<{ prop: string, value: string }>,
  options: { mode: TailwindConversionMode, applyBaseUtilities: boolean, forcedVariantPrefix?: string },
  stats: CapturedTailwindStats,
): { html: string, leftoverCss: string } {
  let nextHtml = html
  const leftoverCss: string[] = []
  const selectors = splitSelectorList(selector)

  for (const rawSelector of selectors) {
    const selectorPlan = parseSelectorPlan(rawSelector.trim(), options.forcedVariantPrefix)
    if (!selectorPlan) {
      leftoverCss.push(formatCssRule(rawSelector.trim(), declarations))
      stats.leftover_rules += 1
      stats.leftover_declarations += declarations.length
      continue
    }

    if (!selectorMatchesHtml(nextHtml, selectorPlan.targetSelector)) {
      stats.unmatched_rules += 1
      continue
    }

    const classes: string[] = []
    const leftoverDeclarations: Array<{ prop: string, value: string }> = []
    for (const declaration of declarations) {
      const cleaned = cleanCssDeclarationValue(declaration.value)
      countCssSignals(declaration.value, stats)
      const mapped = declarationToTailwindClasses(declaration.prop, cleaned.value, options.mode)
      const shouldApply = mapped.length && (options.applyBaseUtilities || selectorPlan.variantPrefix)

      if (cleaned.important)
        stats.important_count += 1

      if (shouldApply) {
        const prefixed = selectorPlan.variantPrefix
          ? mapped.map(className => `${selectorPlan.variantPrefix}${className}`)
          : mapped
        classes.push(...prefixed)
        stats.mapped_declarations += 1
        if (selectorPlan.variantPrefix)
          stats.variant_declarations += 1
      }
      else if (!mapped.length && shouldCountCssDeclaration(declaration.prop, cleaned.value)) {
        leftoverDeclarations.push({ prop: declaration.prop, value: declaration.value })
        stats.leftover_declarations += 1
      }
    }

    if (classes.length)
      nextHtml = appendClassesForSelector(nextHtml, selectorPlan.targetSelector, classes)

    if (leftoverDeclarations.length) {
      leftoverCss.push(formatCssRule(rawSelector.trim(), leftoverDeclarations))
      stats.leftover_rules += 1
    }
  }

  return { html: nextHtml, leftoverCss: leftoverCss.join('\n').trim() }
}

function parseTopLevelCssBlocks(css: string): Array<{ type: 'rule' | 'atrule', selector: string, body: string, raw: string }> {
  const blocks: Array<{ type: 'rule' | 'atrule', selector: string, body: string, raw: string }> = []
  const input = String(css || '')
  let cursor = 0

  while (cursor < input.length) {
    const open = input.indexOf('{', cursor)
    if (open < 0)
      break

    const prelude = input.slice(cursor, open).trim()
    let depth = 1
    let index = open + 1
    while (index < input.length && depth > 0) {
      const char = input[index]
      if (char === '{')
        depth += 1
      else if (char === '}')
        depth -= 1
      index += 1
    }

    const raw = input.slice(cursor, index).trim()
    const body = input.slice(open + 1, Math.max(open + 1, index - 1)).trim()
    if (prelude) {
      if (prelude.startsWith('@') || body.includes('{'))
        blocks.push({ type: 'atrule', selector: prelude, body, raw })
      else
        blocks.push({ type: 'rule', selector: prelude, body, raw })
    }

    cursor = index
  }

  return blocks
}

function splitSelectorList(selector: string): string[] {
  const selectors: string[] = []
  let current = ''
  let parenDepth = 0

  for (const char of selector) {
    if (char === '(')
      parenDepth += 1
    else if (char === ')')
      parenDepth = Math.max(0, parenDepth - 1)

    if (char === ',' && parenDepth === 0) {
      selectors.push(current)
      current = ''
    }
    else {
      current += char
    }
  }

  if (current.trim())
    selectors.push(current)

  return selectors
}

function parseDeclarations(body: string): Array<{ prop: string, value: string }> {
  return String(body || '')
    .split(';')
    .map((part) => {
      const colon = part.indexOf(':')
      if (colon < 0)
        return null

      const prop = part.slice(0, colon).trim().toLowerCase()
      const value = part.slice(colon + 1).trim()
      return prop && value ? { prop, value } : null
    })
    .filter((declaration): declaration is { prop: string, value: string } => Boolean(declaration))
}

function isSafeSelector(selector: string): boolean {
  return /^(\.[A-Za-z0-9_-]+|#[A-Za-z0-9_-]+|[a-z][a-z0-9-]*)$/i.test(selector)
}

function parseSelectorPlan(selector: string, forcedVariantPrefix?: string): { targetSelector: string, variantPrefix: string } | null {
  if (!selector)
    return null

  if (forcedVariantPrefix && isSafeSelector(selector))
    return { targetSelector: selector, variantPrefix: forcedVariantPrefix }

  if (isSafeSelector(selector))
    return { targetSelector: selector, variantPrefix: forcedVariantPrefix || '' }

  const variant = selector.match(/^(\.[A-Za-z0-9_-]+|#[A-Za-z0-9_-]+|[a-z][a-z0-9-]*):(hover|focus|active|disabled|visited|focus-visible)$/i)
  if (variant) {
    const variantName = variant[2].toLowerCase()
    return { targetSelector: variant[1], variantPrefix: `${variantName}:` }
  }

  return null
}

function mediaVariantPrefix(selector: string): string {
  const normalized = String(selector || '').replace(/\s+/g, ' ').trim()
  const max = normalized.match(/^@media\s*\(\s*max-width\s*:\s*([0-9.]+px)\s*\)$/i)
  if (max)
    return `max-[${max[1]}]:`

  const min = normalized.match(/^@media\s*\(\s*min-width\s*:\s*([0-9.]+px)\s*\)$/i)
  if (min)
    return `min-[${min[1]}]:`

  return ''
}

function selectorMatchesHtml(html: string, selector: string): boolean {
  if (selector.startsWith('.')) {
    const className = selector.slice(1)
    let matched = false
    html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag) => {
      if (readHtmlClassAttribute(tag).split(/\s+/).includes(className))
        matched = true
      return tag
    })
    return matched
  }

  if (selector.startsWith('#')) {
    const id = selector.slice(1)
    let matched = false
    html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag) => {
      if (readHtmlAttributeValue(tag, 'id') === id)
        matched = true
      return tag
    })
    return matched
  }

  return new RegExp(`<${escapeRegExp(selector)}(\\s|>|/)`, 'i').test(html)
}

function formatCssRule(selector: string, declarations: Array<{ prop: string, value: string }>): string {
  if (!declarations.length)
    return ''

  const body = declarations.map(declaration => `${declaration.prop}: ${declaration.value};`).join(' ')
  return `${selector} { ${body} }`
}

function appendClassesForSelector(html: string, selector: string, classes: string[]): string {
  if (!classes.length)
    return html

  if (selector.startsWith('.')) {
    const className = selector.slice(1)
    return html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag) => {
      const existing = readHtmlClassAttribute(tag)
      if (!existing.split(/\s+/).includes(className))
        return tag
      return appendClassesToOpeningTag(tag, classes)
    })
  }

  if (selector.startsWith('#')) {
    const id = selector.slice(1)
    return html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag) => {
      if (readHtmlAttributeValue(tag, 'id') !== id)
        return tag
      return appendClassesToOpeningTag(tag, classes)
    })
  }

  const tagName = selector.toLowerCase()
  const pattern = new RegExp(`<${escapeRegExp(tagName)}(\\s[^<>]*?)?>`, 'gi')
  return html.replace(pattern, tag => appendClassesToOpeningTag(tag, classes))
}

function appendClassesToOpeningTag(tag: string, classes: string[]): string {
  const existing = readHtmlClassAttribute(tag)
  const next = uniqueClassList([...existing.split(/\s+/).filter(Boolean), ...classes])
  if (!next.length)
    return tag

  if (/\sclass\s*=/.test(tag))
    return tag.replace(/\sclass\s*=\s*(["'])(.*?)\1/i, ` class="${next.join(' ')}"`)

  return tag.replace(/\/?>$/, match => ` class="${next.join(' ')}"${match}`)
}

function readHtmlClassAttribute(tag: string): string {
  return readHtmlAttributeValue(tag, 'class') || ''
}

function readHtmlAttributeValue(tag: string, name: string): string | null {
  const pattern = new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  const match = String(tag || '').match(pattern)
  return match ? match[2] : null
}

function uniqueClassList(classes: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const className of classes) {
    const trimmed = className.trim()
    if (!trimmed || seen.has(trimmed))
      continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compileComputedStyleArtifactIntoHtml(html: string, artifact: any, mode: TailwindConversionMode): { html: string, stats: CapturedTailwindStats } {
  const snapshots = computedSnapshotsForArtifact(artifact)
  if (!snapshots.length)
    return { html, stats: createTailwindStats() }

  const snapshotNodes = snapshots.map(snapshot => flattenTailwindRecipeNodes(snapshot.root))
  let index = 0
  const stats = createTailwindStats()
  const nextHtml = html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag, tagName) => {
    const node = snapshotNodes[0]?.[index]
    index += 1
    if (!node || String(node.tag || '').toLowerCase() !== String(tagName || '').toLowerCase())
      return tag

    const classes: string[] = []
    classes.push(...computedStyleToTailwindClasses(node.computed_style, mode, stats).classes)

    let previousStyle = node.computed_style || {}
    for (let snapshotIndex = 1; snapshotIndex < snapshotNodes.length; snapshotIndex++) {
      const responsiveNode = snapshotNodes[snapshotIndex]?.[index - 1]
      if (!responsiveNode || String(responsiveNode.tag || '').toLowerCase() !== String(tagName || '').toLowerCase())
        continue

      const prefix = responsiveVariantPrefixForViewport(snapshots[snapshotIndex].viewport)
      if (!prefix)
        continue

      const diff = diffComputedStyle(previousStyle, responsiveNode.computed_style)
      const responsiveClasses = computedStyleToTailwindClasses(diff, mode, stats).classes
      classes.push(...responsiveClasses.map(className => `${prefix}${className}`))
      stats.variant_declarations += responsiveClasses.length
      previousStyle = responsiveNode.computed_style || previousStyle
    }

    return appendClassesToOpeningTag(tag, classes)
  })

  return { html: nextHtml, stats }
}

function hasComputedStyleArtifact(artifact: any): boolean {
  return computedSnapshotsForArtifact(artifact).length > 0
}

function computedSnapshotsForArtifact(artifact: any): Array<{ viewport: any, root: any }> {
  if (!artifact || typeof artifact !== 'object')
    return []

  const rawSnapshots = Array.isArray(artifact.computed_snapshots)
    ? artifact.computed_snapshots
    : Array.isArray(artifact.computedSnapshots)
      ? artifact.computedSnapshots
      : []

  const snapshots = rawSnapshots
    .filter((snapshot: any) => snapshot?.root && typeof snapshot.root === 'object')
    .map((snapshot: any) => ({ viewport: snapshot.viewport || {}, root: snapshot.root }))

  if (snapshots.length)
    return snapshots

  return artifact.root && typeof artifact.root === 'object'
    ? [{ viewport: artifact.viewport || {}, root: artifact.root }]
    : []
}

function flattenTailwindRecipeNodes(root: any): any[] {
  const nodes: any[] = []
  const visit = (node: any) => {
    if (!node || typeof node !== 'object')
      return

    nodes.push(node)
    const children = Array.isArray(node.children) ? node.children : []
    for (const child of children)
      visit(child)
  }

  visit(root)
  return nodes
}

function computedStyleToTailwindClasses(style: Record<string, unknown> | null | undefined, mode: TailwindConversionMode, stats: CapturedTailwindStats): { classes: string[] } {
  if (!style || typeof style !== 'object')
    return { classes: [] }

  const classes: string[] = []
  for (const [prop, rawValue] of Object.entries(style)) {
    const value = String(rawValue ?? '')
    countCssSignals(value, stats)
    if (!shouldCountCssDeclaration(prop, value))
      continue

    stats.computed_declarations += 1
    const mapped = declarationToTailwindClasses(prop, value, mode)
    if (!mapped.length) {
      stats.leftover_declarations += 1
      continue
    }

    classes.push(...mapped)
    stats.mapped_declarations += 1
  }

  return { classes: uniqueClassList(classes) }
}

function diffComputedStyle(previous: Record<string, unknown> | null | undefined, next: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const previousStyle = previous && typeof previous === 'object' ? previous : {}
  const nextStyle = next && typeof next === 'object' ? next : {}
  const diff: Record<string, unknown> = {}

  for (const [prop, value] of Object.entries(nextStyle)) {
    if (String(previousStyle[prop] ?? '') !== String(value ?? ''))
      diff[prop] = value
  }

  return diff
}

function responsiveVariantPrefixForViewport(viewport: any): string {
  const name = String(viewport?.name || '').toLowerCase()
  if (['sm', 'md', 'lg', 'xl', '2xl'].includes(name))
    return `${name}:`

  const width = Number(viewport?.width)
  if (!Number.isFinite(width) || width < 640)
    return ''
  if (width >= 1536)
    return '2xl:'
  if (width >= 1280)
    return 'xl:'
  if (width >= 1024)
    return 'lg:'
  if (width >= 768)
    return 'md:'
  return 'sm:'
}

interface TailwindDeclarationResolver {
  mode: TailwindConversionMode
  classesForDeclaration: (prop: string, value: string) => string[]
}

function declarationToTailwindClasses(prop: string, value: string, mode: TailwindConversionMode): string[] {
  const normalizedProp = String(prop || '').trim().toLowerCase()
  const normalizedValue = String(value || '').trim()
  if (!normalizedProp || !normalizedValue)
    return []

  return getTailwindDeclarationResolver(mode).classesForDeclaration(normalizedProp, normalizedValue)
}

function getTailwindDeclarationResolver(mode: TailwindConversionMode): TailwindDeclarationResolver {
  return {
    mode,
    classesForDeclaration: exactTailwindClassesForDeclaration,
  }
}

function exactTailwindClassesForDeclaration(normalizedProp: string, normalizedValue: string): string[] {
  const shorthand = spacingShorthandToTailwind(normalizedProp, normalizedValue)
  if (shorthand.length)
    return shorthand

  return tailwindRules().cssTw(normalizedProp, normalizeCssValue(normalizedValue))
}

function spacingShorthandToTailwind(prop: string, value: string): string[] {
  if (prop !== 'padding' && prop !== 'margin')
    return []

  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length !== 1)
    return []

  const numeric = parseFloat(parts[0])
  if (Number.isNaN(numeric) || numeric < 0 || !/px$/i.test(parts[0]))
    return []

  const prefix = prop === 'padding' ? 'p' : 'm'
  return [`${prefix}-${tailwindRules().pxToSp(numeric)}`]
}

function normalizeCssValue(value: string): string {
  const rgb = value.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([0-9.]+%?))?\s*\)$/i)
  if (!rgb)
    return value

  if (rgb[4]) {
    const alpha = rgb[4].endsWith('%') ? String(Number.parseFloat(rgb[4]) / 100) : rgb[4]
    return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`
  }

  return `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})`
}

function createTailwindStats(): CapturedTailwindStats {
  return {
    computed_declarations: 0,
    mapped_declarations: 0,
    leftover_declarations: 0,
    unmatched_rules: 0,
    leftover_rules: 0,
    important_count: 0,
    calc_count: 0,
    unresolved_var_count: 0,
    variant_declarations: 0,
  }
}

function mergeTailwindStats(...statsList: CapturedTailwindStats[]): CapturedTailwindStats {
  const merged = createTailwindStats()
  for (const stats of statsList) {
    for (const key of Object.keys(merged) as Array<keyof CapturedTailwindStats>)
      merged[key] += stats[key] || 0
  }
  return merged
}

function cleanCssDeclarationValue(value: string): { value: string, important: boolean } {
  const raw = String(value || '').trim()
  const important = /!important\s*$/i.test(raw)
  return {
    value: raw.replace(/\s*!important\s*$/i, '').trim(),
    important,
  }
}

function countCssSignals(value: string, stats: CapturedTailwindStats) {
  const raw = String(value || '')
  if (/calc\(/i.test(raw))
    stats.calc_count += 1
  if (/var\(/i.test(raw))
    stats.unresolved_var_count += 1
}

function shouldCountCssDeclaration(prop: string, value: string): boolean {
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue || normalizedValue === 'none' || normalizedValue === 'normal' || normalizedValue === 'auto' || normalizedValue === '0px' || normalizedValue === 'rgba(0, 0, 0, 0)')
    return false
  return Boolean(String(prop || '').trim())
}

export interface ConvertCloneRegionsToTailwindSectionsInput {
  regions: CloneRegion[]
  compileTailwindRecipeArtifact?: (artifact: any) => Promise<any>
}

export interface ConvertCloneRegionsToTailwindSectionsResult {
  sections: Record<string, any>[]
  skipped: Array<{ id: string, label: string, reason: 'missing-source' | 'conversion-failed' }>
}

export async function convertCloneRegionsToTailwindSections(input: ConvertCloneRegionsToTailwindSectionsInput): Promise<ConvertCloneRegionsToTailwindSectionsResult> {
  const orderedRegions = [...(input.regions || [])].sort((a, b) => {
    const topDelta = (Number(a.top) || 0) - (Number(b.top) || 0)
    if (topDelta !== 0)
      return topDelta
    return (Number(a.left) || 0) - (Number(b.left) || 0)
  })
  const converted: Array<{ region: CloneRegion, section: Record<string, any> }> = []
  const skipped: ConvertCloneRegionsToTailwindSectionsResult['skipped'] = []

  for (const region of orderedRegions) {
    const hasSource = Boolean(region.html || region.tailwindRecipeArtifact)
    if (!hasSource) {
      skipped.push({ id: region.id, label: region.label || region.id, reason: 'missing-source' })
      continue
    }

    const section = await buildEditableSectionFromCloneRegion({
      html: region.html,
      tailwindRecipeArtifact: region.tailwindRecipeArtifact,
      compileTailwindRecipeArtifact: input.compileTailwindRecipeArtifact,
    })

    if (!section) {
      skipped.push({ id: region.id, label: region.label || region.id, reason: 'conversion-failed' })
      continue
    }

    converted.push({ region, section })
  }

  const sections = buildSectionsFromConvertedCloneRegions(converted)
  return { sections, skipped }
}

function buildSectionsFromConvertedCloneRegions(converted: Array<{ region: CloneRegion, section: Record<string, any> }>): Record<string, any>[] {
  const rows: Array<Array<{ region: CloneRegion, section: Record<string, any> }>> = []

  for (const item of converted) {
    const row = rows.find(existing => existing.some(candidate => regionsShareVisualRow(candidate.region, item.region)))
    if (row)
      row.push(item)
    else
      rows.push([item])
  }

  return rows.map((row, index) => {
    const orderedRow = [...row].sort((a, b) => regionLeft(a.region) - regionLeft(b.region))
    if (orderedRow.length > 1)
      return buildGroupedCloneRegionSection(orderedRow, index)

    const item = orderedRow[0]
    return {
      ...JSON.parse(JSON.stringify(item.section)),
      id: `tw-${safeIdPart(item.region.id || `region-${index + 1}`)}`,
      order: index,
      _clone_region_id: item.region.id,
      _tailwind_conversion: {
        source: 'clone-region',
        region_id: item.region.id,
        label: item.region.label || item.region.id,
      },
    }
  })
}

function regionsShareVisualRow(a: CloneRegion, b: CloneRegion): boolean {
  const aTop = regionTop(a)
  const bTop = regionTop(b)
  const aHeight = Math.max(1, Number(a.height) || 1)
  const bHeight = Math.max(1, Number(b.height) || 1)
  const verticalOverlap = Math.min(aTop + aHeight, bTop + bHeight) - Math.max(aTop, bTop)
  const verticalOverlapRatio = verticalOverlap / Math.min(aHeight, bHeight)
  const topDelta = Math.abs(aTop - bTop)

  const aLeft = regionLeft(a)
  const bLeft = regionLeft(b)
  const aWidth = Math.max(1, Number(a.width) || 1)
  const bWidth = Math.max(1, Number(b.width) || 1)
  const horizontalOverlap = Math.min(aLeft + aWidth, bLeft + bWidth) - Math.max(aLeft, bLeft)
  const horizontalOverlapRatio = Math.max(0, horizontalOverlap) / Math.min(aWidth, bWidth)

  return horizontalOverlapRatio < 0.35 && (verticalOverlapRatio >= 0.45 || topDelta <= Math.max(96, Math.min(aHeight, bHeight) * 0.35))
}

function regionLeft(region: CloneRegion): number {
  return Number.isFinite(Number(region.left)) ? Number(region.left) : Number(region.viewport_left) || 0
}

function regionTop(region: CloneRegion): number {
  return Number.isFinite(Number(region.top)) ? Number(region.top) : Number(region.viewport_top) || 0
}

function buildGroupedCloneRegionSection(row: Array<{ region: CloneRegion, section: Record<string, any> }>, order: number): Record<string, any> {
  const regionIds = row.map(item => item.region.id)
  const columns = row.map(item => {
    const html = renderPreviewSectionHtml(item.section, {
      regionId: item.region.id,
      html: item.region.html,
      tailwindRecipeArtifact: item.region.tailwindRecipeArtifact,
    }) || ''

    return `<div class="min-w-0">${html}</div>`
  }).join('')

  return {
    type: 'content-block',
    title: '',
    content_html: '',
    _generated_html: `<section class="w-full bg-white text-neutral-950"><div class="grid grid-cols-1 lg:grid-cols-${Math.min(row.length, 4)}">${columns}</div></section>`,
    animation: 'fade-in',
    id: `tw-${regionIds.map(safeIdPart).join('-')}`,
    order,
    _clone_region_ids: regionIds,
    _tailwind_conversion: {
      source: 'clone-region-group',
      region_ids: regionIds,
      labels: row.map(item => item.region.label || item.region.id),
    },
  }
}

function safeIdPart(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'region'
}

export interface BuildPreviewReplacementHtmlFromCloneRegionInput extends BuildEditableSectionFromCloneRegionInput {
  regionId?: string | null
}

export async function buildPreviewReplacementHtmlFromCloneRegion(input: BuildPreviewReplacementHtmlFromCloneRegionInput): Promise<string | null> {
  const section = await buildEditableSectionFromCloneRegion(input)
  if (!section)
    return null

  return renderPreviewSectionHtml(section, input)
}

function renderPreviewSectionHtml(section: Record<string, any>, input: BuildPreviewReplacementHtmlFromCloneRegionInput): string | null {
  const regionId = escapeText(input.regionId || section?._tailwind_recipe?.region_id || '')

  if (section.type === 'variant-color-explorer')
    return renderVariantColorExplorerPreviewHtml(section, regionId)

  const generatedHtml = typeof section._generated_html === 'string' ? section._generated_html.trim() : ''
  if (generatedHtml)
    return generatedHtml

  const contentHtml = typeof section.content_html === 'string' ? section.content_html.trim() : ''
  if (contentHtml)
    return `<section${regionId ? ` data-oem-region-id="${regionId}"` : ''} class="px-5 py-14 md:px-10 md:py-20">${contentHtml}</section>`

  const fallbackHtml = typeof input.html === 'string' ? input.html.trim() : ''
  return fallbackHtml || null
}

function renderVariantColorExplorerPreviewHtml(section: Record<string, any>, regionId: string): string {
  const variants = Array.isArray(section.variants) ? section.variants : []
  const selectedVariant = variants[0] || {}
  const colors = Array.isArray(selectedVariant.colors) ? selectedVariant.colors : []
  const selectedColor = colors[0] || {}
  const selectedImage = selectedColor.hero_image_url || selectedVariant.image_url || section.fallback_image_url || ''
  const selectedColorName = selectedColor.name || ''
  const ctaText = selectedVariant.cta_text || section.cta_text || 'Build your own'
  const ctaUrl = selectedVariant.cta_url || section.cta_url || '#'
  const features = Array.isArray(selectedVariant.key_features) ? selectedVariant.key_features : []

  const variantButtons = variants.map((variant: any, index: number) => `
          <button type="button" class="relative whitespace-nowrap pb-4 text-base ${index === 0 ? 'font-black' : 'font-medium'} text-neutral-950 transition-colors md:text-lg">
            ${escapeText(variant.title || `Variant ${index + 1}`)}
            ${index === 0 ? '<span class="absolute bottom-0 left-0 h-[3px] w-7 bg-red-600"></span>' : ''}
          </button>`).join('')

  const featureItems = features.map((feature: unknown) => `
                <li class="border-l-2 border-red-600 pl-3">${escapeText(feature)}</li>`).join('')

  const swatches = colors.map((color: any, index: number) => {
    const swatchUrl = typeof color.swatch_url === 'string' ? color.swatch_url : ''
    const swatchStyle = !swatchUrl && color.hex ? ` style="background-color: ${escapeText(color.hex)}"` : ''
    return `
                <button type="button" class="grid place-items-center" title="${escapeText(color.name || '')}">
                  <span class="block size-14 rounded-full border border-white shadow-[0_4px_12px_rgba(0,0,0,0.28)] ring-offset-4 transition ${index === 0 ? 'ring-2 ring-neutral-300' : 'ring-0'}">
                    ${swatchUrl
                      ? `<img src="${escapeText(swatchUrl)}" alt="${escapeText(color.name || '')}" class="size-full rounded-full object-cover">`
                      : `<span class="block size-full rounded-full bg-neutral-200"${swatchStyle}></span>`}
                  </span>
                </button>`
  }).join('')

  return `<section${regionId ? ` data-oem-region-id="${regionId}"` : ''} class="bg-white px-5 py-14 text-neutral-950 md:px-10 md:py-20">
    <div class="mx-auto max-w-7xl">
      <div class="text-center">
        ${section.eyebrow ? `<p class="text-[0.7rem] font-bold uppercase tracking-[0.34em] text-neutral-500">${escapeText(section.eyebrow)}</p>` : ''}
        <h2 class="mt-5 text-3xl font-black leading-tight md:text-5xl">${escapeText(section.heading || 'Make Your Mark.')}</h2>
      </div>

      <div class="mt-10 md:mt-14">
        ${variants.length
          ? `<div class="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <div class="mx-auto flex w-max min-w-full items-center justify-start gap-8 md:justify-center">
            ${variantButtons}
          </div>
        </div>`
          : ''}

        <div class="mt-12 grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:items-start">
          <div class="order-2 lg:order-1">
            <h3 class="text-4xl font-black leading-none md:text-5xl">${escapeText(selectedVariant.title || '')}</h3>
            ${selectedVariant.description ? `<p class="mt-8 max-w-md text-lg leading-8 text-neutral-900">${escapeText(selectedVariant.description)}</p>` : ''}
            ${selectedVariant.price_label ? `<p class="mt-5 text-sm font-bold text-neutral-600">${escapeText(selectedVariant.price_label)}</p>` : ''}

            <div class="mt-10 border-y border-neutral-300">
              <div class="flex w-full items-center justify-between py-5 text-left text-xl font-black">Key Features</div>
              ${featureItems ? `<ul class="grid gap-3 pb-6 text-sm leading-6 text-neutral-700 md:grid-cols-2">${featureItems}</ul>` : ''}
            </div>

            <a href="${escapeText(ctaUrl)}" class="mt-10 inline-flex min-h-14 items-center justify-center bg-red-600 px-7 text-base font-black text-white transition-colors hover:bg-red-700">${escapeText(ctaText)}</a>
          </div>

          <div class="order-1 lg:order-2">
            <div class="flex min-h-[260px] items-center justify-center md:min-h-[430px]">
              ${selectedImage
                ? `<img src="${escapeText(selectedImage)}" alt="${escapeText([selectedVariant.title, selectedColorName].filter(Boolean).join(' '))}" class="max-h-[260px] w-full object-contain md:max-h-[430px]">`
                : '<div class="flex aspect-[16/9] w-full items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-500">Vehicle image unavailable</div>'}
            </div>

            ${colors.length ? `<div class="mt-8 text-center">
              <p class="text-base font-black">${escapeText(selectedColorName)}</p>
              <div class="mt-7 flex flex-wrap justify-center gap-x-10 gap-y-8">${swatches}</div>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>`
}
