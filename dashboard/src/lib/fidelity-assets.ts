function workerRoot(workerBase: string): string {
  return String(workerBase || '').replace(/\/+$/, '')
}

function encodeUrl(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function proxyFidelityAssetUrl(rawUrl: string, oemId: string, workerBase: string): string {
  const value = String(rawUrl || '').trim()
  if (!value || value.startsWith('#') || /^(?:data|blob|javascript|mailto|tel):/i.test(value))
    return value

  const root = workerRoot(workerBase)
  if (value.startsWith('/media/'))
    return `${root}${value}`
  if (value.startsWith(`${root}/media/`))
    return value

  const absolute = value.startsWith('//') ? `https:${value}` : value
  if (!/^https?:\/\//i.test(absolute))
    return value

  return `${root}/media/${encodeURIComponent(oemId)}/${encodeUrl(absolute)}`
}

function rewriteSrcset(value: string, oemId: string, workerBase: string): string {
  if (/^\s*data:/i.test(value))
    return value
  return value.split(',').map((entry) => {
    const match = entry.trim().match(/^(\S+)(\s+(?:\S.*)?)?$/)
    return match ? `${proxyFidelityAssetUrl(match[1], oemId, workerBase)}${match[2] || ''}` : entry
  }).join(', ')
}

export function rewriteFidelityHtmlAssetUrls(html: string, oemId: string, workerBase: string): string {
  return String(html || '')
    .replace(/(\b(?:src|poster)\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${proxyFidelityAssetUrl(value, oemId, workerBase)}${quote}`)
    .replace(/(\bsrcset\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, value: string) =>
      `${prefix}${quote}${rewriteSrcset(value, oemId, workerBase)}${quote}`)
}

export function rewriteFidelityCssAssetUrls(css: string, oemId: string, workerBase: string): string {
  return String(css || '').replace(/url\((['"]?)([^"')]+)\1\)/gi, (match, quote: string, value: string) => {
    const proxied = proxyFidelityAssetUrl(value, oemId, workerBase)
    if (proxied === value.trim())
      return match
    return `url(${quote || '"'}${proxied}${quote || '"'})`
  })
}

/**
 * Drops `srcset` attributes so fidelity captures stay self-contained. html-to-image
 * inlines `<img src>` as a data URL but never inlines `<source srcset>`, and an SVG
 * used as an image cannot load external subresources — a live proxied `srcset` URL
 * therefore renders as a broken image in the capture on both sides of the comparison
 * (blank == blank false positive) and floods the media proxy with variant requests
 * while the frames load.
 */
export function stripFidelitySrcsetAttributes(html: string): string {
  return String(html || '').replace(/\ssrcset\s*=\s*("[^"]*"|'[^']*')/gi, '')
}

export function extractDeclaredFontFamilies(css: string): string[] {
  const families: string[] = []
  for (const match of String(css || '').matchAll(/@font-face\s*\{([\s\S]*?)\}/gi)) {
    const family = match[1].match(/font-family\s*:\s*([^;}]+)/i)?.[1]?.trim().replace(/^["']|["']$/g, '')
    if (family && !families.includes(family))
      families.push(family)
  }
  return families
}
