import { describe, expect, it } from 'vitest'
import { getRegionActions } from './region-actions'

describe('region menu contract', () => {
  it('hero-like region yields edit-text/replace-image/edit-link/background/height', () => {
    const ids = getRegionActions({ id: 'r', editable_fields: [{ kind: 'text' }, { kind: 'image' }, { kind: 'link' }] } as any).map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['edit-text', 'replace-image', 'edit-link', 'background', 'height']))
  })
})
