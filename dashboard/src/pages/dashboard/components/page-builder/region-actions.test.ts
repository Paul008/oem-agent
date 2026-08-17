import { describe, expect, it } from 'vitest'

import { buildPatchPayload, getRegionActions } from './region-actions'

const base = { id: 'r1', label: 'Region', selector: 'div', tag: 'div', classes: [], top: 0, height: 100, editable_fields: [] as any[] }

describe('getRegionActions', () => {
  it('always offers colour, height, OEM matching, Tailwind submenu, hide, duplicate, delete', () => {
    const actions = getRegionActions(base)
    const ids = actions.map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['background', 'height', 'convert-tailwind', 'hide', 'duplicate', 'delete']))
    expect(ids).toContain('bind-catalog')
    expect(ids).toContain('match-oem')
    expect(actions.find(action => action.id === 'match-oem')?.label).toBe('Adaptive Match OEM…')

    const convert = actions.find(action => action.id === 'convert-tailwind')
    expect(convert?.children?.map(child => child.id)).toEqual([
      'convert-tailwind-selected',
      'convert-tailwind-all',
    ])
  })

  it('offers edit-text only when the region has a text field', () => {
    expect(getRegionActions(base).map(a => a.id)).not.toContain('edit-text')
    const withText = { ...base, editable_fields: [{ kind: 'text', selector: 'h1' }] as any[] }
    expect(getRegionActions(withText).map(a => a.id)).toContain('edit-text')
  })

  it('offers image + alt actions only when the region has an image field', () => {
    const withImg = { ...base, editable_fields: [{ kind: 'image', selector: 'img' }] as any[] }
    const ids = getRegionActions(withImg).map(a => a.id)
    expect(ids).toContain('replace-image')
    expect(ids).toContain('alt-text')
  })

  it('offers edit-link only when the region has a link field', () => {
    const withLink = { ...base, editable_fields: [{ kind: 'link', selector: 'a' }] as any[] }
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
  it('returns null for non-patch actions', () => {
    expect(buildPatchPayload('height', base)).toBeNull()
    expect(buildPatchPayload('duplicate', base)).toBeNull()
    expect(buildPatchPayload('next-panel', { ...base, type_hint: 'tabs' } as any)).toBeNull()
  })
})
