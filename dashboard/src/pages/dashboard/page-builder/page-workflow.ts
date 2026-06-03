export type PageWorkflowState = 'missing' | 'empty' | 'cloned' | 'structured' | 'custom'

export type PrimaryWorkflowActionKey = 'pipeline' | 'structure' | 'save' | 'edit'

export type DestructivePageAction = 'clone' | 'structure' | 'pipeline' | 'template'

export interface PrimaryWorkflowAction {
  key: PrimaryWorkflowActionKey
  label: string
}

export interface PipelineActionDisabledOptions {
  needsSourceUrl: boolean
  sourceUrlOverride?: string | null
  pipelining?: boolean
  cloning?: boolean
  structuring?: boolean
}

interface PageWorkflowPage {
  active_mode?: string | null
  page_type?: string | null
  manually_edited?: boolean | null
  content?: {
    sections?: unknown
    rendered?: unknown
    modes?: unknown
  } | null
}

export function getPageWorkflowState(input: {
  page: PageWorkflowPage | null | undefined
  error: string | null | undefined
}): PageWorkflowState {
  const page = input.page
  if (page?.page_type === 'custom')
    return 'custom'

  if (page?.active_mode === 'clone' && hasClonePayload(page))
    return 'cloned'

  if (hasStructuredSections(page))
    return 'structured'

  const rendered = page?.content?.rendered
  if (typeof rendered === 'string') {
    const normalizedRendered = rendered.toLowerCase()
    if (
      normalizedRendered.includes('tailwindcss.com')
      || normalizedRendered.includes('<link rel="stylesheet"')
    ) {
      return 'cloned'
    }
  }

  if (input.error?.toLowerCase().includes('404'))
    return 'missing'

  return 'empty'
}

export function getPrimaryWorkflowAction(
  state: PageWorkflowState,
  options: { isDirty?: boolean } = {},
): PrimaryWorkflowAction {
  if (state === 'missing' || state === 'empty')
    return { key: 'pipeline', label: 'Run Pipeline' }

  if (state === 'cloned')
    return { key: 'structure', label: 'Structure Page' }

  if (state === 'structured' && options.isDirty)
    return { key: 'save', label: 'Save' }

  return { key: 'edit', label: 'Edit Sections' }
}

export function isPipelineActionDisabled(options: PipelineActionDisabledOptions): boolean {
  return Boolean(
    options.pipelining
    || options.cloning
    || options.structuring
    || (options.needsSourceUrl && !options.sourceUrlOverride?.trim()),
  )
}

export function shouldShowSourceUrlInput(state: PageWorkflowState): boolean {
  return state !== 'custom'
}

export function needsDestructiveActionConfirmation(
  action: DestructivePageAction,
  page: PageWorkflowPage | null | undefined,
): boolean {
  const hasManualEdits = page?.manually_edited === true
  const hasSections = hasStructuredSections(page)
  const hasClone = hasClonePayload(page)

  switch (action) {
    case 'clone':
      return hasManualEdits || hasSections
    case 'structure':
      return hasManualEdits && hasSections
    case 'pipeline':
    case 'template':
      return hasManualEdits || hasSections || hasClone
  }
}

function hasClonePayload(page: PageWorkflowPage | null | undefined): boolean {
  const rendered = page?.content?.rendered

  if (isNonEmptyString(rendered))
    return true

  const cloneMode = isRecord(page?.content?.modes)
    && isRecord(page.content.modes.clone)
    ? page.content.modes.clone
    : null

  return isNonEmptyString(cloneMode?.rendered)
    || isNonEmptyString(cloneMode?.edited_rendered)
}

function hasStructuredSections(page: PageWorkflowPage | null | undefined): boolean {
  const sections = page?.content?.sections

  if (Array.isArray(sections) && sections.length > 0)
    return true

  const sectionItems = isRecord(page?.content?.modes)
    && isRecord(page.content.modes.sections)
    ? page.content.modes.sections.items
    : null

  return Array.isArray(sectionItems) && sectionItems.length > 0
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
