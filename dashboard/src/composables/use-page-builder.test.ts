import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('usePageBuilder media URL resolution', () => {
  it('does not define duplicate section media resolver cases', () => {
    const source = readFileSync(new URL('./use-page-builder.ts', import.meta.url), 'utf8')
    const resolverStart = source.indexOf('function resolveSectionMediaUrls')
    const resolverEnd = source.indexOf('export interface HistoryEntry')
    const resolverSource = source.slice(resolverStart, resolverEnd)
    const cases = Array.from(resolverSource.matchAll(/case '([^']+)'/g), match => match[1])
    const duplicates = cases.filter((type, index) => cases.indexOf(type) !== index)

    expect(duplicates).toEqual([])
  })
})
