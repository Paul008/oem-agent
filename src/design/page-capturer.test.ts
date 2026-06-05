import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  activateLazyMediaForCapture,
  buildDomCaptureFromHtml,
  CAPTURE_DOM_QUIET_TIMEOUT_MS,
  CAPTURE_DOM_QUIET_WINDOW_MS,
  CAPTURE_FONT_READY_TIMEOUT_MS,
  CAPTURE_IMAGE_READY_TIMEOUT_MS,
  CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS,
  CAPTURE_SCROLL_SWEEP_MAX_STEPS,
  CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS,
  CAPTURE_SCROLL_SWEEP_TIMEOUT_MS,
  CAPTURE_STATIC_CAROUSEL_SAFETY_CSS,
  CAPTURE_STATIC_CLONE_SAFETY_CSS,
  CAPTURE_STATIC_MEDIA_FRAME_CSS,
  isCaptureBlockedBySecurityPage,
  normalizeCapturedLazyMedia,
  normalizePseudoElementContentForCapture,
  pseudoElementInlineStyleForCapture,
  sweepCaptureScrollForCapture,
  waitForCaptureDomQuietForCapture,
  waitForCaptureFontsForCapture,
  waitForCaptureImagesForCapture,
} from './page-capturer'

function createLazyMediaElement(attrs: Record<string, string> = {}, props: { loading?: string; sources?: any[] } = {}) {
  const element: any = {
    attrs: { ...attrs },
    removedAttrs: [] as string[],
    style: {},
    loading: props.loading,
    sources: props.sources ?? [],
    getAttribute(name: string) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null
    },
    setAttribute(name: string, value: string) {
      this.attrs[name] = value
      if (name === 'src')
        this.src = value
      if (name === 'srcset')
        this.srcset = value
      if (name === 'poster')
        this.poster = value
    },
    removeAttribute(name: string) {
      this.removedAttrs.push(name)
      delete this.attrs[name]
    },
    querySelectorAll(selector: string) {
      if (selector === 'source')
        return this.sources

      return []
    },
  }

  return element
}

function createLazyMediaDocument(input: {
  href?: string;
  images?: any[];
  srcsetElements?: any[];
  backgroundElements?: any[];
  videos?: any[];
}) {
  return {
    location: {
      href: input.href ?? 'https://www.toyota.com.au/rav4',
      origin: 'https://www.toyota.com.au',
    },
    querySelectorAll(selector: string) {
      if (selector === 'img')
        return input.images ?? []
      if (selector === 'img[data-srcset], source[data-srcset]')
        return input.srcsetElements ?? []
      if (selector === '[data-bg], [data-background-image]')
        return input.backgroundElements ?? []
      if (selector === 'video')
        return input.videos ?? []

      return []
    },
  }
}

function createScrollSweepWindow(options: {
  innerHeight?: number;
  scrollHeight: number;
  onScroll?: (y: number, win: any) => void;
}) {
  const calls: Array<[number, number]> = []
  const win: any = {
    innerHeight: options.innerHeight ?? 1000,
    scrollY: 0,
    document: {
      body: { scrollHeight: options.scrollHeight },
      documentElement: { scrollHeight: options.scrollHeight },
    },
    Date: { now: () => 0 },
    setTimeout: ((callback: () => void) => {
      callback()
      return 0 as any
    }) as typeof setTimeout,
    scrollTo: (x: number, y: number) => {
      calls.push([x, y])
      win.scrollY = y
      options.onScroll?.(y, win)
    },
  }

  return { win, calls }
}

