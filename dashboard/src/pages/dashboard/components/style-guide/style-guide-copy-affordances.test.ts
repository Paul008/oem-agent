import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Style Guide copy affordances', () => {
  it('extends copy-to-clipboard controls to typography tokens and font files', () => {
    const source = readFileSync(new URL('./StyleGuideTypography.vue', import.meta.url), 'utf8')

    expect(source).toContain("import { useClipboard }")
    expect(source).toContain('function copyTypographyScale')
    expect(source).toContain('function copyFontName')
    expect(source).toContain('function copyFontFace')
    expect(source).toContain('@click="copyTypographyScale')
    expect(source).toContain('@click="copyFontName')
    expect(source).toContain('@click="copyFontFace')
    expect(source).toContain('data-export-ignore')
    expect(source).toContain('isCopied(`type-${scale}`)')
    expect(source).toContain("isCopied('font-primary')")
    expect(source).toContain('isCopied(`font-${face.family}-${face.weight}`)')
  })

  it('extends copy-to-clipboard controls to spacing metrics and scale values', () => {
    const source = readFileSync(new URL('./StyleGuideSpacing.vue', import.meta.url), 'utf8')

    expect(source).toContain("import { useClipboard }")
    expect(source).toContain('function copySpacingMetric')
    expect(source).toContain('function copySpacingScale')
    expect(source).toContain('@click="copySpacingMetric')
    expect(source).toContain('@click="copySpacingScale')
    expect(source).toContain('data-export-ignore')
    expect(source).toContain("isCopied('spacing-container-max-width')")
    expect(source).toContain('isCopied(`spacing-scale-${String(name)}`)')
  })
})
