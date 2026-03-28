import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TokenCrawler, type CrawledTokens } from './token-crawler';

// Mock @cloudflare/puppeteer — never actually launch a browser
vi.mock('@cloudflare/puppeteer', () => ({
  default: {
    launch: vi.fn(),
  },
}));

describe('TokenCrawler', () => {
  let crawler: TokenCrawler;
  const mockBrowser = {} as Fetcher;

  beforeEach(() => {
    crawler = new TokenCrawler({ browser: mockBrowser });
  });

  // -----------------------------------------------------------------------
  // rgbToHex
  // -----------------------------------------------------------------------
  describe('rgbToHex (private)', () => {
    const rgbToHex = (rgb?: string) => (crawler as any).rgbToHex(rgb);

    it('converts rgb(r, g, b) to hex', () => {
      expect(rgbToHex('rgb(255, 0, 0)')).toBe('#ff0000');
      expect(rgbToHex('rgb(0, 128, 255)')).toBe('#0080ff');
      expect(rgbToHex('rgb(0, 0, 0)')).toBe('#000000');
      expect(rgbToHex('rgb(255, 255, 255)')).toBe('#ffffff');
    });

    it('converts rgba(r, g, b, a) to hex (ignoring alpha)', () => {
      expect(rgbToHex('rgba(10, 20, 30, 0.5)')).toBe('#0a141e');
    });

    it('returns hex strings as-is', () => {
      expect(rgbToHex('#abcdef')).toBe('#abcdef');
      expect(rgbToHex('#000')).toBe('#000');
    });

    it('returns null for undefined/null/empty', () => {
      expect(rgbToHex(undefined)).toBeNull();
      expect(rgbToHex('')).toBeNull();
    });

    it('returns null for non-color strings', () => {
      expect(rgbToHex('transparent')).toBeNull();
      expect(rgbToHex('not-a-color')).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // isNeutral
  // -----------------------------------------------------------------------
  describe('isNeutral (private)', () => {
    const isNeutral = (hex: string) => (crawler as any).isNeutral(hex);

    it('treats pure white as neutral', () => {
      expect(isNeutral('#ffffff')).toBe(true);
    });

    it('treats pure black as neutral', () => {
      expect(isNeutral('#000000')).toBe(true);
    });

    it('treats grays as neutral', () => {
      expect(isNeutral('#808080')).toBe(true);
      expect(isNeutral('#cccccc')).toBe(true);
      expect(isNeutral('#333333')).toBe(true);
    });

    it('treats saturated colors as NOT neutral', () => {
      expect(isNeutral('#ff0000')).toBe(false); // red
      expect(isNeutral('#0000ff')).toBe(false); // blue
      expect(isNeutral('#00cc00')).toBe(false); // green
    });

    it('treats near-white as neutral (min > 225)', () => {
      expect(isNeutral('#f0f0ff')).toBe(true);
    });

    it('treats very dark colors as neutral (max < 30)', () => {
      expect(isNeutral('#0a0a1d')).toBe(true);
    });

    it('rejects invalid short hex as neutral', () => {
      expect(isNeutral('#abc')).toBe(true); // length < 7
      expect(isNeutral('notahex')).toBe(true); // no # prefix
    });
  });

  // -----------------------------------------------------------------------
  // cleanFontFamily
  // -----------------------------------------------------------------------
  describe('cleanFontFamily (private)', () => {
    const cleanFontFamily = (raw: string) => (crawler as any).cleanFontFamily(raw);

    it('takes the first font and appends sans-serif', () => {
      expect(cleanFontFamily('"Roboto", Arial, sans-serif')).toBe('Roboto, sans-serif');
    });

    it('strips single quotes', () => {
      expect(cleanFontFamily("'Open Sans', Helvetica")).toBe('Open Sans, sans-serif');
    });

    it('handles unquoted font families', () => {
      expect(cleanFontFamily('Arial, Helvetica, sans-serif')).toBe('Arial, sans-serif');
    });

    it('returns system-ui fallback for empty input', () => {
      expect(cleanFontFamily('')).toBe('system-ui, sans-serif');
    });
  });

  // -----------------------------------------------------------------------
  // looksLikeColor
  // -----------------------------------------------------------------------
  describe('looksLikeColor (private)', () => {
    const looksLikeColor = (val: string) => (crawler as any).looksLikeColor(val);

    it('recognizes hex colors', () => {
      expect(looksLikeColor('#ff0000')).toBe(true);
      expect(looksLikeColor('#abc')).toBe(true);
      expect(looksLikeColor('#aabbccdd')).toBe(true); // 8-digit hex
    });

    it('recognizes rgb/rgba strings', () => {
      expect(looksLikeColor('rgb(0, 0, 0)')).toBe(true);
      expect(looksLikeColor('rgba(255, 0, 0, 1)')).toBe(true);
    });

    it('rejects non-color strings', () => {
      expect(looksLikeColor('12px')).toBe(false);
      expect(looksLikeColor('auto')).toBe(false);
      expect(looksLikeColor('none')).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // findPrimaryColor
  // -----------------------------------------------------------------------
  describe('findPrimaryColor (private)', () => {
    const findPrimaryColor = (allColors: string[], buttonBg?: string) =>
      (crawler as any).findPrimaryColor(allColors, buttonBg);

    it('prefers button background when it is a non-neutral color', () => {
      const result = findPrimaryColor(['rgb(200, 200, 200)'], 'rgb(255, 0, 0)');
      expect(result).toBe('#ff0000');
    });

    it('skips neutral button background and uses first non-neutral from allColors', () => {
      const result = findPrimaryColor(['rgb(128, 128, 128)', 'rgb(0, 100, 200)'], 'rgb(255, 255, 255)');
      expect(result).toBe('#0064c8');
    });

    it('returns null when all colors are neutral', () => {
      const result = findPrimaryColor(['rgb(255, 255, 255)', 'rgb(0, 0, 0)']);
      expect(result).toBeNull();
    });

    it('returns null for empty allColors and no button', () => {
      expect(findPrimaryColor([])).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // mapToTokens
  // -----------------------------------------------------------------------
  describe('mapToTokens (private)', () => {
    const mapToTokens = (extracted: any, sourceUrl: string): CrawledTokens =>
      (crawler as any).mapToTokens(extracted, sourceUrl);

    it('produces a valid CrawledTokens structure from extracted data', () => {
      const extracted = {
        customProps: { '--brand-primary': '#e60012' },
        body: {
          fontFamily: '"Nissan Brand", sans-serif',
          fontSize: '16px',
          color: 'rgb(33, 33, 33)',
          backgroundColor: 'rgb(255, 255, 255)',
          lineHeight: '1.5',
        },
        headings: {
          h1: {
            fontFamily: '"Nissan Brand Bold", sans-serif',
            fontSize: '48px',
            fontWeight: '700',
            lineHeight: '1.2',
            letterSpacing: 'normal',
            color: 'rgb(0, 0, 0)',
          },
          h2: {
            fontFamily: '"Nissan Brand", sans-serif',
            fontSize: '36px',
            fontWeight: '600',
            lineHeight: '1.3',
            letterSpacing: '-0.5px',
            color: 'rgb(0, 0, 0)',
          },
        },
        buttons: {
          backgroundColor: 'rgb(230, 0, 18)',
          color: 'rgb(255, 255, 255)',
          borderRadius: '4px',
          padding: '12px 32px',
          fontSize: '14px',
          fontWeight: '700',
        },
        links: { color: 'rgb(0, 100, 200)' },
        container: { maxWidth: '1280px', paddingLeft: '16px', paddingRight: '16px' },
        allColors: ['rgb(230, 0, 18)', 'rgb(255, 255, 255)', 'rgb(33, 33, 33)'],
        fontFaces: [],
      };

      const tokens = mapToTokens(extracted, 'https://www.nissan.com.au');

      // Colors
      expect(tokens.colors.primary).toBe('#e60012');
      expect(tokens.colors.background).toBe('#ffffff');
      expect(tokens.colors.text_primary).toBe('#212121');
      expect(tokens.colors.cta_fill).toBe('#e60012');
      expect(tokens.colors.cta_text).toBe('#ffffff');
      expect(tokens.colors.link).toBe('#0064c8');

      // Typography
      expect(tokens.typography.font_primary).toBe('Nissan Brand Bold, sans-serif');
      expect(tokens.typography.font_secondary).toBe('Nissan Brand, sans-serif');
      expect(tokens.typography.scale.h1.fontSize).toBe('48px');
      expect(tokens.typography.scale.h1.fontWeight).toBe(700);
      expect(tokens.typography.scale.h2.letterSpacing).toBe('-0.5px');
      expect(tokens.typography.scale.body.fontSize).toBe('16px');

      // Spacing
      expect(tokens.spacing.container_max_width).toBe('1280px');
      expect(tokens.spacing.container_padding).toBe('16px');

      // Borders
      expect(tokens.borders.radius_md).toBe('4px');

      // Buttons
      expect(tokens.buttons.primary.background).toBe('#e60012');
      expect(tokens.buttons.primary.border_radius).toBe('4px');

      // Custom properties pass through
      expect(tokens.css_custom_properties['--brand-primary']).toBe('#e60012');

      // Metadata
      expect(tokens.source_url).toBe('https://www.nissan.com.au');
      expect(tokens.crawled_at).toBeTruthy();
    });

    it('falls back to defaults when extracted data is sparse', () => {
      const extracted = {
        customProps: {},
        body: {},
        headings: {},
        buttons: {},
        links: {},
        container: {},
        allColors: [],
        fontFaces: [],
      };

      const tokens = mapToTokens(extracted, 'https://example.com');

      expect(tokens.colors.primary).toBe('#000000');
      expect(tokens.colors.background).toBe('#ffffff');
      expect(tokens.typography.font_primary).toBe('system-ui, sans-serif');
      expect(tokens.typography.font_secondary).toBeNull();
      expect(tokens.spacing.container_max_width).toBe('1440px');
      expect(tokens.buttons.primary.padding).toBe('12px 24px');
    });

    it('picks up CSS custom properties matching color keywords', () => {
      const extracted = {
        customProps: {
          '--color-primary': '#1a73e8',
          '--color-secondary': '#fbbc04',
          '--color-accent': '#34a853',
          '--surface-bg': '#f1f3f4',
          '--spacing': '16px', // not a color, should be ignored
        },
        body: { color: 'rgb(0,0,0)', backgroundColor: 'rgb(255,255,255)' },
        headings: {},
        buttons: {},
        links: {},
        container: {},
        allColors: [],
        fontFaces: [],
      };

      const tokens = mapToTokens(extracted, 'https://example.com');

      expect(tokens.colors.primary).toBe('#1a73e8');
      expect(tokens.colors.secondary).toBe('#fbbc04');
      expect(tokens.colors.accent).toBe('#34a853');
      expect(tokens.colors.surface).toBe('#f1f3f4');
    });

    it('omits letterSpacing when it is "normal"', () => {
      const extracted = {
        customProps: {},
        body: {},
        headings: {
          h1: {
            fontFamily: 'Arial',
            fontSize: '32px',
            fontWeight: '700',
            lineHeight: '1.2',
            letterSpacing: 'normal',
          },
        },
        buttons: {},
        links: {},
        container: {},
        allColors: [],
        fontFaces: [],
      };

      const tokens = mapToTokens(extracted, 'https://example.com');
      expect(tokens.typography.scale.h1.letterSpacing).toBeUndefined();
    });
  });
});
