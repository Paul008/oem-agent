<script lang="ts" setup>
import { Code2, Columns2, ExternalLink, Eye, FileCode, Loader2, Lock, Monitor, Pencil, Save, Smartphone, Tablet, Wand2 } from 'lucide-vue-next'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'

import type { RegionActionId } from '@/pages/dashboard/components/page-builder/region-actions'
import type { CloneRegion } from '@/pages/dashboard/page-builder/page-modes'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { resolvePublicationPreviewView, useModelPagePublication } from '@/composables/use-model-page-publication'
import { useOemData } from '@/composables/use-oem-data'
import { usePageBuilder } from '@/composables/use-page-builder'
import { getModelPageWriteProtectedMessage, isModelPageWriteProtected } from '@/lib/oem-ids'
import { scopeOemSection } from '@/lib/scope-oem-section'
import { compileTailwindRecipeArtifact, fetchStyleGuide } from '@/lib/worker-api'
import { buildCatalogSectionsFromModel, buildEditableSectionFromCloneRegion, buildPreviewReplacementHtmlFromCloneRegion, convertCloneRegionsToTailwindSections, extractTailwindRecipeArtifactCss } from '@/pages/dashboard/components/page-builder/clone-region-converter'
import { buildCloneStudioFrameHtmlForCanvas } from '@/pages/dashboard/components/page-builder/clone-studio-canvas-helpers'
import FidelityAssistantDialog from '@/pages/dashboard/components/page-builder/FidelityAssistantDialog.vue'
import PageBuilderCanvas from '@/pages/dashboard/components/page-builder/PageBuilderCanvas.vue'
import PublicationControls from '@/pages/dashboard/components/page-builder/PublicationControls.vue'
import SectionEditorDialog from '@/pages/dashboard/components/page-builder/SectionEditorDialog.vue'

// Standalone, chrome-free preview of a model page as the builder renders it.
// Reuses PageBuilderCanvas so clone and structured pages render faithfully. Non-protected pages keep
// the same right-click editing affordances as the builder, with a small preview-local save bar.
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'
type PreviewView = 'edit' | 'production' | 'candidate' | 'source' | 'compare' | 'standalone'
type CandidatePreviewWidth = 'desktop' | 'tablet' | 'mobile'
type CompareLayoutMode = 'accurate' | 'fit'
interface StyleGuideFontFace {
  family: string
  weight?: string | number
  style?: string
  url: string
}

const route = useRoute()
const {
  page,
  loading,
  saving,
  error,
  isDirty,
  sections,
  selectedSectionId,
  selectedCloneRegionId,
  activeMode,
  isCloned,
  isStructured,
  cloneHtml,
  cloneRegions,
  cloneRegionsForSave,
  selectedCloneRegionData,
  oemId,
  modelSlug,
  loadPage,
  selectSection,
  deleteSection,
  moveSection,
  duplicateSection,
  updateSection,
  addSectionFromLiveData,
  replaceSections,
  saveSections,
  saveClone,
  setActiveMode,
  selectCloneRegion,
  setRegionHeight,
  addCloneRegion,
  regenerating,
  regenerateSectionById,
  convertSection,
} = usePageBuilder()

const pageBuilderCanvas = ref<{
  patchCloneField: (payload: Record<string, unknown>) => void
  duplicateRegion: (regionId: string) => void
  collectCloneRegions: () => Promise<CloneRegion[]>
} | null>(null)
const cloneDraftHtml = ref<string | null>(null)
const convertingCloneRegion = ref(false)
const convertingPage = ref(false)
const fidelityOpen = ref(false)
const fidelityRegionId = ref('')
const fidelityOriginalHtml = ref('')
const fidelityOriginalCss = ref('')
const fidelityCandidateSection = ref<Record<string, any> | null>(null)
const editorSectionId = ref<string | null>(null)
const styleGuideTokens = ref<Record<string, any> | null>(null)
const compareLayoutMode = ref<CompareLayoutMode>('accurate')
const pageSlug = computed(() => (route.params as { slug?: string }).slug ?? '')
const publicationPageId = computed(() => pageSlug.value || null)
const draftVersion = computed(() => {
  const version = Number(page.value?.version)
  return Number.isInteger(version) && version > 0 ? version : null
})
const publication = useModelPagePublication({ pageId: publicationPageId, draftVersion })
const candidatePreviewWidth = ref<CandidatePreviewWidth>('desktop')
const publicationStateLoaded = ref(false)
const candidatePreviewClass = computed(() => {
  if (candidatePreviewWidth.value === 'tablet')
    return 'w-[768px] max-w-full'
  if (candidatePreviewWidth.value === 'mobile')
    return 'w-[375px] max-w-full'
  return 'w-full'
})
const builderUrl = computed(() => pageSlug.value ? `/dashboard/page-builder/${pageSlug.value}` : '/dashboard/model-pages')
const isWriteProtectedPage = computed(() => isModelPageWriteProtected(oemId.value))
const writeProtectedMessage = computed(() => getModelPageWriteProtectedMessage(page.value?.name ?? oemId.value))
const previewView = ref<PreviewView>(normalizePreviewView(route.query.view))
const isProductionView = computed(() => previewView.value === 'production')
const isCandidateView = computed(() => previewView.value === 'candidate')
const isSourceView = computed(() => previewView.value === 'source')
const isCompareView = computed(() => previewView.value === 'compare')
const isStandaloneView = computed(() => previewView.value === 'standalone')
const previewReadOnly = computed(() => isWriteProtectedPage.value || isProductionView.value || isCandidateView.value || isSourceView.value || isCompareView.value || isStandaloneView.value)

const canEditPreview = computed(() => !previewReadOnly.value)
const hasTailwindSource = computed(() => Boolean(
  activeMode.value === 'sections'
  && sections.value.some((section: any) => Boolean(section?._tailwind_conversion || String(section?._generated_html || '').trim())),
))
const hasTailwindCompare = computed(() => Boolean(
  activeMode.value === 'sections'
  && sections.value.some((section: any) => Boolean(section?._tailwind_conversion && tailwindCompareOriginalHtml(section) && tailwindCompareConvertedHtml(section))),
))
const editorSection = computed(() =>
  editorSectionId.value ? sections.value.find((section: any) => section.id === editorSectionId.value) ?? null : null,
)
const selectedCloneRegion = computed(() => {
  if (!selectedCloneRegionId.value)
    return null
  if (selectedCloneRegionData.value && selectedCloneRegionData.value.id === selectedCloneRegionId.value)
    return selectedCloneRegionData.value
  return cloneRegions.value.find(region => region.id === selectedCloneRegionId.value) ?? null
})
const canConvertSelectedCloneRegion = computed(() => Boolean(
  canEditPreview.value
  && activeMode.value === 'clone'
  && selectedCloneRegion.value
  && (selectedCloneRegion.value.html || selectedCloneRegion.value.tailwindRecipeArtifact),
))
const canConvertPageToTailwind = computed(() => Boolean(
  canEditPreview.value
  && activeMode.value === 'clone'
  && isCloned.value,
))
const { fetchProductsForModel, fetchVariantColors } = useOemData()
const catalogModelSlug = computed(() =>
  modelSlug.value.includes('--') ? modelSlug.value.split('--')[0] : modelSlug.value,
)

