import { describe, expect, it } from 'vitest'

import { buildCatalogSectionsFromModel, buildEditableSectionFromCloneRegion, buildPreviewReplacementHtmlFromCloneRegion, buildRawHtmlSectionFromCloneRegion, convertCloneRegionsToTailwindSections } from './clone-region-converter'

describe('buildRawHtmlSectionFromCloneRegion', () => {
  it('wraps clone region HTML in an editable content block', () => {
    expect(buildRawHtmlSectionFromCloneRegion(' <section><h2>Offer</h2></section> ')).toEqual({
      type: 'content-block',
      title: '',
      content_html: '',
      _generated_html: '<section><h2>Offer</h2></section>',
      animation: 'fade-in',
    })
  })

  it('rejects blank clone region HTML', () => {
    expect(buildRawHtmlSectionFromCloneRegion('   ')).toBeNull()
  })
})

describe('buildEditableSectionFromCloneRegion', () => {
  it('uses a confident Tailwind recipe compile result when an artifact is available', async () => {
    const artifact = { region_id: 'r1' }
    const compile = async () => ({
      success: true,
      result: {
        section_type: 'variant-color-explorer',
        confidence: 0.82,
        section: { type: 'variant-color-explorer', heading: 'Make Your Mark.' },
      },
    })

    await expect(buildEditableSectionFromCloneRegion({
      html: '<section>fallback</section>',
      tailwindRecipeArtifact: artifact,
      compileTailwindRecipeArtifact: compile,
    })).resolves.toEqual({ type: 'variant-color-explorer', heading: 'Make Your Mark.' })
  })

  it('falls back to raw HTML when Tailwind compile confidence is low', async () => {
    const section = await buildEditableSectionFromCloneRegion({
      html: '<section><h2>Fallback</h2></section>',
      tailwindRecipeArtifact: { region_id: 'r2' },
      compileTailwindRecipeArtifact: async () => ({
        success: true,
        result: {
          section_type: 'content-block',
          confidence: 0.4,
          section: { type: 'content-block', title: 'Low confidence' },
        },
      }),
    })

    expect(section).toEqual({
      type: 'content-block',
      title: '',
      content_html: '',
      _generated_html: '<section><h2>Fallback</h2></section>',
      animation: 'fade-in',
    })
  })
})

describe('buildPreviewReplacementHtmlFromCloneRegion', () => {
  it('renders a confident Tailwind recipe compile result as replacement preview HTML', async () => {
    const html = await buildPreviewReplacementHtmlFromCloneRegion({
      regionId: 'region-1',
      html: '<section>fallback</section>',
      tailwindRecipeArtifact: { region_id: 'region-1' },
      compileTailwindRecipeArtifact: async () => ({
        success: true,
        result: {
          confidence: 0.86,
          section: {
            type: 'variant-color-explorer',
            eyebrow: 'Petrol range',
            heading: 'Make Your Mark.',
            cta_text: 'Build your own',
            cta_url: '/build',
            variants: [
              {
                title: 'ES',
                image_url: '/outlander.png',
                key_features: ['20 inch black alloys'],
                colors: [{ name: 'White', hero_image_url: '/outlander-white.png', hex: '#fff' }],
              },
            ],
          },
        },
      }),
    })

    expect(html).toContain('data-oem-region-id="region-1"')
    expect(html).toContain('Make Your Mark.')
    expect(html).toContain('20 inch black alloys')
    expect(html).toContain('class="bg-white px-5 py-14 text-neutral-950 md:px-10 md:py-20"')
  })

  it('falls back to the captured region HTML when the compiler is not confident', async () => {
    const html = await buildPreviewReplacementHtmlFromCloneRegion({
      regionId: 'region-2',
      html: '<section data-oem-region-id="region-2"><h2>Original</h2></section>',
      tailwindRecipeArtifact: { region_id: 'region-2' },
      compileTailwindRecipeArtifact: async () => ({
        success: true,
        result: {
          confidence: 0.2,
          section: { type: 'content-block', content_html: '<p>Low confidence</p>' },
        },
      }),
    })

    expect(html).toBe('<section data-oem-region-id="region-2"><h2>Original</h2></section>')
  })
})

