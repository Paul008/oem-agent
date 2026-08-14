import { z } from 'zod';

import type { InferenceRequest, InferenceResponse } from '../ai/router';
import type { AiProvider, OemId } from '../oem/types';

const executablePattern = /<\s*(?:script|iframe|object|embed)\b|\son[a-z]+\s*=|javascript\s*:/i;
const unsafeCssPattern = /<\s*\/\s*style|javascript\s*:|@import\b|expression\s*\(/i;
const safeText = (max = 4_000) => z.string().max(max).refine(value => !executablePattern.test(value), 'Executable content is not allowed');
const safeRichText = safeText(40_000);
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
    provider: z.string().min(1).max(100).optional(),
    model: z.string().min(1).max(300).optional(),
    fallbackProvider: z.string().min(1).max(100).optional(),
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

function buildPrompt(request: AdaptiveMatchRequest): string {
  const evidence = redactedEvidence(request);
  const common = `You are reconstructing one bounded automotive OEM page region. Return JSON only.\n\nSafety rules:\n- Never output JavaScript, event-handler attributes, iframes, objects, embeds, global CSS, or unsafe URLs.\n- Preserve all supplied wording and required assets.\n- Use exactly one supported kind: carousel, gallery-lightbox, tabs, or accordion.\n- Use only bounded layoutTokens and appearanceTokens.\n- The regionId must remain "${request.evidence.regionId}".\n\nEvidence:\n${JSON.stringify(evidence)}`;
  if (request.mode === 'repair') {
    return `${common}\n\nReturn a CandidateMutation with version, regionId, operations, and explanation. Operations may target only /section or /interaction.\nPrevious graph:\n${JSON.stringify(request.previousGraph)}\nDeterministic QA failures:\n${JSON.stringify(request.qaFailures)}`;
  }
  return `${common}\n\nReturn a complete CandidateGraph with version, kind, regionId, confidence, section, interaction, and provenance. The server will replace provenance with authoritative model data.`;
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

function applyMutation(graph: WorkerCandidateGraph, input: unknown): { graph: WorkerCandidateGraph; mutation: WorkerCandidateMutation } {
  const mutation = mutationSchema.parse(input);
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
  await bucket.put(key, JSON.stringify(ledger), { httpMetadata: { contentType: 'application/json' } });
}

export async function executeAdaptiveMatch(input: unknown, deps: AdaptiveMatchDependencies): Promise<AdaptiveMatchResponse> {
  const request = adaptiveMatchRequestSchema.parse(input);
  let inference: InferenceResponse | null = null;
  try {
    inference = await deps.infer({
      taskType: 'section_deep_analysis',
      requireJson: true,
      imageBase64: request.contactSheetBase64,
      imageMimeType: 'image/png',
      prompt: buildPrompt(request),
      oemId: request.evidence.oemId as OemId,
      ...(request.modelOverride
        ? {
            overrideRoute: {
              provider: request.modelOverride.provider as AiProvider | undefined,
              model: request.modelOverride.model,
              fallbackProvider: request.modelOverride.fallbackProvider as AiProvider | undefined,
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
      graph = workerCandidateGraphSchema.parse(parsed);
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
