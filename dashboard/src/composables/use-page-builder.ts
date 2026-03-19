import { ref, computed } from 'vue'
import {
  fetchGeneratedPage,
  clonePage,
  structurePage,
  updatePageSections,
  regenerateSection as apiRegenerateSection,
  adaptivePipeline as apiAdaptivePipeline,
} from '@/lib/worker-api'
import {
  SECTION_DEFAULTS,
  SECTION_TEMPLATES,
  type PageSectionType,
} from '@/pages/dashboard/components/page-builder/section-templates'
import {
  convertSectionData,
  getConvertibleTypes,
} from '@/pages/dashboard/components/page-builder/section-converter'

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const OEM_IDS = [
  'chery-au', 'ford-au', 'foton-au', 'gac-au', 'gmsv-au', 'gwm-au', 'hyundai-au', 'isuzu-au', 'kia-au', 'ldv-au',
  'mazda-au', 'mitsubishi-au', 'nissan-au', 'subaru-au', 'suzuki-au',
  'toyota-au', 'volkswagen-au', 'kgm-au',
]

function parseSlug(slug: string): { oemId: string; modelSlug: string; subpageSlug?: string; parentModelSlug?: string } | null {
  for (const oemId of OEM_IDS) {
    if (slug.startsWith(`${oemId}-`)) {
      const rest = slug.slice(oemId.length + 1) // e.g. "sportage--performance"
      if (rest.includes('--')) {
        const [parentModelSlug, subpageSlug] = rest.split('--', 2)
        return { oemId, modelSlug: rest, subpageSlug, parentModelSlug }
      }
      return { oemId, modelSlug: rest }
    }
  }
  return null
}

/**
 * Resolve a URL that may be a /media/ proxy path to an absolute URL.
 * /media/pages/kia-au/sportage/hero.jpg → https://worker.dev/media/pages/kia-au/sportage/hero.jpg
 */
function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null
  if (url.startsWith('/media/')) return `${WORKER_BASE}${url}`
  return url
}

/**
 * Walk all image/video URL fields in a section and resolve /media/ paths.
 */
function resolveSectionMediaUrls(section: any): any {
  const s = { ...section }
  switch (s.type) {
    case 'hero':
      s.desktop_image_url = resolveMediaUrl(s.desktop_image_url) ?? s.desktop_image_url
      s.mobile_image_url = resolveMediaUrl(s.mobile_image_url) ?? s.mobile_image_url
      s.background_image_url = resolveMediaUrl(s.background_image_url) ?? s.background_image_url
      s.video_url = resolveMediaUrl(s.video_url) ?? s.video_url
      break
    case 'intro':
      s.image_url = resolveMediaUrl(s.image_url) ?? s.image_url
      break
    case 'tabs':
      if (Array.isArray(s.tabs)) {
        s.tabs = s.tabs.map((t: any) => ({ ...t, image_url: resolveMediaUrl(t.image_url) ?? t.image_url }))
      }
      break
    case 'color-picker':
      if (Array.isArray(s.colors)) {
        s.colors = s.colors.map((c: any) => ({
          ...c,
          swatch_url: resolveMediaUrl(c.swatch_url) ?? c.swatch_url,
          hero_image_url: resolveMediaUrl(c.hero_image_url) ?? c.hero_image_url,
        }))
      }
      break
    case 'gallery':
      if (Array.isArray(s.images)) {
        s.images = s.images.map((img: any) => ({ ...img, url: resolveMediaUrl(img.url) ?? img.url }))
      }
      break
    case 'feature-cards':
      if (Array.isArray(s.cards)) {
        s.cards = s.cards.map((c: any) => ({ ...c, image_url: resolveMediaUrl(c.image_url) ?? c.image_url }))
      }
      break
    case 'video':
      s.video_url = resolveMediaUrl(s.video_url) ?? s.video_url
      s.poster_url = resolveMediaUrl(s.poster_url) ?? s.poster_url
      break
    case 'content-block':
      s.image_url = resolveMediaUrl(s.image_url) ?? s.image_url
      break
    case 'testimonial':
      if (Array.isArray(s.testimonials)) {
        s.testimonials = s.testimonials.map((t: any) => ({ ...t, avatar_url: resolveMediaUrl(t.avatar_url) ?? t.avatar_url }))
      }
      break
    case 'stats':
      if (Array.isArray(s.stats)) {
        s.stats = s.stats.map((st: any) => ({ ...st, icon_url: resolveMediaUrl(st.icon_url) ?? st.icon_url }))
      }
      break
    case 'logo-strip':
      if (Array.isArray(s.logos)) {
        s.logos = s.logos.map((l: any) => ({ ...l, image_url: resolveMediaUrl(l.image_url) ?? l.image_url }))
      }
      break
    case 'countdown':
      s.background_image_url = resolveMediaUrl(s.background_image_url) ?? s.background_image_url
      break
    case 'image-showcase':
      if (Array.isArray(s.images)) {
        s.images = s.images.map((img: any) => ({ ...img, url: resolveMediaUrl(img.url) ?? img.url }))
      }
      break
  }
  return s
}

