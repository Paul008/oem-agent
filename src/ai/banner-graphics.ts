import type { AiRouter, InferenceResponse } from './router';

const KNOWN_GRAPHICS_TAGS = new Set([
  'embedded_text',
  'price_badge',
  'offer_badge',
  'logo',
  'cta_button',
  'graphic_shapes',
  'icons',
  'illustration',
  'composited_callout',
  'plain_photo',
  'vehicle_photo',
  'lifestyle_photo',
]);

export interface BannerGraphicsAnalysis {
  has_graphics: boolean;
  graphics_tags: string[];
  confidence: number;
  summary: string;
  provider: InferenceResponse['provider'];
  model: string;
  usage: InferenceResponse['usage'];
}

export interface BannerGraphicsInput {
  aiRouter: AiRouter;
  imageBase64: string;
  imageMimeType: string;
  oemId?: string;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const maybeBuffer = (globalThis as unknown as { Buffer?: { from: (data: Uint8Array) => { toString: (encoding: string) => string } } }).Buffer;

  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString('base64');
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function inferImageMimeType(url: string, headerValue: string | null): string {
  const cleanHeader = headerValue?.split(';')[0]?.trim().toLowerCase();
  if (cleanHeader?.startsWith('image/')) return cleanHeader;

  const path = (() => {
    try { return new URL(url).pathname.toLowerCase(); }
    catch { return url.toLowerCase(); }
  })();

  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.avif')) return 'image/avif';
  return 'image/jpeg';
}

export function parseBannerGraphicsResponse(content: string): Omit<BannerGraphicsAnalysis, 'provider' | 'model' | 'usage'> {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Invalid banner graphics JSON: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Banner graphics response must be an object');
  }

  const record = parsed as Record<string, unknown>;
  const hasGraphics = record.has_graphics;
  if (typeof hasGraphics !== 'boolean') {
    throw new Error('Banner graphics response missing boolean "has_graphics"');
  }

  return {
    has_graphics: hasGraphics,
    graphics_tags: normaliseGraphicsTags(record.graphics_tags),
    confidence: clampConfidence(record.confidence),
    summary: typeof record.summary === 'string' ? record.summary.slice(0, 240) : '',
  };
}

export async function analyzeBannerGraphics(input: BannerGraphicsInput): Promise<BannerGraphicsAnalysis> {
  const response = await input.aiRouter.route({
    taskType: 'banner_graphics_classification',
    prompt: buildBannerGraphicsPrompt(),
    imageBase64: input.imageBase64,
    imageMimeType: input.imageMimeType,
    oemId: input.oemId as any,
    requireJson: true,
    maxTokens: 512,
  });

  const parsed = parseBannerGraphicsResponse(response.content);
  return {
    ...parsed,
    provider: response.provider,
    model: response.model,
    usage: response.usage,
  };
}

function buildBannerGraphicsPrompt(): string {
  return `Analyze this automotive website hero banner image.

Classify whether the image itself contains baked-in designed graphics. Ignore any HTML or dashboard overlay that may be added outside the image.

Set has_graphics=true when the actual image visibly contains one or more of:
- embedded marketing text or offer copy
- price, offer, finance, or savings badges
- OEM/model logos or campaign badges
- CTA button artwork
- icons, ribbons, graphic panels, blocks, shapes, or gradients used as designed elements
- composited callouts or illustration-like treatment

Set has_graphics=false when it is just a plain vehicle photo, lifestyle photo, showroom/background image, or vehicle render without baked-in text, badges, logos, icons, panels, or callouts.

Return only JSON with this exact shape:
{
  "has_graphics": boolean,
  "graphics_tags": string[],
  "confidence": number,
  "summary": "short reason, 20 words or fewer"
}

Use only these tags where applicable:
embedded_text, price_badge, offer_badge, logo, cta_button, graphic_shapes, icons, illustration, composited_callout, plain_photo, vehicle_photo, lifestyle_photo`;
}

function normaliseGraphicsTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const tags: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_');
    if (!tag || !KNOWN_GRAPHICS_TAGS.has(tag) || tags.includes(tag)) continue;
    tags.push(tag);
  }
  return tags.slice(0, 8);
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}
