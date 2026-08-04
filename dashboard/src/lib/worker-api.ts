import type {
  PublicationCandidateResponse,
  PublicationHistoryResponse,
  PublicationTransitionResponse,
  PublishModelPagePublicationInput,
} from '@/lib/model-page-publication'
import type { Recipe } from '@/lib/recipes'

import {
  parsePublicationCandidateResponse,
  parsePublicationHistoryResponse,
  parsePublicationTransitionResponse,
} from '@/lib/model-page-publication'
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '@/lib/oem-ids'
import { normalizeRecipesResponse } from '@/lib/recipes'
import { supabase } from '@/lib/supabase'

export type { Recipe } from '@/lib/recipes'

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

function assertModelPageWriteAllowed(oemId: string) {
  if (isModelPageWriteProtected(oemId))
    throw new Error(getModelPageWriteProtectedMessage(oemId))
}

type WorkerFetchOptions = RequestInit & {
  skipAuthHeader?: boolean
}

type WorkerTextFetchOptions = WorkerFetchOptions & {
  expectedContentType?: string
}

export async function workerFetch(path: string, options?: WorkerFetchOptions) {
  const { skipAuthHeader, ...fetchOptions } = options ?? {}
  const headers = await buildWorkerHeaders(fetchOptions.headers, { skipAuthHeader })
  const res = await fetch(`${WORKER_BASE}${path}`, {
    credentials: 'include',
    ...fetchOptions,
    headers,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body')
    throw new Error(`Worker API error ${res.status}: ${text.slice(0, 200)}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '')
    throw new Error(`Expected JSON from ${path} but got ${contentType || 'unknown'}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

export async function workerTextFetch(path: string, options?: WorkerTextFetchOptions): Promise<string> {
  const { expectedContentType, skipAuthHeader, ...fetchOptions } = options ?? {}
  const headers = await buildWorkerHeaders(fetchOptions.headers, { skipAuthHeader })
  const res = await fetch(`${WORKER_BASE}${path}`, {
    credentials: 'include',
    ...fetchOptions,
    headers,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => 'No response body')
    throw new Error(`Worker API error ${res.status}: ${text.slice(0, 200)}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (expectedContentType && !contentType.includes(expectedContentType)) {
    const text = await res.text().catch(() => '')
    throw new Error(`Expected ${expectedContentType} from ${path} but got ${contentType || 'unknown'}: ${text.slice(0, 200)}`)
  }
  return res.text()
}

async function buildWorkerHeaders(headers?: HeadersInit, options?: { skipAuthHeader?: boolean }) {
  const merged = new Headers(headers)
  if (!options?.skipAuthHeader && !merged.has('Authorization')) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token)
      merged.set('Authorization', `Bearer ${token}`)
  }
  return merged
}

export async function triggerCrawl(oemId: string) {
  return workerFetch(`/api/v1/oem-agent/admin/crawl/${oemId}`, { method: 'POST' })
}

export async function triggerCrawlAll() {
  return workerFetch(`/api/v1/oem-agent/admin/crawl`, { method: 'POST' })
}

export async function triggerForceCrawl(oemId: string) {
  return workerFetch(`/api/v1/oem-agent/admin/force-crawl/${oemId}`, { method: 'POST' })
}

export async function triggerDesignCapture(oemId: string) {
  return workerFetch(`/api/v1/oem-agent/admin/design-capture/${oemId}`, { method: 'POST' })
}

export interface AnalyzeBannerGraphicsRequest {
  banner_ids?: string[]
  oem_id?: string
  force?: boolean
  limit?: number
}

export async function analyzeBannerGraphics(request: AnalyzeBannerGraphicsRequest) {
  return workerFetch('/api/v1/oem-agent/admin/banners/analyze-graphics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}

export async function fetchCronJobs() {
  return workerFetch('/cron')
}

export async function triggerCronJob(jobId: string) {
  return workerFetch(`/cron/run/${jobId}`, { method: 'POST' })
}

export async function fetchCronRuns(jobId: string, limit = 20) {
  return workerFetch(`/cron/runs/${jobId}?limit=${limit}`)
}

export async function updateCronJobOverride(jobId: string, enabled: boolean) {
  return workerFetch(`/cron/jobs/${jobId}/override`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  })
}

export async function restartGateway() {
  return workerFetch('/api/admin/gateway/restart', { method: 'POST' })
}

export async function triggerR2Sync() {
  return workerFetch('/api/admin/storage/sync', { method: 'POST' })
}

export async function fetchWorkerHealth() {
  return workerFetch('/api/v1/oem-agent/health')
}

export async function fetchGeneratedPages(oemId: string) {
  return workerFetch(`/api/v1/oem-agent/pages?oemId=${oemId}`)
}

export async function fetchGeneratedPage(slug: string, options?: { includeRendered?: boolean, includeModes?: boolean }) {
  const params = new URLSearchParams()
  if (options?.includeRendered)
    params.set('includeRendered', 'true')
  if (options?.includeModes)
    params.set('includeModes', 'true')
  const query = params.toString()
  return workerFetch(`/api/v1/oem-agent/pages/${slug}${query ? `?${query}` : ''}`)
}

function publicationPath(pageId: string, action: string): string {
  return `/api/v1/oem-agent/admin/pages/${encodeURIComponent(pageId)}/publication/${action}`
}

export async function fetchModelPagePublicationState(pageId: string): Promise<PublicationHistoryResponse> {
  return parsePublicationHistoryResponse(await workerFetch(publicationPath(pageId, 'history')), pageId)
}

export async function buildModelPagePublicationCandidate(
  pageId: string,
  expectedDraftVersion: number,
): Promise<PublicationCandidateResponse> {
  const response = await workerFetch(publicationPath(pageId, 'candidate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expectedDraftVersion }),
  })
  return parsePublicationCandidateResponse(response)
}

export async function fetchModelPagePublicationCandidateHtml(
  pageId: string,
  revision: number,
): Promise<string> {
  return workerTextFetch(`${publicationPath(pageId, 'candidate-html')}?revision=${revision}`, {
    expectedContentType: 'text/html',
  })
}

export async function publishModelPagePublicationCandidate(
  pageId: string,
  input: PublishModelPagePublicationInput,
): Promise<PublicationTransitionResponse> {
  const response = await workerFetch(publicationPath(pageId, 'publish'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parsePublicationTransitionResponse(response, { action: 'publish', revision: input.revision })
}

export async function rollbackModelPagePublication(
  pageId: string,
  targetRevision: number,
): Promise<PublicationTransitionResponse> {
  const response = await workerFetch(publicationPath(pageId, 'rollback'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetRevision }),
  })
  return parsePublicationTransitionResponse(response, { action: 'rollback', targetRevision })
}

export async function fetchRecipes(oemId: string): Promise<Recipe[]> {
  const result = await workerFetch(`/api/v1/oem-agent/recipes/${oemId}`)
  return normalizeRecipesResponse(result)
}

export async function fetchAllRecipes(): Promise<{ brand_recipes: any[], default_recipes: any[] }> {
  return workerFetch('/api/v1/oem-agent/admin/recipes')
}

export async function saveRecipe(recipe: Omit<Recipe, 'id' | 'source'>): Promise<Recipe> {
  return workerFetch('/api/v1/oem-agent/admin/recipes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recipe),
  })
}

export async function deleteRecipe(id: string): Promise<void> {
  await workerFetch(`/api/v1/oem-agent/admin/recipes/${id}`, { method: 'DELETE' })
}

export interface ExtractedRecipe {
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any>
  confidence: number
  bounds?: { top_pct: number, height_pct: number }
}

export async function extractRecipesFromUrl(url: string, oemId: string): Promise<{ suggestions: ExtractedRecipe[], screenshot_base64: string }> {
  return workerFetch('/api/v1/oem-agent/admin/recipes/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, oem_id: oemId }),
  })
}

export async function uploadRecipeThumbnail(oemId: string, recipeKey: string, imageBase64: string): Promise<{ url: string }> {
  return workerFetch('/api/v1/oem-agent/admin/recipes/upload-thumbnail', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId, recipe_key: recipeKey, image_base64: imageBase64 }),
  })
}

export async function fetchWebhooks(): Promise<{ webhooks: Array<{ id: string, url: string, events: string[], created_at: string }> }> {
  return workerFetch('/api/v1/oem-agent/admin/webhooks')
}

export async function addWebhook(url: string, events: string[]): Promise<{ success: boolean, webhook: any }> {
  return workerFetch('/api/v1/oem-agent/admin/webhooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, events }),
  })
}

export async function deleteWebhook(id: string): Promise<{ success: boolean }> {
  return workerFetch(`/api/v1/oem-agent/admin/webhooks/${id}`, { method: 'DELETE' })
}

export async function scoreQuality(oemId: string, thumbnailBase64: string): Promise<{ score: number, feedback: string, scored_at: string }> {
  return workerFetch('/api/v1/oem-agent/admin/quality/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId, thumbnail_base64: thumbnailBase64 }),
  })
}

export async function fetchDesignHealth(): Promise<{ oems: Array<{ oem_id: string, last_crawled: string | null, token_count: number, has_fonts: boolean }> }> {
  return workerFetch('/api/v1/oem-agent/admin/design-health')
}

export async function checkDrift(oemId: string): Promise<{ oem_id: string, severity: string, changes: Array<{ field: string, current: string, crawled: string, changed: boolean }>, change_count: number, crawled_at: string }> {
  return workerFetch('/api/v1/oem-agent/admin/design-health/check-drift', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId }),
  })
}

export async function fetchPageTemplates(): Promise<{ templates: Array<{ id: string, name: string, category: string, description: string, sections: Array<{ type: string, defaults: any }> }> }> {
  return workerFetch('/api/v1/oem-agent/admin/page-templates')
}

export async function saveAsTemplate(name: string, category: string, description: string, oemId: string, modelSlug: string): Promise<{ success: boolean, template_id: string }> {
  return workerFetch('/api/v1/oem-agent/admin/page-templates/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, category, description, oem_id: oemId, model_slug: modelSlug }),
  })
}

export async function saveDealerOverrides(oemId: string, modelSlug: string, overrides: Record<string, string>): Promise<{ success: boolean }> {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/dealer-overrides/${oemId}/${modelSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(overrides),
  })
}

export async function getDealerOverrides(oemId: string, modelSlug: string): Promise<{ dealer_overrides: Record<string, string> }> {
  return workerFetch(`/api/v1/oem-agent/admin/dealer-overrides/${oemId}/${modelSlug}`)
}

export async function applyPageTemplate(templateId: string, oemId: string, modelSlug: string): Promise<{ success: boolean, slug: string, sections: number }> {
  assertModelPageWriteAllowed(oemId)
  return workerFetch('/api/v1/oem-agent/admin/page-templates/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId, oem_id: oemId, model_slug: modelSlug }),
  })
}

export async function fetchRecipeAnalytics(): Promise<{ total_brand: number, total_default: number, by_oem: Record<string, Record<string, number>>, by_pattern: Record<string, number>, gaps: Array<{ oem_id: string, missing_patterns: string[] }>, patterns: string[] }> {
  return workerFetch('/api/v1/oem-agent/admin/recipe-analytics')
}

export async function crawlLiveTokens(oemId: string, url: string): Promise<{ crawled: any, existing: any, diff: Array<{ field: string, current: string, crawled: string, changed: boolean }> }> {
  return workerFetch('/api/v1/oem-agent/admin/tokens/crawl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId, url }),
  })
}

export async function applyCrawledTokens(oemId: string, crawled: any): Promise<{ success: boolean }> {
  return workerFetch('/api/v1/oem-agent/admin/tokens/apply-crawled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId, crawled }),
  })
}

export async function generateRecipeComponent(oemId: string, recipe: ExtractedRecipe, thumbnailBase64?: string): Promise<{ success: boolean, template_html?: string, r2_key?: string, config_schema?: Record<string, any>, error?: string }> {
  return workerFetch('/api/v1/oem-agent/admin/recipes/generate-component', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ oem_id: oemId, recipe, thumbnail_base64: thumbnailBase64 }),
  })
}

export async function generatePage(oemId: string, modelSlug: string, modelOverride?: { provider: string, model: string }) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/generate-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelOverride }),
        }
      : {}),
  })
}

export type CloneCaptureBackend = 'cloudflare-browser' | 'scrapling-stealth'

export interface ClonePageOptions {
  sourceUrl?: string
  captureBackend?: CloneCaptureBackend
  capturedHtml?: string
  capturedTitle?: string
  finalUrl?: string
  stylesheetUrls?: string[]
}

export async function clonePage(oemId: string, modelSlug: string, sourceUrlOrOptions?: string | ClonePageOptions) {
  assertModelPageWriteAllowed(oemId)
  const options = typeof sourceUrlOrOptions === 'string'
    ? { sourceUrl: sourceUrlOrOptions }
    : sourceUrlOrOptions
  const bodyData: Record<string, unknown> = {}
  if (options?.sourceUrl)
    bodyData.source_url = options.sourceUrl
  if (options?.captureBackend)
    bodyData.capture_backend = options.captureBackend
  if (options?.capturedHtml)
    bodyData.captured_html = options.capturedHtml
  if (options?.capturedTitle)
    bodyData.captured_title = options.capturedTitle
  if (options?.finalUrl)
    bodyData.final_url = options.finalUrl
  if (options?.stylesheetUrls)
    bodyData.stylesheet_urls = options.stylesheetUrls
  const hasBody = Object.keys(bodyData).length > 0
  return workerFetch(`/api/v1/oem-agent/admin/clone-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(hasBody
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
        }
      : {}),
  })
}

export async function updateClonePage(oemId: string, modelSlug: string, payload: { edited_rendered: string, section_index?: any[] }) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/update-clone/${oemId}/${modelSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function structurePage(oemId: string, modelSlug: string, modelOverride?: { provider: string, model: string }) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/structure-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelOverride }),
        }
      : {}),
  })
}

