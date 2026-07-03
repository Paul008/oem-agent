import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('page builder full preview workflow', () => {
  it('routes the full preview action through the adaptive pipeline', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('fullPreviewActionLabel')
    expect(source).toContain('Build Full Preview')
    expect(source).toContain('Rebuild Full Preview')
    expect(source).toContain('Run full preview pipeline (clone, structure, refresh preview)')
    expect(source).toContain('@click="runAdaptivePipeline(selectedModelOverride)"')
    expect(source).toContain('@select="runAdaptivePipeline(selectedModelOverride)"')
    expect(source).toContain('fetchCompileRunStatus')
    expect(source).toContain('compileStageLabel')
    expect(source).toContain('startCompileStatusPolling()')
  })
})
