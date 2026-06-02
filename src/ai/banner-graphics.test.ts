import { describe, expect, it, vi } from 'vitest';
import { analyzeBannerGraphics, arrayBufferToBase64, inferImageMimeType, parseBannerGraphicsResponse } from './banner-graphics';

describe('banner graphics analysis helpers', () => {
  it('parses and normalises a valid response', () => {
    const result = parseBannerGraphicsResponse(`{
      "has_graphics": true,
      "graphics_tags": ["Embedded Text", "price_badge", "unknown"],
      "confidence": 1.4,
      "summary": "Contains large offer copy and a price badge."
    }`);

    expect(result.has_graphics).toBe(true);
    expect(result.graphics_tags).toEqual(['embedded_text', 'price_badge']);
    expect(result.confidence).toBe(1);
    expect(result.summary).toContain('offer copy');
  });

  it('accepts fenced JSON', () => {
    const result = parseBannerGraphicsResponse('```json\n{"has_graphics":false,"graphics_tags":["plain_photo"],"confidence":0.82,"summary":"Plain vehicle photo."}\n```');

    expect(result.has_graphics).toBe(false);
    expect(result.graphics_tags).toEqual(['plain_photo']);
    expect(result.confidence).toBe(0.82);
  });

  it('throws when has_graphics is missing', () => {
    expect(() => parseBannerGraphicsResponse('{"graphics_tags":[]}')).toThrow('has_graphics');
  });

  it('infers image MIME type from headers or URL extension', () => {
    expect(inferImageMimeType('https://cdn.example.com/banner.webp', null)).toBe('image/webp');
    expect(inferImageMimeType('https://cdn.example.com/banner', 'image/png; charset=binary')).toBe('image/png');
    expect(inferImageMimeType('https://cdn.example.com/banner', null)).toBe('image/jpeg');
  });

  it('encodes an ArrayBuffer to base64', () => {
    expect(arrayBufferToBase64(new Uint8Array([65, 66, 67]).buffer)).toBe('QUJD');
  });

  it('calls the AI router with the banner classification task', async () => {
    const route = vi.fn().mockResolvedValue({
      content: '{"has_graphics":true,"graphics_tags":["logo"],"confidence":0.9,"summary":"Logo is baked in."}',
      provider: 'groq',
      model: 'vision-model',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    const result = await analyzeBannerGraphics({
      aiRouter: { route } as any,
      imageBase64: 'abc',
      imageMimeType: 'image/jpeg',
      oemId: 'kia-au',
    });

    expect(route).toHaveBeenCalledWith(expect.objectContaining({
      taskType: 'banner_graphics_classification',
      imageBase64: 'abc',
      imageMimeType: 'image/jpeg',
      requireJson: true,
    }));
    expect(result.has_graphics).toBe(true);
    expect(result.model).toBe('vision-model');
  });
});
