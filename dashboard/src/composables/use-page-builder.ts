import { computed, ref } from 'vue'

import type { Recipe } from '@/lib/worker-api'
import type { PageSectionType } from '@/pages/dashboard/components/page-builder/section-templates'
import type { CloneRegion, PageMode } from '@/pages/dashboard/page-builder/page-modes'

import {
  adaptivePipeline as apiAdaptivePipeline,
  regenerateSection as apiRegenerateSection,
  clonePage,
  fetchGeneratedPage,
  fetchRecipes,
  saveRecipe,
  structurePage,
  updateClonePage,
  updatePageSections,
} from '@/lib/worker-api'
import {
  convertSectionData,
  getConvertibleTypes,
} from '@/pages/dashboard/components/page-builder/section-converter'
import { resolveSectionMediaPaths } from '@/pages/dashboard/components/page-builder/section-media'
import {
  getSectionRecipeDefaults,
  getSectionRecipePattern,
  getSectionSplittableField,
  SECTION_DEFAULTS,
  SECTION_TEMPLATES,
} from '@/pages/dashboard/components/page-builder/section-templates'
import {
  getActivePageMode,
  getAvailablePageModes,
  getCloneHtml,
  getCloneRegions,
  getSectionItems,
  normalizeDashboardPageModes,
} from '@/pages/dashboard/page-builder/page-modes'

const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const OEM_IDS = [
  'chery-au',
  'ford-au',
  'foton-au',
  'gac-au',
  'gmsv-au',
  'gwm-au',
  'hyundai-au',
  'isuzu-au',
  'kia-au',
  'ldv-au',
  'mazda-au',
  'mitsubishi-au',
  'nissan-au',
  'subaru-au',
  'suzuki-au',
  'toyota-au',
  'volkswagen-au',
  'kgm-au',
]

function parseSlug(slug: string): { oemId: string, modelSlug: string, subpageSlug?: string, parentModelSlug?: string } | null {
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
  if (!url || typeof url !== 'string')
    return null
  if (url.startsWith('/media/'))
    return `${WORKER_BASE}${url}`
  return url
}

function normalizeStoredMediaUrl(url: string): string {
  if (!url.startsWith('http'))
    return url

  try {
    const parsed = new URL(url)
    const workerUrl = new URL(WORKER_BASE)
    if (parsed.origin === workerUrl.origin && parsed.pathname.startsWith('/media/')) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  }
  catch {
    return url
  }

  return url
}

export function normalizeStoredMediaUrls<T>(value: T): T {
  if (typeof value === 'string')
    return normalizeStoredMediaUrl(value) as T

  if (Array.isArray(value))
    return value.map(item => normalizeStoredMediaUrls(item)) as T

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeStoredMediaUrls(entry)]),
    ) as T
  }

  return value
}

export interface HistoryEntry {
  id: string
  sections: any[]
  label: string
  timestamp: string
}

function normalizeLoadedPage<T>(loadedPage: T): T {
  return normalizeDashboardPageModes(loadedPage)
}

