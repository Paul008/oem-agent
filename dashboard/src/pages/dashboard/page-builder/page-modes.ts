export type PageMode = 'clone' | 'sections' | 'raw-html' | 'generated' | 'template'

export interface CloneEditableField {
  id: string
  selector: string
  kind: 'text' | 'html' | 'image' | 'link' | 'button' | 'background' | 'visibility'
  label: string
  value: string
}

export interface CloneRegion {
  id: string
  label: string
  selector: string
  tag: string
  classes: string[]
  left?: number
  top: number
  width?: number
  height: number
  toolbar_x?: number
  toolbar_y?: number
  type_hint?: string
  editable_fields: CloneEditableField[]
  height_override?: number
  panel_index?: number
}

export interface CloneViewport {
  width: number
  height: number
}

interface DashboardPageContent {
  rendered?: unknown
  sections?: unknown
  modes?: DashboardPageModes | null
}

interface DashboardPage {
  active_mode?: string | null
  content?: DashboardPageContent | null
}

interface CloneModeContent extends Record<string, unknown> {
  rendered?: unknown
  edited_rendered?: unknown
  section_index?: unknown
  stylesheet_urls?: unknown
  viewport?: unknown
}

interface SectionsModeContent extends Record<string, unknown> {
  items?: unknown
}

interface DashboardPageModes extends Record<string, unknown> {
  clone?: CloneModeContent
  sections?: SectionsModeContent
  raw_html?: unknown
  generated?: unknown
  template?: unknown
  'raw-html'?: unknown
}

const PAGE_MODE_ORDER: PageMode[] = ['clone', 'sections', 'raw-html', 'generated', 'template']
const CLONE_HEAD_PART_PATTERN = /<link\b[^>]*>|<style\b[^>]*>[\s\S]*?<\/style>/gi
const FALLBACK_CLONE_VIEWPORT: CloneViewport = { width: 1280, height: 1080 }

export function normalizeDashboardPageModes<T extends any>(page: T): T {
  if (!page || !isRecord(page)) {
    return page
  }

  const dashboardPage = page as DashboardPage
  const content = ensureContent(dashboardPage)
  const modes = ensureModes(content)
  const legacyRendered = typeof content.rendered === 'string' ? content.rendered : ''
  const legacySections = Array.isArray(content.sections) ? content.sections : []

  if (!isRecord(modes.clone) && legacyRendered.length > 0) {
    modes.clone = {
      rendered: legacyRendered,
      section_index: [],
    }
  }

  if (!isRecord(modes.sections) && legacySections.length > 0) {
    modes.sections = {
      items: legacySections,
    }
  }

  content.rendered = getCloneHtml({ ...dashboardPage, content }) || legacyRendered || ''
  content.sections = getSectionItems({ ...dashboardPage, content })
  dashboardPage.active_mode = getActivePageMode(dashboardPage)

  return page
}

export function getActivePageMode(page: DashboardPage | null | undefined): PageMode {
  const activeMode = normalizeModeName(page?.active_mode)
  const availableModes = getAvailablePageModes(page)

  if (activeMode && availableModes.includes(activeMode)) {
    return activeMode
  }

  return availableModes[0] ?? 'sections'
}

export function getAvailablePageModes(page: DashboardPage | null | undefined): PageMode[] {
  const modes = isRecord(page?.content?.modes)
    ? page.content.modes
    : {}
  const availableModes: PageMode[] = []

  for (const mode of PAGE_MODE_ORDER) {
    if (isModeAvailable(mode, page, modes)) {
      availableModes.push(mode)
    }
  }

  return availableModes
}

export function getCloneHtml(page: DashboardPage | null | undefined): string {
  const clone = getCloneMode(page)
  const editedRendered = clone?.edited_rendered
  const cloneRendered = clone?.rendered
  const legacyRendered = page?.content?.rendered

  if (typeof editedRendered === 'string' && editedRendered.length > 0) {
    return editedRendered
  }

  if (typeof cloneRendered === 'string' && cloneRendered.length > 0) {
    return cloneRendered
  }

  if (typeof legacyRendered === 'string' && legacyRendered.length > 0) {
    return legacyRendered
  }

  return ''
}

export function getCloneStudioHtml(page: DashboardPage | null | undefined): string {
  const clone = getCloneMode(page)
  const editedRendered = clone?.edited_rendered
  if (typeof editedRendered !== 'string' || editedRendered.length === 0) {
    return getCloneHtml(page)
  }

  const originalRendered = typeof clone?.rendered === 'string' ? clone.rendered : ''
  return [
    ...extractCloneHeadParts(originalRendered),
    editedRendered,
  ].filter(part => part.length > 0).join('\n')
}