describe('convertCloneRegionsToTailwindSections', () => {
  it('converts all clone regions with captured HTML or Tailwind artifacts into ordered section drafts', async () => {
    const result = await convertCloneRegionsToTailwindSections({
      regions: [
        {
          id: 'hero',
          label: 'Hero',
          selector: '[data-oem-region-id="hero"]',
          tag: 'section',
          classes: [],
          top: 0,
          height: 300,
          editable_fields: [],
          html: '<section><h1>Hero</h1></section>',
        },
        {
          id: 'range',
          label: 'Range',
          selector: '[data-oem-region-id="range"]',
          tag: 'section',
          classes: [],
          top: 300,
          height: 400,
          editable_fields: [],
          tailwindRecipeArtifact: { region_id: 'range' },
        },
      ],
      compileTailwindRecipeArtifact: async () => ({
        success: true,
        result: {
          confidence: 0.88,
          section: { type: 'variant-color-explorer', heading: 'Make Your Mark.' },
        },
      }),
    })

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0]).toMatchObject({ type: 'content-block', order: 0, _clone_region_id: 'hero' })
    expect(result.sections[1]).toMatchObject({ type: 'variant-color-explorer', order: 1, _clone_region_id: 'range' })
    expect(result.skipped).toEqual([])
  })

  it('preserves side-by-side clone regions as one responsive grouped section', async () => {
    const result = await convertCloneRegionsToTailwindSections({
      regions: [
        {
          id: 'image',
          label: 'Hero image',
          selector: '[data-oem-region-id="image"]',
          tag: 'section',
          classes: [],
          left: 640,
          top: 120,
          width: 640,
          height: 560,
          editable_fields: [],
          html: '<section><img src="/outlander.webp" alt="Outlander"></section>',
        },
        {
          id: 'copy',
          label: 'Hero copy',
          selector: '[data-oem-region-id="copy"]',
          tag: 'section',
          classes: [],
          left: 0,
          top: 140,
          width: 560,
          height: 420,
          editable_fields: [],
          html: '<section><h1>Take centre stage</h1></section>',
        },
      ],
    })

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]).toMatchObject({
      type: 'content-block',
      order: 0,
      _clone_region_ids: ['copy', 'image'],
      _tailwind_conversion: {
        source: 'clone-region-group',
        region_ids: ['copy', 'image'],
      },
    })
    expect(result.sections[0]._generated_html).toContain('lg:grid-cols-2')
    expect(result.sections[0]._generated_html.indexOf('Take centre stage')).toBeLessThan(result.sections[0]._generated_html.indexOf('Outlander'))
    expect(result.skipped).toEqual([])
  })

  it('reports skipped regions that do not have conversion-ready source data', async () => {
    const result = await convertCloneRegionsToTailwindSections({
      regions: [
        {
          id: 'empty',
          label: 'Empty region',
          selector: '[data-oem-region-id="empty"]',
          tag: 'section',
          classes: [],
          top: 0,
          height: 300,
          editable_fields: [],
        },
      ],
      compileTailwindRecipeArtifact: async () => ({ success: true, result: { confidence: 1, section: {} } }),
    })

    expect(result.sections).toEqual([])
    expect(result.skipped).toEqual([{ id: 'empty', label: 'Empty region', reason: 'missing-source' }])
  })
})

