import { z } from 'zod';

import type { InferenceRequest, InferenceResponse } from '../ai/router';
import type { OemId } from '../oem/types';

const executablePattern = /<\s*(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript\s*:/i;
const unsafeRichTextPattern = /<\s*(?:style|link|meta|base|form|input|button|textarea|select|option|svg|math|video|audio|source|track|canvas)\b|\s(?:style|srcdoc|formaction)\s*=|(?:href|src)\s*=\s*["']?\s*(?:data|blob|file):/i;
const unsafeCssPattern = /<\s*\/\s*style|javascript\s*:|@import\b|expression\s*\(/i;
const aiProviderSchema = z.enum(['groq', 'together', 'moonshot', 'anthropic', 'cloudflare_ai_gateway', 'google_gemini', 'workers_ai']);
const safeText = (max = 4_000) => z.string().max(max).refine(value => !executablePattern.test(value), 'Executable content is not allowed');
const safeRichText = safeText(40_000).refine(value => !unsafeRichTextPattern.test(value), 'Unsafe rich text is not allowed');
const safeCss = z.string().max(80_000).refine(value => !unsafeCssPattern.test(value), 'Unsafe CSS is not allowed');
const safeUrl = z.string().min(1).max(4_000).refine((value) => {
  if (executablePattern.test(value) || /^(?:data|blob):/i.test(value)) return false;
  if (value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Unsafe URL');
const safeCtaUrl = z.string().max(4_000).refine((value) => {
  if (!value) return true;
  if (executablePattern.test(value) || /^(?:data|blob|file):/i.test(value)) return false;
  if (value.startsWith('/') || value.startsWith('#')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}, 'Unsafe CTA URL');

const layoutTokensSchema = z.object({
  maxWidthPx: z.number().int().min(240).max(2_400).optional(),
  desktopColumns: z.number().int().min(1).max(8).optional(),
  tabletColumns: z.number().int().min(1).max(6).optional(),
  mobileColumns: z.number().int().min(1).max(2).optional(),
  gapPx: z.number().int().min(0).max(128).optional(),
  paddingBlockPx: z.number().int().min(0).max(240).optional(),
  paddingInlinePx: z.number().int().min(0).max(240).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
}).strict();

const colorSchema = z.string().max(64).refine(value => /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|transparent|currentColor)$/i.test(value), 'Unsupported colour');
const appearanceTokensSchema = z.object({
  backgroundColor: colorSchema.optional(),
  textColor: colorSchema.optional(),
  accentColor: colorSchema.optional(),
  borderColor: colorSchema.optional(),
  borderRadiusPx: z.number().int().min(0).max(80).optional(),
  headingSizePx: z.number().int().min(12).max(96).optional(),
  bodySizePx: z.number().int().min(10).max(40).optional(),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).optional(),
  imageFit: z.enum(['contain', 'cover', 'fill']).optional(),
  imageAspectRatio: z.enum(['auto', '1/1', '4/3', '3/2', '16/9']).optional(),
  shadow: z.boolean().optional(),
}).strict();

const imageSchema = z.object({
  url: safeUrl,
  alt: safeText(500).default(''),
  caption: safeText(2_000).default(''),
  description: safeText(4_000).default(''),
}).strict();

const ctaSchema = z.object({
  text: safeText(500).default(''),
  url: safeCtaUrl.default(''),
}).strict();

const contentBlockSchema = z.object({
  type: z.literal('content-block'),
  title: safeText(2_000).default(''),
  contentHtml: safeRichText.default(''),
  generatedHtml: safeRichText.min(1),
  generatedCss: safeCss.default(''),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict();

const gallerySchema = z.object({
  type: z.literal('gallery'),
  title: safeText(2_000).default(''),
  description: safeText(4_000).default(''),
  cta: ctaSchema.optional(),
  layout: z.enum(['carousel', 'grid']),
  images: z.array(imageSchema).min(1).max(60),
  initialIndex: z.number().int().min(0).max(59).default(0),
  lightbox: z.boolean().default(false),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict().refine(section => section.initialIndex < section.images.length, { message: 'initialIndex must reference an image' });

const tabsSchema = z.object({
  type: z.literal('tabs'),
  title: safeText(2_000).default(''),
  category: safeText(1_000).default(''),
  tabs: z.array(z.object({
    label: safeText(500).min(1),
    contentHtml: safeRichText.default(''),
    imageUrl: z.union([safeUrl, z.literal('')]).default(''),
    imageAlt: safeText(500).default(''),
  }).strict()).min(1).max(30),
  defaultTab: z.number().int().min(0).max(29).default(0),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict().refine(section => section.defaultTab < section.tabs.length, { message: 'defaultTab must reference a tab' });

const accordionSchema = z.object({
  type: z.literal('accordion'),
  title: safeText(2_000).default(''),
  items: z.array(z.object({ question: safeText(2_000).min(1), answer: safeRichText }).strict()).min(1).max(40),
  allowMultiple: z.boolean().default(true),
  layoutTokens: layoutTokensSchema.default({}),
  appearanceTokens: appearanceTokensSchema.default({}),
}).strict();

const sectionSchema = z.discriminatedUnion('type', [contentBlockSchema, gallerySchema, tabsSchema, accordionSchema]);
const interactionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('carousel'), wrap: z.boolean(), keyboard: z.boolean(), showIndicators: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('gallery-lightbox'), wrap: z.boolean(), keyboard: z.boolean() }).strict(),
  z.object({ kind: z.literal('tabs'), keyboard: z.boolean(), activation: z.enum(['automatic', 'manual']).default('automatic') }).strict(),
  z.object({ kind: z.literal('accordion'), allowMultiple: z.boolean(), keyboard: z.boolean() }).strict(),
]);

export const workerCandidateGraphSchema = z.object({
  version: z.literal(1),
  kind: z.enum(['static', 'carousel', 'gallery-lightbox', 'tabs', 'accordion']),
  regionId: z.string().min(1).max(300).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/),
  confidence: z.number().min(0).max(1),
  section: sectionSchema,
  interaction: z.union([interactionSchema, z.null()]),
  provenance: z.object({
    strategy: z.enum(['deterministic', 'ai-interpretation', 'ai-repair']),
    attempt: z.number().int().min(1).max(3),
    provider: safeText(200).optional(),
    model: safeText(300).optional(),
  }).strict(),
}).strict().superRefine((graph, context) => {
  const expectedSection: Record<string, string> = {
    static: 'content-block',
    carousel: 'gallery',
    'gallery-lightbox': 'gallery',
    tabs: 'tabs',
    accordion: 'accordion',
  };
  if (graph.section.type !== expectedSection[graph.kind])
    context.addIssue({ code: 'custom', path: ['section', 'type'], message: `Section type does not match ${graph.kind}` });
  if (graph.kind === 'static') {
    if (graph.interaction !== null)
      context.addIssue({ code: 'custom', path: ['interaction'], message: 'Static candidates cannot declare interactions' });
  } else if (!graph.interaction || graph.interaction.kind !== graph.kind) {
    context.addIssue({ code: 'custom', path: ['interaction'], message: `Interaction does not match ${graph.kind}` });
  }
  if (graph.kind === 'carousel' && graph.section.type === 'gallery' && graph.section.layout !== 'carousel')
    context.addIssue({ code: 'custom', path: ['section', 'layout'], message: 'Carousel candidates require carousel layout' });
  if (graph.kind === 'gallery-lightbox' && graph.section.type === 'gallery' && !graph.section.lightbox)
    context.addIssue({ code: 'custom', path: ['section', 'lightbox'], message: 'Gallery-lightbox candidates require a lightbox' });
});

const mutationSchema = z.object({
  version: z.literal(1),
  regionId: z.string().min(1).max(300),
  operations: z.array(z.object({
    op: z.enum(['set', 'insert', 'remove', 'move']),
    path: z.string().min(1).max(500),
    value: z.unknown().optional(),
    from: z.string().min(1).max(500).optional(),
  }).strict()).min(1).max(40),
  explanation: safeText(4_000),
}).strict();

const evidenceSchema = z.object({
  version: z.literal(1),
  oemId: z.string().min(1).max(100).regex(/^[a-z0-9][a-z0-9-]*$/),
  modelSlug: z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9-]*$/),
  sourceUrl: z.string().url().max(4_000),
  regionId: z.string().min(1).max(300),
  html: z.string().max(120_000),
  css: z.string().max(80_000),
  recipeArtifact: z.record(z.string(), z.unknown()).nullable(),
  detection: z.object({
    kind: z.enum(['static', 'carousel', 'gallery-lightbox', 'tabs', 'accordion', 'unknown']),
    confidence: z.number().min(0).max(1),
    markers: z.array(safeText(200)).max(40),
    itemCount: z.number().int().min(0).max(500),
    requiresAi: z.boolean(),
  }).strict(),
  interactionStates: z.array(z.object({
    id: safeText(200),
    activeIndex: z.number().int().min(0).max(499).optional(),
    visibleItems: z.array(z.number().int().min(0).max(499)).max(100),
    expandedItems: z.array(z.number().int().min(0).max(499)).max(100),
  }).strict()).max(40),
  viewports: z.array(z.object({
    name: z.enum(['desktop', 'tablet', 'mobile']),
    width: z.number().int().min(240).max(2_400),
    height: z.number().int().min(240).max(2_400),
    mismatchRatio: z.number().min(0).max(1).optional(),
  }).strict()).min(1).max(3),
  content: z.object({
    text: z.array(safeText(4_000)).max(500),
    assets: z.array(z.object({ url: safeUrl, alt: safeText(500), required: z.boolean() }).strict()).max(200),
  }).strict(),
}).strict();

export const adaptiveMatchRequestSchema = z.object({
  version: z.literal(1),
  mode: z.enum(['interpret', 'repair']),
  runId: z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  attempt: z.number().int().min(1).max(3),
  contactSheetBase64: z.string().min(4).max(16_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  evidence: evidenceSchema,
  previousGraph: workerCandidateGraphSchema.optional(),
  qaFailures: z.array(safeText(2_000)).max(60),
  modelOverride: z.object({
    provider: aiProviderSchema.optional(),
    model: z.string().min(1).max(300).optional(),
    fallbackProvider: aiProviderSchema.optional(),
    fallbackModel: z.string().min(1).max(300).optional(),
  }).strict().optional(),
}).strict().superRefine((request, context) => {
  if (request.evidence.regionId.length && request.mode === 'repair' && !request.previousGraph)
    context.addIssue({ code: 'custom', path: ['previousGraph'], message: 'Repair requests require a previous graph' });
  if (request.previousGraph && request.previousGraph.regionId !== request.evidence.regionId)
    context.addIssue({ code: 'custom', path: ['previousGraph', 'regionId'], message: 'Previous graph region does not match evidence' });
});

export type WorkerCandidateGraph = z.infer<typeof workerCandidateGraphSchema>;
export type AdaptiveMatchRequest = z.infer<typeof adaptiveMatchRequestSchema>;
export type WorkerCandidateMutation = z.infer<typeof mutationSchema>;

export interface AdaptiveMatchResponse {
  success: true;
  runId: string;
  attempt: number;
  graph: WorkerCandidateGraph;
  mutation?: WorkerCandidateMutation;
  provider: string;
  model: string;
  latencyMs: number;
  usage: InferenceResponse['usage'];
}

export interface AdaptiveMatchDependencies {
  infer: (request: InferenceRequest) => Promise<InferenceResponse>;
  bucket: Pick<R2Bucket, 'put'>;
}

function sanitizeEvidenceHtml(value: string): string {
  return value
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/https?:\/\/[^\s"'<>]+/gi, raw => redactUrl(raw));
}

function sanitizeEvidenceCss(value: string): string {
  return value.replace(/@import\b[^;]*;?/gi, '').replace(/javascript\s*:/gi, '').replace(/<\/?style/gi, '');
}

function redactUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return value.split(/[?#]/, 1)[0];
  }
}

function redactedEvidence(request: AdaptiveMatchRequest) {
  return {
    sourceUrl: redactUrl(request.evidence.sourceUrl),
    regionId: request.evidence.regionId,
    html: sanitizeEvidenceHtml(request.evidence.html),
    css: sanitizeEvidenceCss(request.evidence.css),
    recipeArtifact: request.evidence.recipeArtifact,
    detection: request.evidence.detection,
    interactionStates: request.evidence.interactionStates,
    viewports: request.evidence.viewports,
    content: {
      text: request.evidence.content.text,
      assets: request.evidence.content.assets.map(asset => ({ ...asset, url: redactUrl(asset.url) })),
    },
  };
}

type JsonSchema = Record<string, unknown>;

const layoutTokensJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    maxWidthPx: { type: 'integer', minimum: 240, maximum: 2_400 },
    desktopColumns: { type: 'integer', minimum: 1, maximum: 8 },
    tabletColumns: { type: 'integer', minimum: 1, maximum: 6 },
    mobileColumns: { type: 'integer', minimum: 1, maximum: 2 },
    gapPx: { type: 'integer', minimum: 0, maximum: 128 },
    paddingBlockPx: { type: 'integer', minimum: 0, maximum: 240 },
    paddingInlinePx: { type: 'integer', minimum: 0, maximum: 240 },
    textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
  },
};

const appearanceTokensJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    backgroundColor: { type: 'string' },
    textColor: { type: 'string' },
    accentColor: { type: 'string' },
    borderColor: { type: 'string' },
    borderRadiusPx: { type: 'integer', minimum: 0, maximum: 80 },
    headingSizePx: { type: 'integer', minimum: 12, maximum: 96 },
    bodySizePx: { type: 'integer', minimum: 10, maximum: 40 },
    fontWeight: { type: 'integer', minimum: 100, maximum: 900 },
    imageFit: { type: 'string', enum: ['contain', 'cover', 'fill'] },
    imageAspectRatio: { type: 'string', enum: ['auto', '1/1', '4/3', '3/2', '16/9'] },
    shadow: { type: 'boolean' },
  },
};

const imageJsonSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    url: { type: 'string' },
    alt: { type: 'string' },
    caption: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['url'],
};

function candidateSectionJsonSchema(kind: AdaptiveMatchRequest['evidence']['detection']['kind']): JsonSchema {
  if (kind === 'carousel' || kind === 'gallery-lightbox') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['gallery'] },
        title: { type: 'string' },
        description: { type: 'string' },
        cta: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            url: { type: 'string' },
          },
        },
        layout: { type: 'string', enum: kind === 'carousel' ? ['carousel'] : ['grid'] },
        images: { type: 'array', minItems: 1, maxItems: 60, items: imageJsonSchema },
        initialIndex: { type: 'integer', minimum: 0, maximum: 59 },
        lightbox: { type: 'boolean' },
        layoutTokens: layoutTokensJsonSchema,
        appearanceTokens: appearanceTokensJsonSchema,
      },
      required: ['type', 'layout', 'images'],
    };
  }
  if (kind === 'tabs') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['tabs'] },
        title: { type: 'string' },
        category: { type: 'string' },
        tabs: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              label: { type: 'string' },
              contentHtml: { type: 'string' },
              imageUrl: { type: 'string' },
              imageAlt: { type: 'string' },
            },
            required: ['label'],
          },
        },
        defaultTab: { type: 'integer', minimum: 0, maximum: 29 },
        layoutTokens: layoutTokensJsonSchema,
        appearanceTokens: appearanceTokensJsonSchema,
      },
      required: ['type', 'tabs'],
    };
  }
  if (kind === 'accordion') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['accordion'] },
        title: { type: 'string' },
        items: {
          type: 'array',
          minItems: 1,
          maxItems: 40,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { question: { type: 'string' }, answer: { type: 'string' } },
            required: ['question', 'answer'],
          },
        },
        allowMultiple: { type: 'boolean' },
        layoutTokens: layoutTokensJsonSchema,
        appearanceTokens: appearanceTokensJsonSchema,
      },
      required: ['type', 'items'],
    };
  }
  return {
    anyOf: [
      candidateSectionJsonSchema('carousel'),
      candidateSectionJsonSchema('gallery-lightbox'),
      candidateSectionJsonSchema('tabs'),
      candidateSectionJsonSchema('accordion'),
    ],
  };
}