export type CaptureStatus = 'ok' | 'blocked' | 'error'

export interface CaptureDiagnosticsRecord {
  oem_id: string
  model_slug: string
  captured_at: string
  status: CaptureStatus
  success: boolean
  bot_blocked: boolean
  backend?: string
  source_url: string
  final_url?: string
  capture_time_ms: number
  html_size_kb?: number
  elements_captured?: number
  images_uploaded?: number
  reason?: string
}

export interface CaptureDiagnosticsResponse {
  found: boolean
  oemId: string
  modelSlug: string
  latest?: CaptureDiagnosticsRecord
  history?: CaptureDiagnosticsRecord[]
}

/** Read persisted capture diagnostics (latest + recent history). Read-only. */
export async function fetchCaptureDiagnostics(oemId: string, modelSlug: string): Promise<CaptureDiagnosticsResponse> {
  return workerFetch(`/api/v1/oem-agent/admin/capture-diagnostics/${oemId}/${modelSlug}`)
}

/** Deterministic-first mapping preview (non-mutating). */
export async function mapPagePreview(oemId: string, modelSlug: string) {
  return workerFetch(`/api/v1/oem-agent/admin/map-page/${oemId}/${modelSlug}`, { method: 'POST' })
}

/** Deterministic-first mapping WITH persistence (AI fallback when low confidence). */
export async function mapAndStructurePage(oemId: string, modelSlug: string, modelOverride?: { provider: string, model: string }) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/map-and-structure/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelOverride }),
        }
      : {}),
  })
}

