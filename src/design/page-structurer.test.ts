import { describe, expect, it } from 'vitest'

import { PageStructurer } from './page-structurer'

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
