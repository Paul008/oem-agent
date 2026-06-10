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

  it('compiles safe captured CSS selectors into Tailwind classes and preserves leftovers', () => {
    const section = buildRawHtmlSectionFromCloneRegion(`
      <style>
        .hero-copy {
          padding: 37px;
          background-color: #050505;
          color: #f5f5f5;
          clip-path: polygon(0 0, 100% 0, 90% 100%, 0 100%);
        }
        .hero-copy::before { content: ""; display: block; }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
      </style>
      <section class="hero-copy"><h1>Take centre stage</h1></section>
    `)

    expect(section?._generated_html).not.toContain('<style>')
    expect(section?._generated_html).toContain('class="hero-copy p-[37px] bg-[#050505] text-[#f5f5f5]"')
    expect(section?._tailwind_leftover_css).toContain('clip-path: polygon(0 0, 100% 0, 90% 100%, 0 100%)')
    expect(section?._tailwind_leftover_css).toContain('.hero-copy::before')
    expect(section?._tailwind_leftover_css).toContain('@keyframes fade-in')
    expect(section?._tailwind_conversion).toMatchObject({
      source: 'captured-region-css',
      mode: 'exact',
      supported_declarations: 3,
      template_kind: 'content-block',
    })
    expect(section?._tailwind_conversion.confidence).toBeGreaterThan(0)
    expect(section?._tailwind_conversion.parity_risks).toContain('No browser-computed style snapshot; static CSS selector conversion may miss cascade details.')
    expect(section?._tailwind_conversion.extracted_schema).toMatchObject({
      heading: 'Take centre stage',
    })
  })

  it('renders known Mitsubishi home offer modules through a deterministic Tailwind template', () => {
    const section = buildRawHtmlSectionFromCloneRegion(`
      <section class="contentblock bg-black invisible-xs-down">
        <img src="/content/dam/mmal/home/outlander.jpg" alt="Outlander Black Edition">
        <div class="text">
          <h2>Take centre stage</h2>
          <p>The new Outlander Black Edition commands the road.</p>
          <p>Pitch-dark details demand the spotlight.</p>
        </div>
        <a class="link" href="/offers/outlander.html"><span class="link-text">View offer</span></a>
      </section>
    `, {
      tailwindRecipeArtifact: { source_url: 'https://www.mitsubishi-motors.com.au/' },
    })

    expect(section?._tailwind_conversion).toMatchObject({
      source: 'known-oem-pattern',
      pattern: 'mitsubishi-home-offer',
      template_kind: 'offer-card',
      confidence: 0.98,
      parity_risks: [],
    })
    expect(section?._tailwind_conversion.extracted_schema).toMatchObject({
      heading: 'Take centre stage',
      cta_text: 'View offer',
    })
    expect(section?._generated_html).toContain('src="https://www.mitsubishi-motors.com.au/content/dam/mmal/home/outlander.jpg"')
    expect(section?._generated_html).toContain('Take centre stage')
    expect(section?._generated_html).toContain('The new Outlander Black Edition commands the road.')
    expect(section?._generated_html).toContain('Pitch-dark details demand the spotlight.')
    expect(section?._generated_html).toContain('href="/special-offers"')
    expect(section?._generated_html).toContain('mx-auto grid max-w-7xl grid-cols-1 items-center gap-8 bg-[#050505] text-white lg:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]')
  })

  it('decodes captured HTML entities before rendering known Mitsubishi copy', () => {
    const section = buildRawHtmlSectionFromCloneRegion(`
      <section class="contentblock bg-black">
        <img src="/content/dam/mmal/home/outlander.jpg" alt="Outlander&nbsp;Black&nbsp;Edition">
        <h2>Take&nbsp;centre&nbsp;stage</h2>
        <p>The new&nbsp;Outlander&nbsp;Black&nbsp;Edition&nbsp;commands the road with&nbsp;blacked-out details.</p>
        <a class="link" href="/offers/outlander.html"><span class="link-text">Build&nbsp;your&nbsp;own</span></a>
      </section>
    `, {
      tailwindRecipeArtifact: { source_url: 'https://www.mitsubishi-motors.com.au/' },
    })

    expect(section?._generated_html).toContain('Take centre stage')
    expect(section?._generated_html).toContain('The new Outlander Black Edition commands the road with blacked-out details.')
    expect(section?._generated_html).toContain('Build your own')
    expect(section?._generated_html).not.toContain('&nbsp;')
    expect(section?._generated_html).not.toContain('&amp;nbsp;')
  })

  it('renders known Mitsubishi Diamond Advantage modules through a deterministic Tailwind template', () => {
    const section = buildRawHtmlSectionFromCloneRegion(`
      <section class="contentblock">
        <img src="/content/dam/mmal/home/diamond.jpg">
        <div class="text">
          <h2>You Can Count On Us</h2>
          <p>Every new Mitsubishi is backed by Diamond Advantage.</p>
          <ul>
            <li>10 year warranty</li>
            <li>10 year capped price servicing</li>
          </ul>
          <a class="link" href="/owners/diamond-advantage.html">Learn more</a>
        </div>
      </section>
    `, {
      tailwindRecipeArtifact: { source_url: 'https://www.mitsubishi-motors.com.au/' },
    })

    expect(section?._tailwind_conversion).toMatchObject({
      source: 'known-oem-pattern',
      pattern: 'mitsubishi-diamond-advantage',
      template_kind: 'feature-card',
      confidence: 0.98,
    })
    expect(section?._generated_html).toContain('Australia&#39;s first')
    expect(section?._generated_html).toContain('You Can Count On Us')
    expect(section?._generated_html).toContain('10 year warranty')
    expect(section?._generated_html).toContain('class="w-full bg-[#f3f4f4] px-5 py-12 text-neutral-950')
    expect(section?._generated_html).toContain('href="https://www.mitsubishi-motors.com.au/owners/diamond-advantage.html"')
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

  it('falls back to compiling captured computed styles into Tailwind classes', async () => {
    const section = await buildEditableSectionFromCloneRegion({
      html: '<section class="hero-copy"><h1>Take centre stage</h1></section>',
      tailwindRecipeArtifact: {
        region_id: 'r3',
        root: {
          path: '0',
          tag: 'section',
          attributes: { class: 'hero-copy' },
          computed_style: {
            display: 'flex',
            'background-color': 'rgb(5, 5, 5)',
            color: 'rgb(245, 245, 245)',
            padding: '37px',
          },
          children: [
            {
              path: '0.0',
              tag: 'h1',
              attributes: {},
              computed_style: {
                'font-size': '48px',
                'font-weight': '700',
                'letter-spacing': '0.3px',
              },
              children: [],
            },
          ],
        },
      },
      compileTailwindRecipeArtifact: async () => ({
        success: false,
        result: null,
      }),
    })

    expect(section?._generated_html).toContain('class="hero-copy flex bg-[#050505] text-[#f5f5f5] p-[37px]"')
    expect(section?._generated_html).toContain('<h1 class="text-5xl font-bold tracking-[0.3px]">Take centre stage</h1>')
    expect(section?._tailwind_conversion).toMatchObject({
      source: 'captured-computed-style',
      mode: 'exact',
      template_kind: 'content-block',
    })
    expect(section?._tailwind_conversion.confidence).toBeGreaterThan(0.9)
    expect(section?._tailwind_conversion.parity_risks).toEqual([])
  })

  it('uses computed styles as the base conversion and raw CSS only for variants, leftovers, and stats', async () => {
    const section = await buildEditableSectionFromCloneRegion({
      html: `
        <style>
          .hero-copy { padding: 12px; color: #111111; clip-path: inset(0); }
          .hero-copy:hover { color: #ffffff; background-color: #000000 !important; }
          .unused-rule { color: #ff0000; }
          @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        </style>
        <section class="hero-copy"><h1>Take centre stage</h1></section>
      `,
      tailwindRecipeArtifact: {
        region_id: 'r4',
        root: {
          path: '0',
          tag: 'section',
          attributes: { class: 'hero-copy' },
          computed_style: {
            'background-color': 'rgb(5, 5, 5)',
            color: 'rgb(245, 245, 245)',
            padding: '37px',
          },
          children: [
            {
              path: '0.0',
              tag: 'h1',
              attributes: {},
              computed_style: { 'font-weight': '700' },
              children: [],
            },
          ],
        },
      },
      compileTailwindRecipeArtifact: async () => ({ success: false, result: null }),
    })

    expect(section?._generated_html).toContain('class="hero-copy bg-[#050505] text-[#f5f5f5] p-[37px] hover:text-[#ffffff] hover:bg-[#000000]"')
    expect(section?._generated_html).not.toContain('p-3')
    expect(section?._tailwind_leftover_css).toContain('clip-path: inset(0)')
    expect(section?._tailwind_leftover_css).toContain('@keyframes fade-in')
    expect(section?._tailwind_conversion).toMatchObject({
      source: 'captured-computed-style',
      template_kind: 'content-block',
      stats: {
        unmatched_rules: 1,
        important_count: 1,
        variant_declarations: 2,
        unsupported_declaration_samples: expect.arrayContaining(['clip-path: inset(0)']),
      },
    })
    expect(section?._tailwind_conversion.parity_risks).toEqual(expect.arrayContaining([
      '1 CSS rules matched no elements in the captured region.',
      '1 !important declarations were encountered.',
    ]))
  })

  it('emits responsive utilities from multi-viewport computed snapshots when values change', async () => {
    const section = await buildEditableSectionFromCloneRegion({
      html: '<section class="hero-copy"><h1>Take centre stage</h1></section>',
      tailwindRecipeArtifact: {
        region_id: 'r5',
        computed_snapshots: [
          {
            viewport: { name: 'base', width: 375 },
            root: {
              path: '0',
              tag: 'section',
              computed_style: {
                padding: '24px',
                'clip-path': 'inset(0)',
                opacity: '1',
                overflow: 'visible',
                'background-position': '0% 0%',
                'object-position': '50% 50%',
                'object-fit': 'fill',
                visibility: 'visible',
                position: 'static',
                'border-color': 'rgb(0, 0, 0)',
                border: '0px none rgb(0, 0, 0)',
              },
              children: [
                { path: '0.0', tag: 'h1', computed_style: { 'font-size': '30px' }, children: [] },
              ],
            },
          },
          {
            viewport: { name: 'lg', width: 1024 },
            root: {
              path: '0',
              tag: 'section',
              computed_style: { padding: '48px' },
              children: [
                { path: '0.0', tag: 'h1', computed_style: { 'font-size': '60px' }, children: [] },
              ],
            },
          },
        ],
      },
      compileTailwindRecipeArtifact: async () => ({ success: false, result: null }),
    })

    expect(section?._generated_html).toContain('class="hero-copy p-6 lg:p-12"')
    expect(section?._generated_html).toContain('<h1 class="text-3xl lg:text-6xl">Take centre stage</h1>')
    expect(section?._tailwind_conversion.stats.computed_snapshots).toBe(2)
    expect(section?._tailwind_conversion.stats.variant_declarations).toBe(2)
    expect(section?._tailwind_conversion.stats.unsupported_declaration_samples).toEqual(['clip-path: inset(0)'])
    expect(section?._tailwind_conversion.stats.unsupported_declaration_samples).not.toContain('opacity: 1')
    expect(section?._tailwind_conversion.stats.unsupported_declaration_samples).not.toContain('position: static')
  })

  it('maps multi-value spacing shorthands from computed styles', async () => {
    const section = await buildEditableSectionFromCloneRegion({
      html: '<section><p>Spacing</p></section>',
      tailwindRecipeArtifact: {
        root: {
          path: '0',
          tag: 'section',
          computed_style: { padding: '80px 0px 0px', margin: '0px 16px 24px 16px' },
          children: [
            { path: '0.0', tag: 'p', computed_style: { padding: '12px 20px' }, children: [] },
          ],
        },
      },
      compileTailwindRecipeArtifact: async () => ({ success: false, result: null }),
    })

    expect(section?._generated_html).toContain('<section class="pt-20 mx-4 mb-6">')
    expect(section?._generated_html).toContain('<p class="py-3 px-5">Spacing</p>')
    expect(section?._tailwind_conversion.stats.unsupported_declaration_samples).toEqual([])
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
          viewport_left: 640,
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
          viewport_left: 0,
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

  it('preserves detailed Tailwind conversion stats on whole-page converted clone sections', async () => {
    const result = await convertCloneRegionsToTailwindSections({
      regions: [
        {
          id: 'copy',
          label: 'Hero copy',
          selector: '[data-oem-region-id="copy"]',
          tag: 'section',
          classes: [],
          top: 0,
          width: 1000,
          height: 400,
          editable_fields: [],
          html: '<section class="hero-copy"><h1>Take centre stage</h1></section>',
          tailwindRecipeArtifact: {
            region_id: 'copy',
            root: {
              path: '0',
              tag: 'section',
              computed_style: { color: 'rgb(255, 255, 255)' },
              children: [
                { path: '0.0', tag: 'h1', computed_style: { 'font-weight': '700' }, children: [] },
              ],
            },
          },
        },
      ],
    })

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]._tailwind_conversion).toMatchObject({
      source: 'clone-region',
      region_id: 'copy',
      compiled_source: 'captured-computed-style',
      template_kind: 'content-block',
      confidence: 0.96,
      extracted_schema: {
        heading: 'Take centre stage',
      },
      stats: {
        computed_snapshots: 1,
        computed_declarations: 2,
        mapped_declarations: 2,
      },
    })
    expect(result.sections[0]._tailwind_original_html).toContain('<section class="hero-copy" style="color: rgb(255, 255, 255)">')
    expect(result.sections[0]._tailwind_original_html).toContain('<h1 style="font-weight: 700">Take centre stage</h1>')
  })

  it('aggregates detailed Tailwind conversion stats on grouped clone sections', async () => {
    const result = await convertCloneRegionsToTailwindSections({
      regions: [
        {
          id: 'copy',
          label: 'Hero copy',
          selector: '[data-oem-region-id="copy"]',
          tag: 'section',
          classes: [],
          viewport_left: 0,
          top: 0,
          width: 400,
          height: 400,
          editable_fields: [],
          html: '<section class="copy"><h1>Take centre stage</h1></section>',
          tailwindRecipeArtifact: {
            root: {
              path: '0',
              tag: 'section',
              computed_style: { color: 'rgb(255, 255, 255)' },
              children: [
                { path: '0.0', tag: 'h1', computed_style: { 'font-weight': '700' }, children: [] },
              ],
            },
          },
        },
        {
          id: 'image',
          label: 'Hero image',
          selector: '[data-oem-region-id="image"]',
          tag: 'section',
          classes: [],
          viewport_left: 500,
          top: 0,
          width: 400,
          height: 400,
          editable_fields: [],
          html: '<section class="image"><img src="/outlander.webp" alt="Outlander"></section>',
          tailwindRecipeArtifact: {
            root: {
              path: '0',
              tag: 'section',
              computed_style: { display: 'block' },
              children: [
                { path: '0.0', tag: 'img', computed_style: { width: '100%', 'object-fit': 'cover' }, children: [] },
              ],
            },
          },
        },
      ],
    })

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0]._tailwind_conversion).toMatchObject({
      source: 'clone-region-group',
      template_kind: 'content-block',
      confidence: 0.96,
      stats: {
        computed_declarations: 5,
        mapped_declarations: 5,
      },
    })
    expect(result.sections[0]._tailwind_original_html).toContain('<section class="copy" style="color: rgb(255, 255, 255)">')
    expect(result.sections[0]._tailwind_original_html).toContain('<section class="image" style="display: block"><img src="/outlander.webp" alt="Outlander" style="width: 100%; object-fit: cover"></section>')
    expect(result.sections[0]._tailwind_original_html).toContain('lg:grid-cols-2')
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
