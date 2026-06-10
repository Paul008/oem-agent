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
type TailwindTemplateKind = 'hero' | 'offer-card' | 'feature-grid' | 'feature-card' | 'image-media' | 'content-block' | 'variant-color-explorer' | 'unknown'

interface CapturedTailwindStats {
  computed_snapshots: number
  computed_declarations: number
  mapped_declarations: number
  leftover_declarations: number
  unmatched_rules: number
  leftover_rules: number
  important_count: number
  calc_count: number
  unresolved_var_count: number
  variant_declarations: number
  unsupported_declaration_samples: string[]
}

const TAILWIND_UNSUPPORTED_DECLARATION_SAMPLE_LIMIT = 12
const TAILWIND_NUMERIC_STAT_KEYS = [
  'computed_snapshots',
  'computed_declarations',
  'mapped_declarations',
  'leftover_declarations',
  'unmatched_rules',
  'leftover_rules',
  'important_count',
  'calc_count',
  'unresolved_var_count',
  'variant_declarations',
] as const satisfies Array<Exclude<keyof CapturedTailwindStats, 'unsupported_declaration_samples'>>

interface CapturedTailwindCompilation {
  html: string
  leftoverCss: string
  source: 'known-oem-pattern' | 'captured-region-css' | 'captured-computed-style' | 'raw-html'
  pattern?: string
  templateKind: TailwindTemplateKind
  confidence: number
  parityRisks: string[]
  extractedSchema?: Record<string, unknown>
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
      template_kind: compiled.templateKind,
      confidence: compiled.confidence,
      parity_risks: compiled.parityRisks,
      ...(compiled.extractedSchema ? { extracted_schema: compiled.extractedSchema } : {}),
      ...(compiled.pattern ? { pattern: compiled.pattern } : {}),
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
  const knownPattern = compileKnownOemRegionToTailwind(styleExtraction.html, options, mode)
  if (knownPattern)
    return knownPattern

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
      templateKind: inferTailwindTemplateKind(cssResult.html, options.tailwindRecipeArtifact),
      confidence: tailwindCompilationConfidence(stats, true),
      parityRisks: tailwindCompilationRisks(stats, true),
      extractedSchema: extractTailwindTemplateSchema(cssResult.html, options.tailwindRecipeArtifact),
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
      templateKind: inferTailwindTemplateKind(cssResult.html, options.tailwindRecipeArtifact),
      confidence: tailwindCompilationConfidence(cssResult.stats, false),
      parityRisks: tailwindCompilationRisks(cssResult.stats, false),
      extractedSchema: extractTailwindTemplateSchema(cssResult.html, options.tailwindRecipeArtifact),
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
    templateKind: inferTailwindTemplateKind(styleExtraction.html, options.tailwindRecipeArtifact),
    confidence: 0,
    parityRisks: ['No captured CSS or computed-style artifact was available.'],
    extractedSchema: extractTailwindTemplateSchema(styleExtraction.html, options.tailwindRecipeArtifact),
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

function compileKnownOemRegionToTailwind(html: string, options: BuildRawHtmlSectionFromCloneRegionOptions, mode: TailwindConversionMode): CapturedTailwindCompilation | null {
  const mitsubishi = compileKnownMitsubishiRegionToTailwind(html, options, mode)
  if (mitsubishi)
    return mitsubishi

  return null
}

function compileKnownMitsubishiRegionToTailwind(html: string, options: BuildRawHtmlSectionFromCloneRegionOptions, mode: TailwindConversionMode): CapturedTailwindCompilation | null {
  const sectionTag = firstOpeningTag(html, 'section')
  if (!readHtmlClassAttribute(sectionTag).split(/\s+/).includes('contentblock'))
    return null

  const sectionText = htmlToKnownPatternText(html)
  if (/You Can Count On Us/i.test(sectionText))
    return compileMitsubishiDiamondAdvantageModule(html, options, mode)

  const sectionClasses = readHtmlClassAttribute(sectionTag).split(/\s+/)
  if (sectionClasses.includes('bg-black') && firstOpeningTag(html, 'img') && knownPatternParagraphs(html).length)
    return compileMitsubishiHomeOfferModule(html, options, mode)

  return null
}

function compileMitsubishiHomeOfferModule(sourceHtml: string, options: BuildRawHtmlSectionFromCloneRegionOptions, mode: TailwindConversionMode): CapturedTailwindCompilation | null {
  const imageTag = firstOpeningTag(sourceHtml, 'img')
  const image = absoluteKnownPatternUrl(readHtmlAttributeValue(imageTag, 'src'), options.tailwindRecipeArtifact)
  const imageAlt = normalizeKnownPatternText(readHtmlAttributeValue(imageTag, 'alt'))
  const title = knownPatternFirstHeading(sourceHtml)
  const paragraphs = knownPatternParagraphs(sourceHtml)
  const ctaHtml = knownPatternFirstAnchor(sourceHtml)
  const ctaText = knownPatternLinkText(ctaHtml) || 'View offer'
  const ctaHref = hrefForKnownMitsubishiOffer(readHtmlAttributeValue(firstOpeningTag(ctaHtml, 'a'), 'href'), options.tailwindRecipeArtifact)

  if (!image || !paragraphs.length)
    return null

  const html = `<section class="w-full bg-[#050505] px-5 py-12 text-white md:px-10 md:py-20">
  <div class="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 bg-[#050505] text-white lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)] lg:gap-16">
    <div class="aspect-square overflow-hidden bg-[#111111]">
      <img src="${escapeText(image)}" alt="${escapeText(imageAlt || title || ctaText)}" class="h-full w-full object-cover">
    </div>
    <div class="max-w-xl">
      ${title ? `<h2 class="m-0 text-4xl font-black leading-tight tracking-normal text-white md:text-5xl">${escapeText(title)}</h2>` : ''}
      <div class="${title ? 'mt-6' : ''} space-y-5 text-base leading-7 text-white md:text-xl md:leading-8">
        ${paragraphs.map((paragraph: string) => `<p>${escapeText(paragraph)}</p>`).join('')}
      </div>
      <a href="${escapeText(ctaHref)}" class="mt-8 inline-flex min-h-14 items-center justify-center border border-white px-6 text-base font-black text-white transition-colors hover:border-[#ed0000] hover:bg-[#ed0000]">${escapeText(ctaText)}</a>
    </div>
  </div>
</section>`

  return knownPatternCompilation(html, 'mitsubishi-home-offer', mode)
}

function compileMitsubishiDiamondAdvantageModule(sourceHtml: string, options: BuildRawHtmlSectionFromCloneRegionOptions, mode: TailwindConversionMode): CapturedTailwindCompilation | null {
  const imageTag = firstOpeningTag(sourceHtml, 'img')
  const image = absoluteKnownPatternUrl(readHtmlAttributeValue(imageTag, 'src'), options.tailwindRecipeArtifact)
  const imageAlt = normalizeKnownPatternText(readHtmlAttributeValue(imageTag, 'alt'))
  const title = knownPatternFirstHeading(sourceHtml)
  const paragraphs = knownPatternParagraphs(sourceHtml)
  const features = knownPatternListItems(sourceHtml)
  const ctaHtml = knownPatternFirstAnchor(sourceHtml)
  const ctaText = knownPatternLinkText(ctaHtml) || 'Learn more'
  const ctaHref = absoluteKnownPatternUrl(readHtmlAttributeValue(firstOpeningTag(ctaHtml, 'a'), 'href'), options.tailwindRecipeArtifact)

  if (!image || !title || !paragraphs.length)
    return null

  const html = `<section class="w-full bg-[#f3f4f4] px-5 py-12 text-neutral-950 md:px-10 md:py-20">
  <div class="mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(280px,0.92fr)_minmax(0,1.08fr)] lg:gap-16">
    <div class="aspect-square overflow-hidden bg-white">
      <img src="${escapeText(image)}" alt="${escapeText(imageAlt || title)}" class="h-full w-full object-cover">
    </div>
    <div>
      <p class="mb-2 text-sm font-black uppercase tracking-[0.08em] text-[#ed0000]">${escapeText('Australia\'s first')}</p>
      <h2 class="m-0 text-4xl font-black leading-tight tracking-normal text-neutral-950 md:text-5xl">${escapeText(title)}</h2>
      <div class="mt-6 space-y-5 text-base leading-7 text-neutral-950 md:text-xl md:leading-8">
        ${paragraphs.map((paragraph: string) => `<p>${escapeText(paragraph)}</p>`).join('')}
      </div>
      ${features.length ? `<ul class="mt-6 grid list-none gap-2 p-0">${features.map((feature: string) => `<li class="relative pl-6 font-bold before:absolute before:left-0 before:top-[0.55em] before:size-2 before:bg-[#ed0000]">${escapeText(feature)}</li>`).join('')}</ul>` : ''}
      <a href="${escapeText(ctaHref)}" class="mt-8 inline-flex min-h-14 items-center justify-center border border-neutral-950 px-6 text-base font-black text-neutral-950 transition-colors hover:border-[#ed0000] hover:bg-[#ed0000] hover:text-white">${escapeText(ctaText)}</a>
    </div>
  </div>
</section>`

  return knownPatternCompilation(html, 'mitsubishi-diamond-advantage', mode)
}

function knownPatternCompilation(html: string, pattern: string, mode: TailwindConversionMode): CapturedTailwindCompilation {
  const templateKind: TailwindTemplateKind = pattern === 'mitsubishi-home-offer'
    ? 'offer-card'
    : pattern === 'mitsubishi-diamond-advantage'
      ? 'feature-card'
      : 'content-block'

  return {
    html: html.trim(),
    leftoverCss: '',
    source: 'known-oem-pattern',
    pattern,
    templateKind,
    confidence: 0.98,
    parityRisks: [],
    extractedSchema: extractTailwindTemplateSchema(html, null),
    supportedDeclarations: 0,
    leftoverRules: 0,
    mode,
    stats: createTailwindStats(),
  }
}

function firstOpeningTag(html: string, tagName: string): string {
  const match = String(html || '').match(new RegExp(`<${escapeRegExp(tagName)}(?:\\s[^<>]*?)?/?>`, 'i'))
  return match?.[0] || ''
}

function knownPatternFirstHeading(html: string): string {
  const match = String(html || '').match(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/i)
  return htmlToKnownPatternText(match?.[1] || '')
}

function knownPatternParagraphs(html: string): string[] {
  return Array.from(String(html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi))
    .map(match => htmlToKnownPatternText(match[1] || ''))
    .filter(Boolean)
}

function knownPatternListItems(html: string): string[] {
  return Array.from(String(html || '').matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi))
    .map(match => htmlToKnownPatternText(match[1] || ''))
    .filter(Boolean)
}

