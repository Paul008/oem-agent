import type { BrandTokens, OemId } from '../oem/types';

export interface BrandFontFace {
  family: string;
  weight: string;
  style?: string;
  url: string;
}

interface HostedOemFontConfig {
  primary: string;
  secondary?: string;
  fonts: Array<{
    family: string;
    weight: string;
    filename: string;
  }>;
}

export const HOSTED_OEM_FONTS: Partial<Record<OemId, HostedOemFontConfig>> = {
  'kia-au': {
    primary: 'KiaSignature, sans-serif',
    fonts: [
      { family: 'KiaSignature', weight: '400', filename: 'KiaSignature-Regular.woff2' },
      { family: 'KiaSignature', weight: '700', filename: 'KiaSignature-Bold.woff2' },
    ],
  },
  'ford-au': {
    primary: 'FordAntenna, sans-serif',
    fonts: [
      { family: 'FordAntenna', weight: '400', filename: 'FordAntenna-Regular.woff2' },
      { family: 'FordAntenna', weight: '600', filename: 'FordAntenna-Medium.woff2' },
      { family: 'FordAntenna', weight: '700', filename: 'FordAntenna-CondBold.woff2' },
    ],
  },
  'volkswagen-au': {
    primary: 'VWHead, sans-serif',
    secondary: 'VWText, sans-serif',
    fonts: [
      { family: 'VWHead', weight: '200', filename: 'VWHead-Light.woff2' },
      { family: 'VWHead', weight: '400', filename: 'VWHead-Regular.woff2' },
      { family: 'VWHead', weight: '700', filename: 'VWHead-Bold.woff2' },
      { family: 'VWText', weight: '400', filename: 'VWText-Regular.woff2' },
      { family: 'VWText', weight: '700', filename: 'VWText-Bold.woff2' },
    ],
  },
  'mitsubishi-au': {
    primary: 'MMC, sans-serif',
    fonts: [
      { family: 'MMC', weight: '400', filename: 'MMC-Regular.woff2' },
      { family: 'MMC', weight: '500', filename: 'MMC-Medium.woff2' },
      { family: 'MMC', weight: '700', filename: 'MMC-Bold.woff2' },
    ],
  },
  'mazda-au': {
    primary: 'MazdaType, sans-serif',
    fonts: [
      { family: 'MazdaType', weight: '400', filename: 'MazdaType-Regular.woff2' },
      { family: 'MazdaType', weight: '500', filename: 'MazdaType-Medium.woff2' },
      { family: 'MazdaType', weight: '600', filename: 'MazdaType-Bold.woff2' },
    ],
  },
  'hyundai-au': {
    primary: 'HyundaiSansHead, sans-serif',
    secondary: 'HyundaiSansText, sans-serif',
    fonts: [
      { family: 'HyundaiSansHead', weight: '300', filename: 'HyundaiSansHead-Light.woff2' },
      { family: 'HyundaiSansHead', weight: '400', filename: 'HyundaiSansHead-Regular.woff2' },
      { family: 'HyundaiSansHead', weight: '500', filename: 'HyundaiSansHead-Medium.woff2' },
      { family: 'HyundaiSansHead', weight: '700', filename: 'HyundaiSansHead-Bold.woff2' },
      { family: 'HyundaiSansText', weight: '400', filename: 'HyundaiSansText-Regular.woff2' },
      { family: 'HyundaiSansText', weight: '500', filename: 'HyundaiSansText-Medium.woff2' },
      { family: 'HyundaiSansText', weight: '700', filename: 'HyundaiSansText-Bold.woff2' },
    ],
  },
};

export function enrichBrandTokensWithHostedFontFaces<T extends BrandTokens | null | undefined>(
  tokens: T,
  oemId: string,
  mediaBaseUrl: string,
): T {
  if (!tokens)
    return tokens;

  const typography = tokens.typography;
  if (Array.isArray(typography.font_faces) && typography.font_faces.length)
    return tokens;

  const config = hostedOemFontConfig(oemId);
  const fontFaces = Array.isArray(typography.font_cdn_urls) && typography.font_cdn_urls.length
    ? fontFacesFromCdnUrls(typography.font_cdn_urls, typography.font_primary || config?.primary || '')
    : hostedOemFontFaces(oemId, mediaBaseUrl);

  if (!fontFaces.length)
    return tokens;

  return {
    ...tokens,
    typography: {
      ...typography,
      font_primary: typography.font_primary || config?.primary || '',
      font_secondary: typography.font_secondary || config?.secondary || null,
      font_faces: fontFaces,
      font_cdn_urls: Array.isArray(typography.font_cdn_urls) && typography.font_cdn_urls.length
        ? typography.font_cdn_urls
        : fontFaces.map(face => face.url),
    },
  };
}

export function hostedOemFontFaces(oemId: string, mediaBaseUrl: string): BrandFontFace[] {
  const config = hostedOemFontConfig(oemId);
  if (!config)
    return [];

  const base = mediaBaseUrl.replace(/\/+$/, '');
  return config.fonts.map(font => ({
    family: font.family,
    weight: font.weight,
    url: `${base}/media/fonts/${oemId}/${font.filename}`,
  }));
}

export function hostedOemFontConfig(oemId: string): HostedOemFontConfig | null {
  return HOSTED_OEM_FONTS[oemId as OemId] ?? null;
}

export function fontFacesFromCdnUrls(urls: string[], fontPrimary: string): BrandFontFace[] {
  const family = firstFontFamily(fontPrimary);
  if (!family)
    return [];

  return urls
    .map(url => ({
      family,
      weight: fontWeightFromFilename(url.split('/').pop() || ''),
      url,
    }))
    .filter(face => Boolean(face.url));
}

export function fontWeightFromFilename(filename: string): string {
  const normalized = filename.toLowerCase();
  if (normalized.includes('bold'))
    return '700';
  if (normalized.includes('medium'))
    return '500';
  if (normalized.includes('light'))
    return '300';
  return '400';
}

function firstFontFamily(value: string): string {
  return String(value || '')
    .split(',')[0]
    .replace(/['"\\<>]/g, '')
    .trim();
}
