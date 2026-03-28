const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

export async function workerFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    credentials: 'include',
    ...options,
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

export async function fetchGeneratedPage(slug: string) {
  return workerFetch(`/api/v1/oem-agent/pages/${slug}`)
}

export interface Recipe {
  id: string
  oem_id: string | null
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any>
  source: 'brand' | 'default'
}

export async function fetchRecipes(oemId: string): Promise<Recipe[]> {
  const result = await workerFetch(`/api/v1/oem-agent/recipes/${oemId}`)
  return result.recipes ?? []
}

export async function fetchAllRecipes(): Promise<{ brand_recipes: any[]; default_recipes: any[] }> {
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

export async function generatePage(oemId: string, modelSlug: string, modelOverride?: { provider: string; model: string }) {
  return workerFetch(`/api/v1/oem-agent/admin/generate-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelOverride }),
    } : {}),
  })
}

export async function clonePage(oemId: string, modelSlug: string, sourceUrl?: string, modelOverride?: { provider: string; model: string }) {
  const bodyData: Record<string, unknown> = {}
  if (sourceUrl) bodyData.source_url = sourceUrl
  if (modelOverride) bodyData.modelOverride = modelOverride
  const hasBody = Object.keys(bodyData).length > 0
  return workerFetch(`/api/v1/oem-agent/admin/clone-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(hasBody ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    } : {}),
  })
}

export async function structurePage(oemId: string, modelSlug: string, modelOverride?: { provider: string; model: string }) {
  return workerFetch(`/api/v1/oem-agent/admin/structure-page/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(modelOverride ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelOverride }),
    } : {}),
  })
}

export async function updatePageSections(oemId: string, modelSlug: string, sections: any[]) {
  return workerFetch(`/api/v1/oem-agent/admin/update-sections/${oemId}/${modelSlug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sections }),
  })
}

export async function regenerateSection(oemId: string, modelSlug: string, sectionId: string, sectionType: string) {
  return workerFetch(`/api/v1/oem-agent/admin/regenerate-section/${oemId}/${modelSlug}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sectionId, sectionType }),
  })
}

export async function createCustomPage(oemId: string, slug: string, name: string) {
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error('Invalid slug format')
  if (!name?.trim()) throw new Error('Name is required')
  return workerFetch(`/api/v1/oem-agent/admin/create-custom-page/${encodeURIComponent(oemId)}/${encodeURIComponent(slug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  })
}

export async function deleteCustomPage(oemId: string, slug: string) {
  return workerFetch(`/api/v1/oem-agent/admin/delete-custom-page/${encodeURIComponent(oemId)}/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

export async function createSubpage(oemId: string, modelSlug: string, subpageSlug: string, name: string, subpageType?: string) {
  return workerFetch(`/api/v1/oem-agent/admin/create-subpage/${encodeURIComponent(oemId)}/${encodeURIComponent(modelSlug)}/${encodeURIComponent(subpageSlug)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, subpage_type: subpageType }),
  })
}

export async function deleteSubpage(oemId: string, modelSlug: string, subpageSlug: string) {
  return workerFetch(`/api/v1/oem-agent/admin/delete-subpage/${encodeURIComponent(oemId)}/${encodeURIComponent(modelSlug)}/${encodeURIComponent(subpageSlug)}`, {
    method: 'DELETE',
  })
}

export async function adaptivePipeline(oemId: string, modelSlug: string, sourceUrl?: string, modelOverride?: { provider: string; model: string }) {
  const bodyData: Record<string, unknown> = {}
  if (sourceUrl) bodyData.source_url = sourceUrl
  if (modelOverride) bodyData.modelOverride = modelOverride
  const hasBody = Object.keys(bodyData).length > 0
  return workerFetch(`/api/v1/oem-agent/admin/adaptive-pipeline/${oemId}/${modelSlug}`, {
    method: 'POST',
    ...(hasBody ? {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
    } : {}),
  })
}

export async function uploadMedia(oemId: string, modelSlug: string, file: File) {
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
  return res.json() as Promise<{ success: boolean; url: string; filename: string; size: number; type: string }>
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

export async function listMedia(oemId: string, options?: { modelSlug?: string; cursor?: string }): Promise<ListMediaResponse> {
  const params = new URLSearchParams()
  if (options?.modelSlug) params.set('modelSlug', options.modelSlug)
  if (options?.cursor) params.set('cursor', options.cursor)
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

export async function saveAiModelConfig(overrides: Record<string, { provider?: string; model?: string; fallbackProvider?: string; fallbackModel?: string }>) {
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
  if (oemId) params.set('oemId', oemId)
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
  source_pages: Array<{ url: string; page_type: string }>
  config: Record<string, unknown>
  flags: Record<string, unknown>
  discovered_apis?: Array<{ url: string; method: string; data_type: string; content_type?: string; notes?: string }>
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
  source_pages: Array<{ url: string; page_type: string }>
  notes?: string
}) {
  return workerFetch('/api/v1/oem-agent/admin/onboarding/generate-snippets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
