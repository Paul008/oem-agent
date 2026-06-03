import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { disableClonePreviewNavigation } from './clone-preview-html'

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

  it('switches from OEM clone preview into section editing when a section is selected', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('() => props.selectedSectionId')
    expect(source).toContain("previewMode.value = 'sections'")
  })

  it('keeps desktop-only cloned OEM images visible in the static iframe preview', () => {
    const source = readFileSync(new URL('./PageBuilderCanvas.vue', import.meta.url), 'utf8')

    expect(source).toContain('oem-static-clone-shim')
    expect(source).toContain('.imgdesktop')
    expect(source).toContain('.dsktoponly')
  })

  it('disables cloned page links so preview clicks cannot navigate into the worker app', () => {
    const html = '<a href="/showroom/cars/mustang/specs.html" onclick="window.location.href=\'/\'"><img src="/media/pages/assets/ford-au/mustang/hero.webp"></a>'
    const disabled = disableClonePreviewNavigation(html)

    expect(disabled).toContain('href="#oem-preview-disabled"')
    expect(disabled).toContain('data-oem-preview-href="/showroom/cars/mustang/specs.html"')
    expect(disabled).toContain('data-oem-preview-onclick="window.location.href=&#39;/&#39;"')
    expect(disabled).toContain('data-oem-preview-link="true"')
    expect(disabled).toContain('onclick="return false"')
  })
})
