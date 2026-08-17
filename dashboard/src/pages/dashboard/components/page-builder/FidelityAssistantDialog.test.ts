import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('adaptive Match OEM dialog contracts', () => {
  const source = readFileSync(new URL('./FidelityAssistantDialog.vue', import.meta.url), 'utf8')

  it('runs the adaptive controller automatically and never applies implicitly', () => {
    expect(source).toContain('Adaptive Match OEM')
    expect(source).toContain('await controller.start()')
    expect(source).toContain('function applyCandidate()')
    expect(source).toContain('emit(\'apply\', candidateGraphToSection')
    expect(source).not.toMatch(/controller\.start\(\)[\s\S]{0,100}emit\('apply'/)
  })

  it('shows attempt history and warns before applying the best failed candidate', () => {
    expect(source).toContain('data-adaptive-attempts')
    expect(source).toContain('Attempt {{ attempt.attempt }}')
    expect(source).toContain('best safe candidate from three attempts')
    expect(source).toContain('applyAnyway ? \'Apply anyway\' : \'Apply\'')
  })

  it('uses the balanced gate and checks interactions, content, assets and overflow', () => {
    expect(source).toContain('evaluateAdaptiveCandidate({')
    expect(source).toContain('probeInteractions')
    expect(source).toContain('contentMatches')
    expect(source).toContain('measureRegionOverflow')
    expect(source).toContain('compareRegionPixels')
  })

  it('captures each viewport sequentially with Safari-safe bounded rasterisation', () => {
    expect(source).toContain('import { getFontEmbedCSS, toSvg } from \'html-to-image\'')
    expect(source).toContain('for (const viewport of VIEWPORTS)')
    expect(source).toContain('withFidelityMeasurementTimeout')
    expect(source).toContain('withFidelityMeasurementFallback')
    expect(source).toContain('background tab')
    expect(source).not.toContain('toCanvas(')
    expect(source).not.toContain('Promise.all([captureRoot')
  })

  it('keeps all comparison frames scriptless', () => {
    expect(source).toContain('sandbox="allow-same-origin"')
    expect(source).not.toContain('sandbox="allow-scripts')
    expect(source).not.toContain('https://cdn.tailwindcss.com')
  })
})
