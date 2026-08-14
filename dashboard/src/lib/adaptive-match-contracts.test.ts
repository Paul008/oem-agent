import { describe, expect, it } from 'vitest'

import {
  adaptiveMatchGraphSchema,
  candidateGraphToSection,
  parseAdaptiveMatchGraph,
  sectionToDeterministicGraph,
} from './adaptive-match-contracts'

const galleryGraph = {
  version: 1,
  kind: 'gallery-lightbox',
  regionId: 'safety',
  confidence: 0.94,
  section: {
    type: 'gallery',
    title: 'Safety',
    layout: 'carousel',
    images: [
      { url: 'https://example.test/a.jpg', alt: 'Front braking', caption: 'Intelligent braking', description: '' },
      { url: '/media/nissan-au/b.jpg', alt: 'Parking sensors', caption: 'Parking sensors', description: '' },
    ],
    initialIndex: 0,
    lightbox: true,
    layoutTokens: { desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, gapPx: 16, paddingBlockPx: 32, paddingInlinePx: 24 },
    appearanceTokens: { backgroundColor: '#ffffff', textColor: '#111111', accentColor: '#00a6d2', borderRadiusPx: 0, imageFit: 'contain', imageAspectRatio: '4/3' },
  },
  interaction: { kind: 'gallery-lightbox', wrap: true, keyboard: true },
  provenance: { strategy: 'ai-interpretation', attempt: 1, provider: 'google_gemini', model: 'gemini-3.1-pro' },
} as const

describe('adaptiveMatchGraphSchema', () => {
  it('accepts a bounded gallery and lightbox candidate', () => {
    expect(adaptiveMatchGraphSchema.safeParse(galleryGraph).success).toBe(true)
  })

  it('rejects executable content in a model candidate', () => {
    const result = adaptiveMatchGraphSchema.safeParse({
      ...galleryGraph,
      section: { ...galleryGraph.section, title: '<script>alert(1)</script>' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects active markup and inline styles inside rich text fields', () => {
    const tabs = {
      ...galleryGraph,
      kind: 'tabs',
      section: {
        type: 'tabs',
        title: 'Safety',
        category: '',
        tabs: [{
          label: 'Safety',
          contentHtml: '<meta http-equiv="refresh" content="0;url=https://example.test"><p style="position:fixed">Safety</p>',
          imageUrl: '',
          imageAlt: '',
        }],
        defaultTab: 0,
        layoutTokens: {},
        appearanceTokens: {},
      },
      interaction: { kind: 'tabs', keyboard: true, activation: 'automatic' },
    }

    expect(adaptiveMatchGraphSchema.safeParse(tabs).success).toBe(false)
  })

  it('rejects unsafe asset protocols', () => {
    const result = adaptiveMatchGraphSchema.safeParse({
      ...galleryGraph,
      section: {
        ...galleryGraph.section,
        images: [{ ...galleryGraph.section.images[0], url: 'javascript:alert(1)' }],
      },
    })

    expect(result.success).toBe(false)
  })

  it('allows generated markup only for deterministic static candidates', () => {
    const staticSection = {
      type: 'content-block',
      title: '',
      contentHtml: '',
      generatedHtml: '<section><h2>Warranty</h2></section>',
      generatedCss: '.warranty{display:grid}',
      layoutTokens: {},
      appearanceTokens: {},
    }
    const aiResult = adaptiveMatchGraphSchema.safeParse({
      ...galleryGraph,
      kind: 'static',
      section: staticSection,
      interaction: null,
    })
    const deterministicResult = adaptiveMatchGraphSchema.safeParse({
      ...galleryGraph,
      kind: 'static',
      section: staticSection,
      interaction: null,
      provenance: { strategy: 'deterministic', attempt: 1 },
    })

    expect(aiResult.success).toBe(false)
    expect(deterministicResult.success).toBe(true)
  })
})

describe('adaptive match graph conversion', () => {
  it('rejects a valid graph for a different selected region', () => {
    expect(() => parseAdaptiveMatchGraph(galleryGraph, 'hero')).toThrow(/region/i)
  })

  it('converts a graph into an editable section with provenance', () => {
    const section = candidateGraphToSection(parseAdaptiveMatchGraph(galleryGraph, 'safety'), {
      runId: 'run-1',
      qa: { passed: true, worstMismatchRatio: 0.022 },
    })

    expect(section).toMatchObject({
      type: 'gallery',
      title: 'Safety',
      layout: 'carousel',
      _clone_region_id: 'safety',
      _adaptive_interaction: { kind: 'gallery-lightbox', wrap: true, keyboard: true },
      _adaptive_match: {
        version: 1,
        run_id: 'run-1',
        kind: 'gallery-lightbox',
        attempt: 1,
        strategy: 'ai-interpretation',
        qa: { passed: true, worstMismatchRatio: 0.022 },
      },
    })
    expect(section.images).toHaveLength(2)
  })

  it('wraps the existing deterministic conversion without changing its HTML', () => {
    const graph = sectionToDeterministicGraph({
      regionId: 'warranty',
      section: {
        type: 'content-block',
        title: '',
        content_html: '',
        _generated_html: '<section class="grid"><h2>Warranty</h2></section>',
        _tailwind_leftover_css: '.grid{display:grid}',
      },
    })

    expect(graph).toMatchObject({ kind: 'static', regionId: 'warranty' })
    expect(graph.section).toMatchObject({
      type: 'content-block',
      generatedHtml: '<section class="grid"><h2>Warranty</h2></section>',
      generatedCss: '.grid{display:grid}',
    })
  })
})
