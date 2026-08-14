import { z } from 'zod'

export const ADAPTIVE_MATCH_KINDS = ['static', 'carousel', 'gallery-lightbox', 'tabs', 'accordion', 'unknown'] as const
export type AdaptiveMatchKind = typeof ADAPTIVE_MATCH_KINDS[number]
export type SupportedAdaptiveMatchKind = Exclude<AdaptiveMatchKind, 'unknown'>
export type AdaptiveViewportName = 'desktop' | 'tablet' | 'mobile'

const executablePattern = /<\s*(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript\s*:/i
const unsafeRichTextPattern = /<\s*(?:style|link|meta|base|form|input|button|textarea|select|option|svg|math|video|audio|source|track|canvas)\b|\s(?:style|srcdoc|formaction)\s*=|(?:href|src)\s*=\s*(?:["']\s*)?(?:data|blob|file):/i
const unsafeCssPattern = /<\s*\/\s*style|javascript\s*:|@import\b|expression\s*\(/i
const safeText = (maximum = 4_000) => z.string().max(maximum).refine(value => !executablePattern.test(value), 'Executable content is not allowed')
const safeRichText = safeText(40_000).refine(value => !unsafeRichTextPattern.test(value), 'Unsafe rich text is not allowed')
const safeCss = z.string().max(80_000).refine(value => !unsafeCssPattern.test(value), 'Unsafe CSS is not allowed')
const safeAssetUrl = z.string().min(1).max(4_000).refine((value) => {
  if (executablePattern.test(value) || /^(?:data|blob):/i.test(value))
    return false
  if (value.startsWith('/'))
    return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  }
  catch {
    return false
  }
}, 'Unsafe asset URL')

const layoutTokensSchema = z.object({
  maxWidthPx: z.number().int().min(240).max(2_400).optional(),
  desktopColumns: z.number().int().min(1).max(8).optional(),
  tabletColumns: z.number().int().min(1).max(6).optional(),
  mobileColumns: z.number().int().min(1).max(2).optional(),
  gapPx: z.number().int().min(0).max(128).optional(),
  paddingBlockPx: z.number().int().min(0).max(240).optional(),
  paddingInlinePx: z.number().int().min(0).max(240).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
}).strict()

const cssColorSchema = z.string().max(64).refine(value => /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|currentColor)$/i.test(value), 'Unsupported colour')
const appearanceTokensSchema = z.object({
  backgroundColor: cssColorSchema.optional(),
  textColor: cssColorSchema.optional(),
  accentColor: cssColorSchema.optional(),
  borderColor: cssColorSchema.optional(),
  borderRadiusPx: z.number().int().min(0).max(80).optional(),
  headingSizePx: z.number().int().min(12).max(96).optional(),
  bodySizePx: z.number().int().min(10).max(40).optional(),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
  imageFit: z.enum(['contain', 'cover', 'fill']).optional(),
  imageAspectRatio: z.enum(['auto', '1/1', '4/3', '3/2', '16/9']).optional(),
  shadow: z.boolean().optional(),
}).strict()

const imageSchema = z.object({
  url: safeAssetUrl,
  alt: safeText(500).default(''),
  caption: safeText(2_000).default(''),
  description: safeText(4_000).default(''),
}).strict()

const contentBlockSectionSchema = z.object({
  type: z.literal('content-block'),
  title: safeText(2_000).default(''),
  contentHtml: safeRichText.default(''),
  generatedHtml: safeRichText.min(1),
  generatedCss: safeCss.default(''),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict()

const gallerySectionSchema = z.object({
  type: z.literal('gallery'),
  title: safeText(2_000).default(''),
  description: safeText(4_000).default(''),
  layout: z.enum(['carousel', 'grid']),
  images: z.array(imageSchema).min(1).max(60),
  initialIndex: z.number().int().min(0).max(59).default(0),
  lightbox: z.boolean().default(false),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict().refine(section => section.initialIndex < section.images.length, {
  message: 'initialIndex must reference an image',
  path: ['initialIndex'],
})

const tabItemSchema = z.object({
  label: safeText(500).min(1),
  contentHtml: safeRichText.default(''),
  imageUrl: z.union([safeAssetUrl, z.literal('')]).default(''),
  imageAlt: safeText(500).default(''),
}).strict()

const tabsSectionSchema = z.object({
  type: z.literal('tabs'),
  title: safeText(2_000).default(''),
  category: safeText(1_000).default(''),
  tabs: z.array(tabItemSchema).min(1).max(30),
  defaultTab: z.number().int().min(0).max(29).default(0),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict().refine(section => section.defaultTab < section.tabs.length, {
  message: 'defaultTab must reference a tab',
  path: ['defaultTab'],
})

const accordionSectionSchema = z.object({
  type: z.literal('accordion'),
  title: safeText(2_000).default(''),
  items: z.array(z.object({
    question: safeText(2_000).min(1),
    answer: safeRichText,
  }).strict()).min(1).max(40),
  allowMultiple: z.boolean().default(true),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict()

export const adaptiveSectionSchema = z.discriminatedUnion('type', [
  contentBlockSectionSchema,
  gallerySectionSchema,
  tabsSectionSchema,
  accordionSectionSchema,
])

const interactionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('carousel'), wrap: z.boolean(), keyboard: z.boolean(), showIndicators: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('gallery-lightbox'), wrap: z.boolean(), keyboard: z.boolean() }).strict(),
  z.object({ kind: z.literal('tabs'), keyboard: z.boolean(), activation: z.enum(['automatic', 'manual']).default('automatic') }).strict(),
  z.object({ kind: z.literal('accordion'), allowMultiple: z.boolean(), keyboard: z.boolean() }).strict(),
])

const provenanceSchema = z.object({
  strategy: z.enum(['deterministic', 'ai-interpretation', 'ai-repair']),
  attempt: z.number().int().min(1).max(3),
  provider: safeText(200).optional(),
  model: safeText(300).optional(),
}).strict()

export const adaptiveMatchGraphSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['static', 'carousel', 'gallery-lightbox', 'tabs', 'accordion']),
  regionId: z.string().min(1).max(300).regex(/^[a-z0-9][\w.:-]*$/i),
  confidence: z.number().min(0).max(1),
  section: adaptiveSectionSchema,
  interaction: z.union([interactionSchema, z.null()]),
  provenance: provenanceSchema,
}).strict().superRefine((graph, context) => {
  const expectedSection: Record<SupportedAdaptiveMatchKind, string> = {
    'static': 'content-block',
    'carousel': 'gallery',
    'gallery-lightbox': 'gallery',
    'tabs': 'tabs',
    'accordion': 'accordion',
  }
  if (graph.section.type !== expectedSection[graph.kind]) {
    context.addIssue({ code: 'custom', path: ['section', 'type'], message: `Section type does not match ${graph.kind}` })
  }
  if (graph.kind === 'static') {
    if (graph.interaction !== null)
      context.addIssue({ code: 'custom', path: ['interaction'], message: 'Static candidates cannot declare interactions' })
    if (graph.provenance.strategy !== 'deterministic')
      context.addIssue({ code: 'custom', path: ['provenance', 'strategy'], message: 'Generated static markup is deterministic-only' })
  }
  else if (!graph.interaction || graph.interaction.kind !== graph.kind) {
    context.addIssue({ code: 'custom', path: ['interaction'], message: `Interaction does not match ${graph.kind}` })
  }
  if (graph.kind === 'carousel' && graph.section.type === 'gallery' && graph.section.layout !== 'carousel')
    context.addIssue({ code: 'custom', path: ['section', 'layout'], message: 'Carousel candidates require carousel layout' })
  if (graph.kind === 'gallery-lightbox' && graph.section.type === 'gallery' && !graph.section.lightbox)
    context.addIssue({ code: 'custom', path: ['section', 'lightbox'], message: 'Gallery-lightbox candidates require a lightbox' })
})

export type CandidateGraph = z.infer<typeof adaptiveMatchGraphSchema>
export type AdaptiveSection = z.infer<typeof adaptiveSectionSchema>
export type AdaptiveInteraction = z.infer<typeof interactionSchema>

export const candidateMutationSchema = z.object({
  version: z.literal(1),
  regionId: z.string().min(1).max(300),
  operations: z.array(z.object({
    op: z.enum(['set', 'insert', 'remove', 'move']),
    path: z.string().min(1).max(500),
    value: z.unknown().optional(),
    from: z.string().min(1).max(500).optional(),
  }).strict()).min(1).max(40),
  explanation: safeText(4_000),
}).strict()

export type CandidateMutation = z.infer<typeof candidateMutationSchema>

export interface AdaptiveMatchAttemptQa {
  passed: boolean
  failures: string[]
  failureCount: number
  worstMismatchRatio: number
  interactionPassed: number
  contentMatched: number
  overflowFailures: number
}

export interface AdaptiveMatchAttempt {
  attempt: number
  safe: boolean
  graph?: CandidateGraph
  qa?: AdaptiveMatchAttemptQa
  error?: string
}

export function parseAdaptiveMatchGraph(input: unknown, expectedRegionId?: string): CandidateGraph {
  const graph = adaptiveMatchGraphSchema.parse(input)
  if (expectedRegionId && graph.regionId !== expectedRegionId)
    throw new Error(`Adaptive Match region mismatch: expected ${expectedRegionId}, received ${graph.regionId}`)
  return graph
}

export function sectionToDeterministicGraph(input: { regionId: string, section: Record<string, any> }): CandidateGraph {
  const generatedHtml = String(input.section._generated_html || input.section.content_html || '').trim()
  const generatedCss = [input.section._generated_css, input.section._tailwind_leftover_css].filter(Boolean).join('\n')
  return parseAdaptiveMatchGraph({
    version: 1,
    kind: 'static',
    regionId: input.regionId,
    confidence: Number(input.section._tailwind_conversion?.confidence || 1),
    section: {
      type: 'content-block',
      title: String(input.section.title || ''),
      contentHtml: String(input.section.content_html || ''),
      generatedHtml,
      generatedCss,
      layoutTokens: {},
      appearanceTokens: {},
    },
    interaction: null,
    provenance: { strategy: 'deterministic', attempt: 1 },
  }, input.regionId)
}

export function candidateGraphToSection(
  graph: CandidateGraph,
  metadata: {
    runId: string
    qa: AdaptiveMatchAttemptQa | { passed: boolean, worstMismatchRatio: number }
    appliedAt?: string
  },
): Record<string, any> {
  const common = {
    _clone_region_id: graph.regionId,
    _adaptive_layout: graph.section.layoutTokens,
    _adaptive_appearance: graph.section.appearanceTokens,
    _adaptive_interaction: graph.interaction,
    _adaptive_match: {
      version: 1,
      run_id: metadata.runId,
      kind: graph.kind,
      attempt: graph.provenance.attempt,
      strategy: graph.provenance.strategy,
      provider: graph.provenance.provider,
      model: graph.provenance.model,
      qa: metadata.qa,
      ...(metadata.appliedAt ? { applied_at: metadata.appliedAt } : {}),
    },
  }

  if (graph.section.type === 'content-block') {
    return {
      type: 'content-block',
      title: graph.section.title,
      content_html: graph.section.contentHtml,
      _generated_html: graph.section.generatedHtml,
      _generated_css: graph.section.generatedCss,
      ...common,
    }
  }
  if (graph.section.type === 'gallery') {
    return {
      type: 'gallery',
      title: graph.section.title,
      description: graph.section.description,
      layout: graph.section.layout,
      images: graph.section.images,
      initial_index: graph.section.initialIndex,
      lightbox: graph.section.lightbox,
      ...common,
    }
  }
  if (graph.section.type === 'tabs') {
    return {
      type: 'tabs',
      title: graph.section.title,
      category: graph.section.category,
      default_tab: graph.section.defaultTab,
      tabs: graph.section.tabs.map(tab => ({
        label: tab.label,
        content_html: tab.contentHtml,
        image_url: tab.imageUrl,
        image_disclaimer: tab.imageAlt,
        disclaimer: '',
      })),
      ...common,
    }
  }
  return {
    type: 'accordion',
    title: graph.section.title,
    items: graph.section.items,
    allow_multiple: graph.section.allowMultiple,
    ...common,
  }
}