function candidateInteractionJsonSchema(kind: AdaptiveMatchRequest['evidence']['detection']['kind']): JsonSchema {
  if (kind === 'carousel') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['carousel'] },
        wrap: { type: 'boolean' },
        keyboard: { type: 'boolean' },
        showIndicators: { type: 'boolean' },
      },
      required: ['kind', 'wrap', 'keyboard'],
    };
  }
  if (kind === 'gallery-lightbox') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['gallery-lightbox'] },
        wrap: { type: 'boolean' },
        keyboard: { type: 'boolean' },
      },
      required: ['kind', 'wrap', 'keyboard'],
    };
  }
  if (kind === 'tabs') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['tabs'] },
        keyboard: { type: 'boolean' },
        activation: { type: 'string', enum: ['automatic', 'manual'] },
      },
      required: ['kind', 'keyboard'],
    };
  }
  if (kind === 'accordion') {
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { type: 'string', enum: ['accordion'] },
        allowMultiple: { type: 'boolean' },
        keyboard: { type: 'boolean' },
      },
      required: ['kind', 'allowMultiple', 'keyboard'],
    };
  }
  return {
    anyOf: [
      candidateInteractionJsonSchema('carousel'),
      candidateInteractionJsonSchema('gallery-lightbox'),
      candidateInteractionJsonSchema('tabs'),
      candidateInteractionJsonSchema('accordion'),
    ],
  };
}