/** Compile a selected Clone Studio region artifact into a structured section draft. Non-mutating. */
export async function compileTailwindRecipeArtifact(artifact: any) {
  return workerFetch('/api/v1/oem-agent/admin/compile-tailwind-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact }),
  })
}

export async function updatePageSections(oemId: string, modelSlug: string, sections: any[]) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/update-sections/${oemId}/${modelSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections }),
  })
}

export async function regenerateSection(oemId: string, modelSlug: string, sectionId: string, sectionType: string) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/regenerate-section/${oemId}/${modelSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionId, sectionType }),
  })
}

export async function createCustomPage(oemId: string, slug: string, name: string) {
  assertModelPageWriteAllowed(oemId)
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug))
    throw new Error('Invalid slug format')
  if (!name?.trim())
    throw new Error('Name is required')
  return workerFetch(`/api/v1/oem-agent/admin/create-custom-page/${encodeURIComponent(oemId)}/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })
}

export async function deleteCustomPage(oemId: string, slug: string) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/delete-custom-page/${encodeURIComponent(oemId)}/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

export async function createSubpage(oemId: string, modelSlug: string, subpageSlug: string, name: string, subpageType?: string) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/create-subpage/${encodeURIComponent(oemId)}/${encodeURIComponent(modelSlug)}/${encodeURIComponent(subpageSlug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, subpage_type: subpageType }),
  })
}

export async function deleteSubpage(oemId: string, modelSlug: string, subpageSlug: string) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/delete-subpage/${encodeURIComponent(oemId)}/${encodeURIComponent(modelSlug)}/${encodeURIComponent(subpageSlug)}`, {
    method: 'DELETE',
  })
}

