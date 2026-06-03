export type PageMode = 'clone' | 'sections' | 'raw-html' | 'generated' | 'template'

export interface CloneEditableField {
  id?: string
  label?: string
  selector?: string
  type?: string
  attribute?: string
  value?: string
  [key: string]: unknown
}

export interface CloneSectionRegion {
  id: string
  label: string
  selector: string
  tag: string
  classes: string[]
  top: number
  height: number
  editable_fields: CloneEditableField[]
  [key: string]: unknown
}

export interface CloneModeContent {
  rendered: string
  edited_rendered?: string
  source_url?: string
  captured_at: string
  viewport?: {
    width: number
    height: number
  }
  asset_map: Record<string, string>
  stylesheet_urls: string[]
  section_index: CloneSectionRegion[]
  stripped_selectors: string[]
  warnings: string[]
  [key: string]: unknown
}

export interface SectionsModeContent {
  items: any[]
  source?: {
    mode?: PageMode | string
    version?: number
    generated_at?: string
  }
  [key: string]: unknown
}

export interface PageModes {
  clone?: CloneModeContent
  sections?: SectionsModeContent
  raw_html?: { items: any[]; [key: string]: unknown }
  generated?: { items: any[]; [key: string]: unknown }
  template?: { items: any[]; [key: string]: unknown }
}

