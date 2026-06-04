import { describe, expect, it } from 'vitest'

import {
  buildDomCaptureFromHtml,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
} from './page-capturer'

describe('pseudo-element capture helpers', () => {
  it('keeps only quoted pseudo-element text content', () => {
    expect(normalizePseudoElementContentForCapture('"New"')).toBe('New')
    expect(normalizePseudoElementContentForCapture('\'Hybrid\'')).toBe('Hybrid')
    expect(normalizePseudoElementContentForCapture('"EV \\\\"badge\\\\""')).toBe('EV "badge"')
    expect(normalizePseudoElementContentForCapture('none')).toBeNull()
    expect(normalizePseudoElementContentForCapture('normal')).toBeNull()
    expect(normalizePseudoElementContentForCapture('url("badge.svg")')).toBeNull()
    expect(normalizePseudoElementContentForCapture('counter(section)')).toBeNull()
    expect(normalizePseudoElementContentForCapture('attr(data-label)')).toBeNull()
    expect(normalizePseudoElementContentForCapture('""')).toBeNull()
  })

  it('serializes a conservative inline style for materialized pseudo text', () => {
    expect(pseudoElementInlineStyleForCapture({
      display: 'inline-block',
      color: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(0, 0, 0)',
      fontWeight: '700',
      fontSize: '12px',
      lineHeight: '16px',
      margin: '0px 4px',
      padding: '2px 6px',
      borderRadius: '4px',
      textTransform: 'uppercase',
      letterSpacing: '0.2px',
      visibility: 'visible',
      opacity: '1',
    })).toBe('display:inline-block;color:rgb(255, 255, 255);background-color:rgb(0, 0, 0);font-weight:700;font-size:12px;line-height:16px;margin:0px 4px;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.2px')
  })
})

describe('normalizeCapturedLazyMedia', () => {
  it('restores Toyota responsive lazy image URLs from source data-srcset', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <picture data-ty-lazy-image="">
            <source data-aspectratio="1.777778" type="image/jpeg" data-srcset="/-/media/toyota/main-site/vehicle-hubs/rav4/bep/2026/new_powertrain_mosaic_d_v4.jpg?rev=f4075ca88c294e0187cf8f14c4f5d12f" srcset="">
            <img class="ty-responsive-background-picture-img" alt="RAV4 feature" srcset="">
          </picture>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 4,
    }, 'https://www.toyota.com.au/rav4')

    const expectedUrl = 'https://www.toyota.com.au/-/media/toyota/main-site/vehicle-hubs/rav4/bep/2026/new_powertrain_mosaic_d_v4.jpg?rev=f4075ca88c294e0187cf8f14c4f5d12f'

    expect(result.html).toContain(`srcset="${expectedUrl}"`)
    expect(result.html).toContain(`src="${expectedUrl}"`)
    expect(result.imageUrls).toContain(expectedUrl)
  })

  it('removes image placeholders that have no recoverable source', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="blank-placeholder" alt="">
          <img class="real-image" src="/-/media/rav4.jpg">
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 3,
    }, 'https://www.toyota.com.au/rav4')

    expect(result.html).not.toContain('blank-placeholder')
    expect(result.html).toContain('real-image')
    expect(result.imageUrls).toContain('https://www.toyota.com.au/-/media/rav4.jpg')
  })

  it('removes image placeholders whose src is the captured page URL', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="subaru-placeholder" src="https://www.subaru.com.au/brz/2026">
          <img class="subaru-real" src="/media/brz.jpg">
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: ['https://www.subaru.com.au/brz/2026'],
      heroUrl: '',
      title: 'BRZ',
      elementCount: 3,
    }, 'https://www.subaru.com.au/brz/2026')

    expect(result.html).not.toContain('subaru-placeholder')
    expect(result.html).toContain('subaru-real')
    expect(result.imageUrls).toContain('https://www.subaru.com.au/media/brz.jpg')
  })
})

describe('isCaptureBlockedBySecurityPage', () => {
  it('detects Toyota-style security verification pages', () => {
    expect(isCaptureBlockedBySecurityPage({
      title: 'www.toyota.com.au',
      html: `
        <div class="main-wrapper">
          <h2 class="ch-title">Performing security verification</h2>
          <p>This website uses a security service to protect against malicious bots.</p>
          <p>This page is displayed while the website verifies you are not a bot.</p>
        </div>
      `,
    })).toBe(true)
  })

  it('does not flag normal model page content', () => {
    expect(isCaptureBlockedBySecurityPage({
      title: 'RAV4 | Toyota Australia',
      html: `
        <main>
          <h1>All-New RAV4</h1>
          <p>Long live recreation</p>
          <img src="https://www.toyota.com.au/-/media/toyota/main-site/vehicle-hubs/rav4/bep/2026/hero.jpg">
        </main>
      `,
    })).toBe(false)
  })
})

describe('buildDomCaptureFromHtml', () => {
  it('converts externally rendered HTML into a normalized DOM capture', () => {
    const result = buildDomCaptureFromHtml({
      html: `
        <!doctype html>
        <html>
          <head>
            <title>All-New RAV4</title>
            <link rel="stylesheet" href="/assets/rav4.css">
            <script>window.bad = true</script>
          </head>
          <body>
            <nav>Global navigation</nav>
            <main>
              <h1>All-New RAV4</h1>
              <picture>
                <source data-srcset="/-/media/rav4-hero.jpg 1x, /-/media/rav4-hero@2x.jpg 2x">
                <img alt="RAV4 hero">
              </picture>
              <section style="background-image:url('/-/media/rav4-bg.jpg')">
                <p>${'Long live recreation. '.repeat(80)}</p>
              </section>
            </main>
          </body>
        </html>
      `,
      stylesheetUrls: ['https://cdn.example.test/toyota-extra.css'],
    }, 'https://www.toyota.com.au/rav4')

    if ('bot_blocked' in result)
      throw new Error('Expected external capture to succeed')

    expect(result.title).toBe('All-New RAV4')
    expect(result.stylesheetLinks).toContain('<link rel="stylesheet" href="https://www.toyota.com.au/assets/rav4.css">')
    expect(result.stylesheetLinks).toContain('<link rel="stylesheet" href="https://cdn.example.test/toyota-extra.css">')
    expect(result.html).not.toContain('<script')
    expect(result.html).not.toContain('<nav')
    expect(result.html).toContain('srcset="https://www.toyota.com.au/-/media/rav4-hero.jpg 1x, https://www.toyota.com.au/-/media/rav4-hero@2x.jpg 2x"')
    expect(result.imageUrls).toContain('https://www.toyota.com.au/-/media/rav4-hero@2x.jpg')
    expect(result.imageUrls).toContain('https://www.toyota.com.au/-/media/rav4-bg.jpg')
    expect(result.heroUrl).toBe('https://www.toyota.com.au/-/media/rav4-hero@2x.jpg')
  })

  it('rejects externally rendered security verification pages', () => {
    expect(buildDomCaptureFromHtml({
      title: 'www.toyota.com.au',
      html: `
        <html>
          <body>
            <h2>Performing security verification</h2>
            <p>This website uses a security service to protect against malicious bots.</p>
          </body>
        </html>
      `,
    }, 'https://www.toyota.com.au/rav4')).toEqual({ bot_blocked: true })
  })
})
