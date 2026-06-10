import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('preview Tailwind conversion toolbar', () => {
  it('converts the selected preview clone region in place without leaving clone mode', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')
    const convertFunction = source.slice(
      source.indexOf('async function convertSelectedCloneRegionToTailwind()'),
      source.indexOf('async function savePreview()'),
    )

    expect(source).toContain('selectedCloneRegionData')
    expect(source).toContain('const selectedCloneRegion = computed')
    expect(source).toContain('const canConvertSelectedCloneRegion = computed')
    expect(source).toContain('const convertingCloneRegion = ref(false)')
    expect(source).toContain('async function convertSelectedCloneRegionToTailwind()')
    expect(convertFunction).toContain('buildPreviewReplacementHtmlFromCloneRegion({')
    expect(source).toContain('tailwindRecipeArtifact: selectedCloneRegion.value?.tailwindRecipeArtifact')
    expect(source).toContain('compileTailwindRecipeArtifact')
    expect(convertFunction).toContain('patchCloneField({')
    expect(convertFunction).toContain('kind: \'outer-html\'')
    expect(convertFunction).toContain('html: replacementHtml')
    expect(convertFunction).not.toContain('addSectionFromLiveData')
    expect(convertFunction).not.toContain('setActiveMode(\'sections\')')
    expect(source).toContain('title="Convert selected region to Tailwind"')
    expect(source).toContain('Convert to Tailwind')
  })
})
