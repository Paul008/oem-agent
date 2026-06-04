export function buildRawHtmlSectionFromCloneRegion(html: string | null | undefined): Record<string, any> | null {
  const trimmed = typeof html === 'string' ? html.trim() : ''
  if (!trimmed)
    return null

  return {
    type: 'content-block',
    title: '',
    content_html: '',
    _generated_html: trimmed,
    animation: 'fade-in',
  }
}
