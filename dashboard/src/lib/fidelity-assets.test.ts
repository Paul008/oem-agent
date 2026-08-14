import { describe, expect, it } from 'vitest'

import { extractDeclaredFontFamilies, rewriteFidelityCssAssetUrls, rewriteFidelityHtmlAssetUrls, stripFidelitySrcsetAttributes } from './fidelity-assets'

const worker = 'https://oem-agent.adme-dev.workers.dev'

describe('fidelity comparison assets', () => {
  it('makes captured Worker media paths absolute inside srcdoc frames', () => {
    const html = `<img src="/media/pages/assets/nissan-au/navara/hero.webp"><video poster="${worker}/media/nissan-au/abc"></video>`

    expect(rewriteFidelityHtmlAssetUrls(html, 'nissan-au', worker)).toBe(
      `<img src="${worker}/media/pages/assets/nissan-au/navara/hero.webp"><video poster="${worker}/media/nissan-au/abc"></video>`,
    )
  })

  it('proxies absolute HTML and CSS assets so comparison frames do not depend on OEM CORS', () => {
    const html = rewriteFidelityHtmlAssetUrls('<img src="https://navara.nissan.com.au/hero.webp">', 'nissan-au', worker)
    const css = rewriteFidelityCssAssetUrls('@font-face{font-family:"Nissan";src:url(https://navara.nissan.com.au/font.woff2)}', 'nissan-au', worker)

    expect(html).toMatch(new RegExp(`src="${worker}/media/nissan-au/`))
    expect(css).toMatch(new RegExp(`url\\("${worker}/media/nissan-au/`))
    expect(css).not.toContain('url("https://navara.nissan.com.au')
  })

  it('leaves data URLs untouched and extracts declared font families', () => {
    const css = '@font-face { font-family: Nissan Brand; src: url(data:font/woff2;base64,abc) }\n@font-face{font-family:"Nissan Bold";src:url(/media/fonts/nissan-au/bold.woff2)}'

    expect(rewriteFidelityCssAssetUrls(css, 'nissan-au', worker)).toContain('url(data:font/woff2;base64,abc)')
    expect(extractDeclaredFontFamilies(css)).toEqual(['Nissan Brand', 'Nissan Bold'])
  })

  it('strips srcset so captures embed the inlined img src instead of broken live variants', () => {
    const html = `<picture><source srcset="${worker}/media/nissan-au/abc 480w, ${worker}/media/nissan-au/def 728w"><img src="${worker}/media/pages/assets/nissan-au/navara/hero.png" srcset='${worker}/media/nissan-au/ghi 1x' alt="Hero"></picture>`

    const stripped = stripFidelitySrcsetAttributes(html)

    expect(stripped).not.toContain('srcset')
    expect(stripped).toContain(`<img src="${worker}/media/pages/assets/nissan-au/navara/hero.png"`)
    expect(stripped).toContain('<picture>')
  })

  it('keeps other attributes and non-string input intact when stripping srcset', () => {
    expect(stripFidelitySrcsetAttributes('<img src="a.png" alt="srcset note">')).toBe('<img src="a.png" alt="srcset note">')
    expect(stripFidelitySrcsetAttributes('')).toBe('')
  })
})