export interface ModeAwarePage {
  id?: string
  version?: number
  active_mode?: PageMode | string
  content?: {
    rendered?: string
    sections?: any[]
    modes?: PageModes
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface CloneCaptureInput {
  rendered: string
  source_url?: string
  viewport?: {
    width: number
    height: number
  }
  asset_map?: Record<string, string>
  stylesheet_urls?: string[]
  section_index?: CloneSectionRegion[]
  warnings?: string[]
}

interface CloneEditInput {
  edited_rendered: string
  section_index: CloneSectionRegion[]
}

interface SectionsModeSourceInput {
  sourceMode?: PageMode | string
  sourceVersion?: number
  generatedAt?: string
}

const MODE_PREFERENCE: PageMode[] = ['clone', 'sections', 'generated', 'raw-html', 'template']

export function normalizePageModes<T extends ModeAwarePage>(page: T): T {
  const content = ensureContent(page)
  const modes = ensureModes(content)
  const legacyRendered = typeof content.rendered === 'string' ? content.rendered : ''
  const legacySections = Array.isArray(content.sections) ? content.sections : []

  if (!modes.clone && legacyRendered.trim().length > 0) {
    modes.clone = normalizeCloneMode({
      rendered: legacyRendered,
      stylesheet_urls: extractStylesheetUrls(legacyRendered),
    }, legacyRendered)
  } else if (modes.clone) {
    modes.clone = normalizeCloneMode(modes.clone, legacyRendered)
  }

  if (!modes.sections && legacySections.length > 0) {
    modes.sections = {
      items: legacySections,
    }
  } else if (modes.sections && !Array.isArray(modes.sections.items)) {
    modes.sections.items = legacySections
  }

  const activeMode = normalizeModeName(page.active_mode)
  page.active_mode = activeMode && isModeAvailable(activeMode, modes)
    ? activeMode
    : chooseActiveMode(modes)

  content.rendered = getRenderableCloneHtml(page)
  content.sections = Array.isArray(modes.sections?.items) ? modes.sections.items : legacySections

  return page
}

export function applyCloneMode<T extends ModeAwarePage>(
  page: T,
  input: CloneCaptureInput,
  options?: { activate?: boolean },
): T {
  normalizePageModes(page)

  const content = ensureContent(page)
  const modes = ensureModes(content)
  const activeBeforeCapture = normalizeModeName(page.active_mode)
  const hadAvailableActiveMode = activeBeforeCapture
    ? isModeAvailable(activeBeforeCapture, modes)
    : false

  modes.clone = {
    rendered: input.rendered,
    source_url: input.source_url,
    captured_at: new Date().toISOString(),
    viewport: input.viewport,
    asset_map: input.asset_map ?? {},
    stylesheet_urls: input.stylesheet_urls ?? extractStylesheetUrls(input.rendered),
    section_index: input.section_index ?? [],
    stripped_selectors: [],
    warnings: input.warnings ?? [],
  }

  content.rendered = input.rendered
  content.sections = Array.isArray(modes.sections?.items)
    ? modes.sections.items
    : Array.isArray(content.sections)
      ? content.sections
      : []

  if (options?.activate === true || !hadAvailableActiveMode) {
    page.active_mode = 'clone'
  }

  return page
}

export function applySectionsMode<T extends ModeAwarePage>(
  page: T,
  sections: any[],
  source: SectionsModeSourceInput = {},
): T {
  normalizePageModes(page)

  const content = ensureContent(page)
  const modes = ensureModes(content)
  const activeBeforeSections = normalizeModeName(page.active_mode)
  const hadAvailableActiveMode = activeBeforeSections
    ? isModeAvailable(activeBeforeSections, modes)
    : false

  modes.sections = {
    items: sections,
    source: {
      mode: source.sourceMode,
      version: source.sourceVersion,
      generated_at: source.generatedAt,
    },
  }
  content.sections = sections
  content.rendered = getRenderableCloneHtml(page)

  if (!hadAvailableActiveMode) {
    page.active_mode = 'sections'
  }

  return page
}

export function applyCloneEdit<T extends ModeAwarePage>(page: T, input: CloneEditInput): T {
  normalizePageModes(page)

  const content = ensureContent(page)
  const modes = ensureModes(content)

  if (!modes.clone) {
    throw new Error('Cannot apply clone edit without clone mode content')
  }

  modes.clone.edited_rendered = input.edited_rendered
  modes.clone.section_index = input.section_index
  content.rendered = input.edited_rendered
  page.active_mode = 'clone'

  return page
}

export function getRenderableCloneHtml(page: ModeAwarePage): string {
  const content = page.content
  const clone = content?.modes?.clone
  const editedClone = clone?.edited_rendered
  const originalClone = clone?.rendered
  const legacyRendered = content?.rendered

  if (typeof editedClone === 'string' && editedClone.length > 0) {
    return editedClone
  }

  if (typeof originalClone === 'string' && originalClone.length > 0) {
    return originalClone
  }

  if (typeof legacyRendered === 'string' && legacyRendered.length > 0) {
    return legacyRendered
  }

  return ''
}

function ensureContent(page: ModeAwarePage): NonNullable<ModeAwarePage['content']> {
  if (!isRecord(page.content)) {
    page.content = {}
  }

  return page.content
}

function ensureModes(content: NonNullable<ModeAwarePage['content']>): PageModes {
  if (!isRecord(content.modes)) {
    content.modes = {}
  }

  const modes = content.modes
  const hyphenatedRawHtml = (modes as Record<string, unknown>)['raw-html']

  if (!modes.raw_html && isRecord(hyphenatedRawHtml) && Array.isArray(hyphenatedRawHtml.items)) {
    modes.raw_html = hyphenatedRawHtml as PageModes['raw_html']
  }

  return modes
}

function normalizeCloneMode(input: Partial<CloneModeContent>, fallbackRendered: string): CloneModeContent {
  const rendered = typeof input.rendered === 'string' ? input.rendered : fallbackRendered
  const clone: CloneModeContent = {
    ...input,
    rendered,
    captured_at: typeof input.captured_at === 'string' ? input.captured_at : '',
    asset_map: isStringRecord(input.asset_map) ? input.asset_map : {},
    stylesheet_urls: Array.isArray(input.stylesheet_urls)
      ? input.stylesheet_urls
      : extractStylesheetUrls(rendered || fallbackRendered),
    section_index: Array.isArray(input.section_index) ? input.section_index : [],
    stripped_selectors: Array.isArray(input.stripped_selectors) ? input.stripped_selectors : [],
    warnings: Array.isArray(input.warnings) ? input.warnings : [],
  }

  if (typeof input.edited_rendered === 'string') {
    clone.edited_rendered = input.edited_rendered
  }

  return clone
}

function chooseActiveMode(modes: PageModes): PageMode {
  for (const mode of MODE_PREFERENCE) {
    if (isModeAvailable(mode, modes)) {
      return mode
    }
  }

  return 'sections'
}

function isModeAvailable(mode: PageMode, modes: PageModes): boolean {
  switch (mode) {
    case 'clone':
      return Boolean(modes.clone && getRenderableCloneHtml({ content: { modes } }).length > 0)
    case 'sections':
      return Array.isArray(modes.sections?.items)
    case 'generated':
      return Array.isArray(modes.generated?.items)
    case 'raw-html':
      return Array.isArray(modes.raw_html?.items)
    case 'template':
      return Array.isArray(modes.template?.items)
  }
}

function normalizeModeName(mode: unknown): PageMode | undefined {
  if (mode === 'raw_html') {
    return 'raw-html'
  }

  return typeof mode === 'string' && MODE_PREFERENCE.includes(mode as PageMode)
    ? mode as PageMode
    : undefined
}

function extractStylesheetUrls(html: string): string[] {
  const stylesheetUrls: string[] = []
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? []

  for (const linkTag of linkTags) {
    const rel = getHtmlAttribute(linkTag, 'rel')

    if (!rel?.toLowerCase().split(/\s+/).includes('stylesheet')) {
      continue
    }

    const href = getHtmlAttribute(linkTag, 'href')

    if (href) {
      stylesheetUrls.push(href)
    }
  }

  return stylesheetUrls
}

function getHtmlAttribute(tag: string, attribute: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${attribute}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i'))

  return match?.[1] ?? match?.[2] ?? match?.[3]
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'string')
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
