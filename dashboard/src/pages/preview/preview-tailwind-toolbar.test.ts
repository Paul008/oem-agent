import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('preview Tailwind conversion toolbar', () => {
  it('converts the selected preview clone region in place without leaving clone mode', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')
    const convertFunction = source.slice(
      source.indexOf('async function convertSelectedCloneRegionToTailwind()'),
      source.indexOf('async function convertPageToTailwind()'),
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

  it('exposes whole-page Tailwind conversion as an unsaved structured draft', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')
    const convertPageFunction = source.slice(
      source.indexOf('async function convertPageToTailwind()'),
      source.indexOf('async function savePreview()'),
    )

    expect(source).toContain('convertCloneRegionsToTailwindSections')
    expect(source).toContain('const convertingPage = ref(false)')
    expect(source).toContain('const canConvertPageToTailwind = computed')
    expect(convertPageFunction).toContain('convertCloneRegionsToTailwindSections({')
    expect(convertPageFunction).toContain('const collectedRegions = await pageBuilderCanvas.value?.collectCloneRegions()')
    expect(convertPageFunction).toContain('regions: collectedRegions?.length ? collectedRegions : cloneRegionsForSave.value')
    expect(convertPageFunction).toContain('replaceSections(result.sections)')
    expect(convertPageFunction).toContain('setActiveMode(\'sections\')')
    expect(convertPageFunction).toContain('toast.success')
    expect(convertPageFunction).not.toContain('saveSections(')
    expect(source).toContain('title="Convert page to Tailwind sections"')
    expect(source).toContain('Convert Page')
  })

  it('adds a read-only Tailwind source view for converted sections', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('type PreviewView = \'edit\' | \'production\' | \'source\'')
    expect(source).toContain('const isSourceView = computed(() => previewView.value === \'source\')')
    expect(source).toContain('const hasTailwindSource = computed')
    expect(source).toContain('function tailwindSectionSource(section: any): string')
    expect(source).toContain('return raw === \'production\' || raw === \'source\' ? raw : \'edit\'')
    expect(source).toContain('query.view = \'source\'')
    expect(source).toContain('@click="setPreviewView(\'source\')"')
    expect(source).toContain('title="Tailwind source"')
    expect(source).toContain('Tailwind Source')
    expect(source).toContain('v-if="isSourceView"')
    expect(source).toContain('data-oem-tailwind-source-view="true"')
    expect(source).toContain('v-for="section in sections"')
    expect(source).toContain('tailwindSectionSource(section)')
  })

  it('preserves unsaved converted sections when switching preview views', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')
    const setPreviewViewFunction = source.slice(
      source.indexOf('function setPreviewView(view: PreviewView)'),
      source.indexOf('function tailwindSectionSource(section: any): string'),
    )

    expect(setPreviewViewFunction).toContain('replacePreviewViewQuery(view)')
    expect(setPreviewViewFunction).not.toContain('router.replace')
    expect(source).toContain('function replacePreviewViewQuery(view: PreviewView)')
    expect(source).toContain('window.history.replaceState')
    expect(source).toContain('preserve unsaved converted sections')
  })
})