function interpretationResponseJsonSchema(request: AdaptiveMatchRequest): JsonSchema {
  const detectedKind = request.evidence.detection.kind;
  const supportedKinds = detectedKind === 'unknown' || detectedKind === 'static'
    ? ['carousel', 'gallery-lightbox', 'tabs', 'accordion']
    : [detectedKind];
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      version: { type: 'integer', enum: [1] },
      kind: { type: 'string', enum: supportedKinds },
      regionId: { type: 'string', enum: [request.evidence.regionId] },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      section: candidateSectionJsonSchema(detectedKind),
      interaction: candidateInteractionJsonSchema(detectedKind),
    },
    required: ['version', 'kind', 'regionId', 'confidence', 'section', 'interaction'],
  };
}

function repairResponseJsonSchema(request: AdaptiveMatchRequest): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      version: { type: 'integer', enum: [1] },
      regionId: { type: 'string', enum: [request.evidence.regionId] },
      operations: {
        type: 'array',
        minItems: 1,
        maxItems: 40,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            op: { type: 'string', enum: ['set', 'insert', 'remove', 'move'] },
            path: { type: 'string' },
            value: {},
            from: { type: 'string' },
          },
          required: ['op', 'path'],
        },
      },
      explanation: { type: 'string' },
    },
    required: ['version', 'regionId', 'operations', 'explanation'],
  };
}