describe('activateLazyMediaForCapture', () => {
  it('resolves relative image lazy sources before scrolling', () => {
    const rootRelative = createLazyMediaElement({ 'data-src': '/-/media/rav4.jpg' })
    const pageRelative = createLazyMediaElement({ 'data-lazy-src': 'assets/detail.jpg' })
    const absolute = createLazyMediaElement({ 'data-original': 'https://cdn.example.test/hero.jpg' })
    const dataUrl = createLazyMediaElement({ 'data-lazy': 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' })
    const doc = createLazyMediaDocument({
      images: [rootRelative, pageRelative, absolute, dataUrl],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.imageSources).toBe(4)
    expect(rootRelative.src).toBe('https://www.toyota.com.au/-/media/rav4.jpg')
    expect(rootRelative.removedAttrs).toContain('data-src')
    expect(pageRelative.src).toBe('https://www.toyota.com.au/assets/detail.jpg')
    expect(pageRelative.removedAttrs).toContain('data-lazy-src')
    expect(absolute.src).toBe('https://cdn.example.test/hero.jpg')
    expect(dataUrl.src).toBe('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
  })

  it('normalizes relative srcset candidates while preserving descriptors', () => {
    const img = createLazyMediaElement({
      'data-srcset': '/-/media/rav4.jpg 1x, assets/rav4-2x.jpg 2x',
    })
    const source = createLazyMediaElement({
      'data-srcset': '//cdn.example.test/mobile.jpg 480w, /-/media/mobile-large.jpg 960w',
    })
    const doc = createLazyMediaDocument({
      srcsetElements: [img, source],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.sourceSets).toBe(2)
    expect(img.srcset).toBe('https://www.toyota.com.au/-/media/rav4.jpg 1x, https://www.toyota.com.au/assets/rav4-2x.jpg 2x')
    expect(source.srcset).toBe('https://cdn.example.test/mobile.jpg 480w, https://www.toyota.com.au/-/media/mobile-large.jpg 960w')
    expect(img.removedAttrs).toContain('data-srcset')
    expect(source.removedAttrs).toContain('data-srcset')
  })

  it('resolves lazy background image attributes before scrolling', () => {
    const bg = createLazyMediaElement({ 'data-bg': '/-/media/background.jpg' })
    const backgroundImage = createLazyMediaElement({ 'data-background-image': 'assets/feature.jpg' })
    const doc = createLazyMediaDocument({
      backgroundElements: [bg, backgroundImage],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.backgrounds).toBe(2)
    expect(bg.style.backgroundImage).toBe('url("https://www.toyota.com.au/-/media/background.jpg")')
    expect(backgroundImage.style.backgroundImage).toBe('url("https://www.toyota.com.au/assets/feature.jpg")')
    expect(bg.removedAttrs).toContain('data-bg')
    expect(backgroundImage.removedAttrs).toContain('data-background-image')
  })

  it('forces lazy images to eager and counts only changed images', () => {
    const lazy = createLazyMediaElement({}, { loading: 'lazy' })
    const eager = createLazyMediaElement({}, { loading: 'eager' })
    const doc = createLazyMediaDocument({
      images: [lazy, eager],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.eagerImages).toBe(1)
    expect(lazy.loading).toBe('eager')
    expect(eager.loading).toBe('eager')
  })

  it('resolves video data-poster before scrolling', () => {
    const video = createLazyMediaElement({ 'data-poster': '/-/media/rav4-poster.jpg' })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoPosters).toBe(1)
    expect(video.poster).toBe('https://www.toyota.com.au/-/media/rav4-poster.jpg')
    expect(video.attrs.poster).toBe('https://www.toyota.com.au/-/media/rav4-poster.jpg')
    expect(video.removedAttrs).toContain('data-poster')
  })

  it('resolves relative video poster attributes before scrolling', () => {
    const video = createLazyMediaElement({ poster: 'assets/video-poster.jpg' })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoPosters).toBe(1)
    expect(video.poster).toBe('https://www.toyota.com.au/assets/video-poster.jpg')
    expect(video.attrs.poster).toBe('https://www.toyota.com.au/assets/video-poster.jpg')
    expect(video.removedAttrs).not.toContain('poster')
  })

  it('resolves direct video data-src attributes before scrolling', () => {
    const video = createLazyMediaElement({ 'data-src': 'media/rav4-loop.mp4' })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoSources).toBe(1)
    expect(video.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(video.attrs.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(video.removedAttrs).toContain('data-src')
  })

  it('resolves video source data-src attributes before scrolling', () => {
    const source = createLazyMediaElement({ 'data-src': 'media/rav4-loop.mp4' })
    const absoluteSource = createLazyMediaElement({ 'data-src': 'https://cdn.example.test/rav4.mp4' })
    const video = createLazyMediaElement({}, { sources: [source, absoluteSource] })
    const doc = createLazyMediaDocument({
      videos: [video],
    })

    const result = activateLazyMediaForCapture({ doc })

    expect(result.videoSources).toBe(2)
    expect(source.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(source.attrs.src).toBe('https://www.toyota.com.au/media/rav4-loop.mp4')
    expect(source.removedAttrs).toContain('data-src')
    expect(absoluteSource.src).toBe('https://cdn.example.test/rav4.mp4')
    expect(absoluteSource.removedAttrs).toContain('data-src')
  })
})

describe('sweepCaptureScrollForCapture', () => {
  it('returns complete and scrolls back to top for a stable page', async () => {
    const { win, calls } = createScrollSweepWindow({ scrollHeight: 2500 })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 10,
      win,
    })).resolves.toBe('complete')

    expect(calls).toEqual([
      [0, 1000],
      [0, 1500],
      [0, 0],
    ])
  })

  it('continues beyond the initially measured height when content grows during scrolling', async () => {
    const { win, calls } = createScrollSweepWindow({
      scrollHeight: 1800,
      onScroll: (y, activeWindow) => {
        if (y >= 800) {
          activeWindow.document.body.scrollHeight = 3200
          activeWindow.document.documentElement.scrollHeight = 3200
        }
      },
    })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 10,
      win,
    })).resolves.toBe('complete')

    expect(calls.some(([, y]) => y > 800)).toBe(true)
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('returns max-steps when content keeps growing beyond the configured step limit', async () => {
    const { win, calls } = createScrollSweepWindow({
      scrollHeight: 3000,
      onScroll: (_y, activeWindow) => {
        activeWindow.document.body.scrollHeight += 1000
        activeWindow.document.documentElement.scrollHeight += 1000
      },
    })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 1000,
      maxSteps: 2,
      win,
    })).resolves.toBe('max-steps')

    expect(calls).toHaveLength(3)
    expect(calls.at(-1)).toEqual([0, 0])
  })

  it('returns timeout when the configured elapsed limit is already reached', async () => {
    const { win, calls } = createScrollSweepWindow({ scrollHeight: 3000 })

    await expect(sweepCaptureScrollForCapture({
      stepDelayMs: 0,
      finalDelayMs: 0,
      timeoutMs: 0,
      maxSteps: 10,
      win,
    })).resolves.toBe('timeout')

    expect(calls).toEqual([[0, 0]])
  })

  it('returns unsupported when the viewport cannot scroll', async () => {
    await expect(sweepCaptureScrollForCapture({
      win: {
        innerHeight: 0,
        document: { body: { scrollHeight: 1000 }, documentElement: { scrollHeight: 1000 } },
        scrollTo: () => {},
      },
    })).resolves.toBe('unsupported')
  })
})

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
    const lazyActivation = source.indexOf('page.evaluate(activateLazyMediaForCapture as any)')
    const lazyActivationLog = source.indexOf('videoSources=${lazyMediaActivation.videoSources}, videoPosters=${lazyMediaActivation.videoPosters}', lazyActivation)
    const scrollSweep = source.indexOf('page.evaluate(sweepCaptureScrollForCapture as any')
    const imageWait = source.indexOf('page.evaluate(waitForCaptureImagesForCapture as any, CAPTURE_IMAGE_READY_TIMEOUT_MS)')
    const fontWait = source.indexOf('page.evaluate(waitForCaptureFontsForCapture as any, CAPTURE_FONT_READY_TIMEOUT_MS)')
    const domQuietWait = source.indexOf('page.evaluate(waitForCaptureDomQuietForCapture as any, CAPTURE_DOM_QUIET_WINDOW_MS, CAPTURE_DOM_QUIET_TIMEOUT_MS)')
    const pseudoMaterialize = source.indexOf('page.evaluate(materializePseudoElementTextForCapture as any)')

    expect(CAPTURE_SCROLL_SWEEP_STEP_DELAY_MS).toBe(300)
    expect(CAPTURE_SCROLL_SWEEP_FINAL_DELAY_MS).toBe(500)
    expect(CAPTURE_SCROLL_SWEEP_TIMEOUT_MS).toBe(10000)
    expect(CAPTURE_SCROLL_SWEEP_MAX_STEPS).toBe(30)
    expect(CAPTURE_IMAGE_READY_TIMEOUT_MS).toBe(3000)
    expect(CAPTURE_FONT_READY_TIMEOUT_MS).toBe(2500)
    expect(CAPTURE_DOM_QUIET_WINDOW_MS).toBe(250)
    expect(CAPTURE_DOM_QUIET_TIMEOUT_MS).toBe(1500)
    expect(lazyActivation).toBeGreaterThan(-1)
    expect(lazyActivationLog).toBeGreaterThan(lazyActivation)
    expect(scrollSweep).toBeGreaterThan(lazyActivation)
    expect(scrollSweep).toBeGreaterThan(-1)
    expect(imageWait).toBeGreaterThan(scrollSweep)
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

