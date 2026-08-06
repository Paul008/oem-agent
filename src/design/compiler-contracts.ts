import type { OemId, PageSectionType } from '../oem/types';

export const COMPILE_JOB_STATUSES = [
  'queued',
  'capturing',
  'segmenting',
  'compiling',
  'qa',
  'publishing',
  'succeeded',
  'failed',
] as const;

export type CompileJobStatus = typeof COMPILE_JOB_STATUSES[number];

export const RENDER_TARGETS = [
  'vue',
  'static-html',
  'tailwind-html',
  'alpine-island',
  'react',
  'web-component',
] as const;

export type RenderTarget = typeof RENDER_TARGETS[number];

export const INTERACTION_TYPES = [
  'carousel',
  'gallery-lightbox',
  'tabs',
  'accordion',
  'feature-overlay',
  'sticky-bar',
  'pinned-scroll',
  'scroll-reveal',
  'parallax-media',
  'video',
  'vehicle-360',
  'variant-color-explorer',
  'finance-calculator',
] as const;

export type InteractionType = typeof INTERACTION_TYPES[number];

export const RUNTIME_ADAPTERS = [
  'vue',
  'embla',
  'gsap-scrolltrigger',
  'motion',
  'auto-animate',
  'alpine',
  'css-scroll-snap',
  'static',
] as const;

export type RuntimeAdapter = typeof RUNTIME_ADAPTERS[number];

export interface ArtifactRef {
  path: string;
  contentType?: string;
  bytes?: number;
  sha256?: string;
}

export interface CompileJob {
  runId: string;
  oemId: OemId;
  modelSlug: string;
  sourceUrl: string;
  status: CompileJobStatus;
  requestedTargets: RenderTarget[];
  force?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompileRunStatus {
  runId: string;
  status: CompileJobStatus;
  stageLabel: string;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  error: string | null;
  warnings: string[];
  artifacts: ArtifactRef[];
}

export interface CaptureRun {
  runId: string;
  oemId: OemId;
  modelSlug: string;
  sourceUrl: string;
  finalUrl?: string;
  initialHtml?: ArtifactRef;
  hydratedDom?: ArtifactRef;
  networkLog?: ArtifactRef;
  fontDiagnostics?: ArtifactRef;
  screenshots: ArtifactRef[];
  warnings: string[];
}

export interface SectionBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SectionManifestEntry {
  id: string;
  type: PageSectionType | 'unknown';
  sourceSelector?: string;
  bbox?: SectionBoundingBox;
  strategyHint?: 'linked-css' | 'ssr-styled-components' | 'cssom' | 'computed-critical' | 'reconstructed';
  confidence: number;
  sourceScreenshot?: ArtifactRef;
}

export interface SectionManifest {
  runId: string;
  sections: SectionManifestEntry[];
  warnings: string[];
}

export interface InteractionManifest {
  type: InteractionType;
  preferredRuntime: RuntimeAdapter;
  fallbackRuntime: RuntimeAdapter;
  sourceRuntime?: string;
}

export interface ComponentManifest {
  sectionId: string;
  sectionType: PageSectionType | 'unknown';
  renderTarget: RenderTarget;
  runtimeDependencies: RuntimeAdapter[];
  interaction?: InteractionManifest;
  sourceFrameworkDetected?: string;
  sourceRuntimeDetected?: string;
}

export interface SectionArtifact {
  sectionId: string;
  type: PageSectionType | 'unknown';
  renderTarget: RenderTarget;
  html: string;
  css: string;
  assets: ArtifactRef[];
  sourceScreenshot?: ArtifactRef;
  cloneScreenshot?: ArtifactRef;
  component?: ComponentManifest;
  repairs: RepairPlan[];
  warnings: string[];
}

export interface RepairPlan {
  id: string;
  type:
    | 'font-variable-injection'
    | 'ssr-body-strategy-switch'
    | 'grid-collapse-repair'
    | 'asset-url-normalization'
    | 'sticky-bar-isolation'
    | 'section-reconstruction';
  reason: string;
  confidence: number;
  autoApply: boolean;
}

export interface QaReport {
  runId: string;
  status: 'passed' | 'failed' | 'needs-review';
  desktopScore: number;
  mobileScore: number;
  checks: QaCheckResult[];
  sourceScreenshot?: ArtifactRef;
  cloneScreenshot?: ArtifactRef;
  diffScreenshot?: ArtifactRef;
}

export interface QaCheckResult {
  id: string;
  status: 'passed' | 'failed' | 'warning';
  message: string;
  sectionId?: string;
}

export interface ProviderResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

export interface BrowserCaptureProvider {
  capture(job: CompileJob): Promise<ProviderResult<CaptureRun>>;
}

export interface VisualDiffProvider {
  compare(source: ArtifactRef, clone: ArtifactRef): Promise<ProviderResult<QaCheckResult>>;
}

export interface ModelReasoningProvider {
  classifySections(capture: CaptureRun): Promise<ProviderResult<SectionManifest>>;
  proposeRepairs(report: QaReport): Promise<ProviderResult<RepairPlan[]>>;
}

export interface ArtifactStore {
  put(path: string, value: ArrayBuffer | string, metadata?: Record<string, string>): Promise<ArtifactRef>;
  get(path: string): Promise<ProviderResult<ArrayBuffer>>;
}

export interface EdgeExecutionProvider {
  enqueueCompile(job: CompileJob): Promise<ProviderResult<{ jobId: string }>>;
  publishArtifact(artifact: SectionArtifact): Promise<ProviderResult<ArtifactRef>>;
}

export interface KnowledgeIndexProvider {
  indexRun(capture: CaptureRun, report: QaReport): Promise<ProviderResult<{ indexed: boolean }>>;
  indexComponent(component: ComponentManifest): Promise<ProviderResult<{ indexed: boolean }>>;
  search(query: string): Promise<ProviderResult<Array<{ title: string; path: string; score: number }>>>;
}

export interface AgenticControlPlaneProvider {
  createTask(job: CompileJob): Promise<ProviderResult<{ taskId: string }>>;
  attachWorkProduct(taskId: string, artifact: ArtifactRef): Promise<ProviderResult<{ attached: boolean }>>;
  requestApproval(repair: RepairPlan): Promise<ProviderResult<{ approved: boolean }>>;
}

export function isCompileJobStatus(value: unknown): value is CompileJobStatus {
  return typeof value === 'string' && COMPILE_JOB_STATUSES.includes(value as CompileJobStatus);
}

export function isRenderTarget(value: unknown): value is RenderTarget {
  return typeof value === 'string' && RENDER_TARGETS.includes(value as RenderTarget);
}

export function normalizeRenderTargets(values: unknown): RenderTarget[] {
  if (!Array.isArray(values)) return ['vue'];

  const targets = values.filter(isRenderTarget);
  return targets.length ? [...new Set(targets)] : ['vue'];
}