export interface HistoryEntry {
  id: string
  sections: any[]
  label: string
  timestamp: string
}

export function usePageBuilder() {
  const page = ref<any>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const slug = ref('')
  const isDirty = ref(false)

  const selectedSectionId = ref<string | null>(null)
  const sourceUrlOverride = ref('')

  // History system
  const history = ref<HistoryEntry[]>([])
  const historyIndex = ref(-1)
  const MAX_HISTORY = 50
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  let _restoringHistory = false

  function pushHistory(label: string) {
    if (_restoringHistory) return
    // Truncate any future entries when a new edit happens
    if (historyIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, historyIndex.value + 1)
    }
    const snapshot: HistoryEntry = {
      id: `h${Date.now().toString(36)}`,
      sections: JSON.parse(JSON.stringify(page.value?.content?.sections ?? [])),
      label,
      timestamp: new Date().toISOString(),
    }
    history.value.push(snapshot)
    if (history.value.length > MAX_HISTORY) {
      history.value = history.value.slice(history.value.length - MAX_HISTORY)
    }
    historyIndex.value = history.value.length - 1
  }

  function _restoreSections(index: number) {
    if (index < 0 || index >= history.value.length) return
    _restoringHistory = true
    historyIndex.value = index
    const restored = JSON.parse(JSON.stringify(history.value[index].sections))
    if (page.value?.content) {
      page.value.content.sections = restored
    }
    isDirty.value = true
    _restoringHistory = false
  }

  function undo() {
    if (!canUndo.value) return
    _restoreSections(historyIndex.value - 1)
  }

  function redo() {
    if (!canRedo.value) return
    _restoreSections(historyIndex.value + 1)
  }

  function jumpTo(index: number) {
    _restoreSections(index)
  }

  const parsed = computed(() => parseSlug(slug.value))
  const oemId = computed(() => parsed.value?.oemId ?? '')
  const modelSlug = computed(() => parsed.value?.modelSlug ?? '')
  const isSubpage = computed(() => !!parsed.value?.subpageSlug)
  const subpageSlug = computed(() => parsed.value?.subpageSlug ?? null)
  const parentModelSlug = computed(() => parsed.value?.parentModelSlug ?? null)
  const parentFullSlug = computed(() => parentModelSlug.value && oemId.value ? `${oemId.value}-${parentModelSlug.value}` : null)

  const sections = computed({
    get: () => (page.value?.content?.sections ?? []).map(resolveSectionMediaUrls),
    set: (val: any[]) => {
      if (page.value?.content) {
        page.value.content.sections = val
      }
    },
  })

  const selectedSection = computed(() =>
    sections.value.find((s: any) => s.id === selectedSectionId.value) ?? null,
  )

  const isStructured = computed(() => sections.value.length > 0)
  const isCloned = computed(() => {
    const rendered = page.value?.content?.rendered ?? ''
    return rendered.includes('tailwindcss.com') || rendered.includes('<link rel="stylesheet"')
  })

  async function loadPage(newSlug: string) {
    slug.value = newSlug
    loading.value = true
    error.value = null
    isDirty.value = false
    selectedSectionId.value = null

    try {
      page.value = await fetchGeneratedPage(newSlug)
      // Seed hero section images from header.slides if section is missing them
      const heroSec = page.value?.content?.sections?.find((s: any) => s.type === 'hero')
      const slide = page.value?.header?.slides?.[0]
      if (heroSec && slide) {
        if (!heroSec.desktop_image_url && slide.desktop) heroSec.desktop_image_url = slide.desktop
        if (!heroSec.mobile_image_url && slide.mobile) heroSec.mobile_image_url = slide.mobile
        if (!heroSec.heading && slide.heading) heroSec.heading = slide.heading
        if (!heroSec.sub_heading && slide.sub_heading) heroSec.sub_heading = slide.sub_heading
        if (!heroSec.cta_text && slide.button) heroSec.cta_text = slide.button
      }
      // Reset history with initial entry
      history.value = [{
        id: `h${Date.now().toString(36)}`,
        sections: JSON.parse(JSON.stringify(page.value?.content?.sections ?? [])),
        label: 'Loaded page',
        timestamp: new Date().toISOString(),
      }]
      historyIndex.value = 0
    } catch (err: any) {
      error.value = err.message || 'Failed to load page'
      page.value = null
      history.value = []
      historyIndex.value = -1
    } finally {
      loading.value = false
    }
  }

  async function refreshPage() {
    if (!slug.value) return
    try {
      page.value = await fetchGeneratedPage(slug.value)
      isDirty.value = false
    } catch (err: any) {
      error.value = err.message || 'Failed to refresh'
    }
  }

  function selectSection(id: string | null) {
    selectedSectionId.value = id
  }

  function deleteSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1) return
    pushHistory(`Deleted ${sections.value[idx].type} section`)
    const updated = [...sections.value]
    updated.splice(idx, 1)
    // Recompute order
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    if (selectedSectionId.value === id) {
      selectedSectionId.value = null
    }
  }

  function moveSection(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= sections.value.length) return
    pushHistory(`Moved ${sections.value[fromIndex].type} section`)
    const updated = [...sections.value]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
  }

  let _idCounter = 0
  function genId() {
    _idCounter++
    return `s${Date.now().toString(36)}${_idCounter.toString(36)}`
  }

  function ensureContentExists() {
    if (!page.value) {
      page.value = { content: { sections: [], rendered: '' }, version: 0 }
    }
    if (!page.value.content) {
      page.value.content = { sections: [], rendered: '' }
    }
    if (!page.value.content.sections) {
      page.value.content.sections = []
    }
  }

  function addSection(type: PageSectionType, afterIndex?: number) {
    ensureContentExists()
    pushHistory(`Added ${type} section`)
    const defaults = SECTION_DEFAULTS[type]?.() ?? {}
    const newSection = { ...defaults, type, id: genId(), order: 0 }
    const updated = [...sections.value]
    const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
    updated.splice(insertAt, 0, newSection)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = newSection.id
  }

  function addSectionFromTemplate(templateId: string, afterIndex?: number) {
    ensureContentExists()
    const template = SECTION_TEMPLATES.find(t => t.id === templateId)
    if (!template) return
    pushHistory(`Added ${template.name}`)
    const defaults = SECTION_DEFAULTS[template.type]?.() ?? {}
    const newSection = { ...defaults, ...template.data, type: template.type, id: genId(), order: 0 }
    const updated = [...sections.value]
    const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
    updated.splice(insertAt, 0, newSection)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = newSection.id
  }

  function addSectionFromLiveData(sectionData: Record<string, any>, afterIndex?: number) {
    ensureContentExists()
    pushHistory(`Added ${sectionData.type || 'live data'} section`)
    const clone = JSON.parse(JSON.stringify(sectionData))
    clone.id = genId()
    clone.order = 0
    const updated = [...sections.value]
    const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
    updated.splice(insertAt, 0, clone)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = clone.id
  }

  function duplicateSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1) return
    pushHistory(`Duplicated ${sections.value[idx].type} section`)
    const source = sections.value[idx]
    const clone = JSON.parse(JSON.stringify(source))
    clone.id = genId()
    const updated = [...sections.value]
    updated.splice(idx + 1, 0, clone)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = clone.id
  }

  function updateSection(id: string, updates: Record<string, any>) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1) return
    pushHistory(`Edited ${sections.value[idx].type} section`)
    const updated = [...sections.value]
    updated[idx] = { ...updated[idx], ...updates }
    sections.value = updated
    isDirty.value = true
  }

  function convertSection(id: string, targetType: PageSectionType) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1) return
    const source = sections.value[idx]

    // Check if source has multiple items — if so, split & convert each
    const field = SPLITTABLE_FIELDS[source.type]
    const items = field ? source[field] : null
    if (Array.isArray(items) && items.length >= 2) {
      // Split into individual sections, then convert each
      const singles = items.map((item: any) => {
        const single = JSON.parse(JSON.stringify(source))
        single.id = genId()
        single[field] = [item]
        return single
      })
      const convertedSections = singles.map((s: any) => {
        const c = convertSectionData(s, targetType)
        return c || s
      })
      pushHistory(`Split & converted ${source.type} → ${convertedSections.length}x ${targetType}`)
      const updated = [...sections.value]
      updated.splice(idx, 1, ...convertedSections)
      updated.forEach((s: any, i: number) => { s.order = i })
      sections.value = updated
      isDirty.value = true
      selectedSectionId.value = convertedSections[0].id
      return
    }

    // Standard 1:1 conversion
    const converted = convertSectionData(source, targetType)
    if (!converted) return
    pushHistory(`Converted ${source.type} → ${targetType}`)
    const updated = [...sections.value]
    updated[idx] = converted
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = id
  }

  /** Which array field holds the splittable items for a given section type */
  const SPLITTABLE_FIELDS: Record<string, string> = {
    'gallery': 'images',
    'image-showcase': 'images',
    'feature-cards': 'cards',
    'tabs': 'tabs',
    'accordion': 'items',
    'testimonial': 'testimonials',
    'logo-strip': 'logos',
    'stats': 'stats',
    'pricing-table': 'tiers',
    'comparison-table': 'rows',
  }

  function canSplitSection(type: string): boolean {
    const field = SPLITTABLE_FIELDS[type]
    return !!field
  }

  function splitSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1) return
    const source = sections.value[idx]
    const field = SPLITTABLE_FIELDS[source.type]
    if (!field) return
    const items = source[field]
    if (!Array.isArray(items) || items.length < 2) return

    pushHistory(`Split ${source.type} into ${items.length} sections`)
    const updated = [...sections.value]
    updated.splice(idx, 1) // remove original

    const newSections = items.map((item: any) => {
      const clone = JSON.parse(JSON.stringify(source))
      clone.id = genId()
      clone[field] = [item]
      return clone
    })

    updated.splice(idx, 0, ...newSections)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = newSections[0].id
  }

  async function saveSections() {
    if (!oemId.value || !modelSlug.value) return
    saving.value = true
    try {
      await updatePageSections(oemId.value, modelSlug.value, sections.value)
      isDirty.value = false
      // Bump version locally
      if (page.value) page.value.version = (page.value.version || 0) + 1
    } catch (err: any) {
      error.value = err.message || 'Save failed'
    } finally {
      saving.value = false
    }
  }

  const regenerating = ref(false)

  async function regenerateSectionById(id: string) {
    const section = sections.value.find((s: any) => s.id === id)
    if (!section || !oemId.value || !modelSlug.value) return
    regenerating.value = true
    try {
      const result = await apiRegenerateSection(oemId.value, modelSlug.value, id, section.type)
      if (result.section) {
        const idx = sections.value.findIndex((s: any) => s.id === id)
        if (idx !== -1) {
          const updated = [...sections.value]
          updated[idx] = result.section
          sections.value = updated
        }
      }
      // Refresh full page to get updated version
      if (page.value) {
        page.value.version = result.version ?? page.value.version
      }
    } catch (err: any) {
      error.value = err.message || 'Regenerate failed'
    } finally {
      regenerating.value = false
    }
  }

  const cloning = ref(false)

  async function handleClone(modelOverride?: { provider: string; model: string }) {
    if (!oemId.value || !modelSlug.value) return
    cloning.value = true
    try {
      const overrideUrl = sourceUrlOverride.value?.trim() || undefined
      await clonePage(oemId.value, modelSlug.value, overrideUrl, modelOverride)
      await refreshPage()
    } catch (err: any) {
      error.value = err.message || 'Clone failed'
    } finally {
      cloning.value = false
    }
  }

  const structuring = ref(false)

  async function handleStructure(modelOverride?: { provider: string; model: string }) {
    if (!oemId.value || !modelSlug.value) return
    structuring.value = true
    try {
      await structurePage(oemId.value, modelSlug.value, modelOverride)
      await refreshPage()
    } catch (err: any) {
      error.value = err.message || 'Structuring failed'
    } finally {
      structuring.value = false
    }
  }

  const pipelining = ref(false)
  const pipelineResult = ref<any>(null)

  async function handleAdaptivePipeline(modelOverride?: { provider: string; model: string }) {
    if (!oemId.value || !modelSlug.value) return
    pipelining.value = true
    pipelineResult.value = null
    try {
      const overrideUrl = sourceUrlOverride.value?.trim() || undefined
      const result = await apiAdaptivePipeline(oemId.value, modelSlug.value, overrideUrl, modelOverride)
      pipelineResult.value = result
      await refreshPage()
    } catch (err: any) {
      error.value = err.message || 'Pipeline failed'
    } finally {
      pipelining.value = false
    }
  }

  // --- Copy/Paste ---

  function pasteSections(sourceSections: any[], afterIndex?: number) {
    ensureContentExists()
    pushHistory(`Pasted ${sourceSections.length} section${sourceSections.length > 1 ? 's' : ''}`)
    const clones = sourceSections.map((s: any) => {
      const clone = JSON.parse(JSON.stringify(s))
      clone.id = genId()
      return clone
    })
    const updated = [...sections.value]
    const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
    updated.splice(insertAt, 0, ...clones)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
  }

  async function copySectionToClipboard(id: string): Promise<boolean> {
    const section = sections.value.find((s: any) => s.id === id)
    if (!section) return false
    try {
      await navigator.clipboard.writeText(JSON.stringify(section, null, 2))
      return true
    } catch {
      return false
    }
  }

  async function pasteSectionFromClipboard(afterIndex?: number): Promise<boolean> {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      // Basic validation: each entry must have a type
      if (!arr.every((s: any) => s && typeof s.type === 'string')) return false
      pasteSections(arr, afterIndex)
      return true
    } catch {
      return false
    }
  }

  function replaceSections(newSections: any[]) {
    ensureContentExists()
    pushHistory('Bulk edit sections')
    newSections.forEach((s: any, i: number) => { s.order = i })
    sections.value = newSections
    isDirty.value = true
  }

  // Workflow stage: determines what the user should do next
  const workflowStage = computed<'empty' | 'cloned' | 'structured'>(() => {
    if (!page.value) return 'empty'
    if (isStructured.value) return 'structured'
    if (isCloned.value) return 'cloned'
    return 'empty'
  })

  return {
    // State
    page,
    loading,
    saving,
    error,
    slug,
    isDirty,
    oemId,
    modelSlug,
    isSubpage,
    subpageSlug,
    parentModelSlug,
    parentFullSlug,
    sourceUrlOverride,
    sections,
    selectedSectionId,
    selectedSection,
    isStructured,
    isCloned,
    regenerating,
    cloning,
    structuring,
    pipelining,
    pipelineResult,
    workflowStage,
    // History
    history,
    historyIndex,
    canUndo,
    canRedo,
    // Methods
    loadPage,
    refreshPage,
    selectSection,
    deleteSection,
    moveSection,
    addSection,
    addSectionFromTemplate,
    addSectionFromLiveData,
    duplicateSection,
    updateSection,
    saveSections,
    regenerateSectionById,
    handleClone,
    handleStructure,
    handleAdaptivePipeline,
    // History methods
    undo,
    redo,
    jumpTo,
    // Copy/Paste methods
    pasteSections,
    copySectionToClipboard,
    pasteSectionFromClipboard,
    replaceSections,
    // Convert & Split
    convertSection,
    getConvertibleTypes,
    splitSection,
    canSplitSection,
  }
}
