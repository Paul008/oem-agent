import type { LoadedCatalog } from './catalog';

export type ExemplarImage = { presetId: string; base64: string };

export type SectionMatch = {
  presetId: string | null;
  confidence: number;
  runnersUp: Array<{ presetId: string; confidence: number }>;
  reason: string;
  error?: string;
};

type ContentPart = { type: string; text?: string; image_url?: { url: string } };

export const TOGETHER_API_BASE = 'https://api.together.xyz/v1';
export const KIMI_MODEL = 'moonshotai/Kimi-K2.5';

export function buildPresetMenu(catalog: LoadedCatalog): string {
  const lines = catalog.presets.map((preset) => {
    const variant = typeof preset.demoProps.variant === 'string' ? ` variant=${preset.demoProps.variant}` : '';
    const propKeys = Object.keys(preset.propSchema).join(', ');
    return `- ${preset.id} | ${preset.name} | type=${preset.type}${variant} | category=${preset.categoryLabel} | props: ${propKeys} | ${preset.description}`;
  });
  return `Available CMS presets:\n${lines.join('\n')}`;
}

export function buildMatchContent(
  sectionBase64: string,
  exemplars: ExemplarImage[],
  menu: string,
): ContentPart[] {
  const parts: ContentPart[] = [
    {
      type: 'text',
      text: [
        'You match a captured website section to the closest CMS block preset.',
        menu,
        'After the section image, each preset exemplar image follows, labelled with its id.',
      ].join('\n\n'),
    },
    { type: 'text', text: 'SECTION TO MATCH:' },
    { type: 'image_url', image_url: { url: `data:image/png;base64,${sectionBase64}` } },
  ];
  for (const exemplar of exemplars) {
    parts.push({ type: 'text', text: `EXEMPLAR ${exemplar.presetId}:` });
    parts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${exemplar.base64}` } });
  }
  parts.push({
    type: 'text',
    text: [
      'Respond with ONLY this JSON object:',
      '{"presetId": "<id or null if nothing fits>", "confidence": <0..1>, "runnersUp": [{"presetId": "<id>", "confidence": <0..1>}], "reason": "<one sentence>"}',
      'Judge by layout structure and content role (hero vs cards vs cta vs form vs map), not by colors or exact copy.',
    ].join('\n'),
  });
  return parts;
}

export function parseMatchResponse(
  content: string,
  validIds: Set<string>,
): Omit<SectionMatch, 'error'> {
  const cleaned = content.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return { presetId: null, confidence: 0, runnersUp: [], reason: 'unparseable model response' };
  }
  const rawId = typeof parsed.presetId === 'string' ? parsed.presetId : null;
  const presetId = rawId && validIds.has(rawId) ? rawId : null;
  const runnersUp = (Array.isArray(parsed.runnersUp) ? parsed.runnersUp : [])
    .filter((entry): entry is { presetId: string; confidence: number } =>
      !!entry && typeof entry === 'object'
      && typeof (entry as Record<string, unknown>).presetId === 'string'
      && validIds.has((entry as Record<string, unknown>).presetId as string))
    .map((entry) => ({ presetId: entry.presetId, confidence: clamp01(Number(entry.confidence)) }));
  return {
    presetId,
    confidence: clamp01(Number(parsed.confidence)),
    runnersUp,
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  };
}

export async function matchSection(opts: {
  sectionBase64: string;
  exemplars: ExemplarImage[];
  catalog: LoadedCatalog;
  apiKey: string;
  apiBase?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<SectionMatch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const validIds = new Set(opts.catalog.presets.map((preset) => preset.id));
  const content = buildMatchContent(opts.sectionBase64, opts.exemplars, buildPresetMenu(opts.catalog));

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(`${opts.apiBase ?? TOGETHER_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: opts.model ?? KIMI_MODEL,
          messages: [{ role: 'user', content }],
          temperature: 0.2,
          max_tokens: 1024,
          response_format: { type: 'json_object' },
        }),
      });
      if (!response.ok) {
        lastError = `Together error ${response.status}: ${(await response.text()).slice(0, 300)}`;
        continue;
      }
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { ...parseMatchResponse(data.choices?.[0]?.message?.content || '', validIds) };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  return { presetId: null, confidence: 0, runnersUp: [], reason: 'match call failed', error: lastError };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = 'gemini-2.5-pro';

type GeminiPart = { text?: string; inline_data?: { mime_type: string; data: string } };

export function buildGeminiParts(
  sectionBase64: string,
  exemplars: ExemplarImage[],
  menu: string,
): GeminiPart[] {
  const parts: GeminiPart[] = [
    {
      text: [
        'You match a captured website section to the closest CMS block preset.',
        menu,
        'After the section image, each preset exemplar image follows, labelled with its id.',
      ].join('\n\n'),
    },
    { text: 'SECTION TO MATCH:' },
    { inline_data: { mime_type: 'image/png', data: sectionBase64 } },
  ];
  for (const exemplar of exemplars) {
    parts.push({ text: `EXEMPLAR ${exemplar.presetId}:` });
    parts.push({ inline_data: { mime_type: 'image/png', data: exemplar.base64 } });
  }
  parts.push({
    text: [
      'Respond with ONLY this JSON object:',
      '{"presetId": "<id or null if nothing fits>", "confidence": <0..1>, "runnersUp": [{"presetId": "<id>", "confidence": <0..1>}], "reason": "<one sentence>"}',
      'Judge by layout structure and content role (hero vs cards vs cta vs form vs map), not by colors or exact copy.',
    ].join('\n'),
  });
  return parts;
}

export async function matchSectionWithGemini(opts: {
  sectionBase64: string;
  exemplars: ExemplarImage[];
  catalog: LoadedCatalog;
  apiKey: string;
  apiBase?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<SectionMatch> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const validIds = new Set(opts.catalog.presets.map((preset) => preset.id));
  const parts = buildGeminiParts(opts.sectionBase64, opts.exemplars, buildPresetMenu(opts.catalog));
  const url = `${opts.apiBase ?? GEMINI_API_BASE}/models/${opts.model ?? GEMINI_MODEL}:generateContent?key=${opts.apiKey}`;

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      });
      if (!response.ok) {
        lastError = `Gemini error ${response.status}: ${(await response.text()).slice(0, 300)}`;
        continue;
      }
      const data = await response.json() as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const content = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text || '')
        .join('');
      return { ...parseMatchResponse(content, validIds) };
    } catch (error) {
      lastError = (error as Error).message;
    }
  }
  return { presetId: null, confidence: 0, runnersUp: [], reason: 'match call failed', error: lastError };
}
