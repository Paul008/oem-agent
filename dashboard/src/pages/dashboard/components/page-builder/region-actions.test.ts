import { describe, it, expect } from 'vitest'
import { getRegionActions, buildPatchPayload } from './region-actions'

const base = { id: 'r1', label: 'Region', selector: 'div', tag: 'div', classes: [], top: 0, height: 100, editable_fields: [] as any[] }

describe('getRegionActions', () => {
  it('always offers colour, height, convert, hide, duplicate, delete', () => {
    const ids = getRegionActions(base).map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['background', 'height', 'convert', 'hide', 'duplicate', 'delete']))
  })

  it('offers edit-text only when the region has a text field', () => {
    expect(getRegionActions(base).map(a => a.id)).not.toContain('edit-text')
    const withText = { ...base, editable_fields: [{ kind: 'text', selector: 'h1' }] }
    expect(getRegionActions(withText).map(a => a.id)).toContain('edit-text')
  })

  it('offers image + alt actions only when the region has an image field', () => {
    const withImg = { ...base, editable_fields: [{ kind: 'image', selector: 'img' }] }
    const ids = getRegionActions(withImg).map(a => a.id)
    expect(ids).toContain('replace-image')
    expect(ids).toContain('alt-text')
  })

  it('offers edit-link only when the region has a link field', () => {
    const withLink = { ...base, editable_fields: [{ kind: 'link', selector: 'a' }] }
    expect(getRegionActions(withLink).map(a => a.id)).toContain('edit-link')
  })

  it('offers panel actions for tabs/carousel regions', () => {
    const tabs = { ...base, type_hint: 'tabs' }
    expect(getRegionActions(tabs).map(a => a.id)).toContain('next-panel')
  })
})

describe('buildPatchPayload', () => {
  it('builds a visibility payload for hide', () => {
    expect(buildPatchPayload('hide', base)).toEqual({ regionId: 'r1', kind: 'visibility', value: false })
  })
  it('builds an image payload for replace-image', () => {
    expect(buildPatchPayload('replace-image', base, 'https://x/y.jpg')).toEqual({ regionId: 'r1', kind: 'image', value: 'https://x/y.jpg' })
  })
  it('builds a link payload for edit-link', () => {
    expect(buildPatchPayload('edit-link', base, '/build')).toEqual({ regionId: 'r1', kind: 'link', value: '/build' })
  })
})
