import { describe, expect, it, vi } from 'vitest';
import type { LoadedCatalog } from './catalog';
import {
  buildGeminiParts,
  buildMatchContent,
  buildPresetMenu,
  matchSection,
  matchSectionWithGemini,
  parseMatchResponse,
} from './preset-matcher';

const CATALOG: LoadedCatalog = {
  version: 1, oem: 'toyota', presetCount: 2, categories: [], dir: '/tmp/cat',
  presets: [
    {
      id: 'hero-standard', type: 'hero', categoryId: 'content', categoryLabel: 'Toyota',
      name: 'Toyota Hero', description: 'Large opener.',
      propSchema: { heading: { type: 'string' } }, demoProps: {}, screenshotPath: 's/h.png',
    },
    {
      id: 'toyota-ideal-cards', type: 'feature_grid', categoryId: 'inventory', categoryLabel: 'Inventory',
      name: 'Ideal Cards', description: 'Category cards.',
      propSchema: { items: { type: 'array', item: { title: { type: 'string' } } } },
      demoProps: { variant: 'toyota-category' }, screenshotPath: 's/c.png',
    },
  ],
};

const EXEMPLARS = [
  { presetId: 'hero-standard', base64: 'AAA' },
  { presetId: 'toyota-ideal-cards', base64: 'BBB' },
];

describe('buildPresetMenu', () => {
  it('lists every preset id, name, type, and variant', () => {
    const menu = buildPresetMenu(CATALOG);
    expect(menu).toContain('hero-standard');
    expect(menu).toContain('toyota-ideal-cards');
    expect(menu).toContain('feature_grid');
    expect(menu).toContain('toyota-category');
  });
});

describe('buildMatchContent', () => {
  it('orders parts: menu text, section image, labelled exemplar images', () => {
    const parts = buildMatchContent('SEC', EXEMPLARS, 'MENU');
    expect(parts[0]).toMatchObject({ type: 'text' });
    expect(parts[0].text).toContain('MENU');
    expect(parts[1]).toMatchObject({ type: 'text', text: expect.stringContaining('SECTION TO MATCH') });
    expect(parts[2]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,SEC' } });
    expect(parts[3]).toMatchObject({ type: 'text', text: expect.stringContaining('hero-standard') });
    expect(parts[4]).toEqual({ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } });
    expect(parts.at(-1)).toMatchObject({ type: 'text' });
  });
});

describe('parseMatchResponse', () => {
  const valid = new Set(['hero-standard', 'toyota-ideal-cards']);

  it('parses a clean JSON verdict', () => {
    const result = parseMatchResponse(
      JSON.stringify({ presetId: 'hero-standard', confidence: 0.92, runnersUp: [{ presetId: 'toyota-ideal-cards', confidence: 0.3 }], reason: 'big hero' }),
      valid,
    );
    expect(result.presetId).toBe('hero-standard');
    expect(result.confidence).toBe(0.92);
    expect(result.runnersUp).toHaveLength(1);
  });

  it('nulls an unknown presetId and strips unknown runners-up', () => {
    const result = parseMatchResponse(
      JSON.stringify({ presetId: 'nope', confidence: 0.9, runnersUp: [{ presetId: 'nope2', confidence: 0.5 }] }),
      valid,
    );
    expect(result.presetId).toBeNull();
    expect(result.runnersUp).toEqual([]);
  });

  it('clamps confidence into [0,1] and survives fenced JSON', () => {
    const result = parseMatchResponse('```json\n{"presetId":"hero-standard","confidence":7}\n```', valid);
    expect(result.confidence).toBe(1);
  });

  it('returns a null verdict for unparseable content', () => {
    const result = parseMatchResponse('not json at all', valid);
    expect(result.presetId).toBeNull();
    expect(result.reason).toMatch(/unparseable/i);
  });
});

describe('matchSection', () => {
  it('returns the parsed verdict on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ presetId: 'hero-standard', confidence: 0.8, runnersUp: [], reason: 'r' }) } }] }),
    });
    const match = await matchSection({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(match.presetId).toBe('hero-standard');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.model).toBe('moonshotai/Kimi-K2.5');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('retries once then resolves with a null match carrying the error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });
    const match = await matchSection({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(match.presetId).toBeNull();
    expect(match.error).toMatch(/500/);
  });
});

describe('buildGeminiParts', () => {
  it('mirrors the Together content contract: menu, section label, section image, labelled exemplar images, JSON instruction', () => {
    const parts = buildGeminiParts('SEC', EXEMPLARS, 'MENU');
    expect(parts[0].text).toContain('MENU');
    expect(parts[1]).toEqual({ text: 'SECTION TO MATCH:' });
    expect(parts[2]).toEqual({ inline_data: { mime_type: 'image/png', data: 'SEC' } });
    expect(parts[3]).toMatchObject({ text: expect.stringContaining('hero-standard') });
    expect(parts[4]).toEqual({ inline_data: { mime_type: 'image/png', data: 'AAA' } });
    expect(parts[5]).toMatchObject({ text: expect.stringContaining('toyota-ideal-cards') });
    expect(parts[6]).toEqual({ inline_data: { mime_type: 'image/png', data: 'BBB' } });
    expect(parts.at(-1)?.text).toContain('Respond with ONLY this JSON object');
  });
});

describe('matchSectionWithGemini', () => {
  it('returns the parsed verdict on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ presetId: 'hero-standard', confidence: 0.8, runnersUp: [], reason: 'r' }) }] } }],
      }),
    });
    const match = await matchSectionWithGemini({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url as string).toContain(':generateContent?key=k');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.generationConfig).toEqual({
      temperature: 0.2,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 1024 },
      responseMimeType: 'application/json',
    });
    expect(match.presetId).toBe('hero-standard');
    expect(match.confidence).toBe(0.8);
  });

  it('retries once then resolves with a null match carrying the error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) });
    const match = await matchSectionWithGemini({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(match.presetId).toBeNull();
    expect(match.error).toMatch(/500/);
  });

  it('surfaces finishReason when thinking exhausts the token budget', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => '',
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'MAX_TOKENS' }],
      }),
    });
    const match = await matchSectionWithGemini({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey: 'k', fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(match.presetId).toBeNull();
    expect(match.reason).toContain('MAX_TOKENS');
  });

  it('redacts the api key from stored error text', async () => {
    const apiKey = 'super-secret-key';
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => `boom key=${apiKey} leaked`,
      json: async () => ({}),
    });
    const match = await matchSectionWithGemini({
      sectionBase64: 'SEC', exemplars: EXEMPLARS, catalog: CATALOG,
      apiKey, fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(match.error).not.toContain(apiKey);
    expect(match.error).toContain('***');
  });
});