function normalizePreviewView(value: unknown): PreviewView {
  const raw = Array.isArray(value) ? value[0] : value
  return raw === 'production' || raw === 'candidate' || raw === 'source' || raw === 'compare' || raw === 'standalone' ? raw : 'edit'
}

function shouldLoadStyleGuideForPreview(view: PreviewView): boolean {
  return view === 'compare'
}

onMounted(async () => {
  const slug = pageSlug.value
  if (slug) {
    await loadPage(slug)
    await refreshPublicationState()
  }
})

watch([oemId, previewView], async ([nextOemId, nextPreviewView]) => {
  styleGuideTokens.value = null
  if (!nextOemId)
    return
  if (!shouldLoadStyleGuideForPreview(nextPreviewView))
    return
  try {
    const guide = await fetchStyleGuide(nextOemId)
    styleGuideTokens.value = guide?.brand_tokens ?? null
  }
  catch {
    styleGuideTokens.value = null
  }
}, { immediate: true })

watch(
  () => route.query.view,
  (value) => {
    const requestedView = normalizePreviewView(value)
    const resolvedView = publicationStateLoaded.value
      ? resolvePublicationPreviewView(
        requestedView,
        publication.status.value,
        publication.candidatePreviewUrl.value,
      ) as PreviewView
      : requestedView
    previewView.value = resolvedView
    if (resolvedView !== requestedView)
      replacePreviewViewQuery(resolvedView)
  },
)

watch(
  [publication.status, publication.candidatePreviewUrl],
  () => {
    if (publicationStateLoaded.value)
      enforceCandidatePreviewRoute()
  },
  { flush: 'post' },
)

function setPreviewView(view: PreviewView) {
  previewView.value = view
  replacePreviewViewQuery(view)
}

function replacePreviewViewQuery(view: PreviewView) {
  // Use History directly to preserve unsaved converted sections when toggling Source/Production.
  if (typeof window === 'undefined')
    return
  const query = { ...route.query }
  if (view === 'production')
    query.view = 'production'
  else if (view === 'candidate')
    query.view = 'candidate'
  else if (view === 'source')
    query.view = 'source'
  else if (view === 'compare')
    query.view = 'compare'
  else if (view === 'standalone')
    query.view = 'standalone'
  else
    delete query.view

  const url = new URL(window.location.href)
  url.search = ''
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null)
          url.searchParams.append(key, String(item))
      }
    }
    else if (value != null) {
      url.searchParams.set(key, String(value))
    }
  }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

function tailwindSectionSource(section: any): string {
  const html = section?._generated_html || section?.content_html || section?.body_html || ''
  const leftoverCss = typeof section?._tailwind_leftover_css === 'string' ? section._tailwind_leftover_css.trim() : ''
  const conversion = section?._tailwind_conversion
  const stats = conversion?.stats
  const summarySource = conversion && typeof conversion === 'object'
    ? `/* Tailwind Compiler Summary */\n${JSON.stringify({
      source: conversion.source,
      compiled_source: conversion.compiled_source,
      template_kind: conversion.template_kind,
      confidence: conversion.confidence,
      computed_snapshots: conversion.stats?.computed_snapshots,
      parity_risks: conversion.parity_risks || [],
      extracted_schema: conversion.extracted_schema,
    }, null, 2)}`
    : ''
  const statsSource = stats && typeof stats === 'object'
    ? `/* Tailwind Conversion Stats */\n${JSON.stringify(stats, null, 2)}`
    : ''
  const suffix = [summarySource, statsSource, leftoverCss ? `/* Leftover CSS */\n${leftoverCss}` : ''].filter(Boolean).join('\n\n')
  if (typeof html === 'string' && html.trim()) {
    const trimmedHtml = html.trim()
    return suffix ? `${trimmedHtml}\n\n${suffix}` : trimmedHtml
  }
  if (suffix)
    return suffix
  return JSON.stringify(section, null, 2)
}

function tailwindCompareOriginalHtml(section: any): string {
  return typeof section?._tailwind_original_html === 'string' ? section._tailwind_original_html.trim() : ''
}

function tailwindCompareConvertedHtml(section: any): string {
  const html = section?._generated_html || section?.content_html || section?.body_html || ''
  return typeof html === 'string' ? html.trim() : ''
}

function tailwindLeftoverCss(section: any): string {
  return typeof section?._tailwind_leftover_css === 'string'
    ? section._tailwind_leftover_css.trim()
    : ''
}

function hasTailwindLeftoverCss(section: any): boolean {
  return Boolean(tailwindLeftoverCss(section))
}

function unsupportedDeclarationSamples(section: any): string[] {
  const samples = section?._tailwind_conversion?.stats?.unsupported_declaration_samples
  return Array.isArray(samples)
    ? samples.map(sample => String(sample || '').trim()).filter(Boolean)
    : []
}

function hasUnsupportedDeclarationSamples(section: any): boolean {
  return unsupportedDeclarationSamples(section).length > 0
}

function tailwindCompareSrcdoc(html: string, label: string, section?: any): string {
  const safeLabel = escapeHtml(label)
  const body = stripUnsafeCompareHtml(html) || `<div class="empty">${safeLabel} unavailable</div>`
  const tailwindRuntime = '<script>window.tailwind=window.tailwind||{};window.tailwind.config={corePlugins:{preflight:false}}<\/script><script src="https://cdn.tailwindcss.com"><\/script>'
  const supplementalCss = sanitizeCompareCss([
    styleGuideFontCss(),
    typeof section?._tailwind_leftover_css === 'string' ? section._tailwind_leftover_css : '',
  ].filter(Boolean).join('\n'))
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${tailwindRuntime}<style>${supplementalCss}\nhtml,body{margin:0;min-height:100%;font-family:${styleGuideBodyFontFamily()};background:#fff;color:#111}.empty{display:grid;min-height:180px;place-items:center;color:#64748b;font:500 13px/1.5 ${styleGuideBodyFontFamily()}}</style></head><body>${body}</body></html>`
}

function standaloneBaseHref(): string {
  const raw = page.value?.source_url || page.value?.url || page.value?.content?.source_url
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const url = new URL(raw.trim())
      const lastSegment = url.pathname.split('/').pop() || ''
      // If the URL path looks like a directory (no dot in final segment), ensure a trailing
      // slash so relative asset URLs resolve inside that directory instead of its parent.
      if (lastSegment && !lastSegment.includes('.') && !url.pathname.endsWith('/'))
        url.pathname += '/'
      return url.href
    }
    catch {
      return raw.trim()
    }
  }
  return ''
}

