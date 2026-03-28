/**
 * Token Crawler — Live CSS Token Extraction via Cloudflare Browser
 *
 * Visits an OEM website, extracts CSS custom properties, computed styles,
 * and font declarations to produce accurate brand tokens from live code.
 */

export interface CrawledTokens {
  colors: Record<string, string>;
  typography: {
    font_primary: string;
    font_secondary: string | null;
    scale: Record<string, { fontSize: string; fontWeight: number | string; lineHeight?: string; letterSpacing?: string }>;
  };
  spacing: {
    section_gap: string;
    container_max_width: string;
    container_padding: string;
  };
  borders: {
    radius_sm: string;
    radius_md: string;
    radius_lg: string;
  };
  buttons: {
    primary: {
      background: string;
      text_color: string;
      border_radius: string;
      padding: string;
      font_size: string;
    };
  };
  css_custom_properties: Record<string, string>;
  source_url: string;
  crawled_at: string;
}

export class TokenCrawler {
  private browser: Fetcher;

  constructor(deps: { browser: Fetcher }) {
    this.browser = deps.browser;
  }

  async crawlTokens(url: string, oemId: string): Promise<CrawledTokens> {
    const puppeteerModule = await import('@cloudflare/puppeteer');
    const puppeteer = puppeteerModule.default;
    const browser = await puppeteer.launch(this.browser as any);

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 1080 });
      await page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
      );

      console.log(`[TokenCrawler] Navigating to ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 20_000 });
      await new Promise((r) => setTimeout(r, 2000));

      console.log(`[TokenCrawler] Extracting CSS tokens...`);
      const extracted = await page.evaluate(() => {
        const result: {
          customProps: Record<string, string>;
          body: Record<string, string>;
          headings: Record<string, Record<string, string>>;
          buttons: Record<string, string>;
          links: Record<string, string>;
          container: Record<string, string>;
          fontFaces: Array<{ family: string; src: string; weight: string }>;
          allColors: string[];
        } = {
          customProps: {},
          body: {},
          headings: {},
          buttons: {},
          links: {},
          container: {},
          fontFaces: [],
          allColors: [],
        };

        // 1. CSS custom properties from :root
        const rootStyles = getComputedStyle(document.documentElement);
        for (let i = 0; i < rootStyles.length; i++) {
          const prop = rootStyles[i];
          if (prop.startsWith('--')) {
            result.customProps[prop] = rootStyles.getPropertyValue(prop).trim();
          }
        }

        // 2. Body styles
        const body = document.body;
        const bodyCS = getComputedStyle(body);
        result.body = {
          fontFamily: bodyCS.fontFamily,
          fontSize: bodyCS.fontSize,
          color: bodyCS.color,
          backgroundColor: bodyCS.backgroundColor,
          lineHeight: bodyCS.lineHeight,
        };

        // 3. Heading styles
        for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
          const el = document.querySelector(tag);
          if (el) {
            const cs = getComputedStyle(el);
            result.headings[tag] = {
              fontFamily: cs.fontFamily,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              lineHeight: cs.lineHeight,
              letterSpacing: cs.letterSpacing,
              color: cs.color,
            };
          }
        }

        // 4. Button/CTA styles
        const btn = document.querySelector('a[class*="btn"], a[class*="cta"], button[class*="btn"], button[class*="cta"], a[class*="Button"], button[class*="Button"], .btn-primary, .cta-button, [data-testid*="cta"]');
        if (btn) {
          const cs = getComputedStyle(btn);
          result.buttons = {
            backgroundColor: cs.backgroundColor,
            color: cs.color,
            borderRadius: cs.borderRadius,
            padding: cs.padding,
            fontSize: cs.fontSize,
            fontWeight: cs.fontWeight,
          };
        }

        // 5. Link color
        const link = document.querySelector('a:not([class*="btn"]):not([class*="cta"])');
        if (link) {
          const cs = getComputedStyle(link);
          result.links = { color: cs.color };
        }

        // 6. Container max-width
        const container = document.querySelector('main, [class*="container"], [class*="wrapper"], .content');
        if (container) {
          const cs = getComputedStyle(container);
          result.container = {
            maxWidth: cs.maxWidth,
            paddingLeft: cs.paddingLeft,
            paddingRight: cs.paddingRight,
          };
        }

        // 7. Collect all prominent colors from visible elements
        const colorSet = new Set<string>();
        const prominent = document.querySelectorAll('header, nav, .hero, [class*="hero"], [class*="banner"], a[class*="btn"], button, footer');
        prominent.forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
            colorSet.add(cs.backgroundColor);
          }
          if (cs.color) colorSet.add(cs.color);
        });
        result.allColors = Array.from(colorSet);

        // 8. @font-face from stylesheets
        try {
          for (const sheet of document.styleSheets) {
            try {
              for (const rule of sheet.cssRules) {
                if (rule instanceof CSSFontFaceRule) {
                  result.fontFaces.push({
                    family: rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim(),
                    src: rule.style.getPropertyValue('src'),
                    weight: rule.style.getPropertyValue('font-weight') || '400',
                  });
                }
              }
            } catch { /* cross-origin stylesheet */ }
          }
        } catch { /* stylesheet access error */ }

        return result;
      });

      console.log(`[TokenCrawler] Extracted: ${Object.keys(extracted.customProps).length} custom props, ${Object.keys(extracted.headings).length} headings, ${extracted.fontFaces.length} font faces`);

      return this.mapToTokens(extracted, url);
    } finally {
      await browser.close();
    }
  }

  private mapToTokens(extracted: any, sourceUrl: string): CrawledTokens {
    // Parse primary color — find most prominent non-gray/white/black color
    const primaryColor = this.findPrimaryColor(extracted.allColors, extracted.buttons?.backgroundColor);

    // Build typography scale from headings
    const scale: Record<string, any> = {};
    for (const [tag, styles] of Object.entries(extracted.headings as Record<string, any>)) {
      scale[tag] = {
        fontSize: styles.fontSize,
        fontWeight: parseInt(styles.fontWeight) || styles.fontWeight,
        lineHeight: styles.lineHeight,
        letterSpacing: styles.letterSpacing !== 'normal' ? styles.letterSpacing : undefined,
      };
    }
    scale.body = {
      fontSize: extracted.body.fontSize || '16px',
      fontWeight: 400,
      lineHeight: extracted.body.lineHeight,
    };

    // Extract font family
    const fontPrimary = this.cleanFontFamily(
      extracted.headings?.h1?.fontFamily || extracted.body?.fontFamily || 'system-ui, sans-serif'
    );
    const bodyFont = this.cleanFontFamily(extracted.body?.fontFamily || fontPrimary);
    const fontSecondary = bodyFont !== fontPrimary ? bodyFont : null;

    // Colors
    const colors: Record<string, string> = {
      primary: primaryColor || '#000000',
      background: this.rgbToHex(extracted.body?.backgroundColor) || '#ffffff',
      text_primary: this.rgbToHex(extracted.body?.color) || '#000000',
    };

    if (extracted.buttons?.backgroundColor) {
      colors.cta_fill = this.rgbToHex(extracted.buttons.backgroundColor) || colors.primary;
      colors.cta_text = this.rgbToHex(extracted.buttons.color) || '#ffffff';
    }
    if (extracted.links?.color) {
      colors.link = this.rgbToHex(extracted.links.color) || colors.primary;
    }

    // Map relevant CSS custom properties to colors
    for (const [prop, val] of Object.entries(extracted.customProps as Record<string, string>)) {
      const lower = prop.toLowerCase();
      if (lower.includes('primary') && this.looksLikeColor(val)) colors.primary = val;
      if (lower.includes('secondary') && this.looksLikeColor(val)) colors.secondary = val;
      if (lower.includes('accent') && this.looksLikeColor(val)) colors.accent = val;
      if ((lower.includes('background') || lower.includes('surface')) && this.looksLikeColor(val)) colors.surface = val;
    }

    return {
      colors,
      typography: {
        font_primary: fontPrimary,
        font_secondary: fontSecondary,
        scale,
      },
      spacing: {
        section_gap: '64px',
        container_max_width: extracted.container?.maxWidth || '1440px',
        container_padding: extracted.container?.paddingLeft || '24px',
      },
      borders: {
        radius_sm: '4px',
        radius_md: extracted.buttons?.borderRadius || '8px',
        radius_lg: '16px',
      },
      buttons: {
        primary: {
          background: this.rgbToHex(extracted.buttons?.backgroundColor) || colors.primary,
          text_color: this.rgbToHex(extracted.buttons?.color) || '#ffffff',
          border_radius: extracted.buttons?.borderRadius || '8px',
          padding: extracted.buttons?.padding || '12px 24px',
          font_size: extracted.buttons?.fontSize || '16px',
        },
      },
      css_custom_properties: extracted.customProps,
      source_url: sourceUrl,
      crawled_at: new Date().toISOString(),
    };
  }

  private findPrimaryColor(allColors: string[], buttonBg?: string): string | null {
    // Prefer button background as primary
    if (buttonBg) {
      const hex = this.rgbToHex(buttonBg);
      if (hex && !this.isNeutral(hex)) return hex;
    }

    // Find most prominent non-neutral color
    for (const color of allColors) {
      const hex = this.rgbToHex(color);
      if (hex && !this.isNeutral(hex)) return hex;
    }
    return null;
  }

  private isNeutral(hex: string): boolean {
    if (!hex.startsWith('#') || hex.length < 7) return true;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    return saturation < 0.15 || max < 30 || min > 225;
  }

  private rgbToHex(rgb?: string): string | null {
    if (!rgb) return null;
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return null;
    const [, r, g, b] = match;
    return '#' + [r, g, b].map(v => parseInt(v).toString(16).padStart(2, '0')).join('');
  }

  private looksLikeColor(val: string): boolean {
    return /^#[0-9a-fA-F]{3,8}$/.test(val.trim()) || /^rgb/i.test(val.trim());
  }

  private cleanFontFamily(raw: string): string {
    // Take the first font family, clean quotes
    const first = raw.split(',')[0].replace(/['"]/g, '').trim();
    // Append sans-serif fallback
    return first ? `${first}, sans-serif` : 'system-ui, sans-serif';
  }
}