export function getCloneRegions(page: DashboardPage | null | undefined): CloneRegion[] {
  const sectionIndex = getCloneMode(page)?.section_index

  return Array.isArray(sectionIndex) ? sectionIndex as CloneRegion[] : []
}

/**
 * OEM stylesheet URLs for the clone. Sourced from the structured `stylesheet_urls` captured with the
 * clone; falls back to extracting `<link rel="stylesheet">` hrefs from the original captured HTML.
 * Decoupling styling from the editable body keeps OEM CSS applied even after edits strip head links.
 */
export function getCloneStylesheetUrls(page: DashboardPage | null | undefined): string[] {
  const clone = getCloneMode(page)
  const stored = clone?.stylesheet_urls
  if (Array.isArray(stored)) {
    const urls = stored.filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
    if (urls.length > 0)
      return dedupe(urls)
  }

  const cloneRendered = typeof clone?.rendered === 'string' ? clone.rendered : ''
  return dedupe(extractStylesheetHrefs(cloneRendered))
}

export function getCloneViewport(page: DashboardPage | null | undefined): CloneViewport {
  const viewport = getCloneMode(page)?.viewport
  if (!isRecord(viewport))
    return { ...FALLBACK_CLONE_VIEWPORT }

  const width = viewport.width
  const height = viewport.height
  if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height))
    return { ...FALLBACK_CLONE_VIEWPORT }

  return { width, height }
}

function extractStylesheetHrefs(html: string): string[] {
  return [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]
    .map((match) => {
      const href = match[0].match(/\bhref=["']([^"']+)["']/i)
      return href?.[1] ?? ''
    })
    .filter(url => /^https?:\/\//i.test(url))
}

function extractCloneHeadParts(html: string): string[] {
  return [...html.matchAll(CLONE_HEAD_PART_PATTERN)].map(match => match[0])
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)]
}

export function applyRegionHeightOverride(
  regions: CloneRegion[],
  regionId: string,
  height: number | null,
): CloneRegion[] {
  return regions.map((r) => {
    if (r.id !== regionId) return r
    const next = { ...r }
    if (height == null) delete next.height_override
    else next.height_override = height
    return next
  })
}

export function getSectionItems(page: DashboardPage | null | undefined): any[] {
  const sectionItems = getSectionsMode(page)?.items
  const legacySections = Array.isArray(page?.content?.sections) ? page.content.sections : []

  if (Array.isArray(sectionItems) && sectionItems.length > 0) {
    return sectionItems
  }

  return legacySections
}

function ensureContent(page: DashboardPage): DashboardPageContent {
  if (!isRecord(page.content)) {
    page.content = {}
  }

  return page.content
}

function ensureModes(content: DashboardPageContent): DashboardPageModes {
  if (!isRecord(content.modes)) {
    content.modes = {}
  }

  return content.modes
}

function getCloneMode(page: DashboardPage | null | undefined): CloneModeContent | undefined {
  const cloneMode = page?.content?.modes?.clone

  return isRecord(cloneMode) ? cloneMode as CloneModeContent : undefined
}

function getSectionsMode(page: DashboardPage | null | undefined): SectionsModeContent | undefined {
  const sectionsMode = page?.content?.modes?.sections

  return isRecord(sectionsMode) ? sectionsMode as SectionsModeContent : undefined
}

function isModeAvailable(mode: PageMode, page: DashboardPage | null | undefined, modes: Record<string, unknown>): boolean {
  switch (mode) {
    case 'clone':
      return getCloneHtml(page).length > 0
    case 'sections':
      return getSectionItems(page).length > 0
    case 'raw-html':
      return hasModeValue(modes['raw-html']) || hasModeValue(modes.raw_html)
    case 'generated':
      return hasModeValue(modes.generated)
    case 'template':
      return hasModeValue(modes.template)
  }
}

function hasModeValue(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0
  }

  if (typeof value === 'string') {
    return value.length > 0
  }

  if (!isRecord(value)) {
    return Boolean(value)
  }

  if (Array.isArray(value.items)) {
    return value.items.length > 0
  }

  if (Array.isArray(value.sections)) {
    return value.sections.length > 0
  }

  if (typeof value.rendered === 'string') {
    return value.rendered.length > 0
  }

  return Object.keys(value).length > 0
}

function normalizeModeName(mode: unknown): PageMode | undefined {
  if (mode === 'raw_html') {
    return 'raw-html'
  }

  return typeof mode === 'string' && PAGE_MODE_ORDER.includes(mode as PageMode)
    ? mode as PageMode
    : undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isPositiveFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}