function buildStandaloneHtml(): string {
  const baseHref = standaloneBaseHref()

  // For cloned pages, reuse the Clone Studio frame builder so original stylesheets,
  // media proxying, and the captured body all render exactly like the production view.
  if (activeMode.value === 'clone' && page.value) {
    return buildCloneStudioFrameHtmlForCanvas({
      page: page.value,
      title: page.value?.name || pageSlug.value,
      baseHref: baseHref || WORKER_BASE,
      workerBase: WORKER_BASE,
      selectedRegionId: null,
      bridgeToken: '',
      oemId: oemId.value,
      modelSlug: modelSlug.value,
      editable: false,
    })
  }

  const baseTag = baseHref ? `<base href="${escapeHtml(baseHref)}" target="_blank">` : ''
  const head = `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(page.value?.name || pageSlug.value)}</title>${baseTag}<style>html,body{margin:0;padding:0;}</style>`

  const parts: string[] = []
  for (const section of sections.value) {
    const html = String(section?._generated_html || section?.content_html || section?.body_html || '').trim()
    if (!html)
      continue

    const css = typeof section?._generated_css === 'string' ? section._generated_css.trim() : ''
    if (css) {
      const scoped = scopeOemSection({ html, css }, section.id)
      parts.push(`<style data-section-id="${escapeHtml(section.id)}">${scoped.css}</style>`)
      parts.push(`<div class="${scoped.scopeClass}">${scoped.html}</div>`)
    }
    else {
      parts.push(html)
    }
  }

  const body = parts.length
    ? parts.join('\n')
    : '<div style="padding:2rem;font-family:system-ui,sans-serif;color:#64748b">No captured HTML sections to render.</div>'

  return `<!doctype html><html><head>${head}</head><body>${body}</body></html>`
}

function openStandaloneHtml() {
  const html = buildStandaloneHtml()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  // Expose the URL so tests and automation can navigate to the blob directly.
  ;(window as any).__lastStandaloneBlobUrl = url
  window.open(url, '_blank')
}

function tailwindCompareViewportWidth(section: any): number {
  const width = Number(section?._tailwind_conversion?.viewport?.width)
  if (Number.isFinite(width) && width >= 320)
    return Math.min(Math.max(Math.round(width), 1280), 1920)
  return 1280
}

function tailwindCompareViewportHeight(section: any): number {
  const height = Number(section?._tailwind_conversion?.viewport?.height)
  if (Number.isFinite(height) && height >= 320)
    return Math.min(Math.max(Math.round(height), 720), 1600)
  return 720
}

function comparePaneId(section: any, pane: 'original' | 'converted'): string {
  const raw = String(section?.id || section?.name || 'section')
  const safe = raw.replace(/[^\w-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `compare-${pane}-${safe || 'section'}`
}

function scrollComparePane(section: any, pane: 'original' | 'converted') {
  if (typeof document === 'undefined')
    return
  document.getElementById(comparePaneId(section, pane))?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  })
}

function styleGuideFontCss(): string {
  const faces = styleGuideFontFaces()
  if (!faces.length)
    return ''

  return faces
    .map((face) => {
      const family = sanitizeCssString(face?.family || '')
      const url = sanitizeCssUrl(face?.url || '')
      if (!family || !url)
        return ''
      const weight = sanitizeCssToken(face?.weight || '400')
      const style = sanitizeCssToken(face?.style || 'normal')
      const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
      const fmt = ext === 'woff2' ? 'woff2' : ext === 'ttf' ? 'truetype' : 'woff'
      return `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url('${url}') format('${fmt}');font-display:swap;}`
    })
    .filter(Boolean)
    .join('\n')
}

function styleGuideBodyFontFamily(): string {
  const family = String(styleGuideTokens.value?.typography?.font_primary || '').trim()
  return family ? sanitizeCssFontFamily(family) : 'Inter,Arial,sans-serif'
}

function styleGuideFontFaces(): StyleGuideFontFace[] {
  const typography = styleGuideTokens.value?.typography
  const faces = typography?.font_faces
  if (Array.isArray(faces) && faces.length)
    return faces

  const cdnUrls = typography?.font_cdn_urls
  if (Array.isArray(cdnUrls) && cdnUrls.length) {
    const primaryFamily = firstFontFamily(String(typography?.font_primary || ''))
    return cdnUrls
      .map((url: unknown) => {
        const filename = String(url || '').split('/').pop() || ''
        return {
          family: primaryFamily,
          weight: fontWeightFromFilename(filename),
          url: String(url || ''),
        }
      })
      .filter(face => Boolean(face.family && face.url))
  }

  return []
}

function firstFontFamily(value: string): string {
  return sanitizeCssString(value.split(',')[0] || '')
}

function fontWeightFromFilename(filename: string): string {
  const normalized = filename.toLowerCase()
  if (normalized.includes('bold'))
    return '700'
  if (normalized.includes('medium'))
    return '500'
  if (normalized.includes('light'))
    return '300'
  return '400'
}