export function usePageBuilder() {
  const page = ref<any>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const slug = ref('')
  const isDirty = ref(false)
  const recipes = ref<Recipe[]>([])

  async function loadRecipes(oemIdStr: string) {
    try {
      recipes.value = await fetchRecipes(oemIdStr)
    }
    catch {
      recipes.value = []
    }
  }

  const selectedSectionId = ref<string | null>(null)
  const selectedCloneRegionId = ref<string | null>(null)
  // Holds the full region (with editable_fields) emitted by the clone bridge on selection.
  // The persisted section_index is empty until the first save, so the editor must resolve the
  // selected region from this live object rather than only from cloneRegions/section_index.
  const selectedCloneRegionData = ref<CloneRegion | null>(null)
  // Regions the user has touched this session (from bridge selections), keyed by id. Merged into
  // section_index on save so the sidebar region list survives a reload of a fresh clone.
  const cloneRegionDrafts = ref<CloneRegion[]>([])
  const sourceUrlOverride = ref('')

  // History system
  const history = ref<HistoryEntry[]>([])
  const historyIndex = ref(-1)
  const MAX_HISTORY = 50
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < history.value.length - 1)

  let _restoringHistory = false

  function pushHistory(label: string) {
    if (_restoringHistory)
      return
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
    if (index < 0 || index >= history.value.length)
      return
    _restoringHistory = true
    historyIndex.value = index
    const restored = JSON.parse(JSON.stringify(history.value[index].sections))
    sections.value = restored
    isDirty.value = true
    _restoringHistory = false
  }

  function undo() {
    if (!canUndo.value)
      return
    _restoreSections(historyIndex.value - 1)
  }

  function redo() {
    if (!canRedo.value)
      return
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

  const activeMode = computed<PageMode>(() => getActivePageMode(page.value))
  const availableModes = computed<PageMode[]>(() => getAvailablePageModes(page.value))
  const cloneHtml = computed(() => getCloneHtml(page.value))
  const cloneRegions = computed<CloneRegion[]>(() => getCloneRegions(page.value))

  const sections = computed({
    get: () => getSectionItems(page.value).map((section: any) => resolveSectionMediaPaths(section, resolveMediaUrl)),
    set: (val: any[]) => {
      if (page.value?.content) {
        const storedSections = normalizeStoredMediaUrls(val)
        page.value.content.sections = storedSections
        if (!page.value.content.modes)
          page.value.content.modes = {}
        page.value.content.modes.sections = {
          ...(page.value.content.modes.sections ?? {}),
          items: storedSections,
        }
      }
    },
  })

  const selectedSection = computed(() =>
    sections.value.find((s: any) => s.id === selectedSectionId.value) ?? null,
  )

  const isStructured = computed(() => sections.value.length > 0)
  const isCloned = computed(() => cloneHtml.value.trim().length > 0)

  async function loadPage(newSlug: string) {
    slug.value = newSlug
    loading.value = true
    error.value = null
    isDirty.value = false
    selectedSectionId.value = null
    selectedCloneRegionId.value = null
    selectedCloneRegionData.value = null
    cloneRegionDrafts.value = []

    try {
      page.value = normalizeLoadedPage(await fetchGeneratedPage(newSlug, { includeRendered: true, includeModes: true }))
      if (oemId.value) {
        await loadRecipes(oemId.value)
      }
      // Seed hero section images from header.slides if section is missing them
      const heroSec = page.value?.content?.sections?.find((s: any) => s.type === 'hero')
      const slide = page.value?.header?.slides?.[0]
      if (heroSec && slide) {
        if (!heroSec.desktop_image_url && slide.desktop)
          heroSec.desktop_image_url = slide.desktop
        if (!heroSec.mobile_image_url && slide.mobile)
          heroSec.mobile_image_url = slide.mobile
        if (!heroSec.heading && slide.heading)
          heroSec.heading = slide.heading
        if (!heroSec.sub_heading && slide.sub_heading)
          heroSec.sub_heading = slide.sub_heading
        if (!heroSec.cta_text && slide.button)
          heroSec.cta_text = slide.button
      }
      // Reset history with initial entry
      history.value = [{
        id: `h${Date.now().toString(36)}`,
        sections: JSON.parse(JSON.stringify(page.value?.content?.sections ?? [])),
        label: 'Loaded page',
        timestamp: new Date().toISOString(),
      }]
      historyIndex.value = 0
    }
    catch (err: any) {
      error.value = err.message || 'Failed to load page'
      page.value = null
      history.value = []
      historyIndex.value = -1
    }
    finally {
      loading.value = false
    }
  }

  async function refreshPage() {
    if (!slug.value)
      return
    error.value = null
    try {
      page.value = normalizeLoadedPage(await fetchGeneratedPage(slug.value, { includeRendered: true, includeModes: true }))
      isDirty.value = false
    }
    catch (err: any) {
      error.value = err.message || 'Failed to refresh'
    }
  }

  function selectSection(id: string | null) {
    selectedSectionId.value = id
  }

  function setActiveMode(mode: PageMode) {
    if (!availableModes.value.includes(mode))
      return
    if (page.value)
      page.value.active_mode = mode
    if (mode !== 'sections')
      selectedSectionId.value = null
    if (mode !== 'clone') {
      selectedCloneRegionId.value = null
      selectedCloneRegionData.value = null
    }
  }

  function selectCloneRegion(idOrRegion: string | CloneRegion | null) {
    if (idOrRegion == null) {
      selectedCloneRegionId.value = null
      selectedCloneRegionData.value = null
      return
    }

    if (typeof idOrRegion === 'string') {
      selectedCloneRegionId.value = idOrRegion
      selectedCloneRegionData.value = cloneRegions.value.find(region => region.id === idOrRegion) ?? null
      return
    }

    selectedCloneRegionId.value = idOrRegion.id
    selectedCloneRegionData.value = idOrRegion
    upsertCloneRegionDraft(idOrRegion)
  }

  function upsertCloneRegionDraft(region: CloneRegion) {
    const idx = cloneRegionDrafts.value.findIndex(draft => draft.id === region.id)
    if (idx === -1)
      cloneRegionDrafts.value = [...cloneRegionDrafts.value, region]
    else
      cloneRegionDrafts.value = cloneRegionDrafts.value.map((draft, i) => (i === idx ? region : draft))
  }

  // section_index to persist on save: persisted regions plus any touched this session (drafts win).
  const cloneRegionsForSave = computed<CloneRegion[]>(() => {
    const byId = new Map<string, CloneRegion>()
    for (const region of cloneRegions.value)
      byId.set(region.id, region)
    for (const draft of cloneRegionDrafts.value)
      byId.set(draft.id, draft)
    return [...byId.values()]
  })

  function deleteSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1)
      return
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
    if (toIndex < 0 || toIndex >= sections.value.length)
      return
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
    if (!page.value.content.modes) {
      page.value.content.modes = {}
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
    if (!template)
      return
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

  function addSectionFromRecipe(recipe: Recipe, afterIndex?: number) {
    const sectionType = recipe.resolves_to as PageSectionType
    ensureContentExists()
    pushHistory(`Added ${recipe.label}`)
    const baseDefaults = SECTION_DEFAULTS[sectionType]?.() ?? {}
    const { typography, ...sectionDefaults } = recipe.defaults_json
    const newSection = {
      ...baseDefaults,
      ...sectionDefaults,
      type: sectionType,
      id: genId(),
      order: 0,
      _recipe: { pattern: recipe.pattern, variant: recipe.variant, oem_id: recipe.oem_id },
    }
    const updated = [...sections.value]
    const insertAt = afterIndex != null ? afterIndex + 1 : updated.length
    updated.splice(insertAt, 0, newSection)
    updated.forEach((s: any, i: number) => { s.order = i })
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = newSection.id
  }

  function duplicateSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1)
      return
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
    if (idx === -1)
      return
    pushHistory(`Edited ${sections.value[idx].type} section`)
    const updated = [...sections.value]
    updated[idx] = { ...updated[idx], ...updates }
    sections.value = updated
    isDirty.value = true
  }

  function convertSection(id: string, targetType: PageSectionType) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1)
      return
    const source = sections.value[idx]

    // Check if source has multiple items — if so, split & convert each
    const field = getSectionSplittableField(source.type)
    const items = field ? source[field] : null
    if (field && Array.isArray(items) && items.length >= 2) {
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
    if (!converted)
      return
    pushHistory(`Converted ${source.type} → ${targetType}`)
    const updated = [...sections.value]
    updated[idx] = converted
    sections.value = updated
    isDirty.value = true
    selectedSectionId.value = id
  }

  function canSplitSection(type: string): boolean {
    const field = getSectionSplittableField(type)
    return !!field
  }

  function splitSection(id: string) {
    const idx = sections.value.findIndex((s: any) => s.id === id)
    if (idx === -1)
      return
    const source = sections.value[idx]
    const field = getSectionSplittableField(source.type)
    if (!field)
      return
    const items = source[field]
    if (!Array.isArray(items) || items.length < 2)
      return

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
    if (!oemId.value || !modelSlug.value)
      return
    saving.value = true
    try {
      const storedSections = normalizeStoredMediaUrls(sections.value)
      await updatePageSections(oemId.value, modelSlug.value, storedSections)
      if (page.value?.content)
        page.value.content.sections = storedSections
      isDirty.value = false
      // Bump version locally
      if (page.value)
        page.value.version = (page.value.version || 0) + 1
    }
    catch (err: any) {
      error.value = err.message || 'Save failed'
    }
    finally {
      saving.value = false
    }
  }

  async function saveClone(editedRendered: string, sectionIndex?: CloneRegion[]): Promise<boolean> {
    if (!oemId.value || !modelSlug.value)
      return false
    saving.value = true
    try {
      const payload: { edited_rendered: string, section_index?: CloneRegion[] } = {
        edited_rendered: editedRendered,
      }
      if (sectionIndex)
        payload.section_index = sectionIndex

      const result = await updateClonePage(oemId.value, modelSlug.value, payload)

      ensureContentExists()
      const modes = page.value.content.modes
      modes.clone = {
        ...(modes.clone ?? {}),
        edited_rendered: editedRendered,
        ...(sectionIndex ? { section_index: sectionIndex } : {}),
      }
      page.value.content.rendered = editedRendered
      page.value.active_mode = 'clone'
      page.value.version = result?.version ?? ((page.value.version || 0) + 1)
      isDirty.value = false
      // Drafts are now persisted into section_index; clear so they don't accumulate.
      cloneRegionDrafts.value = []
      return true
    }
    catch (err: any) {
      error.value = err.message || 'Save failed'
      return false
    }
    finally {
      saving.value = false
    }
  }

  const regenerating = ref(false)

  async function regenerateSectionById(id: string) {
    const section = sections.value.find((s: any) => s.id === id)
    if (!section || !oemId.value || !modelSlug.value)
      return
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
    }
    catch (err: any) {
      error.value = err.message || 'Regenerate failed'
    }
    finally {
      regenerating.value = false
    }
  }

  const cloning = ref(false)

  async function handleClone() {
    if (!oemId.value || !modelSlug.value)
      return
    cloning.value = true
    try {
      const overrideUrl = sourceUrlOverride.value?.trim() || undefined
      await clonePage(oemId.value, modelSlug.value, overrideUrl)
      await refreshPage()
    }
    catch (err: any) {
      error.value = err.message || 'Clone failed'
    }
    finally {
      cloning.value = false
    }
  }

  const structuring = ref(false)

  async function handleStructure(modelOverride?: { provider: string, model: string }) {
    if (!oemId.value || !modelSlug.value)
      return
    structuring.value = true
    try {
      await structurePage(oemId.value, modelSlug.value, modelOverride)
      await refreshPage()
    }
    catch (err: any) {
      error.value = err.message || 'Structuring failed'
    }
    finally {
      structuring.value = false
    }
  }

  const pipelining = ref(false)
  const pipelineResult = ref<any>(null)

  async function handleAdaptivePipeline(modelOverride?: { provider: string, model: string }) {
    if (!oemId.value || !modelSlug.value)
      return
    pipelining.value = true
    pipelineResult.value = null
    try {
      const overrideUrl = sourceUrlOverride.value?.trim() || undefined
      const result = await apiAdaptivePipeline(oemId.value, modelSlug.value, overrideUrl, modelOverride)
      pipelineResult.value = result
      await refreshPage()
    }
    catch (err: any) {
      error.value = err.message || 'Pipeline failed'
    }
    finally {
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
    if (!section)
      return false
    try {
      await navigator.clipboard.writeText(JSON.stringify(section, null, 2))
      return true
    }
    catch {
      return false
    }
  }

  async function pasteSectionFromClipboard(afterIndex?: number): Promise<boolean> {
    try {
      const text = await navigator.clipboard.readText()
      const parsed = JSON.parse(text)
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      // Basic validation: each entry must have a type
      if (!arr.every((s: any) => s && typeof s.type === 'string'))
        return false
      pasteSections(arr, afterIndex)
      return true
    }
    catch {
      return false
    }
  }

  async function saveCurrentAsRecipe(sectionId: string) {
    const section = sections.value.find((s: any) => s.id === sectionId)
    if (!section || !oemId.value)
      return

    const mapping = getSectionRecipePattern(section.type)

    const defaults_json = getSectionRecipeDefaults(section)

    const oemName = oemId.value.replace('-au', '').replace(/^\w/, c => c.toUpperCase())
    const label = `${oemName} ${section.heading || section.title || mapping.variant} (custom)`

    try {
      await saveRecipe({
        oem_id: oemId.value,
        pattern: mapping.pattern,
        variant: `${mapping.variant}-custom-${Date.now().toString(36)}`,
        label,
        resolves_to: section.type,
        defaults_json,
      })
      // Reload recipes to include the new one
      await loadRecipes(oemId.value)
    }
    catch (err: any) {
      error.value = err.message || 'Failed to save recipe'
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
    if (!page.value)
      return 'empty'
    if (isStructured.value)
      return 'structured'
    if (isCloned.value)
      return 'cloned'
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
    activeMode,
    availableModes,
    cloneHtml,
    cloneRegions,
    cloneRegionsForSave,
    selectedCloneRegionId,
    selectedCloneRegionData,
    regenerating,
    cloning,
    structuring,
    pipelining,
    pipelineResult,
    workflowStage,
    recipes,
    loadRecipes,
    // History
    history,
    historyIndex,
    canUndo,
    canRedo,
    // Methods
    loadPage,
    refreshPage,
    selectSection,
    setActiveMode,
    selectCloneRegion,
    deleteSection,
    moveSection,
    addSection,
    addSectionFromTemplate,
    addSectionFromLiveData,
    addSectionFromRecipe,
    duplicateSection,
    updateSection,
    saveSections,
    saveClone,
    regenerateSectionById,
    handleClone,
    handleStructure,
    handleAdaptivePipeline,
    // History methods
    undo,
    redo,
    jumpTo,
    // Recipe methods
    saveCurrentAsRecipe,
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
