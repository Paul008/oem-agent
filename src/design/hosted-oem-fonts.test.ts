import { describe, expect, it } from 'vitest';

import {
  enrichBrandTokensWithHostedFontFaces,
  fontFacesFromCdnUrls,
  hostedOemFontFaces,
} from './hosted-oem-fonts';
import type { BrandTokens } from '../oem/types';

function makeTokens(overrides: Partial<BrandTokens['typography']> = {}): BrandTokens {
  return {
    oem_id: 'mitsubishi-au',
    version: 1,
    captured_at: '2026-06-10T00:00:00.000Z',
    source_pages: [],
    colors: {} as any,
    typography: {
      font_primary: 'MMC, sans-serif',
      font_secondary: null,
      font_mono: null,
      font_cdn_urls: [],
      scale: {},
      ...overrides,
    },
    spacing: {} as any,
    borders: {} as any,
    shadows: {} as any,
    buttons: {} as any,
    components: {},
    animations: null,
  };
}

describe('hosted OEM fonts', () => {
  it('builds hosted font faces from the shared OEM font map', () => {
    const faces = hostedOemFontFaces('mitsubishi-au', 'https://worker.example.test/');

    expect(faces).toEqual([
      {
        family: 'MMC',
        weight: '400',
        url: 'https://worker.example.test/media/fonts/mitsubishi-au/MMC-Regular.woff2',
      },
      {
        family: 'MMC',
        weight: '500',
        url: 'https://worker.example.test/media/fonts/mitsubishi-au/MMC-Medium.woff2',
      },
      {
        family: 'MMC',
        weight: '700',
        url: 'https://worker.example.test/media/fonts/mitsubishi-au/MMC-Bold.woff2',
      },
    ]);
  });

  it('enriches tokens missing font faces with hosted font metadata', () => {
    const enriched = enrichBrandTokensWithHostedFontFaces(
      makeTokens({ font_faces: undefined, font_cdn_urls: [] }),
      'mitsubishi-au',
      'https://worker.example.test',
    );

    expect(enriched.typography.font_faces).toHaveLength(3);
    expect(enriched.typography.font_cdn_urls).toContain('https://worker.example.test/media/fonts/mitsubishi-au/MMC-Regular.woff2');
    expect(enriched.typography.font_primary).toBe('MMC, sans-serif');
  });

  it('preserves explicit style guide font faces', () => {
    const tokens = makeTokens({
      font_faces: [{ family: 'Official', weight: '400', url: 'https://cdn.example.test/official.woff2' }],
    });

    const enriched = enrichBrandTokensWithHostedFontFaces(tokens, 'mitsubishi-au', 'https://worker.example.test');

    expect(enriched).toBe(tokens);
    expect(enriched.typography.font_faces).toEqual(tokens.typography.font_faces);
  });

  it('derives generic font faces from font_cdn_urls before using hosted fallbacks', () => {
    const faces = fontFacesFromCdnUrls([
      'https://cdn.example.test/MMC-Regular.woff2',
      'https://cdn.example.test/MMC-Bold.woff2',
    ], 'MMC, sans-serif');

    expect(faces).toEqual([
      { family: 'MMC', weight: '400', url: 'https://cdn.example.test/MMC-Regular.woff2' },
      { family: 'MMC', weight: '700', url: 'https://cdn.example.test/MMC-Bold.woff2' },
    ]);
  });
});
