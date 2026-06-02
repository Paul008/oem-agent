import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { getRecipePatternGroup, RECIPE_PATTERN_GROUPS } from './recipe-patterns'

describe('recipe pattern metadata', () => {
  it('provides the Add Section recipe pattern groups in display order', () => {
    expect(RECIPE_PATTERN_GROUPS.map(group => ({ key: group.key, label: group.label }))).toEqual([
      { key: 'hero', label: 'Hero' },
      { key: 'card-grid', label: 'Card Grid' },
      { key: 'split-content', label: 'Split Content' },
      { key: 'media', label: 'Media' },
      { key: 'tabs', label: 'Tabs' },
      { key: 'data-display', label: 'Data Display' },
      { key: 'action-bar', label: 'Action Bar' },
      { key: 'utility', label: 'Utility' },
    ])

    expect(getRecipePatternGroup('hero')?.label).toBe('Hero')
    expect(getRecipePatternGroup('unknown')).toBeUndefined()
  })

  it('keeps recipe pattern catalogs out of page-builder consumers', () => {
    const source = readFileSync(new URL('./AddSectionPicker.vue', import.meta.url), 'utf8')

    expect(source).not.toContain('const PATTERNS')
  })
})
