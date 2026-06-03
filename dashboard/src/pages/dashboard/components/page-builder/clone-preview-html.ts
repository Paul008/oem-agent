export function disableClonePreviewNavigation(rendered: string): string {
  return rendered.replace(/<a\b([^>]*)>/gi, (_match: string, attrs: string) => {
    let nextAttrs = attrs
      .replace(/\s+onclick\s*=\s*(["'])(.*?)\1/gi, (_onclickMatch: string, _quote: string, onclickValue: string) => {
        return ` data-oem-preview-onclick="${escapeHtmlAttribute(onclickValue)}"`
      })
      .replace(/\s+href\s*=\s*(["'])(.*?)\1/i, (_hrefMatch: string, _quote: string, hrefValue: string) => {
        return ` href="#oem-preview-disabled" data-oem-preview-href="${escapeHtmlAttribute(hrefValue)}"`
      })

    if (!/\shref\s*=/i.test(nextAttrs))
      nextAttrs += ' href="#oem-preview-disabled"'

    return `<a${nextAttrs} data-oem-preview-link="true" onclick="return false">`
  })
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
}