describe('PageCapturer stylesheet link attribute wiring', () => {
  it('collects real stylesheet link elements before document.styleSheets fallback', () => {
    const source = readFileSync(new URL('./page-capturer.ts', import.meta.url), 'utf8')
    const phaseC = source.indexOf('// ====== Phase C: Collect external stylesheets ======')
    const linkQuery = source.indexOf('document.querySelectorAll(\'link[rel~="stylesheet"]\')', phaseC)
    const mediaAttr = source.indexOf('link.getAttribute(\'media\')', linkQuery)
    const crossoriginAttr = source.indexOf('link.getAttribute(\'crossorigin\')', linkQuery)
    const integrityAttr = source.indexOf('link.getAttribute(\'integrity\')', linkQuery)
    const referrerPolicyAttr = source.indexOf('link.getAttribute(\'referrerpolicy\')', linkQuery)
    const styleSheetFallback = source.indexOf('for (const sheet of document.styleSheets)', phaseC)

    expect(phaseC).toBeGreaterThan(-1)
    expect(linkQuery).toBeGreaterThan(phaseC)
    expect(mediaAttr).toBeGreaterThan(linkQuery)
    expect(crossoriginAttr).toBeGreaterThan(mediaAttr)
    expect(integrityAttr).toBeGreaterThan(crossoriginAttr)
    expect(referrerPolicyAttr).toBeGreaterThan(integrityAttr)
    expect(styleSheetFallback).toBeGreaterThan(referrerPolicyAttr)
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
    expect(result.html).not.toContain('data-srcset=')
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
    expect(result.imageUrls).not.toContain('https://www.subaru.com.au/brz/2026')
    expect(result.imageUrls).toContain('https://www.subaru.com.au/media/brz.jpg')
  })

  it('removes same-origin model-year document placeholders from media URLs', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="subaru-year-placeholder" src="https://www.subaru.com.au/brz/2026">
          <img class="subaru-real" src="/media/brz.jpg">
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: ['https://www.subaru.com.au/brz/2026'],
      heroUrl: 'https://www.subaru.com.au/brz/2026',
      title: 'BRZ',
      elementCount: 3,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.subaru.com.au/brz')

    expect(result.html).not.toContain('subaru-year-placeholder')
    expect(result.html).toContain('subaru-real')
    expect(result.heroUrl).toBe('https://www.subaru.com.au/media/brz.jpg')
    expect(result.imageUrls).not.toContain('https://www.subaru.com.au/brz/2026')
    expect(result.imageUrls).toContain('https://www.subaru.com.au/media/brz.jpg')
  })

  it('normalizes pre-queued image URLs before returning the media list', () => {
    const result = normalizeCapturedLazyMedia({
      html: '<main><p>RAV4 content</p></main>',
      stylesheetLinks: [],
      imageUrls: [
        '/media/prequeued.jpg',
        'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
        'https://www.toyota.com.au/rav4',
      ],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 2,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    expect(result.imageUrls).toContain('https://www.toyota.com.au/media/prequeued.jpg')
    expect(result.imageUrls).not.toContain('/media/prequeued.jpg')
    expect(result.imageUrls).not.toContain('data:image/gif;base64,R0lGODlhAQABAAAAACw=')
    expect(result.imageUrls).not.toContain('https://www.toyota.com.au/rav4')
  })

  it('promotes remaining lazy image data-src attributes to renderable src values', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="late-lazy" data-src="/media/rav4-late.jpg" alt="RAV4 late-loaded image">
          <img class="page-placeholder" src="https://www.toyota.com.au/rav4" data-original="/media/rav4-real.jpg" alt="RAV4 real image">
          <img class="transparent-placeholder" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-lazy-src="/media/rav4-transparent.jpg" alt="RAV4 transparent placeholder">
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 3,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const lateUrl = 'https://www.toyota.com.au/media/rav4-late.jpg'
    const realUrl = 'https://www.toyota.com.au/media/rav4-real.jpg'
    const transparentUrl = 'https://www.toyota.com.au/media/rav4-transparent.jpg'

    expect(result.html).toContain(`src="${lateUrl}"`)
    expect(result.html).toContain(`src="${realUrl}"`)
    expect(result.html).toContain(`src="${transparentUrl}"`)
    expect(result.html).not.toContain('data-src=')
    expect(result.html).not.toContain('data-lazy-src=')
    expect(result.html).not.toContain('data-original=')
    expect(result.imageUrls).toContain(lateUrl)
    expect(result.imageUrls).toContain(realUrl)
    expect(result.imageUrls).toContain(transparentUrl)
  })

  it('reselects stale page-placeholder hero URLs from normalized image sources', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="page-placeholder-hero" src="https://www.toyota.com.au/rav4" data-original="/media/rav4-hero.jpg" alt="RAV4 hero">
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: ['https://www.toyota.com.au/rav4'],
      heroUrl: 'https://www.toyota.com.au/rav4',
      title: 'RAV4',
      elementCount: 2,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const heroUrl = 'https://www.toyota.com.au/media/rav4-hero.jpg'

    expect(result.heroUrl).toBe(heroUrl)
    expect(result.html).toContain(`src="${heroUrl}"`)
    expect(result.html).not.toContain('data-original=')
    expect(result.imageUrls).toContain(heroUrl)
    expect(result.imageUrls).not.toContain('https://www.toyota.com.au/rav4')
  })

  it('normalizes direct video sources and queues them for media proxying', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <video class="hero-loop" data-src="/media/rav4-loop.mp4" data-poster="/media/rav4-poster.jpg">
            <source data-src="/media/rav4-alt.mp4" type="video/mp4">
          </video>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 3,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const videoUrl = 'https://www.toyota.com.au/media/rav4-loop.mp4'
    const sourceUrl = 'https://www.toyota.com.au/media/rav4-alt.mp4'
    const posterUrl = 'https://www.toyota.com.au/media/rav4-poster.jpg'

    expect(result.html).toContain(`src="${videoUrl}"`)
    expect(result.html).toContain(`src="${sourceUrl}"`)
    expect(result.html).toContain(`poster="${posterUrl}"`)
    expect(result.imageUrls).toContain(videoUrl)
    expect(result.imageUrls).toContain(sourceUrl)
    expect(result.imageUrls).toContain(posterUrl)
  })

  it('recovers lazy video sources when placeholder media URLs are already present', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <video
            class="placeholder-video"
            src="data:video/mp4;base64,AAAA"
            data-src="/media/rav4-loop.mp4"
            poster="data:image/gif;base64,R0lGODlhAQABAAAAACw="
            data-poster="/media/rav4-poster.jpg"
          >
            <source src="blob:https://www.toyota.com.au/temporary" data-src="/media/rav4-alt.mp4" type="video/mp4">
          </video>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 3,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const videoUrl = 'https://www.toyota.com.au/media/rav4-loop.mp4'
    const sourceUrl = 'https://www.toyota.com.au/media/rav4-alt.mp4'
    const posterUrl = 'https://www.toyota.com.au/media/rav4-poster.jpg'

    expect(result.html).toContain(`src="${videoUrl}"`)
    expect(result.html).toContain(`src="${sourceUrl}"`)
    expect(result.html).toContain(`poster="${posterUrl}"`)
    expect(result.html).not.toContain('data-src=')
    expect(result.html).not.toContain('data-poster=')
    expect(result.imageUrls).toContain(videoUrl)
    expect(result.imageUrls).toContain(sourceUrl)
    expect(result.imageUrls).toContain(posterUrl)
  })

  it('normalizes inline background URLs so proxy rewriting can find them', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <section class="feature" style="background-image:url('/media/rav4-bg.jpg'); mask-image: url(assets/mask.svg)">
            <p>Feature content</p>
          </section>
          <section class="lazy-bg" data-bg="/media/rav4-lazy-bg.jpg">
            <p>Lazy background content</p>
          </section>
          <section class="lazy-background-image" data-background-image="assets/rav4-background-image.jpg">
            <p>Lazy background image content</p>
          </section>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'RAV4',
      elementCount: 3,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const backgroundUrl = 'https://www.toyota.com.au/media/rav4-bg.jpg'
    const maskUrl = 'https://www.toyota.com.au/assets/mask.svg'
    const lazyBgUrl = 'https://www.toyota.com.au/media/rav4-lazy-bg.jpg'
    const lazyBackgroundImageUrl = 'https://www.toyota.com.au/assets/rav4-background-image.jpg'

    expect(result.html).toContain(backgroundUrl)
    expect(result.html).toContain(maskUrl)
    expect(result.html).toContain(lazyBgUrl)
    expect(result.html).toContain(lazyBackgroundImageUrl)
    expect(result.html).not.toContain('data-bg=')
    expect(result.html).not.toContain('data-background-image=')
    expect(result.imageUrls).toContain(backgroundUrl)
    expect(result.imageUrls).toContain(maskUrl)
    expect(result.imageUrls).toContain(lazyBgUrl)
    expect(result.imageUrls).toContain(lazyBackgroundImageUrl)
  })

  it('drops document placeholder URLs from srcset and background styles', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <picture>
            <source data-srcset="/brz/2026 1x, /media/brz-hero.jpg 2x">
            <img alt="BRZ hero">
          </picture>
          <section class="document-bg" style="background-image:url('/brz/2026'); mask-image:url('/media/mask.svg')">
            <p>BRZ content</p>
          </section>
          <section class="lazy-document-bg" data-bg="/brz/2026">
            <p>Lazy document background</p>
          </section>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: [],
      heroUrl: '',
      title: 'BRZ',
      elementCount: 6,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.subaru.com.au/brz')

    const heroUrl = 'https://www.subaru.com.au/media/brz-hero.jpg'
    const maskUrl = 'https://www.subaru.com.au/media/mask.svg'
    const documentUrl = 'https://www.subaru.com.au/brz/2026'

    expect(result.html).toContain(`srcset="${heroUrl} 2x"`)
    expect(result.html).toContain(`src="${heroUrl}"`)
    expect(result.html).toContain('background-image:none')
    expect(result.html).toContain(maskUrl)
    expect(result.html).not.toContain(documentUrl)
    expect(result.html).not.toContain('data-bg=')
    expect(result.imageUrls).toContain(heroUrl)
    expect(result.imageUrls).toContain(maskUrl)
    expect(result.imageUrls).not.toContain(documentUrl)
    expect(result.heroUrl).toBe(heroUrl)
  })

  it('drops unsafe non-http media URLs while preserving recoverable lazy media', () => {
    const result = normalizeCapturedLazyMedia({
      html: `
        <main>
          <img class="unsafe-img" src="javascript:alert(1)" alt="Unsafe">
          <img class="recoverable-img" src="javascript:alert(2)" data-original="/media/recovered.jpg" alt="Recovered">
          <picture>
            <source data-srcset="javascript:alert(3) 1x, /media/srcset-safe.jpg 2x">
            <img alt="Safe srcset">
          </picture>
          <section class="unsafe-style" style="background-image:url('javascript:alert(4)'); mask-image:url('/media/mask.svg')">
            <p>Unsafe style content</p>
          </section>
          <video class="unsafe-video" src="javascript:alert(5)" poster="javascript:alert(6)">
            <source src="javascript:alert(7)" type="video/mp4">
          </video>
        </main>
      `,
      stylesheetLinks: [],
      imageUrls: ['javascript:alert(8)'],
      heroUrl: 'javascript:alert(9)',
      title: 'RAV4',
      elementCount: 8,
      viewport: { width: 1440, height: 1080 },
    }, 'https://www.toyota.com.au/rav4')

    const recoveredUrl = 'https://www.toyota.com.au/media/recovered.jpg'
    const srcsetUrl = 'https://www.toyota.com.au/media/srcset-safe.jpg'
    const maskUrl = 'https://www.toyota.com.au/media/mask.svg'

    expect(result.html).not.toContain('javascript:')
    expect(result.html).toContain(`src="${recoveredUrl}"`)
    expect(result.html).toContain(`srcset="${srcsetUrl} 2x"`)
    expect(result.html).toContain(maskUrl)
    expect(result.imageUrls).toContain(recoveredUrl)
    expect(result.imageUrls).toContain(srcsetUrl)
    expect(result.imageUrls).toContain(maskUrl)
    expect(result.imageUrls.some(url => url.startsWith('javascript:'))).toBe(false)
    expect(result.heroUrl).toBe(recoveredUrl)
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

  it('removes consumed lazy image attributes from external captures', () => {
    const result = buildDomCaptureFromHtml({
      html: `
        <!doctype html>
        <html>
          <body>
            <main>
              <h1>All-New RAV4</h1>
              <img class="external-lazy" data-src="/-/media/rav4-lazy.jpg" alt="RAV4 lazy">
              <img class="external-data-image" data-image-src="/-/media/rav4-data-image.jpg" alt="RAV4 data image">
              <section>${'Vehicle content. '.repeat(80)}</section>
            </main>
          </body>
        </html>
      `,
    }, 'https://www.toyota.com.au/rav4')

    if ('bot_blocked' in result)
      throw new Error('Expected external capture to succeed')

    const lazyUrl = 'https://www.toyota.com.au/-/media/rav4-lazy.jpg'
    const dataImageUrl = 'https://www.toyota.com.au/-/media/rav4-data-image.jpg'

    expect(result.html).toContain(`src="${lazyUrl}"`)
    expect(result.html).toContain(`src="${dataImageUrl}"`)
    expect(result.html).not.toContain('data-src=')
    expect(result.html).not.toContain('data-image-src=')
    expect(result.imageUrls).toContain(lazyUrl)
    expect(result.imageUrls).toContain(dataImageUrl)
  })

  it('uses recoverable lazy image sources when selecting external capture hero images', () => {
    const result = buildDomCaptureFromHtml({
      html: `
        <!doctype html>
        <html>
          <body>
            <main>
              <h1>All-New RAV4</h1>
              <img
                class="external-placeholder-hero"
                src="https://www.toyota.com.au/rav4"
                data-original="/-/media/rav4-real-hero.jpg"
                alt="RAV4 hero"
              >
              <section>${'Vehicle content. '.repeat(80)}</section>
            </main>
          </body>
        </html>
      `,
    }, 'https://www.toyota.com.au/rav4')

    if ('bot_blocked' in result)
      throw new Error('Expected external capture to succeed')

    const heroUrl = 'https://www.toyota.com.au/-/media/rav4-real-hero.jpg'

    expect(result.heroUrl).toBe(heroUrl)
    expect(result.html).toContain(`src="${heroUrl}"`)
    expect(result.html).not.toContain('data-original=')
    expect(result.imageUrls).toContain(heroUrl)
    expect(result.imageUrls).not.toContain('https://www.toyota.com.au/rav4')
  })

  it('preserves safe stylesheet link attributes in external captures', () => {
    const result = buildDomCaptureFromHtml({
      html: `
        <!doctype html>
        <html>
          <head>
            <title>RAV4</title>
            <link
              rel="stylesheet"
              href="/assets/desktop.css?rev=1"
              media="screen and (min-width: 1024px)"
              crossorigin="anonymous"
              integrity="sha384-test"
              referrerpolicy="no-referrer"
              onload="alert(1)"
              data-track="drop-me"
            >
          </head>
          <body>
            <main>
              <h1>RAV4</h1>
              <p>${'Hybrid SUV. '.repeat(120)}</p>
            </main>
          </body>
        </html>
      `,
    }, 'https://www.toyota.com.au/rav4')

    if ('bot_blocked' in result)
      throw new Error('Expected external capture to succeed')

    expect(result.stylesheetLinks).toContain('<link rel="stylesheet" href="https://www.toyota.com.au/assets/desktop.css?rev=1" media="screen and (min-width: 1024px)" crossorigin="anonymous" integrity="sha384-test" referrerpolicy="no-referrer">')
    expect(result.stylesheetLinks.join('\n')).not.toContain('onload=')
    expect(result.stylesheetLinks.join('\n')).not.toContain('data-track')
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
