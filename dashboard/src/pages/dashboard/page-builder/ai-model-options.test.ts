import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { AI_MODEL_OPTIONS, getAiModelOverride } from './ai-model-options'

describe('AI model options', () => {
  it('provides page-builder AI model choices in display order', () => {
    expect(AI_MODEL_OPTIONS.map(option => ({ value: option.value, label: option.label }))).toEqual([
      { value: 'default', label: 'Default (from settings)' },
      { value: 'google_gemini::gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
      { value: 'google_gemini::gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { value: 'moonshot::kimi-k2.6', label: 'Kimi K2.6' },
      { value: 'moonshot::kimi-k2.5', label: 'Kimi K2.5' },
      { value: 'anthropic::claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    ])
  })

  it('converts a selected model value into an override for AI-backed actions', () => {
    expect(getAiModelOverride('default')).toBeUndefined()
    expect(getAiModelOverride('moonshot::kimi-k2.6')).toEqual({
      provider: 'moonshot',
      model: 'kimi-k2.6',
    })
    expect(getAiModelOverride('unknown')).toBeUndefined()
  })

  it('keeps the model catalog out of the page component', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

    expect(source).not.toContain('const MODEL_OPTIONS')
  })

  it('keeps the desktop model selector visually grouped with AI-backed actions', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')
    const cloneMarker = source.indexOf('<!-- Clone -->')
    const modelSelectorMarker = source.indexOf('<!-- AI model selector -->')
    const structureMarker = source.indexOf('<!-- Structure -->')

    expect(cloneMarker).toBeGreaterThan(-1)
    expect(modelSelectorMarker).toBeGreaterThan(cloneMarker)
    expect(structureMarker).toBeGreaterThan(modelSelectorMarker)
  })

  it('exposes the same AI model choices in the compact workflow menu', () => {
    const source = readFileSync(new URL('./[slug].vue', import.meta.url), 'utf8')

    expect(source).toContain('<UiDropdownMenuSub>')
    expect(source).toContain('<UiDropdownMenuRadioGroup v-model="selectedModel">')
    expect(source).toContain('v-for="opt in AI_MODEL_OPTIONS"')
  })
})
