import { describe, expect, it } from 'vitest'

import { PageStructurer, mappedSectionsToRawSections } from './page-structurer'
import type { MappedSection } from './section-mapper'

const LATEST_KEY = 'pages/definitions/ford-au/mustang/latest.json'
const SOURCE_URL = 'https://www.ford.com.au/showroom/cars/mustang/'

class MemoryR2Bucket {
  private objects = new Map<string, string>()

  constructor(initialObjects: Record<string, unknown>) {
    for (const [key, value] of Object.entries(initialObjects)) {
      this.objects.set(key, JSON.stringify(value))
    }
  }

  async get(key: string): Promise<any> {
    const body = this.objects.get(key)

    if (!body) {
      return null
    }

    return {
      json: async () => JSON.parse(body),
      text: async () => body,
    }
  }

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value)
  }

  readJson<T>(key: string): T {
    const body = this.objects.get(key)

    if (!body) {
      throw new Error(`Missing R2 object: ${key}`)
    }

    return JSON.parse(body) as T
  }
}

function makeAiRouter(response: unknown): { router: any, calls: any[] } {
  const calls: any[] = []

  return {
    calls,
    router: {
      route: async (request: any) => {
        calls.push(request)

        return {
          content: JSON.stringify(response),
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 500,
            total_tokens: 1500,
          },
        }
      },
    },
  }
}

function makeBasePage(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'ford-au-mustang',
    slug: 'mustang',
    name: 'Mustang',
    oem_id: 'ford-au',
    active_mode: 'clone',
    header: { slides: [] },
    content: {
      rendered: '<main><h1>Legacy Clone HTML</h1><p>Enough source content for regeneration prompts.</p></main>',
      modes: {
        clone: {
          rendered: '<main><h1>Clone Mode HTML</h1><p>Current clone source.</p></main>',
          source_url: SOURCE_URL,
          captured_at: '2026-06-03T00:00:00.000Z',
          viewport: { width: 1440, height: 1080 },
          asset_map: {},
          stylesheet_urls: [],
          section_index: [],
          stripped_selectors: [],
          warnings: [],
        },
      },
      sections: [],
    },
    form: false,
    variant_link: '/models/mustang/variants',
    generated_at: '2026-06-03T00:00:00.000Z',
    source_url: SOURCE_URL,
    version: 3,
    ...overrides,
  }
}

describe('PageStructurer page mode integration', () => {
  it('does not overwrite latest.json when a publication validator rejects extracted sections', async () => {
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: makeBasePage() })
    const ai = makeAiRouter({
      sections: [{
        id: 'section-hero-0',
        type: 'hero',
        order: 0,
        heading: 'Incomplete Hero',
        sub_heading: '',
        cta_text: '',
        cta_url: '',
        desktop_image_url: 'https://www.ford.com.au/hero.jpg',
        mobile_image_url: 'https://www.ford.com.au/hero.jpg',
        background_image_url: null,
        video_url: null,
      }],
    })
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.structurePage(
      'ford-au',
      'mustang',
      undefined,
      () => ['missing color-picker section'],
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('missing color-picker section')
    const stored = bucket.readJson<any>(LATEST_KEY)
    expect(stored.version).toBe(3)
    expect(stored.content.sections).toEqual([])
  })

  it('structures clone HTML from clone mode when legacy rendered HTML is missing', async () => {
    const page = makeBasePage({
      content: {
        modes: {
          clone: {
            rendered: '<main><h1>Mode Only Clone</h1><p>Clone source lives in mode content.</p></main>',
            source_url: SOURCE_URL,
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
        sections: [],
      },
    })
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: page })
    const ai = makeAiRouter({
      sections: [{
        id: 'section-hero-0',
        type: 'hero',
        order: 0,
        heading: 'Extracted Hero',
        sub_heading: '',
        cta_text: '',
        cta_url: '',
        desktop_image_url: 'https://www.ford.com.au/hero.jpg',
        mobile_image_url: 'https://www.ford.com.au/hero.jpg',
        background_image_url: null,
        video_url: null,
      }],
    })
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.structurePage('ford-au', 'mustang')

    expect(result.success).toBe(true)
    expect(ai.calls[0].prompt).toContain('Mode Only Clone')

    const stored = bucket.readJson<any>(LATEST_KEY)
    expect(stored.active_mode).toBe('clone')
    expect(stored.content.rendered).toContain('Mode Only Clone')
    expect(stored.content.modes.clone.rendered).toContain('Mode Only Clone')
    expect(stored.content.sections[0].heading).toBe('Extracted Hero')
    expect(stored.content.modes.sections.items[0].heading).toBe('Extracted Hero')
  })

  it('passes selected model overrides to AI structuring', async () => {
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: makeBasePage() })
    const ai = makeAiRouter({
      sections: [{
        id: 'section-hero-0',
        type: 'hero',
        order: 0,
        heading: 'Override Hero',
        sub_heading: '',
        cta_text: '',
        cta_url: '',
        desktop_image_url: 'https://www.ford.com.au/hero.jpg',
        mobile_image_url: 'https://www.ford.com.au/hero.jpg',
        background_image_url: null,
        video_url: null,
      }],
    })
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    await structurer.structurePage('ford-au', 'mustang', {
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
    })

    expect(ai.calls[0].overrideRoute).toEqual({
      provider: 'google_gemini',
      model: 'gemini-2.5-pro',
    })
  })

  it('regenerates a section through sections mode and keeps legacy sections synchronized', async () => {
    const page = makeBasePage({
      content: {
        rendered: '<main><h1>Clone HTML</h1><p>This source is long enough for regeneration prompt selection.</p></main>',
        modes: {
          clone: {
            rendered: '<main><h1>Clone HTML</h1><p>This source is long enough for regeneration prompt selection.</p></main>',
            source_url: SOURCE_URL,
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
          sections: {
            items: [
              { id: 'section-hero-0', type: 'hero', order: 0, heading: 'Mode Current Hero' },
              { id: 'section-intro-1', type: 'intro', order: 1, body_html: '<p>Keep me</p>' },
            ],
          },
        },
        sections: [
          { id: 'section-hero-0', type: 'hero', order: 0, heading: 'Legacy Stale Hero' },
        ],
      },
    })
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: page })
    const ai = makeAiRouter({
      section: {
        id: 'section-hero-0',
        type: 'hero',
        order: 0,
        heading: 'Regenerated Hero',
        sub_heading: '',
        cta_text: '',
        cta_url: '',
        desktop_image_url: 'https://www.ford.com.au/regenerated.jpg',
        mobile_image_url: 'https://www.ford.com.au/regenerated.jpg',
        background_image_url: null,
        video_url: null,
      },
    })
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.regenerateSection('ford-au', 'mustang', 'section-hero-0', 'hero')

    expect(result.success).toBe(true)
    expect(ai.calls[0].prompt).toContain('Mode Current Hero')

    const stored = bucket.readJson<any>(LATEST_KEY)
    expect(stored.active_mode).toBe('clone')
    expect(stored.content.rendered).toContain('Clone HTML')
    expect(stored.content.sections.map((section: any) => section.heading ?? section.body_html)).toEqual([
      'Regenerated Hero',
      '<p>Keep me</p>',
    ])
    expect(stored.content.modes.sections.items.map((section: any) => section.heading ?? section.body_html)).toEqual([
      'Regenerated Hero',
      '<p>Keep me</p>',
    ])
    expect(stored.content.modes.sections.source).toEqual({
      mode: 'clone',
      version: 3,
      generated_at: stored.generated_at,
    })
  })
})

