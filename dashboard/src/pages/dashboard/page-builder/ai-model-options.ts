export interface AiModelOption {
  value: string
  label: string
  provider: string
  model: string
}

export interface AiModelOverride {
  provider: string
  model: string
}

export const DEFAULT_AI_MODEL_VALUE = 'default'

export const AI_MODEL_OPTIONS: AiModelOption[] = [
  { value: DEFAULT_AI_MODEL_VALUE, label: 'Default (from settings)', provider: '', model: '' },
  { value: 'moonshot::kimi-k3', label: 'Kimi K3', provider: 'moonshot', model: 'kimi-k3' },
  { value: 'google_gemini::gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', provider: 'google_gemini', model: 'gemini-3.1-pro-preview' },
  { value: 'google_gemini::gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google_gemini', model: 'gemini-2.5-pro' },
  { value: 'moonshot::kimi-k2.6', label: 'Kimi K2.6', provider: 'moonshot', model: 'kimi-k2.6' },
  { value: 'moonshot::kimi-k2.5', label: 'Kimi K2.5', provider: 'moonshot', model: 'kimi-k2.5' },
  { value: 'anthropic::claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
]

export function getAiModelOverride(value: string): AiModelOverride | undefined {
  if (value === DEFAULT_AI_MODEL_VALUE)
    return undefined

  const option = AI_MODEL_OPTIONS.find(modelOption => modelOption.value === value)
  if (!option?.provider || !option.model)
    return undefined

  return {
    provider: option.provider,
    model: option.model,
  }
}
