import { describe, expect, it } from 'vitest'

import { buildCloneFieldPatchPayload } from './CloneRegionEditor.vue'
import { cloneRegionFieldCount, cloneRegionSelectionPayload, sortCloneRegions } from './CloneRegionSidebar.vue'
import { buildCloneStudioFrameHtmlForCanvas } from './CloneStudioCanvas.vue'
import type { CloneEditableField, CloneRegion } from '../../page-builder/page-modes'

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

describe('Clone Studio components', () => {
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