describe('PageStructurer.previewMapping (deterministic-first, non-mutating)', () => {
  const CLONE_HTML = `<body>
    <section class="hero"><h1>Mustang</h1><p>Iconic.</p><img src="/media/hero.jpg"><a href="/build">Build</a></section>
    <section class="grid-blocks">
      <div class="grid-blocks__block"><img src="/media/a.jpg"><h3>Power</h3></div>
      <div class="grid-blocks__block"><img src="/media/b.jpg"><h3>Tech</h3></div>
      <div class="grid-blocks__block"><img src="/media/c.jpg"><h3>Drive</h3></div>
    </section>
  </body>`

  function makeClonePage() {
    return makeBasePage({
      content: {
        modes: {
          clone: {
            rendered: CLONE_HTML,
            source_url: SOURCE_URL,
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
        sections: [],
      },
    })
  }

  it('returns a deterministic mapping with per-section confidence without calling AI or mutating R2', async () => {
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: makeClonePage() })
    const ai = makeAiRouter({})
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.previewMapping('ford-au', 'mustang')

    expect(result.success).toBe(true)
    expect(ai.calls.length).toBe(0) // deterministic only
    expect(result.mapping!.sections[0].type).toBe('hero')
    expect(result.mapping!.sections.map(s => s.type)).toContain('feature-cards')
    expect(result.mapping!.needs_ai_fallback).toBe(false)
    expect(result.mapping!.sections.every(s => typeof s.confidence === 'number')).toBe(true)

    // Non-mutating: version and stored content unchanged.
    const stored = bucket.readJson<any>(LATEST_KEY)
    expect(stored.version).toBe(3)
  })

  it('flags needs_ai_fallback for opaque pages', async () => {
    const opaque = makeBasePage({
      content: {
        modes: {
          clone: {
            rendered: '<body><div class="b1"><p>Lorem ipsum dolor sit amet consectetur adipiscing.</p></div><div class="b2"><p>Sed do eiusmod tempor incididunt ut labore et dolore.</p></div></body>',
            source_url: SOURCE_URL,
            captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 },
            asset_map: {},
            stylesheet_urls: [],
            section_index: [],
            stripped_selectors: [],
            warnings: [],
          },
        },
        sections: [],
      },
    })
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: opaque })
    const ai = makeAiRouter({})
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.previewMapping('ford-au', 'mustang')

    expect(result.success).toBe(true)
    expect(result.mapping!.needs_ai_fallback).toBe(true)
  })

  it('returns success=false when no cloned page exists', async () => {
    const bucket = new MemoryR2Bucket({})
    const ai = makeAiRouter({})
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.previewMapping('ford-au', 'mustang')

    expect(result.success).toBe(false)
    expect(result.mapping).toBeUndefined()
  })
})

