import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('PageBuilderCanvas preview mode', () => {
  it('keeps cloned OEM HTML available when extracted sections also exist', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('previewMode')
    expect(source).toContain('showCloneFrame')
    expect(source).toContain('showStructuredPreview')

    const cloneFrame = source.indexOf('v-if="showCloneFrame"')
    const structuredPreview = source.indexOf('v-else-if="showStructuredPreview"')
    const legacyClonedBranch = source.indexOf('v-else-if="isCloned && page?.content?.rendered"')

    expect(cloneFrame).toBeGreaterThan(-1)
    expect(structuredPreview).toBeGreaterThan(cloneFrame)
    expect(legacyClonedBranch).toBe(-1)
  })
})
