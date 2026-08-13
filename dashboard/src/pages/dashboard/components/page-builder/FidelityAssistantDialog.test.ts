import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('fidelityAssistantDialog safety gates', () => {
  const source = readFileSync(new URL('./FidelityAssistantDialog.vue', import.meta.url), 'utf8')

  it('only applies conversions that are pixel stable across every viewport', () => {
    expect(source).toContain('overallStatus.value === \'pixel-perfect\'')
    expect(source).toContain('if (canApply.value && props.candidateSection)')
    expect(source).toContain('All viewports must be Pixel stable (≤1%)')
  })

  it('fails closed on broken comparison assets and avoids runtime Tailwind injection', () => {
    expect(source).toContain('image.naturalWidth === 0')
    expect(source).toContain('Comparison asset failed to load:')
    expect(source).toContain('Comparison font failed to load:')
    expect(source).not.toContain('https://cdn.tailwindcss.com')
    expect(source).not.toContain('sandbox="allow-scripts allow-same-origin"')
  })

  it('clears stale measurement state when the dialog closes and reopens', () => {
    const watcher = source.slice(
      source.indexOf('watch(() => props.open'),
      source.indexOf('function setFrame'),
    )

    expect(watcher).toContain('runToken += 1')
    expect(watcher).toContain('measuring.value = false')
    expect(watcher).toContain('measurementStep.value = \'\'')
  })

  it('reports incremental progress and avoids a second PNG decode pass', () => {
    expect(source).toContain('import { toCanvas } from \'html-to-image\'')
    expect(source).toMatch(/measurementStep\.value = `Measuring \$\{viewport\.name\}/)
    expect(source).toContain('results.value = [...measured]')
    expect(source).toContain('withFidelityMeasurementTimeout')
    expect(source).not.toContain('async function dataUrlImageData')
  })
})