export interface AdaptivePipelineOptions {
  sourceUrl?: string
  modelOverride?: { provider: string, model: string }
  forceClone?: boolean
}

export type CompileRunStatusValue
  = | 'queued'
    | 'capturing'
    | 'segmenting'
    | 'compiling'
    | 'qa'
    | 'publishing'
    | 'succeeded'
    | 'failed'

export interface CompileRunStatus {
  runId: string
  status: CompileRunStatusValue
  stageLabel: string
  startedAt: string | null
  updatedAt: string | null
  completedAt: string | null
  error: string | null
  warnings: string[]
  artifacts: Array<{
    path: string
    contentType?: string
    bytes?: number
    sha256?: string
  }>
}

export async function adaptivePipeline(
  oemId: string,
  modelSlug: string,
  sourceUrlOrOptions?: string | AdaptivePipelineOptions,
  modelOverride?: { provider: string, model: string },
) {
  assertModelPageWriteAllowed(oemId)
  const options: AdaptivePipelineOptions = typeof sourceUrlOrOptions === 'string'
    ? { sourceUrl: sourceUrlOrOptions, modelOverride }
    : (sourceUrlOrOptions ?? {})
  const bodyData: Record<string, unknown> = {}
  if (options.sourceUrl)
    bodyData.source_url = options.sourceUrl
  if (options.modelOverride)
    bodyData.modelOverride = options.modelOverride
  if (options.forceClone)
    bodyData.force_clone = true
  const hasBody = Object.keys(bodyData).length > 0
  return workerFetch(`/api/v1/oem-agent/admin/adaptive-pipeline/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(hasBody
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
        }
      : {}),
  })
}

export async function fetchCompileRunStatus(oemId: string, modelSlug: string): Promise<CompileRunStatus> {
  return workerFetch(`/api/v1/oem-agent/admin/compile-status/${oemId}/${modelSlug}`)
}

export async function uploadMedia(oemId: string, modelSlug: string, file: File) {
  assertModelPageWriteAllowed(oemId)
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${WORKER_BASE}/api/v1/oem-agent/admin/upload-media/${oemId}/${modelSlug}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Upload failed ${res.status}: ${text}`)
  }
  return res.json() as Promise<{ success: boolean, url: string, filename: string, size: number, type: string }>
}

