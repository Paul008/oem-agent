export type PageWorkflowState = 'missing' | 'empty' | 'cloned' | 'structured' | 'custom'

export type PrimaryWorkflowActionKey = 'pipeline' | 'structure' | 'save' | 'edit'

export interface PrimaryWorkflowAction {
  key: PrimaryWorkflowActionKey
  label: string
}

interface PageWorkflowPage {
  page_type?: string | null
  content?: {
    sections?: unknown
    rendered?: unknown
  } | null
}

export function getPageWorkflowState(input: {
  page: PageWorkflowPage | null | undefined
  error: string | null | undefined
}): PageWorkflowState {
  if (input.error?.toLowerCase().includes('404'))
    return 'missing'

  const page = input.page
  if (page?.page_type === 'custom')
    return 'custom'

  const sections = page?.content?.sections
  if (Array.isArray(sections) && sections.length > 0)
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