describe('buildCatalogSectionsFromModel', () => {
  it('builds model tabs and a color-picker section from catalog data', () => {
    const sections = buildCatalogSectionsFromModel({
      oemId: 'ford-au',
      modelSlug: 'mustang',
      regionId: 'region-1',
      products: [
        {
          id: 'p2',
          oem_id: 'ford-au',
          model_id: 'm2',
          title: 'Mustang Premium',
          subtitle: null,
          variant_name: 'Premium',
          variant_code: 'GT',
          body_type: 'Coupe',
          fuel_type: 'Petrol',
          price_amount: 89990,
          price_type: 'From',
          price_qualifier: null,
          price_raw_string: null,
          availability: 'in-stock',
          key_features: ['Lane Assist', 'Wireless CarPlay'],
          specs_json: { engine: '2.3L EcoBoost' },
          created_at: '',
          updated_at: '',
          last_seen_at: '',
        },
        {
          id: 'p1',
          oem_id: 'ford-au',
          model_id: 'm1',
          title: 'Mustang Base',
          subtitle: null,
          variant_name: 'Base',
          variant_code: null,
          body_type: null,
          fuel_type: null,
          price_amount: null,
          price_type: null,
          price_qualifier: null,
          price_raw_string: 'From $67,990',
          availability: 'in-stock',
          key_features: null,
          specs_json: null,
          created_at: '',
          updated_at: '',
          last_seen_at: '',
        },
      ],
      variantColors: [
        { id: 'c2', product_id: 'p2', color_code: '000', color_name: 'White', color_type: '', is_standard: true, price_delta: null, swatch_url: '/swatch2', hero_image_url: '/hero2', gallery_urls: [], sort_order: null, source_hero_url: null, source_swatch_url: null, source_gallery_urls: null, created_at: '' },
        { id: 'c1', product_id: 'p1', color_code: '001', color_name: 'Red', color_type: '', is_standard: true, price_delta: null, swatch_url: '/swatch1', hero_image_url: null, gallery_urls: [], sort_order: null, source_hero_url: null, source_swatch_url: null, source_gallery_urls: null, created_at: '' },
      ],
    } as any)

    expect(sections).toHaveLength(2)
    expect(sections[0].type).toBe('tabs')
    expect(sections[0].title).toBe('Model variants')
    expect(sections[1]).toMatchObject({
      type: 'color-picker',
      title: 'Colours',
      colors: [],
    })
    expect(sections[1]._catalog_binding).toMatchObject({
      type: 'model-catalog',
      oem_id: 'ford-au',
      model_slug: 'mustang',
      region_id: 'region-1',
    })
    expect(typeof sections[1]._catalog_binding.generated_at).toBe('string')

    const tabs = sections[0].tabs
    expect(tabs).toHaveLength(2)
    expect(tabs[0].label).toBe('Base')
    expect(tabs[1].label).toBe('Premium')
    expect(tabs[0].image_url).toBe('/swatch1')
    expect(tabs[1].image_url).toBe('/hero2')
    expect(tabs[1].content_html).toContain('<strong>Code:</strong> GT')
    expect(tabs[1].content_html).toContain('2.3L EcoBoost')
  })

  it('falls back to swatch when hero image is missing', () => {
    const sections = buildCatalogSectionsFromModel({
      oemId: 'kia-au',
      modelSlug: 'sorento',
      products: [
        {
          id: 'x1',
          oem_id: 'kia-au',
          model_id: 'mx',
          title: 'Sorento',
          subtitle: null,
          variant_name: null,
          variant_code: null,
          body_type: null,
          fuel_type: null,
          price_amount: null,
          price_type: null,
          price_qualifier: null,
          price_raw_string: null,
          availability: null,
          key_features: [],
          specs_json: null,
          created_at: '',
          updated_at: '',
          last_seen_at: '',
        },
      ],
      variantColors: [
        { id: 'y1', product_id: 'x1', color_code: 'BLK', color_name: 'Black', color_type: '', is_standard: true, price_delta: null, swatch_url: '/swatch', hero_image_url: null, gallery_urls: [], sort_order: null, source_hero_url: null, source_swatch_url: null, source_gallery_urls: null, created_at: '' },
      ],
    } as any)

    expect(sections[0].tabs[0].image_url).toBe('/swatch')
  })
})