function modelResponseJsonSchema(request: AdaptiveMatchRequest): JsonSchema {
  return request.mode === 'repair'
    ? repairResponseJsonSchema(request)
    : interpretationResponseJsonSchema(request);
}

function interpretationExample(request: AdaptiveMatchRequest): Record<string, unknown> {
  const detected = request.evidence.detection.kind;
  const kind = detected === 'unknown' || detected === 'static' ? 'carousel' : detected;
  const firstAsset = request.evidence.content.assets[0];
  const image = {
    url: firstAsset?.url || request.evidence.sourceUrl,
    alt: firstAsset?.alt || '',
    caption: request.evidence.content.text[0] || '',
    description: '',
  };
  if (kind === 'carousel' || kind === 'gallery-lightbox') {
    return {
      version: 1,
      kind,
      regionId: request.evidence.regionId,
      confidence: 0.9,
      section: {
        type: 'gallery',
        title: request.evidence.content.text[0] || '',
        description: request.evidence.content.text[1] || '',
        cta: { text: '', url: '' },
        layout: kind === 'carousel' ? 'carousel' : 'grid',
        images: [image],
        initialIndex: 0,
        lightbox: kind === 'gallery-lightbox',
        layoutTokens: {},
        appearanceTokens: {},
      },
      interaction: kind === 'carousel'
        ? { kind, wrap: true, keyboard: true, showIndicators: true }
        : { kind, wrap: true, keyboard: true },
    };
  }
  if (kind === 'tabs') {
    return {
      version: 1,
      kind,
      regionId: request.evidence.regionId,
      confidence: 0.9,
      section: { type: 'tabs', title: '', category: '', tabs: [{ label: 'Tab', contentHtml: '', imageUrl: '', imageAlt: '' }], defaultTab: 0, layoutTokens: {}, appearanceTokens: {} },
      interaction: { kind, keyboard: true, activation: 'automatic' },
    };
  }
  return {
    version: 1,
    kind,
    regionId: request.evidence.regionId,
    confidence: 0.9,
    section: { type: 'accordion', title: '', items: [{ question: 'Question', answer: 'Answer' }], allowMultiple: true, layoutTokens: {}, appearanceTokens: {} },
    interaction: { kind, allowMultiple: true, keyboard: true },
  };
}

