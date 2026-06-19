import { describe, expect, it } from 'vitest'

import { normalizeRecipesResponse } from './recipes'

describe('normalizeRecipesResponse', () => {
  it('returns the new recipes shape with normalized defaults_json', () => {
    expect(normalizeRecipesResponse({
      recipes: [{
        id: 'r1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: null,
        source: 'brand',
      }],
    })).toEqual([{
      id: 'r1',
      oem_id: 'ford-au',
      pattern: 'hero',
      variant: 'image-overlay',
      label: 'Ford Hero',
      resolves_to: 'hero',
      defaults_json: {},
      source: 'brand',
    }])
  })

  it('converts the old brand_recipes/default_recipes shape', () => {
    const recipes = normalizeRecipesResponse({
      brand_recipes: [{
        id: 'b1',
        oem_id: 'ford-au',
        pattern: 'action-bar',
        variant: 'quick-links',
        label: 'Quick Links',
        resolves_to: 'sticky-bar',
        defaults_json: { background_color: '#001a33' },
      }],
      default_recipes: [{
        id: 'd1',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    })

    expect(recipes.map(r => r.source)).toEqual(['brand', 'default'])
    expect(recipes[0].oem_id).toBe('ford-au')
    expect(recipes[1].oem_id).toBeNull()
  })

  it('lets old-shape brand recipes override matching defaults', () => {
    const recipes = normalizeRecipesResponse({
      brand_recipes: [{
        id: 'b1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
      default_recipes: [{
        id: 'd1',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Generic Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    })

    expect(recipes).toHaveLength(1)
    expect(recipes[0].id).toBe('b1')
    expect(recipes[0].source).toBe('brand')
  })

  it('normalizes null defaults_json on old-shape default recipes', () => {
    const recipes = normalizeRecipesResponse({
      default_recipes: [{
        id: 'd1',
        pattern: 'specs',
        variant: 'grid',
        label: 'Specs Grid',
        resolves_to: 'specs-grid',
        defaults_json: null,
      }],
    })

    expect(recipes[0].defaults_json).toEqual({})
  })
})