export interface MediaItem {
  key: string
  url: string
  filename: string
  size: number
  contentType: string
  modelSlug: string
  uploadedAt: string
}

export interface ListMediaResponse {
  success: boolean
  items: MediaItem[]
  cursor: string | null
}

export async function listMedia(oemId: string, options?: { modelSlug?: string, cursor?: string }): Promise<ListMediaResponse> {
  const params = new URLSearchParams()
  if (options?.modelSlug)
    params.set('modelSlug', options.modelSlug)
  if (options?.cursor)
    params.set('cursor', options.cursor)
  const qs = params.toString()
  const data: ListMediaResponse = await workerFetch(`/api/v1/oem-agent/admin/list-media/${oemId}${qs ? `?${qs}` : ''}`)
  for (const item of data.items) {
    if (item.url.startsWith('/')) {
      item.url = `${WORKER_BASE}${item.url}`
    }
  }
  return data
}

export async function fetchAiModelConfig() {
  return workerFetch('/api/v1/oem-agent/admin/ai-model-config')
}

export async function saveAiModelConfig(overrides: Record<string, { provider?: string, model?: string, fallbackProvider?: string, fallbackModel?: string }>) {
  return workerFetch('/api/v1/oem-agent/admin/ai-model-config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overrides }),
  })
}