function buildPrompt(request: AdaptiveMatchRequest): string {
  const evidence = redactedEvidence(request);
  const common = `You are reconstructing one bounded automotive OEM page region. Return JSON only.\n\nSafety rules:\n- Never output JavaScript, event-handler attributes, iframes, objects, embeds, global CSS, or unsafe URLs.\n- Preserve all supplied wording and required assets.\n- Use exactly one supported kind: carousel, gallery-lightbox, tabs, or accordion.\n- Use only bounded layoutTokens and appearanceTokens.\n- The regionId must remain "${request.evidence.regionId}".\n\nEvidence:\n${JSON.stringify(evidence)}`;
  if (request.mode === 'repair') {
    const example = {
      version: 1,
      regionId: request.evidence.regionId,
      operations: [{ op: 'set', path: '/section/title', value: 'Exact captured heading' }],
      explanation: 'Restore the captured heading.',
    };
    return `${common}\n\nReturn exactly one CandidateMutation JSON object with version, regionId, operations, and explanation. Do not wrap the object in a content, candidate, result, or section key. Operations may target only /section or /interaction. Use only op values set, insert, remove, or move and use path (not target). For a gallery action, set /section/cta to exactly {"text":"Learn More","url":"https://safe.example/path"}. Follow this exact shape (replace values using the evidence and QA failures):\n${JSON.stringify(example)}\nPrevious graph:\n${JSON.stringify(request.previousGraph)}\nDeterministic QA failures:\n${JSON.stringify(request.qaFailures)}`;
  }
  return `${common}\n\nReturn exactly one CandidateGraph JSON object with version, kind, regionId, confidence, section, and interaction. Do not wrap the object in a content, candidate, result, or section key. The server adds authoritative provenance. Follow this exact shape (replace values using the evidence):\n${JSON.stringify(interpretationExample(request))}`;
}

