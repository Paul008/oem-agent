import { describe, expect, it } from 'vitest'

import type { CloneEditableField, CloneRegion } from '../../page-builder/page-modes'

import { cloneRegionFieldCount, cloneRegionSelectionPayload, sortCloneRegions } from './clone-region-sidebar-helpers'
import {
  buildCloneStudioFrameHtmlForCanvas,
  cloneStudioIframeSandbox,
  computeCloneFrameScale,
} from './clone-studio-canvas-helpers'
import { buildCloneFieldPatchPayload } from './CloneRegionEditor.vue'

function makeRegion(overrides: Partial<CloneRegion> = {}): CloneRegion {
  return {
    id: 'region-1',
    label: 'Hero',
    selector: '[data-oem-region-id="region-1"]',
    tag: 'section',
    classes: ['hero'],
    top: 0,
    height: 640,
    editable_fields: [],
    ...overrides,
  }
}

function makeField(kind: CloneEditableField['kind'], overrides: Partial<CloneEditableField> = {}): CloneEditableField {
  return {
    id: `${kind}-1`,
    selector: `[data-field="${kind}"]`,
    kind,
    label: kind,
    value: '',
    ...overrides,
  }
}

describe('clone Studio components', () => {
  it('builds canvas srcdoc independently of selected region changes', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<main data-oem-region-id="hero">Hero</main>',
          },
        },
      },
    }

    const baseOptions = {
      page,
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      workerBase: '',
      bridgeToken: 'test-token',
    }

    const heroHtml = buildCloneStudioFrameHtmlForCanvas({ ...baseOptions, selectedRegionId: 'hero' })
    const footerHtml = buildCloneStudioFrameHtmlForCanvas({ ...baseOptions, selectedRegionId: 'footer' })

    expect(heroHtml).toBe(footerHtml)
    expect(heroHtml).toContain('test-token')
    expect(heroHtml).toContain('<base href="https://www.ford.com.au/">')
    expect(heroHtml).toContain('data-oem-region-id="hero"')
  })

  it('preserves original captured head styles when rendering an edited clone body', () => {
    const page = {
      content: {
        modes: {
          clone: {
            rendered: '<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen"><style>.hero { color: red; }</style><main><h1>Original</h1></main>',
            edited_rendered: '<main data-oem-region-id="hero"><h1>Edited</h1></main>',
            stylesheet_urls: ['https://cdn.example.test/site.css'],
          },
        },
      },
    }

    const html = buildCloneStudioFrameHtmlForCanvas({
      page,
      title: 'Mustang',
      baseHref: 'https://www.ford.com.au/',
      workerBase: '',
      selectedRegionId: null,
      bridgeToken: 'test-token',
    })
    const head = html.slice(0, html.indexOf('</head>'))

    expect(head).toContain('<link rel="stylesheet" href="https://cdn.example.test/site.css" media="screen">')
    expect((head.match(/href="https:\/\/cdn\.example\.test\/site\.css"/g) || []).length).toBe(1)
    expect(head).toContain('<style>.hero { color: red; }</style>')
    expect(html).toContain('<h1>Edited</h1>')
    expect(html).not.toContain('<h1>Original</h1>')
  })

  it('scales a desktop-width clone frame to fit a narrow editor panel without upscaling', () => {
    // 1280px desktop frame in a ~700px panel -> scaled down.
    expect(computeCloneFrameScale(700, 1280)).toBeCloseTo(700 / 1280, 5)
    // Panel wider than the frame -> render at native size, never upscale.
    expect(computeCloneFrameScale(1024, 768)).toBe(1)
    // Native device widths (tablet/mobile) -> 1:1.
    expect(computeCloneFrameScale(768, 768)).toBe(1)
    // Unmeasured container -> safe default.
    expect(computeCloneFrameScale(0, 1280)).toBe(1)
  })

  it('keeps same-origin iframe sandboxing opt-in for Clone Studio', () => {
    expect(cloneStudioIframeSandbox()).toBe('allow-scripts')
    expect(cloneStudioIframeSandbox(false)).toBe('allow-scripts')
    expect(cloneStudioIframeSandbox(true)).toBe('allow-scripts allow-same-origin')
  })

  it('returns full region objects and stable sorted sidebar data', () => {
    const hero = makeRegion({ id: 'hero', top: 120, editable_fields: [makeField('text'), makeField('image')] })
    const intro = makeRegion({ id: 'intro', top: 20, editable_fields: [] })

    expect(sortCloneRegions([hero, intro]).map(region => region.id)).toEqual(['intro', 'hero'])
    expect(cloneRegionSelectionPayload(hero)).toBe(hero)
    expect(cloneRegionFieldCount(hero)).toBe(2)
    expect(cloneRegionFieldCount(intro)).toBe(0)
  })

  it('builds bridge-compatible editor patch payloads and blocks unsupported backgrounds', () => {
    const region = makeRegion()

    expect(buildCloneFieldPatchPayload(region, makeField('text'), 'New text')).toEqual({
      regionId: 'region-1',
      fieldId: 'text-1',
      selector: '[data-field="text"]',
      kind: 'text',
      value: 'New text',
    })

    expect(buildCloneFieldPatchPayload(region, makeField('html'), '<strong>HTML</strong>')).toEqual({
      regionId: 'region-1',
      fieldId: 'html-1',
      selector: '[data-field="html"]',
      kind: 'html',
      value: '<strong>HTML</strong>',
      html: '<strong>HTML</strong>',
    })

    expect(buildCloneFieldPatchPayload(region, makeField('image'), '/hero.jpg')).toMatchObject({
      kind: 'image',
      value: '/hero.jpg',
    })

    expect(buildCloneFieldPatchPayload(region, makeField('link'), '/offers')).toMatchObject({
      kind: 'link',
      value: '/offers',
    })

    expect(buildCloneFieldPatchPayload(region, makeField('button'), 'Enquire now')).toMatchObject({
      kind: 'button',
      value: 'Enquire now',
      text: 'Enquire now',
    })

    expect(buildCloneFieldPatchPayload(region, makeField('visibility'), false)).toMatchObject({
      kind: 'visibility',
      value: false,
    })

    expect(buildCloneFieldPatchPayload(region, makeField('background'), '#fff')).toBeNull()
    expect(buildCloneFieldPatchPayload(null, makeField('text'), 'ignored')).toBeNull()
  })
})