export async function fetchBrandTokens(oemId: string): Promise<any> {
  return workerFetch(`/api/v1/oem-agent/admin/brand-tokens/${oemId}`)
}

export interface StyleGuideData {
  oem_id: string
  oem_name: string
  brand_tokens: Record<string, any> | null
  brand_recipes: any[]
  default_recipes: any[]
}

export async function fetchStyleGuide(oemId: string): Promise<StyleGuideData> {
  return workerFetch(`/api/v1/oem-agent/admin/style-guide/${oemId}`)
}

export async function fetchDesignMemory(oemId: string) {
  return workerFetch(`/api/v1/oem-agent/design-memory/${oemId}`)
}

export async function fetchExtractionRuns(oemId?: string, limit = 20) {
  const params = new URLSearchParams()
  if (oemId)
    params.set('oemId', oemId)
  params.set('limit', String(limit))
  return workerFetch(`/api/v1/oem-agent/extraction-runs?${params}`)
}

// ============================================================================
// Onboarding Wizard
// ============================================================================

export async function discoverOem(baseUrl: string, oemName?: string) {
  return workerFetch('/api/v1/oem-agent/admin/onboarding/discover', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl, oem_name: oemName || undefined }),
  })
}

export async function registerOem(payload: {
  oem_id: string
  oem_name: string
  base_url: string
  brand_color?: string
  source_pages: Array<{ url: string, page_type: string }>
  config: Record<string, unknown>
  flags: Record<string, unknown>
  discovered_apis?: Array<{ url: string, method: string, data_type: string, content_type?: string, notes?: string }>
}) {
  return workerFetch('/api/v1/oem-agent/admin/onboarding/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function generateOnboardingSnippets(payload: {
  oem_id: string
  oem_name: string
  base_url: string
  brand_color?: string
  config: Record<string, unknown>
  flags: Record<string, unknown>
  source_pages: Array<{ url: string, page_type: string }>
  notes?: string
}) {
  return workerFetch('/api/v1/oem-agent/admin/onboarding/generate-snippets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// ============================================================================
// Legacy UIkit Importer
// ============================================================================

export async function previewLegacyImport(url?: string, json?: any) {
  return workerFetch('/api/v1/oem-agent/admin/preview-legacy-import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(url ? { url } : { json }),
  })
}

export async function importLegacyPage(oemId: string, modelSlug: string, url?: string, json?: any) {
  assertModelPageWriteAllowed(oemId)
  return workerFetch(`/api/v1/oem-agent/admin/import-legacy/${encodeURIComponent(oemId)}/${encodeURIComponent(modelSlug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(url ? { url } : { json }),
  })
}
