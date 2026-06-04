import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  buildDomCaptureFromHtml,
  CAPTURE_DOM_QUIET_TIMEOUT_MS,
  CAPTURE_DOM_QUIET_WINDOW_MS,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  CAPTURE_STATIC_CAROUSEL_SAFETY_CSS,
  CAPTURE_STATIC_CLONE_SAFETY_CSS,
  CAPTURE_STATIC_MEDIA_FRAME_CSS,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
  waitForCaptureDomQuietForCapture,
  waitForCaptureFontsForCapture,
  waitForCaptureImagesForCapture,
} from './page-capturer'

describe('waitForCaptureImagesForCapture', () => {
  it('returns ready when pending image decodes settle before the timeout', async () => {
    await expect(waitForCaptureImagesForCapture(50, {
      images: [
        { complete: false, decode: () => Promise.resolve() },
        { complete: true, decode: () => Promise.resolve() },
      ],
    } as any)).resolves.toBe('ready')
  })

  it('returns timeout when pending image decodes do not settle in time', async () => {
    await expect(waitForCaptureImagesForCapture(1, {
      images: [{ complete: false, decode: () => new Promise(() => {}) }],
    } as any)).resolves.toBe('timeout')
  })

  it('returns no-images when the image collection is empty', async () => {
    await expect(waitForCaptureImagesForCapture(1, {
      images: [],
    } as any)).resolves.toBe('no-images')
  })

  it('returns unsupported when document images are not available', async () => {
    await expect(waitForCaptureImagesForCapture(1, {} as any)).resolves.toBe('unsupported')
  })
})

class TestMutationObserver {
  static instances: TestMutationObserver[] = []

  callback: () => void
  disconnected = false

  constructor(callback: () => void) {
    this.callback = callback
    TestMutationObserver.instances.push(this)
  }

  observe() {}

  disconnect() {
    this.disconnected = true
  }
}

describe('waitForCaptureDomQuietForCapture', () => {
  it('returns quiet when no mutations arrive during the quiet window', async () => {
    TestMutationObserver.instances = []

    await expect(waitForCaptureDomQuietForCapture(1, 50, {
      target: {},
      MutationObserverCtor: TestMutationObserver as any,
    })).resolves.toBe('quiet')

    expect(TestMutationObserver.instances[0]?.disconnected).toBe(true)
  })

  it('returns timeout when mutations keep arriving before the quiet window elapses', async () => {
    TestMutationObserver.instances = []
    const result = waitForCaptureDomQuietForCapture(20, 35, {
      target: {},
      MutationObserverCtor: TestMutationObserver as any,
    })

    const mutation = setInterval(() => {
      TestMutationObserver.instances[0]?.callback()
    }, 5)

    await expect(result).resolves.toBe('timeout')
    clearInterval(mutation)
    expect(TestMutationObserver.instances[0]?.disconnected).toBe(true)
  })

  it('returns unsupported when target or MutationObserver is unavailable', async () => {
    await expect(waitForCaptureDomQuietForCapture(1, 1, {
      target: undefined,
      MutationObserverCtor: TestMutationObserver as any,
    })).resolves.toBe('unsupported')

    await expect(waitForCaptureDomQuietForCapture(1, 1, {
      target: {},
      MutationObserverCtor: undefined,
    })).resolves.toBe('unsupported')
  })
})

describe('waitForCaptureFontsForCapture', () => {
  it('returns ready when document fonts settle before the timeout', async () => {
    await expect(waitForCaptureFontsForCapture(50, {
      fonts: { ready: Promise.resolve() },
    } as any)).resolves.toBe('ready')
  })

  it('returns timeout when document fonts do not settle in time', async () => {
    await expect(waitForCaptureFontsForCapture(1, {
      fonts: { ready: new Promise(() => {}) },
    } as any)).resolves.toBe('timeout')
  })

  it('returns unsupported when document fonts are not available', async () => {
    await expect(waitForCaptureFontsForCapture(1, {} as any)).resolves.toBe('unsupported')
  })
})

describe('CAPTURE_STATIC_CLONE_SAFETY_CSS', () => {
  it('forces OEM desktop-only image variants visible', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('img.imgdesktop')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.dsktoponly > img')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/display:\s*block\s*!important/i)
  })

  it('keeps OEM mobile-only image variants hidden in desktop clones', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('img.imgmobile')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.mobonly > img')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/display:\s*none\s*!important/i)
  })

  it('reveals common scroll-animation classes left hidden by stripped scripts', () => {
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.animated')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('.animate__animated')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('[data-aos]')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toContain('[class*="fadeIn"]')
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/opacity:\s*1\s*!important/i)
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/visibility:\s*visible\s*!important/i)
    expect(CAPTURE_STATIC_CLONE_SAFETY_CSS).toMatch(/transform:\s*none\s*!important/i)
  })
})

describe('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', () => {
  it('constrains common carousel wrappers and containers', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-list')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-container')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__track')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('[class*="carousel"]')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/max-width:\s*100%\s*!important/i)
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/overflow:\s*hidden\s*!important/i)
  })

  it('normalizes carousel tracks that would otherwise retain scripted offsets', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-track')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-wrapper')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__list')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/width:\s*100%\s*!important/i)
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/transform:\s*none\s*!important/i)
  })

  it('keeps carousel slide items inside the static clone frame', () => {
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.slick-slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.swiper-slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.splide__slide')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toContain('.carousel-item')
    expect(CAPTURE_STATIC_CAROUSEL_SAFETY_CSS).toMatch(/flex-shrink:\s*0\s*!important/i)
  })
})

