import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('preview Tailwind conversion toolbar', () => {
  it('exposes selected clone-region conversion from the standalone preview toolbar', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('selectedCloneRegionData')
    expect(source).toContain('const selectedCloneRegion = computed')
    expect(source).toContain('const canConvertSelectedCloneRegion = computed')
    expect(source).toContain('const convertingCloneRegion = ref(false)')
    expect(source).toContain('async function convertSelectedCloneRegionToTailwind()')
    expect(source).toContain('buildEditableSectionFromCloneRegion({')
    expect(source).toContain('tailwindRecipeArtifact: selectedCloneRegion.value?.tailwindRecipeArtifact')
    expect(source).toContain('compileTailwindRecipeArtifact')
    expect(source).toContain('addSectionFromLiveData(section)')
    expect(source).toContain('setActiveMode(\'sections\')')
    expect(source).toContain('title="Convert selected region to Tailwind"')
    expect(source).toContain('Convert to Tailwind')
  })
})
