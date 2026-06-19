import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('sectionHero responsive media', () => {
  it('renders a mobile source before the desktop hero image', () => {
    const source = readFileSync(new URL('./SectionHero.vue', import.meta.url), 'utf8')
    const pictureIndex = source.indexOf('<picture')
    const sourceIndex = source.indexOf('<source', pictureIndex)
    const imageIndex = source.indexOf('<img', pictureIndex)

    expect(pictureIndex).toBeGreaterThan(-1)
    expect(sourceIndex).toBeGreaterThan(pictureIndex)
    expect(imageIndex).toBeGreaterThan(sourceIndex)
    expect(source).toContain('v-if="section.mobile_image_url"')
    expect(source).toContain(':srcset="section.mobile_image_url"')
    expect(source).toContain('media="(max-width: 767px)"')
  })
})