function extractJson(content: string): unknown {
  const trimmed = String(content || '').trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new Error('Adaptive Match model returned invalid JSON');
  }
}

function decodePointer(path: string): string[] {
  if (!/^\/(?:section|interaction)(?:\/|$)/.test(path))
    throw new Error(`Mutation path is not allowed: ${path}`);
  const segments = path.slice(1).split('/').map(segment => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  if (segments.some(segment => !segment || ['__proto__', 'prototype', 'constructor'].includes(segment)))
    throw new Error(`Mutation path is not allowed: ${path}`);
  return segments;
}

function parentAt(root: any, segments: string[]): { parent: any; key: string } {
  const key = segments[segments.length - 1];
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (parent == null || typeof parent !== 'object' || !(segment in parent))
      throw new Error(`Mutation path does not exist: /${segments.join('/')}`);
    parent = parent[segment];
  }
  return { parent, key };
}

function readAt(root: any, path: string): unknown {
  return decodePointer(path).reduce((value: any, segment) => {
    if (value == null || typeof value !== 'object' || !(segment in value))
      throw new Error(`Mutation source does not exist: ${path}`);
    return value[segment];
  }, root);
}

function normalizeMutationOperation(input: unknown, graph: WorkerCandidateGraph): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return input;
  const raw = { ...input } as Record<string, unknown>;
  const supportedOps = new Set(['set', 'insert', 'remove', 'move']);
  const aliases = [raw.op, raw.action]
    .filter((value): value is string => typeof value === 'string')
    .map(value => value === 'replace' ? 'set' : value);
  let op = aliases.find(value => supportedOps.has(value)) ?? aliases[0];
  const path = typeof raw.path === 'string'
    ? raw.path
    : typeof raw.target === 'string' ? raw.target : raw.path;
  if (path === '/section/type') {
    op = 'set';
    raw.value = graph.section.type;
  } else if (path === '/interaction/kind' && graph.interaction) {
    op = 'set';
    raw.value = graph.interaction.kind;
  }
  delete raw.action;
  delete raw.target;
  return {
    ...raw,
    ...(op ? { op } : {}),
    ...(path ? { path } : {}),
  };
}