describe('CAPTURE_STATIC_MEDIA_FRAME_CSS', () => {
  it('clips document-level horizontal overflow', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('html,')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('body')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/max-width:\s*100%/i)
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/overflow-x:\s*clip\s*!important/i)
  })

  it('caps common media elements to the clone frame', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('picture')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('video')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('canvas')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toContain('svg')
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/max-width:\s*100%\s*!important/i)
  })

  it('keeps image and video height proportional', () => {
    expect(CAPTURE_STATIC_MEDIA_FRAME_CSS).toMatch(/img,[\s\S]*video[\s\S]*height:\s*auto\s*!important/i)
  })
})

describe('PageCapturer readiness wiring', () => {
  it('waits for images, fonts, and DOM quiet before materializing pseudo-element text', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
    const fontWait = source.indexOf('page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)')
    const domQuietWait = source.indexOf('page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS)')
    const pseudoMaterialize = source.indexOf('page.evaluate(materializePseudoElementTextForCapture as any)')

    expect(CAPTURE_IMAGE_READY_TIMEOUT_MS).toBe(3000)
    expect(CAPTURE_FONT_READY_TIMEOUT_MS).toBe(2500)
    expect(CAPTURE_DOM_QUIET_WINDOW_MS).toBe(250)
    expect(CAPTURE_DOM_QUIET_TIMEOUT_MS).toBe(1500)
    expect(imageWait).toBeGreaterThan(-1)
    expect(fontWait).toBeGreaterThan(imageWait)
    expect(domQuietWait).toBeGreaterThan(fontWait)
    expect(pseudoMaterialize).toBeGreaterThan(domQuietWait)
  })
})

describe('PageCapturer persisted clone safety CSS wiring', () => {
  it('includes the static clone safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const safetyCssUsage = source.indexOf('CAPTURE_STATIC_CLONE_SAFETY_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(safetyCssUsage).toBeGreaterThan(overrideCssStart)
    expect(assembledStyle).toBeGreaterThan(safetyCssUsage)
  })
})

describe('PageCapturer persisted carousel safety CSS wiring', () => {
  it('includes carousel safety CSS after general clone safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const cloneSafetyUsage = source.indexOf('CAPTURE_STATIC_CLONE_SAFETY_CSS', overrideCssStart)
    const carouselSafetyUsage = source.indexOf('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(cloneSafetyUsage).toBeGreaterThan(overrideCssStart)
    expect(carouselSafetyUsage).toBeGreaterThan(cloneSafetyUsage)
    expect(assembledStyle).toBeGreaterThan(carouselSafetyUsage)
  })
})

describe('PageCapturer persisted media frame CSS wiring', () => {
  it('includes media frame CSS after carousel safety CSS in persisted override CSS', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const overrideCssStart = source.indexOf('const overrideCss = [')
    const carouselSafetyUsage = source.indexOf('CAPTURE_STATIC_CAROUSEL_SAFETY_CSS', overrideCssStart)
    const mediaFrameUsage = source.indexOf('CAPTURE_STATIC_MEDIA_FRAME_CSS', overrideCssStart)
    const assembledStyle = source.indexOf('`<style>${overrideCss}</style>`', overrideCssStart)

    expect(overrideCssStart).toBeGreaterThan(-1)
    expect(carouselSafetyUsage).toBeGreaterThan(overrideCssStart)
    expect(mediaFrameUsage).toBeGreaterThan(carouselSafetyUsage)
    expect(assembledStyle).toBeGreaterThan(mediaFrameUsage)
  })
})

describe('PageCapturer viewport metadata wiring', () => {
  it('persists the capture viewport into clone mode instead of a hard-coded viewport', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const applyCloneModeCall = source.indexOf('const pageData = applyCloneMode(basePage, {')
    const captureViewport = source.indexOf('viewport: capture.viewport', applyCloneModeCall)
    const hardCodedViewport = source.indexOf('viewport: { width: 1440, height: 1080 }', applyCloneModeCall)

    expect(applyCloneModeCall).toBeGreaterThan(-1)
    expect(captureViewport).toBeGreaterThan(applyCloneModeCall)
    expect(hardCodedViewport).toBe(-1)
  })
})

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
      viewport: { width: 1440, height: 1080 },
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
      viewport: { width: 1440, height: 1080 },
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
      viewport: { width: 1440, height: 1080 },
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

describe('buildDomCaptureFromHtml viewport metadata', () => {
  const html = `
    <html>
      <head><title>Viewport Model</title></head>
      <body>
        <main>
          <h1>Viewport Model</h1>
          <section>${'<p>Vehicle content</p>'.repeat(80)}</section>
        </main>
      </body>
    </html>
  `

  it('defaults external captures to the standard desktop viewport', () => {
    const result = buildDomCaptureFromHtml({ html }, 'https://example.test/model')

    expect('bot_blocked' in result).toBe(false)
    if ('bot_blocked' in result)
      return

    expect(result.viewport).toEqual({ width: 1440, height: 1080 })
  })

  it('preserves supplied external capture viewport metadata', () => {
    const result = buildDomCaptureFromHtml({
      html,
      viewport: { width: 1680, height: 1080 },
    }, 'https://example.test/model')

    expect('bot_blocked' in result).toBe(false)
    if ('bot_blocked' in result)
      return

    expect(result.viewport).toEqual({ width: 1680, height: 1080 })
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
