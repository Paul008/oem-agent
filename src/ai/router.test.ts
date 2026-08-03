import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_MODELS,
  KIMI_K3_CONFIG,
  TASK_ROUTING,
  calculateInferenceCost,
} from './router';

const pageBuilderTasks = [
  'design_vision',
  'page_generation',
  'page_visual_extraction',
  'page_content_generation',
  'page_screenshot_to_code',
  'page_structuring',
] as const;

describe('Kimi K3 Page Builder defaults', () => {
  it('registers Kimi K3 with the official identifier and capabilities', () => {
    expect(KIMI_K3_CONFIG).toMatchObject({
      model: 'kimi-k3',
      api_base: 'https://api.moonshot.ai/v1',
      max_context: 1_048_576,
      supports_vision: true,
      supports_tools: true,
      default_params: { reasoning_effort: 'high' },
    });
    expect(AVAILABLE_MODELS).toContainEqual(expect.objectContaining({
      id: 'kimi-k3-moonshot',
      provider: 'moonshot',
      model: 'kimi-k3',
      capabilities: ['vision', 'json_mode', 'reasoning', 'tools'],
    }));
  });

  it('uses Kimi K3 only for the six approved Page Builder task defaults', () => {
    for (const task of pageBuilderTasks) {
      expect(TASK_ROUTING[task]).toMatchObject({ provider: 'moonshot', model: 'kimi-k3' });
    }

    expect(TASK_ROUTING.quick_scan.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.llm_extraction.model).not.toBe('kimi-k3');
    expect(TASK_ROUTING.sales_conversation.model).not.toBe('kimi-k3');
  });

  it('calculates K3 cache-miss inference cost from official rates', () => {
    expect(calculateInferenceCost('moonshot', 'kimi-k3', {
      prompt_tokens: 1_000_000,
      completion_tokens: 1_000_000,
    })).toBe(18);
  });
});