function applyMutation(graph: WorkerCandidateGraph, input: unknown): { graph: WorkerCandidateGraph; mutation: WorkerCandidateMutation } {
  const raw = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null;
  const mutation = mutationSchema.parse(raw
    ? {
        ...raw,
        version: raw.version ?? 1,
        regionId: raw.regionId ?? graph.regionId,
        operations: Array.isArray(raw.operations)
          ? raw.operations.map(operation => normalizeMutationOperation(operation, graph))
          : raw.operations,
      }
    : input);
  if (mutation.regionId !== graph.regionId)
    throw new Error(`Mutation region mismatch: expected ${graph.regionId}, received ${mutation.regionId}`);
  const next = structuredClone(graph) as any;
  for (const operation of mutation.operations) {
    const { parent, key } = parentAt(next, decodePointer(operation.path));
    if (operation.op === 'set') {
      parent[key] = structuredClone(operation.value);
    } else if (operation.op === 'insert') {
      if (!Array.isArray(parent)) throw new Error(`Insert target is not an array: ${operation.path}`);
      const index = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(index) || index < 0 || index > parent.length) throw new Error(`Invalid insert index: ${operation.path}`);
      parent.splice(index, 0, structuredClone(operation.value));
    } else if (operation.op === 'remove') {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else {
      if (!operation.from) throw new Error('Move operations require a source path');
      const moved = structuredClone(readAt(next, operation.from));
      const source = parentAt(next, decodePointer(operation.from));
      if (Array.isArray(source.parent)) source.parent.splice(Number(source.key), 1);
      else delete source.parent[source.key];
      parent[key] = moved;
    }
  }
  return { graph: workerCandidateGraphSchema.parse(next), mutation };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return `Adaptive Match candidate validation failed: ${error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`.slice(0, 2_000);
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

async function persistLedger(
  request: AdaptiveMatchRequest,
  bucket: Pick<R2Bucket, 'put'>,
  entry: Record<string, unknown>,
): Promise<void> {
  const evidence = redactedEvidence(request);
  const key = `model-pages/${request.evidence.oemId}/${request.evidence.modelSlug}/adaptive-match/${request.runId}/attempt-${request.attempt}.json`;
  const ledger = {
    version: 1,
    runId: request.runId,
    attempt: request.attempt,
    mode: request.mode,
    createdAt: new Date().toISOString(),
    evidenceHash: await sha256(JSON.stringify(evidence)),
    evidence: {
      regionId: request.evidence.regionId,
      kind: request.evidence.detection.kind,
      markers: request.evidence.detection.markers,
      viewportNames: request.evidence.viewports.map(viewport => viewport.name),
      textCount: request.evidence.content.text.length,
      assetCount: request.evidence.content.assets.length,
    },
    ...entry,
  };
  await bucket.put(key, JSON.stringify(ledger), {
    httpMetadata: { contentType: 'application/json' },
    onlyIf: new Headers({ 'if-none-match': '*' }),
  });
}

export async function executeAdaptiveMatch(input: unknown, deps: AdaptiveMatchDependencies): Promise<AdaptiveMatchResponse> {
  const request = adaptiveMatchRequestSchema.parse(input);
  let inference: InferenceResponse | null = null;
  try {
    inference = await deps.infer({
      taskType: 'section_deep_analysis',
      requireJson: true,
      responseJsonSchema: modelResponseJsonSchema(request),
      imageBase64: request.contactSheetBase64,
      imageMimeType: 'image/png',
      prompt: buildPrompt(request),
      oemId: request.evidence.oemId as OemId,
      ...(request.modelOverride
        ? {
            overrideRoute: {
              provider: request.modelOverride.provider,
              model: request.modelOverride.model,
              fallbackProvider: request.modelOverride.fallbackProvider,
              fallbackModel: request.modelOverride.fallbackModel,
            },
          }
        : {}),
    });

    const parsed = extractJson(inference.content);
    let graph: WorkerCandidateGraph;
    let mutation: WorkerCandidateMutation | undefined;
    if (request.mode === 'repair') {
      const repaired = applyMutation(request.previousGraph!, parsed);
      graph = repaired.graph;
      mutation = repaired.mutation;
    } else {
      const raw = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
      const authoritativeProvenance = {
        strategy: 'ai-interpretation' as const,
        attempt: request.attempt,
        provider: inference.provider,
        model: inference.model,
      };
      graph = workerCandidateGraphSchema.parse(raw
        ? {
            ...raw,
            version: raw.version ?? 1,
            regionId: raw.regionId ?? request.evidence.regionId,
            provenance: authoritativeProvenance,
          }
        : parsed);
      if (graph.kind === 'static')
        throw new Error('AI interpretation cannot generate executable static markup');
    }

    if (graph.regionId !== request.evidence.regionId)
      throw new Error(`Adaptive Match region mismatch: expected ${request.evidence.regionId}, received ${graph.regionId}`);
    graph = workerCandidateGraphSchema.parse({
      ...graph,
      provenance: {
        strategy: request.mode === 'repair' ? 'ai-repair' : 'ai-interpretation',
        attempt: request.attempt,
        provider: inference.provider,
        model: inference.model,
      },
    });

    const response: AdaptiveMatchResponse = {
      success: true,
      runId: request.runId,
      attempt: request.attempt,
      graph,
      ...(mutation ? { mutation } : {}),
      provider: inference.provider,
      model: inference.model,
      latencyMs: inference.latency_ms,
      usage: inference.usage,
    };
    await persistLedger(request, deps.bucket, {
      status: 'accepted',
      provider: inference.provider,
      model: inference.model,
      latencyMs: inference.latency_ms,
      usage: inference.usage,
      graph,
      ...(mutation ? { mutation } : {}),
    });
    return response;
  } catch (error) {
    await persistLedger(request, deps.bucket, {
      status: 'rejected',
      ...(inference ? { provider: inference.provider, model: inference.model, latencyMs: inference.latency_ms } : {}),
      error: errorMessage(error),
    });
    throw new Error(errorMessage(error));
  }
}