function knownPatternFirstAnchor(html: string): string {
  const linkClassMatch = String(html || '').match(/<a\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\blink\b[^"']*\1)[^>]*>[\s\S]*?<\/a>/i)
  if (linkClassMatch)
    return linkClassMatch[0]

  return String(html || '').match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] || ''
}

function knownPatternLinkText(anchorHtml: string): string {
  const linkTextMatch = String(anchorHtml || '').match(/<[^>]*\bclass\s*=\s*(["'])[^"']*\blink-text\b[^"']*\1[^>]*>([\s\S]*?)<\/[^>]+>/i)
  return htmlToKnownPatternText(linkTextMatch?.[2] || anchorHtml)
}

function htmlToKnownPatternText(html: string): string {
  return normalizeKnownPatternText(
    String(html || '')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' '),
  )
}

function normalizeKnownPatternText(value: unknown): string {
  return decodeHtmlTextEntities(String(value || ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeHtmlTextEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    cent: '¢',
    copy: '©',
    gt: '>',
    hellip: '…',
    laquo: '«',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '”',
    reg: '®',
    rsquo: '’',
    trade: '™',
  }

  return String(value || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, entity) => {
    const raw = String(entity || '')
    if (raw.startsWith('#x')) {
      const code = Number.parseInt(raw.slice(2), 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    if (raw.startsWith('#')) {
      const code = Number.parseInt(raw.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return named[raw.toLowerCase()] ?? match
  })
}

function absoluteKnownPatternUrl(path: unknown, artifact: any): string {
  const value = String(path || '').trim()
  if (!value)
    return ''
  if (/^data:/i.test(value))
    return value
  const sourceUrl = typeof artifact?.source_url === 'string' ? artifact.source_url : 'https://www.mitsubishi-motors.com.au/'
  try {
    return new URL(value, sourceUrl).toString()
  }
  catch {
    return value
  }
}

function hrefForKnownMitsubishiOffer(path: unknown, artifact: any): string {
  const value = String(path || '').trim()
  if (!value)
    return '/special-offers'
  const absolute = absoluteKnownPatternUrl(value, artifact)
  try {
    const url = new URL(absolute)
    if (/^\/offers\/?/i.test(url.pathname))
      return '/special-offers'
    return url.toString()
  }
  catch {
    return '/special-offers'
  }
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
        recordUnsupportedDeclaration(stats, declaration.prop, declaration.value)
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

function appendInlineStyleToOpeningTag(tag: string, declarations: string): string {
  const existing = readHtmlAttributeValue(tag, 'style')
  const next = [existing?.trim().replace(/;$/, ''), declarations.trim().replace(/;$/, '')]
    .filter(Boolean)
    .join('; ')
  if (!next)
    return tag

  const escaped = escapeHtmlAttributeValue(next)
  if (/\sstyle\s*=/.test(tag))
    return tag.replace(/\sstyle\s*=\s*(["'])(.*?)\1/i, ` style="${escaped}"`)

  return tag.replace(/\/?>$/, match => ` style="${escaped}"${match}`)
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

function escapeHtmlAttributeValue(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
}

function compileComputedStyleArtifactIntoHtml(html: string, artifact: any, mode: TailwindConversionMode): { html: string, stats: CapturedTailwindStats } {
  const snapshots = computedSnapshotsForArtifact(artifact)
  if (!snapshots.length)
    return { html, stats: createTailwindStats() }

  const snapshotNodes = snapshots.map(snapshot => flattenTailwindRecipeNodes(snapshot.root))
  const responsiveNodesByPath = snapshotNodes.map(nodes => new Map(nodes.map(node => [String(node?.path || ''), node])))
  let index = 0
  const stats = createTailwindStats()
  stats.computed_snapshots = snapshots.length
  const nextHtml = html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag, tagName) => {
    const node = snapshotNodes[0]?.[index]
    index += 1
    if (!node || String(node.tag || '').toLowerCase() !== String(tagName || '').toLowerCase())
      return tag

    const classes: string[] = []
    classes.push(...computedStyleToTailwindClasses(node.computed_style, mode, stats).classes)

    let previousStyle = node.computed_style || {}
    for (let snapshotIndex = 1; snapshotIndex < snapshotNodes.length; snapshotIndex++) {
      const responsiveNode = responsiveNodesByPath[snapshotIndex]?.get(String(node.path || ''))
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

function inlineComputedStyleArtifactIntoHtml(html: string, artifact: any): string {
  const snapshot = computedSnapshotsForArtifact(artifact)[0]
  if (!snapshot?.root)
    return html

  const nodes = flattenTailwindRecipeNodes(snapshot.root)
  let index = 0
  return html.replace(/<([a-z][a-z0-9-]*)(\s[^<>]*?)?>/gi, (tag, tagName) => {
    const node = nodes[index]
    index += 1
    if (!node || String(node.tag || '').toLowerCase() !== String(tagName || '').toLowerCase())
      return tag

    const declarations = computedStyleToInlineDeclarations(node.computed_style)
    return declarations ? appendInlineStyleToOpeningTag(tag, declarations) : tag
  })
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
      recordUnsupportedDeclaration(stats, prop, value)
      continue
    }

    classes.push(...mapped)
    stats.mapped_declarations += 1
  }

  return { classes: uniqueClassList(classes) }
}

function computedStyleToInlineDeclarations(style: Record<string, unknown> | null | undefined): string {
  if (!style || typeof style !== 'object')
    return ''

  return Object.entries(style)
    .map(([prop, rawValue]) => {
      const name = String(prop || '').trim()
      const value = String(rawValue ?? '').trim()
      return name && value ? `${name}: ${value}` : ''
    })
    .filter(Boolean)
    .join('; ')
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
  if (!parts.length || parts.length > 4)
    return []

  const spacingClass = (prefix: string, part: string): string => {
    const numeric = parseFloat(part)
    if (Number.isNaN(numeric) || numeric < 0 || !/px$/i.test(part))
      return ''
    return `${prefix}-${tailwindRules().pxToSp(numeric)}`
  }

  const prefix = prop === 'padding' ? 'p' : 'm'
  if (parts.length === 1)
    return [spacingClass(prefix, parts[0])].filter(Boolean)

  const [top, right = top, bottom = top, left = right] = parts
  if ([top, right, bottom, left].some(part => !spacingClass(prefix, part)))
    return []

  const classes: string[] = []
  const add = (classPrefix: string, part: string) => {
    if (parseFloat(part) !== 0)
      classes.push(spacingClass(classPrefix, part))
  }

  if (top === bottom && right === left) {
    add(`${prefix}y`, top)
    add(`${prefix}x`, right)
  }
  else if (right === left) {
    add(`${prefix}t`, top)
    add(`${prefix}x`, right)
    add(`${prefix}b`, bottom)
  }
  else if (top === bottom) {
    add(`${prefix}y`, top)
    add(`${prefix}r`, right)
    add(`${prefix}l`, left)
  }
  else {
    add(`${prefix}t`, top)
    add(`${prefix}r`, right)
    add(`${prefix}b`, bottom)
    add(`${prefix}l`, left)
  }

  return classes
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
    computed_snapshots: 0,
    computed_declarations: 0,
    mapped_declarations: 0,
    leftover_declarations: 0,
    unmatched_rules: 0,
    leftover_rules: 0,
    important_count: 0,
    calc_count: 0,
    unresolved_var_count: 0,
    variant_declarations: 0,
    unsupported_declaration_samples: [],
  }
}

function tailwindCompilationConfidence(stats: CapturedTailwindStats, hasComputedStyles: boolean): number {
  const countedDeclarations = stats.computed_declarations || (stats.mapped_declarations + stats.leftover_declarations)
  const coverage = countedDeclarations > 0 ? stats.mapped_declarations / countedDeclarations : 0
  const riskPenalty = Math.min(0.32, (stats.leftover_rules * 0.04) + (stats.unmatched_rules * 0.015) + (stats.leftover_declarations * 0.025))
  const signalBonus = hasComputedStyles ? 0.1 : 0
  return Math.max(0, Math.min(0.96, Number((coverage + signalBonus - riskPenalty).toFixed(2))))
}

function tailwindCompilationRisks(stats: CapturedTailwindStats, hasComputedStyles: boolean): string[] {
  const risks: string[] = []
  if (!hasComputedStyles)
    risks.push('No browser-computed style snapshot; static CSS selector conversion may miss cascade details.')
  if (stats.leftover_declarations)
    risks.push(`${stats.leftover_declarations} declarations could not be mapped to Tailwind utilities.`)
  if (stats.leftover_rules)
    risks.push(`${stats.leftover_rules} CSS rules remain in leftover CSS.`)
  if (stats.unmatched_rules)
    risks.push(`${stats.unmatched_rules} CSS rules matched no elements in the captured region.`)
  if (stats.unresolved_var_count)
    risks.push(`${stats.unresolved_var_count} var() references need token or literal verification.`)
  if (stats.calc_count)
    risks.push(`${stats.calc_count} calc() values need visual parity review.`)
  if (stats.important_count)
    risks.push(`${stats.important_count} !important declarations were encountered.`)
  return risks
}

function inferTailwindTemplateKind(html: string, artifact: any): TailwindTemplateKind {
  const text = htmlToKnownPatternText(html).toLowerCase()
  const classSignal = String(artifact?.root?.attributes?.class || '').toLowerCase()
  const signal = `${text} ${classSignal}`
  const imageCount = (String(html || '').match(/<img\b/gi) || []).length
  const headingCount = (String(html || '').match(/<h[1-6]\b/gi) || []).length
  const ctaCount = (String(html || '').match(/<(a|button)\b/gi) || []).length
  const cardCount = (String(html || '').match(/<(article|li)\b/gi) || []).length

  if (/make your mark|colour|color|swatch|range selector|variant/.test(signal))
    return 'variant-color-explorer'
  if (/offer|special|finance|drive away|build your own|enquire|view offer/.test(signal) && imageCount)
    return 'offer-card'
  if (cardCount >= 3)
    return 'feature-grid'
  if (headingCount && imageCount && ctaCount)
    return 'hero'
  if (headingCount && (/warranty|advantage|features|safety|performance/.test(signal) || cardCount))
    return 'feature-card'
  if (imageCount && !headingCount)
    return 'image-media'
  if (headingCount || text)
    return 'content-block'
  return 'unknown'
}

function extractTailwindTemplateSchema(html: string, artifact: any): Record<string, unknown> {
  const heading = knownPatternFirstHeading(html)
  const imageTag = firstOpeningTag(html, 'img')
  const ctaHtml = knownPatternFirstAnchor(html)
  const paragraphs = knownPatternParagraphs(html).slice(0, 4)
  const schema: Record<string, unknown> = {
    heading: heading || '',
    paragraphs,
    image_url: readHtmlAttributeValue(imageTag, 'src') || '',
    cta_text: knownPatternLinkText(ctaHtml) || '',
    cta_url: readHtmlAttributeValue(firstOpeningTag(ctaHtml, 'a'), 'href') || '',
  }

  if (artifact?.source_url)
    schema.source_url = artifact.source_url
  if (artifact?.region_id)
    schema.region_id = artifact.region_id

  return Object.fromEntries(Object.entries(schema).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)))
}

function mergeTailwindStats(...statsList: CapturedTailwindStats[]): CapturedTailwindStats {
  const merged = createTailwindStats()
  for (const stats of statsList) {
    for (const key of TAILWIND_NUMERIC_STAT_KEYS)
      merged[key] += stats[key] || 0
    for (const sample of stats.unsupported_declaration_samples || []) {
      if (merged.unsupported_declaration_samples.length >= TAILWIND_UNSUPPORTED_DECLARATION_SAMPLE_LIMIT)
        break
      if (!merged.unsupported_declaration_samples.includes(sample))
        merged.unsupported_declaration_samples.push(sample)
    }
  }
  return merged
}

function recordUnsupportedDeclaration(stats: CapturedTailwindStats, prop: string, value: string) {
  if (stats.unsupported_declaration_samples.length >= TAILWIND_UNSUPPORTED_DECLARATION_SAMPLE_LIMIT)
    return

  const sample = `${String(prop || '').trim()}: ${String(value || '').trim()}`
  if (sample === ': ' || stats.unsupported_declaration_samples.includes(sample))
    return

  stats.unsupported_declaration_samples.push(sample)
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
  const normalizedProp = String(prop || '').trim().toLowerCase()
  const normalizedValue = String(value || '').trim()
  if (!normalizedValue || normalizedValue === 'none' || normalizedValue === 'normal' || normalizedValue === 'auto' || normalizedValue === '0px' || normalizedValue === 'rgba(0, 0, 0, 0)')
    return false
  if (!normalizedProp)
    return false
  if (normalizedProp === 'opacity' && normalizedValue === '1')
    return false
  if (normalizedProp === 'overflow' && normalizedValue === 'visible')
    return false
  if (normalizedProp === 'background-position' && (normalizedValue === '0% 0%' || normalizedValue === '0px 0px'))
    return false
  if (normalizedProp === 'object-position' && normalizedValue === '50% 50%')
    return false
  if (normalizedProp === 'object-fit' && normalizedValue === 'fill')
    return false
  if (normalizedProp === 'visibility' && normalizedValue === 'visible')
    return false
  if (normalizedProp === 'position' && normalizedValue === 'static')
    return false
  if (normalizedProp === 'border-color' && normalizedValue === 'rgb(0, 0, 0)')
    return false
  if (/^border(?:-(?:top|right|bottom|left))?$/.test(normalizedProp) && /^0(?:px)?\s+none\b/i.test(normalizedValue))
    return false
  if (/^border-(?:top|right|bottom|left)-width$/.test(normalizedProp) && normalizedValue === '0px')
    return false
  if (/^border-(?:top|right|bottom|left)-style$/.test(normalizedProp) && normalizedValue === 'none')
    return false
  return true
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
      _tailwind_original_html: originalHtmlForCloneRegion(item.region),
      _tailwind_conversion: buildCloneRegionConversionMetadata(item),
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
  const leftoverCss = row
    .map(item => typeof item.section._tailwind_leftover_css === 'string' ? item.section._tailwind_leftover_css.trim() : '')
    .filter(Boolean)
    .join('\n')
  const columns = row.map(item => {
    const html = renderPreviewSectionHtml(item.section, {
      regionId: item.region.id,
      html: item.region.html,
      tailwindRecipeArtifact: item.region.tailwindRecipeArtifact,
    }) || ''

    return `<div class="min-w-0">${html}</div>`
  }).join('')
  const originalColumns = row.map((item) => {
    const html = originalHtmlForCloneRegion(item.region)
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
    _tailwind_original_html: `<section class="w-full bg-white text-neutral-950"><div class="grid grid-cols-1 lg:grid-cols-${Math.min(row.length, 4)}">${originalColumns}</div></section>`,
    ...(leftoverCss ? { _tailwind_leftover_css: leftoverCss } : {}),
    _tailwind_conversion: buildCloneRegionGroupConversionMetadata(row),
  }
}

function originalHtmlForCloneRegion(region: CloneRegion): string {
  const html = typeof region.html === 'string' ? region.html.trim() : ''
  if (!html)
    return ''

  return inlineComputedStyleArtifactIntoHtml(html, region.tailwindRecipeArtifact)
}

function buildCloneRegionConversionMetadata(item: { region: CloneRegion, section: Record<string, any> }): Record<string, any> {
  const compiled = item.section._tailwind_conversion && typeof item.section._tailwind_conversion === 'object'
    ? item.section._tailwind_conversion
    : {}

  return {
    source: 'clone-region',
    region_id: item.region.id,
    label: item.region.label || item.region.id,
    ...(compiled.source ? { compiled_source: compiled.source } : {}),
    ...(compiled.mode ? { mode: compiled.mode } : {}),
    ...(compiled.template_kind ? { template_kind: compiled.template_kind } : {}),
    ...(Number.isFinite(Number(compiled.confidence)) ? { confidence: Number(compiled.confidence) } : {}),
    ...(Array.isArray(compiled.parity_risks) ? { parity_risks: compiled.parity_risks } : {}),
    ...(compiled.extracted_schema && typeof compiled.extracted_schema === 'object' ? { extracted_schema: compiled.extracted_schema } : {}),
    ...(Number.isFinite(Number(compiled.supported_declarations)) ? { supported_declarations: Number(compiled.supported_declarations) } : {}),
    ...(Number.isFinite(Number(compiled.leftover_rules)) ? { leftover_rules: Number(compiled.leftover_rules) } : {}),
    ...(compiled.stats && typeof compiled.stats === 'object' ? { stats: compiled.stats } : {}),
  }
}

function buildCloneRegionGroupConversionMetadata(row: Array<{ region: CloneRegion, section: Record<string, any> }>): Record<string, any> {
  const stats = mergeTailwindStats(...row.map(item => readTailwindStats(item.section._tailwind_conversion?.stats)))
  const supportedDeclarations = row.reduce((total, item) => total + (Number(item.section._tailwind_conversion?.supported_declarations) || 0), 0)
  const leftoverRules = row.reduce((total, item) => total + (Number(item.section._tailwind_conversion?.leftover_rules) || 0), 0)
  const confidences = row.map(item => Number(item.section._tailwind_conversion?.confidence)).filter(value => Number.isFinite(value))
  const parityRisks = uniqueClassList(row.flatMap(item => Array.isArray(item.section._tailwind_conversion?.parity_risks) ? item.section._tailwind_conversion.parity_risks : []))
  const templateKinds = uniqueClassList(row.map(item => String(item.section._tailwind_conversion?.template_kind || '')).filter(Boolean))

  return {
    source: 'clone-region-group',
    region_ids: row.map(item => item.region.id),
    labels: row.map(item => item.region.label || item.region.id),
    compiled_sources: uniqueClassList(row.map(item => String(item.section._tailwind_conversion?.source || '')).filter(Boolean)),
    ...(templateKinds.length === 1 ? { template_kind: templateKinds[0] } : templateKinds.length > 1 ? { template_kind: 'content-block', template_kinds: templateKinds } : {}),
    ...(confidences.length ? { confidence: Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(2)) } : {}),
    ...(parityRisks.length ? { parity_risks: parityRisks } : {}),
    ...(supportedDeclarations ? { supported_declarations: supportedDeclarations } : {}),
    ...(leftoverRules ? { leftover_rules: leftoverRules } : {}),
    stats,
  }
}

function readTailwindStats(value: unknown): CapturedTailwindStats {
  const stats = createTailwindStats()
  if (!value || typeof value !== 'object')
    return stats

  for (const key of TAILWIND_NUMERIC_STAT_KEYS)
    stats[key] = Number((value as Record<string, unknown>)[key]) || 0
  const samples = (value as Record<string, unknown>).unsupported_declaration_samples
  if (Array.isArray(samples)) {
    stats.unsupported_declaration_samples = uniqueClassList(samples.map(sample => String(sample || '').trim()).filter(Boolean))
      .slice(0, TAILWIND_UNSUPPORTED_DECLARATION_SAMPLE_LIMIT)
  }

  return stats
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
