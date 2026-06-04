export type GeneratedPageStatus = 'unknown' | 'structured' | 'cloned' | 'generated'

export interface GeneratedPageForStatus {
  content?: {
    rendered?: unknown
    sections?: unknown
    modes?: unknown
  } | null
}

export interface GeneratedPageStatusSummary {
  total: number
  loaded: number
  unknown: number
  structured: number
  cloned: number
  generated: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function contentRecord(page: GeneratedPageForStatus | null | undefined): Record<string, unknown> | null {
  if (!page || !isRecord(page.content))
    return null
  return page.content
}

function itemCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0
}

function modeSectionCount(modes: unknown): number {
  if (!isRecord(modes))
    return 0

  const sections = modes.sections
  if (Array.isArray(sections))
    return sections.length

  if (!isRecord(sections))
    return 0

  return itemCount(sections.items)
}

export function getGeneratedPageSectionCount(page: GeneratedPageForStatus | null | undefined): number {
  const content = contentRecord(page)
  if (!content)
    return 0

  return Math.max(
    itemCount(content.sections),
    modeSectionCount(content.modes),
  )
}

export function hasGeneratedPageSections(page: GeneratedPageForStatus | null | undefined): boolean {
  return getGeneratedPageSectionCount(page) > 0
}

function hasLegacyCloneMarker(rendered: unknown): boolean {
  if (!nonEmptyString(rendered))
    return false

  return rendered.includes('tailwindcss.com') || rendered.includes('<link rel="stylesheet"')
}

function hasModeCloneHtml(modes: unknown): boolean {
  if (!isRecord(modes) || !isRecord(modes.clone))
    return false

  return nonEmptyString(modes.clone.rendered) || nonEmptyString(modes.clone.edited_rendered)
}

export function hasGeneratedPageClone(page: GeneratedPageForStatus | null | undefined): boolean {
  const content = contentRecord(page)
  if (!content)
    return false

  return hasModeCloneHtml(content.modes) || hasLegacyCloneMarker(content.rendered)
}

export function getGeneratedPageStatus(page: GeneratedPageForStatus | null | undefined): GeneratedPageStatus {
  if (!page)
    return 'unknown'

  if (hasGeneratedPageSections(page))
    return 'structured'

  if (hasGeneratedPageClone(page))
    return 'cloned'

  return 'generated'
}

export function summarizeGeneratedPageStatuses(pages: Iterable<GeneratedPageForStatus | null | undefined>): GeneratedPageStatusSummary {
  const summary: GeneratedPageStatusSummary = {
    total: 0,
    loaded: 0,
    unknown: 0,
    structured: 0,
    cloned: 0,
    generated: 0,
  }

  for (const page of pages) {
    const status = getGeneratedPageStatus(page)
    summary.total += 1
    summary[status] += 1
    if (status !== 'unknown')
      summary.loaded += 1
  }

  return summary
}