function sanitizeCssString(value: unknown): string {
  return String(value || '').replace(/['"\\<>]/g, '').trim()
}

function sanitizeCssToken(value: unknown): string {
  return String(value || '').replace(/[^\w .-]/g, '').trim() || 'normal'
}

function sanitizeCssUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (!/^https?:\/\//i.test(raw) && !raw.startsWith('/'))
    return ''
  return raw.replace(/['"\\<>\s]/g, '')
}

function sanitizeCssFontFamily(value: string): string {
  return value
    .split(',')
    .map(part => sanitizeCssString(part).replace(/\s+/g, ' '))
    .filter(Boolean)
    .join(',')
    || 'Inter,Arial,sans-serif'
}

function sanitizeCompareCss(css: string): string {
  return String(css || '')
    .replace(/<\/style/gi, '<\\/style')
    .replace(/<script/gi, '<\\script')
    .replace(/javascript:/gi, '')
    .replace(/expression\s*\(/gi, '')
}

function stripUnsafeCompareHtml(html: string): string {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(["']).*?\1/gi, '')
    .trim()
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function computedDeclarations(section: any): number {
  return Number(section?._tailwind_conversion?.stats?.computed_declarations) || 0
}

function mappedDeclarations(section: any): number {
  return Number(section?._tailwind_conversion?.stats?.mapped_declarations) || 0
}

function hasComputedDeclarationStats(section: any): boolean {
  return computedDeclarations(section) > 0
}

function compareMappingSummary(section: any): string {
  if (!hasComputedDeclarationStats(section))
    return 'No computed snapshots'
  return `${mappedDeclarations(section)} / ${computedDeclarations(section)} mapped`
}

function mappedDeclarationRate(section: any): string {
  const computed = computedDeclarations(section)
  if (!computed)
    return 'N/A'
  return `${Math.round((mappedDeclarations(section) / computed) * 100)}%`
}

function compareReadinessLabel(section: any): string {
  if (!hasComputedDeclarationStats(section))
    return 'Capture incomplete'

  const stats = section?._tailwind_conversion?.stats || {}
  const explicitRisks = Array.isArray(section?._tailwind_conversion?.parity_risks)
    ? section._tailwind_conversion.parity_risks
    : []
  const coverage = mappedDeclarations(section) / computedDeclarations(section)
  const hasRiskSignals = Boolean(
    explicitRisks.length
    || Number(stats.leftover_declarations)
    || Number(stats.leftover_rules)
    || Number(stats.unmatched_rules)
    || Number(stats.unresolved_var_count)
    || Number(stats.calc_count)
    || Number(stats.important_count),
  )

  return coverage >= 0.95 && !hasRiskSignals ? 'Ready' : 'Needs review'
}

function compareReadinessClass(section: any): string {
  const label = compareReadinessLabel(section)
  if (label === 'Ready')
    return 'bg-emerald-500 text-emerald-950'
  if (label === 'Needs review')
    return 'bg-amber-400 text-amber-950'
  return 'bg-slate-600 text-white'
}

function comparePageReadinessSummary(): { ready: number, review: number, incomplete: number, total: number } {
  return sections.value.reduce((summary, section: any) => {
    const label = compareReadinessLabel(section)
    if (label === 'Ready')
      summary.ready += 1
    else if (label === 'Needs review')
      summary.review += 1
    else
      summary.incomplete += 1
    summary.total += 1
    return summary
  }, { ready: 0, review: 0, incomplete: 0, total: 0 })
}

function comparePageReadinessLabel(): string {
  const summary = comparePageReadinessSummary()
  if (!summary.total)
    return 'No converted sections'
  return summary.review || summary.incomplete ? 'Action required' : 'Page ready'
}

function comparePageReadinessClass(): string {
  const label = comparePageReadinessLabel()
  if (label === 'Page ready')
    return 'bg-emerald-500 text-emerald-950'
  if (label === 'Action required')
    return 'bg-amber-400 text-amber-950'
  return 'bg-slate-600 text-white'
}

function computedSnapshotCount(section: any): number {
  return Number(section?._tailwind_conversion?.stats?.computed_snapshots) || 0
}

function compareRiskSummary(section: any): string {
  const explicitRisks = Array.isArray(section?._tailwind_conversion?.parity_risks)
    ? section._tailwind_conversion.parity_risks
    : []
  if (explicitRisks.length)
    return explicitRisks.join(' · ')

  const stats = section?._tailwind_conversion?.stats || {}
  const risks = [
    Number(stats.leftover_declarations) ? `${Number(stats.leftover_declarations)} unmapped` : '',
    Number(stats.leftover_rules) ? `${Number(stats.leftover_rules)} leftover rules` : '',
    Number(stats.unmatched_rules) ? `${Number(stats.unmatched_rules)} dead rules` : '',
    Number(stats.unresolved_var_count) ? `${Number(stats.unresolved_var_count)} var()` : '',
    Number(stats.calc_count) ? `${Number(stats.calc_count)} calc()` : '',
    Number(stats.important_count) ? `${Number(stats.important_count)} !important` : '',
  ].filter(Boolean)
  return risks.length ? risks.join(' · ') : 'No conversion risk flags'
}

function compareTemplateSummary(section: any): string {
  const kind = section?._tailwind_conversion?.template_kind || 'unknown'
  const confidence = Number(section?._tailwind_conversion?.confidence)
  return Number.isFinite(confidence)
    ? `${kind} · ${Math.round(confidence * 100)}% confidence`
    : kind
}

function openEditor(id: string) {
  selectSection(id)
  if (previewReadOnly.value)
    return
  editorSectionId.value = id
}

function closeEditor() {
  editorSectionId.value = null
}

function updateEditorSection(updates: Record<string, any>) {
  if (previewReadOnly.value)
    return
  if (editorSectionId.value)
    updateSection(editorSectionId.value, updates)
}

function onCloneDomUpdated(html: string) {
  if (previewReadOnly.value)
    return
  cloneDraftHtml.value = html
  isDirty.value = true
}

function onCloneRegionAdded(region: CloneRegion) {
  if (previewReadOnly.value)
    return
  addCloneRegion(region)
}

function onCloneRegionSelected(region: CloneRegion) {
  selectCloneRegion(region)
}

function patchCloneField(payload: Record<string, unknown>) {
  if (previewReadOnly.value)
    return
  pageBuilderCanvas.value?.patchCloneField(payload)
}

function onUpdateField(id: string, field: string, value: any) {
  if (previewReadOnly.value)
    return
  if (activeMode.value === 'clone' && field === 'height_override') {
    setRegionHeight(id, value == null ? null : Number(value))
    return
  }
  updateSection(id, { [field]: value })
}

async function onRegionAction({ action, regionId, html, tailwindRecipeArtifact }: { action: RegionActionId, regionId: string, html?: string, tailwindRecipeArtifact?: any }) {
  if (previewReadOnly.value)
    return

  if (action === 'delete' || action === 'hide') {
    const selector = `[data-oem-region-id="${regionId}"]`
    patchCloneField({
      regionId,
      fieldId: `${regionId}:visibility`,
      selector,
      kind: 'visibility',
      value: false,
    })
    return
  }

  if (action === 'duplicate') {
    pageBuilderCanvas.value?.duplicateRegion(regionId)
    return
  }

  if (action === 'match-oem') {
    const section = await buildEditableSectionFromCloneRegion({
      html,
      tailwindRecipeArtifact,
      compileTailwindRecipeArtifact,
    })
    if (!section || !html?.trim()) {
      toast.error('This region does not include enough captured HTML to compare')
      return
    }
    fidelityRegionId.value = regionId
    fidelityOriginalHtml.value = html
    fidelityOriginalCss.value = extractTailwindRecipeArtifactCss(tailwindRecipeArtifact)
    fidelityCandidateSection.value = {
      ...section,
      _clone_region_id: regionId,
      _tailwind_original_html: html,
    }
    fidelityOpen.value = true
    return
  }

  if (action === 'convert' || action === 'convert-tailwind-selected') {
    await replaceCloneRegionWithTailwind({ regionId, html, tailwindRecipeArtifact })
    return
  }

  if (action === 'convert-tailwind-all') {
    await convertPageToTailwind()
    return
  }

  if (action === 'bind-catalog') {
    if (!oemId.value) {
      toast.error('Model context is required to bind catalog data')
      return
    }
    if (!catalogModelSlug.value) {
      toast.error('Model slug is not available for this page')
      return
    }
    try {
      const products = await fetchProductsForModel(oemId.value, catalogModelSlug.value)
      if (!products.length) {
        toast.error(`No catalog products found for ${catalogModelSlug.value}`)
        return
      }
      const productIds = products.map(product => product.id)
      const variantColors = productIds.length ? await fetchVariantColors(productIds) : []
      const sectionsToInsert = buildCatalogSectionsFromModel({
        oemId: oemId.value,
        modelSlug: catalogModelSlug.value,
        regionId,
        products,
        variantColors,
      })
      for (const section of sectionsToInsert)
        addSectionFromLiveData(section)
      setActiveMode('sections')
      toast.success('Model catalog data added to page sections')
    }
    catch (error: any) {
      toast.error(`Failed to bind catalog data: ${error?.message || 'Unknown error'}`)
    }
  }
}

function applyFidelityCandidate(section: Record<string, any>) {
  if (!fidelityOpen.value || previewReadOnly.value)
    return
  addSectionFromLiveData(section)
  setActiveMode('sections')
  fidelityOpen.value = false
  toast.success('OEM-matched conversion added to the unsaved draft')
}

async function convertSelectedCloneRegionToTailwind() {
  if (!canConvertSelectedCloneRegion.value)
    return

  convertingCloneRegion.value = true
  try {
    await replaceCloneRegionWithTailwind({
      regionId: selectedCloneRegion.value?.id,
      html: selectedCloneRegion.value?.html,
      tailwindRecipeArtifact: selectedCloneRegion.value?.tailwindRecipeArtifact,
    })
  }
  catch (error: any) {
    toast.error(`Failed to convert region: ${error?.message || 'Unknown error'}`)
  }
  finally {
    convertingCloneRegion.value = false
  }
}

async function replaceCloneRegionWithTailwind(input: { regionId?: string | null, html?: string | null, tailwindRecipeArtifact?: any }) {
  const regionId = input.regionId || selectedCloneRegion.value?.id
  if (!regionId) {
    toast.error('Select a clone region first')
    return
  }

  const replacementHtml = await buildPreviewReplacementHtmlFromCloneRegion({
    regionId,
    html: input.html,
    tailwindRecipeArtifact: input.tailwindRecipeArtifact,
    compileTailwindRecipeArtifact,
  })

  if (!replacementHtml) {
    toast.error('Select a clone region with captured HTML first')
    return
  }

  patchCloneField({
    regionId,
    fieldId: `${regionId}:tailwind-html`,
    selector: `[data-oem-region-id="${regionId}"]`,
    kind: 'outer-html',
    value: replacementHtml,
    html: replacementHtml,
  })
  toast.success('Selected region converted in preview')
}

async function convertPageToTailwind() {
  if (!canConvertPageToTailwind.value)
    return

  convertingPage.value = true
  try {
    const collectedRegions = await pageBuilderCanvas.value?.collectCloneRegions()
    const result = await convertCloneRegionsToTailwindSections({
      regions: collectedRegions?.length ? collectedRegions : cloneRegionsForSave.value,
      compileTailwindRecipeArtifact,
      failClosed: true,
    })

    if (result.blocked) {
      toast.error(result.blocked.message)
      return
    }

    if (!result.sections.length) {
      toast.error('No clone regions are ready to convert')
      return
    }

    replaceSections(result.sections)
    setActiveMode('sections')
    const skippedSuffix = result.skipped.length ? ` (${result.skipped.length} skipped)` : ''
    toast.success(`Converted ${result.sections.length} region${result.sections.length === 1 ? '' : 's'} to Tailwind sections${skippedSuffix}`)
  }
  catch (error: any) {
    toast.error(`Failed to convert page: ${error?.message || 'Unknown error'}`)
  }
  finally {
    convertingPage.value = false
  }
}

async function savePreview() {
  if (isProductionView.value || isCandidateView.value || isSourceView.value || isCompareView.value || isStandaloneView.value) {
    toast.error('Switch to Edit view to save changes')
    return
  }

  if (isWriteProtectedPage.value) {
    toast.error(writeProtectedMessage.value)
    return
  }

  if (activeMode.value === 'clone') {
    const saved = await saveClone(cloneDraftHtml.value ?? cloneHtml.value, cloneRegionsForSave.value)
    if (saved) {
      cloneDraftHtml.value = null
      if (page.value?.version) {
        publication.markDraftChanged(page.value.version)
        try {
          await publication.refresh()
        }
        catch (cause: any) {
          toast.warning(`Draft saved; publication state could not refresh: ${cause?.message || 'Unknown error'}`)
        }
      }
      toast.success('Preview edits saved')
    }
    return
  }

  const previousVersion = page.value?.version
  await saveSections()
  if (!isDirty.value && page.value?.version && page.value.version !== previousVersion) {
    publication.markDraftChanged(page.value.version)
    try {
      await publication.refresh()
    }
    catch (cause: any) {
      toast.warning(`Draft saved; publication state could not refresh: ${cause?.message || 'Unknown error'}`)
    }
    toast.success('Preview edits saved')
  }
}

async function refreshPublicationState() {
  if (!publicationPageId.value)
    return
  try {
    await publication.refresh()
    publicationStateLoaded.value = true
    enforceCandidatePreviewRoute()
  }
  catch (cause: any) {
    toast.error(`Failed to load publication state: ${cause?.message || 'Unknown error'}`)
  }
}

function enforceCandidatePreviewRoute() {
  const resolvedView = resolvePublicationPreviewView(
    previewView.value,
    publication.status.value,
    publication.candidatePreviewUrl.value,
  ) as PreviewView
  if (resolvedView === previewView.value)
    return
  previewView.value = resolvedView
  replacePreviewViewQuery(resolvedView)
  toast.warning('Candidate preview is unavailable because the saved draft has changed')
}

async function buildPublicationCandidate() {
  try {
    await publication.buildCandidate()
    toast.success(publication.canPublish.value ? 'Candidate passed validation' : 'Candidate validation needs attention')
  }
  catch (cause: any) {
    toast.error(`Failed to build candidate: ${cause?.message || 'Unknown error'}`)
  }
}

function previewCandidate() {
  if (publication.status.value === 'stale' || !publication.candidatePreviewUrl.value) {
    toast.error('Build or refresh a candidate before previewing it')
    return
  }
  setPreviewView('candidate')
}

async function publishCandidate() {
  try {
    const response = await publication.publish()
    setPreviewView('production')
    toast.success(`Revision ${response.published_revision} is now production`)
  }
  catch (cause: any) {
    toast.error(`Failed to publish candidate: ${cause?.message || 'Unknown error'}`)
  }
}

async function rollbackPublication(revision: number) {
  try {
    await publication.rollback(revision)
    setPreviewView('production')
    toast.success(`Production rolled back to revision ${revision}`)
  }
  catch (cause: any) {
    toast.error(`Failed to roll back production: ${cause?.message || 'Unknown error'}`)
  }
}
</script>

<template>
  <div class="min-h-screen w-full bg-background">
    <div v-if="loading" class="flex h-screen items-center justify-center text-muted-foreground">
      <Loader2 class="size-5 animate-spin mr-2" />
      Loading preview…
    </div>

    <div v-else-if="error" class="flex h-screen items-center justify-center text-destructive">
      {{ error }}
    </div>

    <div v-else-if="page" class="h-screen">
      <div data-oem-preview-toolbar="true" class="fixed right-2 top-2 z-[70] flex max-w-[calc(100vw-1rem)] items-center gap-1.5 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg border bg-background/95 px-1.5 py-1.5 shadow-lg backdrop-blur [scrollbar-width:none] [&>*]:shrink-0 [&::-webkit-scrollbar]:hidden sm:right-3 sm:top-3 sm:gap-2 sm:px-2">
        <div class="inline-flex h-8 items-center rounded-md border bg-muted/40 p-0.5">
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Edit preview"
            @click="setPreviewView('edit')"
          >
            <Pencil class="size-3.5" />
            <span class="hidden sm:inline">Edit</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'production' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Production view"
            @click="setPreviewView('production')"
          >
            <Eye class="size-3.5" />
            <span class="hidden sm:inline">Production</span>
          </button>
          <button
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'standalone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Standalone HTML"
            @click="setPreviewView('standalone')"
          >
            <FileCode class="size-3.5" />
            <span class="hidden sm:inline">HTML</span>
          </button>
          <button
            v-if="hasTailwindSource || isSourceView"
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'source' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Tailwind source"
            @click="setPreviewView('source')"
          >
            <Code2 class="size-3.5" />
            <span class="hidden md:inline">Source</span>
          </button>
          <button
            v-if="hasTailwindCompare || isCompareView"
            type="button"
            class="inline-flex h-7 items-center gap-1 rounded px-2 text-xs font-medium transition-colors"
            :class="previewView === 'compare' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            title="Compare Tailwind"
            @click="setPreviewView('compare')"
          >
            <Columns2 class="size-3.5" />
            <span class="hidden md:inline">Compare</span>
          </button>
        </div>
        <div
          v-if="previewReadOnly"
          class="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-300"
          :title="isCandidateView ? 'Candidate preview disables editing and save actions' : (isCompareView ? 'Tailwind compare view disables editing and save actions' : (isSourceView ? 'Tailwind source view disables editing and save actions' : (isStandaloneView ? 'Standalone HTML view disables editing overlays and save actions' : (isProductionView ? 'Production view disables editing overlays and save actions' : writeProtectedMessage))))"
        >
          <Lock class="size-3.5" />
          {{ isCandidateView ? 'Candidate' : (isCompareView ? 'Compare' : (isSourceView ? 'Source' : (isStandaloneView ? 'HTML' : (isProductionView ? 'Production' : 'Read-only')))) }}
        </div>
        <div v-else class="hidden items-center gap-1.5 px-1 text-xs text-muted-foreground sm:flex">
          <span
            class="size-2 rounded-full"
            :class="isDirty ? 'bg-amber-500' : 'bg-emerald-500'"
          />
          {{ isDirty ? 'Unsaved' : 'Saved' }}
        </div>
        <PublicationControls
          :draft-version="draftVersion"
          :published-revision="publication.publishedRevision.value"
          :candidate-revision="publication.candidate.value?.revision ?? null"
          :candidate-status="publication.status.value"
          :can-build="draftVersion != null && !publication.isLoading.value && !saving && !isDirty"
          :can-publish="publication.canPublish.value && !publication.isLoading.value"
          :busy="publication.isLoading.value || saving"
          :validation="publication.validation.value"
          :history="publication.history.value"
          @build-candidate="buildPublicationCandidate"
          @preview-candidate="previewCandidate"
          @publish="publishCandidate"
          @rollback="rollbackPublication"
        />
        <button
          v-if="canEditPreview && activeMode === 'clone'"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          :disabled="convertingCloneRegion || !canConvertSelectedCloneRegion"
          title="Convert selected region to Tailwind"
          @click="convertSelectedCloneRegionToTailwind"
        >
          <Loader2 v-if="convertingCloneRegion" class="size-3.5 animate-spin" />
          <Wand2 v-else class="size-3.5" />
          <span class="hidden lg:inline">Convert to Tailwind</span>
        </button>
        <button
          v-if="canEditPreview && activeMode === 'clone'"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          :disabled="convertingPage || !canConvertPageToTailwind"
          title="Convert page to Tailwind sections"
          @click="convertPageToTailwind"
        >
          <Loader2 v-if="convertingPage" class="size-3.5 animate-spin" />
          <Wand2 v-else class="size-3.5" />
          <span class="hidden xl:inline">Convert Page</span>
        </button>
        <button
          v-if="canEditPreview"
          type="button"
          class="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          :disabled="saving || !isDirty"
          title="Save preview edits"
          @click="savePreview"
        >
          <Loader2 v-if="saving" class="size-3.5 animate-spin" />
          <Save v-else class="size-3.5" />
          <span class="hidden sm:inline">Save Draft</span>
        </button>
        <a
          class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
          :href="builderUrl"
          title="Open full builder"
        >
          <ExternalLink class="size-3.5" />
          <span class="hidden sm:inline">Builder</span>
        </a>
      </div>

      <div
        v-if="isSourceView"
        data-oem-tailwind-source-view="true"
        class="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-10"
      >
        <div class="mx-auto max-w-6xl space-y-4">
          <div class="space-y-1">
            <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Tailwind Source
            </p>
            <h1 class="text-xl font-semibold text-white">
              {{ page?.name || pageSlug }}
            </h1>
            <p class="text-sm text-slate-400">
              Converted section markup rendered from the saved section model.
            </p>
          </div>

          <div v-if="!hasTailwindSource" class="rounded-lg border border-slate-800 bg-slate-900/80 p-5 text-sm text-slate-300">
            No converted Tailwind sections are saved for this page yet.
          </div>

          <div
            v-for="section in sections"
            v-else
            :key="section.id"
            class="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/80"
          >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">
                  {{ section.name || section.title || section.id }}
                </p>
                <p class="text-xs text-slate-400">
                  {{ section.type || 'section' }}
                </p>
              </div>
              <span
                v-if="section._tailwind_conversion"
                class="rounded bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-300"
              >
                converted
              </span>
            </div>
            <pre class="max-h-[620px] overflow-auto p-4 text-xs leading-5 text-slate-100"><code>{{ tailwindSectionSource(section) }}</code></pre>
          </div>
        </div>
      </div>

      <div
        v-else-if="isCompareView"
        data-oem-tailwind-compare-view="true"
        class="min-h-screen bg-slate-950 px-4 py-16 text-slate-100 sm:px-6 lg:px-10"
      >
        <div class="mx-auto max-w-[1600px] space-y-5">
          <Card class="border-slate-800 bg-slate-900/85 py-0 text-slate-100 shadow-xl shadow-black/20">
            <CardHeader class="border-b border-slate-800 px-5 py-4">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 space-y-1">
                  <p class="text-xs font-semibold uppercase text-slate-400">
                    Compare Tailwind
                  </p>
                  <CardTitle class="truncate text-xl font-semibold text-white">
                    {{ page?.name || pageSlug }}
                  </CardTitle>
                  <CardDescription class="text-sm text-slate-400">
                    Original captured markup and converted Tailwind output render at the captured viewport width, with conversion coverage signals.
                  </CardDescription>
                </div>
                <div
                  v-if="hasTailwindCompare"
                  class="flex max-w-full flex-wrap items-center gap-2"
                >
                  <div class="inline-flex rounded-md border border-slate-800 bg-slate-950/60 p-0.5">
                    <button
                      type="button"
                      class="rounded px-2.5 py-1 text-xs font-semibold transition"
                      :class="compareLayoutMode === 'accurate' ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
                      @click="compareLayoutMode = 'accurate'"
                    >
                      Accurate
                    </button>
                    <button
                      type="button"
                      class="rounded px-2.5 py-1 text-xs font-semibold transition"
                      :class="compareLayoutMode === 'fit' ? 'bg-slate-100 text-slate-950' : 'text-slate-300 hover:bg-slate-800 hover:text-white'"
                      @click="compareLayoutMode = 'fit'"
                    >
                      Fit
                    </button>
                  </div>
                  <Badge
                    class="font-semibold"
                    :class="comparePageReadinessClass()"
                  >
                    {{ comparePageReadinessLabel() }}
                  </Badge>
                  <Badge variant="secondary" class="bg-slate-800 text-slate-200">
                    {{ comparePageReadinessSummary().total }} sections
                  </Badge>
                  <Badge variant="secondary" class="bg-emerald-500/15 text-emerald-300">
                    {{ comparePageReadinessSummary().ready }} ready
                  </Badge>
                  <Badge variant="secondary" class="bg-amber-500/15 text-amber-200">
                    {{ comparePageReadinessSummary().review }} review
                  </Badge>
                  <Badge variant="secondary" class="bg-slate-700 text-slate-200">
                    {{ comparePageReadinessSummary().incomplete }} incomplete
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card v-if="!hasTailwindCompare" class="border-slate-800 bg-slate-900/80 py-0 text-slate-100">
            <CardContent class="p-5 text-sm text-slate-300">
              Convert a page to Tailwind sections before comparing original and converted output.
            </CardContent>
          </Card>

          <Card
            v-for="section in sections"
            v-else
            :key="section.id"
            class="overflow-hidden border-slate-800 bg-slate-900/80 py-0 text-slate-100 shadow-lg shadow-black/15"
          >
            <CardHeader class="border-b border-slate-800 px-4 py-3">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0 space-y-0.5">
                  <CardTitle class="truncate text-sm font-semibold text-white">
                    {{ section.name || section.title || section.id }}
                  </CardTitle>
                  <CardDescription class="text-xs text-slate-400">
                    {{ section.type || 'section' }}
                  </CardDescription>
                </div>
                <div class="flex max-w-full flex-wrap items-center gap-2">
                  <Badge
                    class="font-semibold"
                    :class="compareReadinessClass(section)"
                  >
                    {{ compareReadinessLabel(section) }}
                  </Badge>
                  <Badge
                    variant="secondary"
                    :class="hasComputedDeclarationStats(section) ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-200'"
                  >
                    {{ compareMappingSummary(section) }}
                  </Badge>
                  <Badge
                    v-if="hasComputedDeclarationStats(section)"
                    variant="secondary"
                    class="bg-sky-500/15 text-sky-300"
                  >
                    {{ mappedDeclarationRate(section) }}
                  </Badge>
                  <Badge
                    v-if="computedSnapshotCount(section)"
                    variant="secondary"
                    class="bg-cyan-500/15 text-cyan-200"
                  >
                    {{ computedSnapshotCount(section) }} snapshots
                  </Badge>
                  <Badge variant="secondary" class="bg-violet-500/15 text-violet-200">
                    {{ compareTemplateSummary(section) }}
                  </Badge>
                  <Badge variant="secondary" class="bg-slate-800 text-slate-300">
                    {{ compareRiskSummary(section) }}
                  </Badge>
                  <Badge variant="outline" class="border-slate-700 bg-slate-950/60 text-slate-300">
                    {{ tailwindCompareViewportWidth(section) }}×{{ tailwindCompareViewportHeight(section) }}
                  </Badge>
                  <div class="ml-1 inline-flex rounded-md border border-slate-800 bg-slate-950/60 p-0.5">
                    <button
                      type="button"
                      class="rounded px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      @click="scrollComparePane(section, 'original')"
                    >
                      Original
                    </button>
                    <button
                      type="button"
                      class="rounded px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
                      @click="scrollComparePane(section, 'converted')"
                    >
                      Converted
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent class="p-0">
              <div :class="compareLayoutMode === 'fit' ? 'grid gap-0 xl:grid-cols-2' : 'grid gap-0 min-[2800px]:grid-cols-2'">
                <div
                  :id="comparePaneId(section, 'original')"
                  class="scroll-mt-20 border-b border-slate-800 min-[2800px]:border-b-0 min-[2800px]:border-r"
                  :class="compareLayoutMode === 'fit' ? 'xl:border-r' : ''"
                >
                  <div class="sticky top-14 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 py-2 text-[11px] font-semibold uppercase text-slate-300 backdrop-blur">
                    <span>Original</span>
                    <span class="font-mono text-slate-500">{{ compareLayoutMode === 'fit' ? 'Fit' : `${tailwindCompareViewportWidth(section)}×${tailwindCompareViewportHeight(section)}` }}</span>
                  </div>
                  <div class="overflow-auto bg-slate-950">
                    <iframe
                      :class="compareLayoutMode === 'fit' ? 'w-full bg-white' : 'max-w-none min-w-[1280px] bg-white'"
                      sandbox="allow-scripts"
                      title="Original capture"
                      :style="compareLayoutMode === 'fit' ? { height: `${tailwindCompareViewportHeight(section)}px` } : { width: `${tailwindCompareViewportWidth(section)}px`, height: `${tailwindCompareViewportHeight(section)}px` }"
                      :srcdoc="tailwindCompareSrcdoc(tailwindCompareOriginalHtml(section), 'Original capture', section)"
                    />
                  </div>
                </div>
                <div
                  :id="comparePaneId(section, 'converted')"
                  class="scroll-mt-20"
                >
                  <div class="sticky top-14 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 px-3 py-2 text-[11px] font-semibold uppercase text-slate-300 backdrop-blur">
                    <span>Converted Tailwind</span>
                    <span class="font-mono text-slate-500">{{ compareLayoutMode === 'fit' ? 'Fit' : 'Tailwind' }}</span>
                  </div>
                  <div class="overflow-auto bg-slate-950">
                    <iframe
                      :class="compareLayoutMode === 'fit' ? 'w-full bg-white' : 'max-w-none min-w-[1280px] bg-white'"
                      sandbox="allow-scripts"
                      title="Converted Tailwind"
                      :style="compareLayoutMode === 'fit' ? { height: `${tailwindCompareViewportHeight(section)}px` } : { width: `${tailwindCompareViewportWidth(section)}px`, height: `${tailwindCompareViewportHeight(section)}px` }"
                      :srcdoc="tailwindCompareSrcdoc(tailwindCompareConvertedHtml(section), 'Converted Tailwind', section)"
                    />
                  </div>
                </div>
              </div>
              <details
                v-if="hasTailwindLeftoverCss(section)"
                class="border-t border-slate-800 bg-slate-950/70"
              >
                <summary class="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase text-slate-300">
                  Leftover CSS
                </summary>
                <pre class="max-h-72 overflow-auto border-t border-slate-800 px-4 py-3 text-xs leading-5 text-slate-200"><code>{{ tailwindLeftoverCss(section) }}</code></pre>
              </details>
              <details
                v-if="hasUnsupportedDeclarationSamples(section)"
                class="border-t border-slate-800 bg-slate-950/70"
              >
                <summary class="cursor-pointer select-none px-4 py-3 text-xs font-semibold uppercase text-slate-300">
                  Unmapped Declarations
                </summary>
                <ul class="max-h-72 list-none overflow-auto border-t border-slate-800 px-4 py-3 text-xs leading-5 text-slate-200">
                  <li
                    v-for="sample in unsupportedDeclarationSamples(section)"
                    :key="sample"
                    class="font-mono"
                  >
                    {{ sample }}
                  </li>
                </ul>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>

      <div
        v-else-if="isCandidateView"
        class="flex h-screen w-full flex-col bg-muted/30 pt-14"
      >
        <div class="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">
              Candidate revision {{ publication.candidate.value?.revision ?? '—' }}
            </p>
            <p class="text-xs text-muted-foreground">
              Authenticated candidate HTML; read-only until published.
            </p>
          </div>
          <div class="flex items-center gap-1">
            <button
              class="rounded-md p-1.5 transition-colors"
              :class="candidatePreviewWidth === 'desktop' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
              title="Desktop candidate preview"
              @click="candidatePreviewWidth = 'desktop'"
            >
              <Monitor class="size-3.5" />
            </button>
            <button
              class="rounded-md p-1.5 transition-colors"
              :class="candidatePreviewWidth === 'tablet' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
              title="Tablet candidate preview (768px)"
              @click="candidatePreviewWidth = 'tablet'"
            >
              <Tablet class="size-3.5" />
            </button>
            <button
              class="rounded-md p-1.5 transition-colors"
              :class="candidatePreviewWidth === 'mobile' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'"
              title="Mobile candidate preview (375px)"
              @click="candidatePreviewWidth = 'mobile'"
            >
              <Smartphone class="size-3.5" />
            </button>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/30">
          <iframe
            v-if="publication.status.value !== 'stale' && publication.candidatePreviewUrl.value"
            class="h-full min-h-[720px] border-0 bg-white transition-[width] duration-200"
            :class="candidatePreviewClass"
            :src="publication.candidatePreviewUrl.value || undefined"
            sandbox="allow-scripts"
            title="Candidate model page preview"
          />
          <div v-else class="grid flex-1 place-items-center p-8 text-sm text-muted-foreground">
            Build a candidate before opening candidate preview.
          </div>
        </div>
      </div>

      <div
        v-else-if="isStandaloneView"
        class="h-screen w-full bg-background"
      >
        <div class="flex items-center justify-between border-b bg-card px-4 py-2">
          <div class="text-sm font-medium">
            Standalone HTML
          </div>
          <button
            type="button"
            class="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted"
            @click="openStandaloneHtml"
          >
            <ExternalLink class="size-3.5" />
            Open in new tab
          </button>
        </div>
        <iframe
          class="h-[calc(100vh-3rem)] w-full border-0 bg-white"
          sandbox="allow-scripts"
          title="Standalone HTML preview"
          :srcdoc="buildStandaloneHtml()"
        />
      </div>

      <PageBuilderCanvas
        v-else
        ref="pageBuilderCanvas"
        :page="page"
        :sections="sections"
        :selected-section-id="selectedSectionId"
        :active-mode="activeMode"
        :selected-clone-region-id="selectedCloneRegionId"
        :is-cloned="isCloned"
        :is-structured="isStructured"
        :worker-base="WORKER_BASE"
        :oem-id="oemId"
        :model-slug="modelSlug"
        :read-only="previewReadOnly"
        :fit-width="true"
        :allow-same-origin-sandbox="previewReadOnly"
        :auto-responsive-preview="true"
        :hide-preview-chrome="true"
        @select-section="selectSection"
        @open-editor="openEditor"
        @move-section="moveSection"
        @duplicate-section="duplicateSection"
        @delete-section="deleteSection"
        @update-field="onUpdateField"
        @select-clone-region="onCloneRegionSelected"
        @clone-dom-updated="onCloneDomUpdated"
        @clone-region-added="onCloneRegionAdded"
        @region-action="onRegionAction"
      />

      <SectionEditorDialog
        v-if="editorSection && canEditPreview"
        :section="editorSection"
        :regenerating="regenerating"
        :oem-id="oemId"
        :model-slug="modelSlug"
        @close="closeEditor"
        @regenerate="regenerateSectionById(editorSection.id)"
        @delete="deleteSection(editorSection.id); closeEditor()"
        @convert="(type: string) => convertSection(editorSection.id, type as any)"
        @update:section="updateEditorSection($event)"
      />

      <FidelityAssistantDialog
        v-if="canEditPreview"
        :open="fidelityOpen"
        :oem-id="oemId"
        :region-id="fidelityRegionId"
        :original-html="fidelityOriginalHtml"
        :original-css="fidelityOriginalCss"
        :candidate-section="fidelityCandidateSection"
        @update:open="fidelityOpen = $event"
        @apply="applyFidelityCandidate"
      />
    </div>

    <div v-else class="flex h-screen items-center justify-center text-muted-foreground">
      Page not found.
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
  auth: false
</route>