describe('mappedSectionsToRawSections', () => {
  function mapped(type: string, data: Record<string, any>, i = 0): MappedSection {
    return { type: type as any, data, id: `s${i}`, order: i, confidence: 1, source: 'deterministic' }
  }

  it('passes through extractable types and reshapes dashboard-only types', () => {
    const raw = mappedSectionsToRawSections([
      mapped('hero', { heading: 'H', desktop_image_url: '/h.jpg' }, 0),
      mapped('heading', { heading: 'Why', sub_heading: 'Because' }, 1),
      mapped('image', { desktop_image_url: '/i.jpg', alt: 'a' }, 2),
      mapped('testimonial', { testimonials: [{ quote: 'Great car' }] }, 3),
      mapped('stats', { stats: [{ value: '500hp', label: 'Power' }] }, 4),
      mapped('feature-cards', { cards: [{ title: 'x', image_url: '/x.jpg' }] }, 5),
    ])

    expect(raw[0].type).toBe('hero')
    expect(raw[1].type).toBe('intro')
    expect(raw[1].title).toBe('Why')
    expect(raw[1].body_html).toBeTruthy()
    expect(raw[2].type).toBe('gallery')
    expect(raw[2].images[0].url).toBe('/i.jpg')
    expect(raw[3].type).toBe('content-block')
    expect(raw[3].content_html).toContain('Great car')
    expect(raw[4].type).toBe('content-block')
    expect(raw[4].content_html).toContain('500hp')
    expect(raw[5].type).toBe('feature-cards')
  })

  it('preserves id and order', () => {
    const raw = mappedSectionsToRawSections([mapped('hero', { heading: 'H' }, 7)])
    expect(raw[0].id).toBe('s7')
    expect(raw[0].order).toBe(7)
  })
})

describe('PageStructurer.mapAndPersist (deterministic-first persistence)', () => {
  const HERO_GRID_CLONE = `<body>
    <section class="hero"><h1>Mustang</h1><p>Iconic.</p><img src="/media/hero.jpg"></section>
    <section class="grid-blocks">
      <div class="grid-blocks__block"><img src="/media/a.jpg"><h3>Power</h3></div>
      <div class="grid-blocks__block"><img src="/media/b.jpg"><h3>Tech</h3></div>
      <div class="grid-blocks__block"><img src="/media/c.jpg"><h3>Drive</h3></div>
    </section>
  </body>`

  function clonePage(rendered: string) {
    return makeBasePage({
      content: {
        modes: {
          clone: {
            rendered, source_url: SOURCE_URL, captured_at: '2026-06-03T00:00:00.000Z',
            viewport: { width: 1440, height: 1080 }, asset_map: {},
            stylesheet_urls: [], section_index: [], stripped_selectors: [], warnings: [],
          },
        },
        sections: [],
      },
    })
  }

  it('persists deterministically WITHOUT calling AI when confidence is high', async () => {
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: clonePage(HERO_GRID_CLONE) })
    const ai = makeAiRouter({})
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.mapAndPersist('ford-au', 'mustang', {
      provider: 'moonshot',
      model: 'kimi-k2.5',
    })

    expect(result.success).toBe(true)
    expect(result.mapping_source).toBe('deterministic')
    expect(ai.calls.length).toBe(0)

    const stored = bucket.readJson<any>(LATEST_KEY)
    expect(stored.active_mode).toBe('clone')
    expect(stored.content.modes.sections.items.length).toBeGreaterThanOrEqual(2)
    expect(stored.content.modes.sections.items[0].type).toBe('hero')
    expect(stored.version).toBe(4) // bumped from 3
  })

  it('falls back to AI structuring when deterministic confidence is low', async () => {
    const opaque = '<body><div class="b1"><p>Lorem ipsum dolor sit amet consectetur adipiscing.</p></div><div class="b2"><p>Sed do eiusmod tempor incididunt ut labore et dolore.</p></div></body>'
    const bucket = new MemoryR2Bucket({ [LATEST_KEY]: clonePage(opaque) })
    const ai = makeAiRouter({
      sections: [{
        id: 'section-hero-0', type: 'hero', order: 0,
        heading: 'AI Hero', sub_heading: '', cta_text: '', cta_url: '',
        desktop_image_url: 'https://www.ford.com.au/hero.jpg', mobile_image_url: '',
        background_image_url: null, video_url: null,
      }],
    })
    const structurer = new PageStructurer({ aiRouter: ai.router, r2Bucket: bucket as any })

    const result = await structurer.mapAndPersist('ford-au', 'mustang', {
      provider: 'moonshot',
      model: 'kimi-k2.5',
    })

    expect(result.success).toBe(true)
    expect(result.mapping_source).toBe('ai')
    expect(ai.calls.length).toBe(1)
    expect(ai.calls[0].overrideRoute).toEqual({
      provider: 'moonshot',
      model: 'kimi-k2.5',
    })
  })
})
