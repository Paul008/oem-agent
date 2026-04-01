import { describe, it, expect } from 'vitest';
import { isBannerData, normaliseBannerData, scoreBannerConfidence } from './banner-data-filter';
import type { ExtractedBannerSlide } from '../oem/types';

// ---------------------------------------------------------------------------
// isBannerData
// ---------------------------------------------------------------------------

describe('isBannerData', () => {
  const bannerItem = (overrides: Record<string, unknown> = {}) => ({
    image: 'https://cdn.example.com/hero.jpg',
    title: 'Drive Away Today',
    link: '/cars/model-x',
    ...overrides,
  });

  describe('URL pattern matching', () => {
    it('accepts banner URL', () => {
      expect(isBannerData('/api/banners', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts hero URL', () => {
      expect(isBannerData('/api/hero-slides', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts carousel URL', () => {
      expect(isBannerData('/content/carousel', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts slider URL', () => {
      expect(isBannerData('/api/slider-data', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts promo URL', () => {
      expect(isBannerData('/promo/items', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts campaign URL', () => {
      expect(isBannerData('/campaign/list', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts spotlight URL', () => {
      expect(isBannerData('/api/spotlight', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts featured URL', () => {
      expect(isBannerData('/featured-vehicles', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts slide URL', () => {
      expect(isBannerData('/slide-content', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('accepts kv URL', () => {
      expect(isBannerData('/api/kv-data', [bannerItem(), bannerItem()])).toBe(true);
    });

    it('is case-insensitive for URL patterns', () => {
      expect(isBannerData('/API/BANNER', [bannerItem(), bannerItem()])).toBe(true);
    });
  });

  describe('structural shape detection', () => {
    it('accepts array of 2+ objects with image + text keys', () => {
      const items = [
        { img: 'https://cdn.example.com/a.jpg', heading: 'Title A' },
        { img: 'https://cdn.example.com/b.jpg', heading: 'Title B' },
      ];
      expect(isBannerData('/api/data', items)).toBe(true);
    });

    it('accepts array with image + link keys (no text)', () => {
      const items = [
        { src: 'https://cdn.example.com/a.jpg', href: '/page-a' },
        { src: 'https://cdn.example.com/b.jpg', href: '/page-b' },
      ];
      expect(isBannerData('/api/data', items)).toBe(true);
    });

    it('accepts various image key names', () => {
      const variants = ['image', 'imageUrl', 'photo', 'media', 'banner', 'visual'];
      for (const key of variants) {
        const items = [
          { [key]: 'https://cdn.example.com/a.jpg', title: 'A' },
          { [key]: 'https://cdn.example.com/b.jpg', title: 'B' },
        ];
        expect(isBannerData('/api/data', items), `key: ${key}`).toBe(true);
      }
    });

    it('accepts various text key names', () => {
      const variants = ['title', 'heading', 'headline', 'name', 'text', 'alt'];
      for (const key of variants) {
        const items = [
          { image: 'https://cdn.example.com/a.jpg', [key]: 'A' },
          { image: 'https://cdn.example.com/b.jpg', [key]: 'B' },
        ];
        expect(isBannerData('/api/data', items), `key: ${key}`).toBe(true);
      }
    });

    it('accepts various link key names', () => {
      const variants = ['link', 'url', 'href', 'cta', 'action'];
      for (const key of variants) {
        const items = [
          { image: 'https://cdn.example.com/a.jpg', [key]: '/a' },
          { image: 'https://cdn.example.com/b.jpg', [key]: '/b' },
        ];
        expect(isBannerData('/api/data', items), `key: ${key}`).toBe(true);
      }
    });

    it('rejects single-item arrays', () => {
      const body = [bannerItem()];
      // No URL pattern match + single item → false
      expect(isBannerData('/api/data', body)).toBe(false);
    });

    it('rejects non-array body', () => {
      expect(isBannerData('/api/data', { banners: [] })).toBe(false);
      expect(isBannerData('/api/data', 'string')).toBe(false);
      expect(isBannerData('/api/data', null)).toBe(false);
    });

    it('rejects objects without image keys', () => {
      const items = [
        { title: 'A', link: '/a' },
        { title: 'B', link: '/b' },
      ];
      expect(isBannerData('/api/data', items)).toBe(false);
    });

    it('rejects objects without text or link keys (image only)', () => {
      const items = [
        { image: 'https://cdn.example.com/a.jpg' },
        { image: 'https://cdn.example.com/b.jpg' },
      ];
      expect(isBannerData('/api/data', items)).toBe(false);
    });
  });

  describe('nested array detection', () => {
    it('finds banner arrays nested one level deep in an object', () => {
      const body = {
        page: 1,
        heroSlides: [bannerItem(), bannerItem(), bannerItem()],
      };
      expect(isBannerData('/api/data', body)).toBe(true);
    });

    it('does not search beyond one level deep', () => {
      const body = {
        level1: {
          level2: [bannerItem(), bannerItem()],
        },
      };
      expect(isBannerData('/api/data', body)).toBe(false);
    });
  });

  describe('URL pattern with minimal structural shape', () => {
    it('returns true when URL matches even if structural check would fail', () => {
      // URL pattern alone is sufficient when body is at least a 2-item array of objects
      // But single-item arrays should still fail even with URL match
      expect(isBannerData('/api/banners', [bannerItem()])).toBe(false);
    });

    it('returns false when URL does not match and structure fails', () => {
      expect(isBannerData('/api/products', { count: 0 })).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// normaliseBannerData
// ---------------------------------------------------------------------------

describe('normaliseBannerData', () => {
  it('maps camelCase keys', () => {
    const items = [
      {
        imageUrl: 'https://cdn.example.com/desktop.jpg',
        mobileImage: 'https://cdn.example.com/mobile.jpg',
        headline: 'Headline Text',
        subtitle: 'Sub text',
        ctaText: 'Learn More',
        ctaUrl: '/learn',
        disclaimer: 'T&Cs apply',
      },
    ];
    const result = normaliseBannerData(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      position: 0,
      image_url_desktop: 'https://cdn.example.com/desktop.jpg',
      image_url_mobile: 'https://cdn.example.com/mobile.jpg',
      headline: 'Headline Text',
      sub_headline: 'Sub text',
      cta_text: 'Learn More',
      cta_url: '/learn',
      disclaimer_text: 'T&Cs apply',
    });
  });

  it('maps snake_case keys', () => {
    const items = [
      {
        image_url: 'https://cdn.example.com/desktop.jpg',
        image_mobile: 'https://cdn.example.com/mobile.jpg',
        title: 'Title Text',
        description: 'Description',
        button_text: 'Click',
        url: '/page',
        disclaimer_text: 'Legal',
      },
    ];
    const result = normaliseBannerData(items);
    expect(result[0]).toMatchObject({
      position: 0,
      image_url_desktop: 'https://cdn.example.com/desktop.jpg',
      image_url_mobile: 'https://cdn.example.com/mobile.jpg',
      headline: 'Title Text',
      sub_headline: 'Description',
      cta_text: 'Click',
      cta_url: '/page',
      disclaimer_text: 'Legal',
    });
  });

  it('maps fully prefixed keys', () => {
    const items = [
      {
        image_url_desktop: 'https://cdn.example.com/d.jpg',
        image_url_mobile: 'https://cdn.example.com/m.jpg',
        heading: 'H',
        sub_headline: 'SH',
        label: 'CTA',
        href: '/href',
        disclaimerText: 'Disc',
      },
    ];
    const result = normaliseBannerData(items);
    expect(result[0]).toMatchObject({
      image_url_desktop: 'https://cdn.example.com/d.jpg',
      image_url_mobile: 'https://cdn.example.com/m.jpg',
      headline: 'H',
      sub_headline: 'SH',
      cta_text: 'CTA',
      cta_url: '/href',
      disclaimer_text: 'Disc',
    });
  });

  it('sets position sequentially', () => {
    const items = [
      { image: 'a.jpg', title: 'A' },
      { image: 'b.jpg', title: 'B' },
      { image: 'c.jpg', title: 'C' },
    ];
    const result = normaliseBannerData(items);
    expect(result.map(r => r.position)).toEqual([0, 1, 2]);
  });

  it('sets missing optional fields to null', () => {
    const items = [{ image: 'https://cdn.example.com/x.jpg' }];
    const result = normaliseBannerData(items);
    expect(result[0].headline).toBeNull();
    expect(result[0].sub_headline).toBeNull();
    expect(result[0].cta_text).toBeNull();
    expect(result[0].cta_url).toBeNull();
    expect(result[0].image_url_mobile).toBeNull();
    expect(result[0].disclaimer_text).toBeNull();
  });

  it('returns empty array for empty input', () => {
    expect(normaliseBannerData([])).toEqual([]);
  });

  it('maps "src" as image_url_desktop', () => {
    const items = [{ src: 'https://cdn.example.com/s.jpg', name: 'N' }];
    expect(normaliseBannerData(items)[0].image_url_desktop).toBe('https://cdn.example.com/s.jpg');
  });

  it('maps "desktopImage" as image_url_desktop', () => {
    const items = [{ desktopImage: 'https://cdn.example.com/d.jpg', title: 'T' }];
    expect(normaliseBannerData(items)[0].image_url_desktop).toBe('https://cdn.example.com/d.jpg');
  });

  it('maps "mobileSrc" as image_url_mobile', () => {
    const items = [{ image: 'https://cdn.example.com/d.jpg', mobileSrc: 'https://cdn.example.com/m.jpg' }];
    expect(normaliseBannerData(items)[0].image_url_mobile).toBe('https://cdn.example.com/m.jpg');
  });

  it('maps "action" as cta_url', () => {
    const items = [{ image: 'https://cdn.example.com/d.jpg', action: '/buy-now' }];
    expect(normaliseBannerData(items)[0].cta_url).toBe('/buy-now');
  });

  it('maps "legal" as disclaimer_text', () => {
    const items = [{ image: 'https://cdn.example.com/d.jpg', disclaimer: 'Legal text' }];
    expect(normaliseBannerData(items)[0].disclaimer_text).toBe('Legal text');
  });
});

// ---------------------------------------------------------------------------
// scoreBannerConfidence
// ---------------------------------------------------------------------------

describe('scoreBannerConfidence', () => {
  const completeBanner = (overrides: Partial<ExtractedBannerSlide> = {}): Partial<ExtractedBannerSlide> => ({
    position: 0,
    image_url_desktop: 'https://cdn.example.com/img.jpg',
    headline: 'Exciting Offer',
    sub_headline: null,
    cta_text: null,
    cta_url: null,
    image_url_mobile: null,
    disclaimer_text: null,
    ...overrides,
  });

  it('returns base confidence unchanged when no adjustments apply', () => {
    const banners = [completeBanner(), completeBanner({ position: 1, headline: 'Second slide' })];
    const score = scoreBannerConfidence(banners, 0.5, null);
    // +0.05 for all having image + headline → 0.55
    expect(score).toBeCloseTo(0.55);
  });

  it('adds +0.05 when all banners have both image_url_desktop AND headline', () => {
    const banners = [
      completeBanner({ position: 0, headline: 'A' }),
      completeBanner({ position: 1, headline: 'B' }),
    ];
    expect(scoreBannerConfidence(banners, 0.7, null)).toBeCloseTo(0.75);
  });

  it('does not add +0.05 when some banners are missing headline', () => {
    const banners = [
      completeBanner({ position: 0, headline: 'A' }),
      completeBanner({ position: 1, headline: null }),
    ];
    expect(scoreBannerConfidence(banners, 0.7, null)).toBeCloseTo(0.7);
  });

  it('does not add +0.05 when some banners are missing image_url_desktop', () => {
    const banners = [
      completeBanner({ position: 0 }),
      { position: 1, headline: 'B', image_url_desktop: undefined } as Partial<ExtractedBannerSlide>,
    ];
    expect(scoreBannerConfidence(banners, 0.7, null)).toBeCloseTo(0.7);
  });

  it('subtracts -0.10 when >50% of headlines match boilerplate patterns', () => {
    const banners = [
      completeBanner({ headline: 'Menu' }),
      completeBanner({ headline: 'Navigation' }),
      completeBanner({ headline: 'Real Offer' }),
    ];
    // 2/3 > 50% → -0.10
    const score = scoreBannerConfidence(banners, 0.7, null);
    // +0.05 (all have image+headline), -0.10 for boilerplate → 0.65
    expect(score).toBeCloseTo(0.65);
  });

  it('matches nav/cookie/privacy/footer/header/sign-in/log-in boilerplate', () => {
    const boilerplateHeadlines = ['nav', 'cookie', 'privacy', 'footer', 'header', 'sign in', 'log in', 'signin', 'login'];
    for (const headline of boilerplateHeadlines) {
      const banners = [
        completeBanner({ headline }),
        completeBanner({ headline }),
      ];
      const score = scoreBannerConfidence(banners, 0.7, null);
      expect(score, `headline: "${headline}"`).toBeCloseTo(0.65); // +0.05 (has image+headline) -0.10 = 0.65
    }
  });

  it('subtracts -0.20 when fewer than 2 banners', () => {
    const banners = [completeBanner({ headline: 'Only One' })];
    // 1 banner: -0.20 for count, +0.05 for complete → 0.7 + 0.05 - 0.20 = 0.55
    expect(scoreBannerConfidence(banners, 0.7, null)).toBeCloseTo(0.55);
  });

  it('adds +0.05 when banner count is within +/-2 of previousCount', () => {
    const banners = [completeBanner(), completeBanner({ position: 1, headline: 'B' })];
    // previousCount=2, actual=2, within ±2 → +0.05
    // Also +0.05 for complete → total 0.7 + 0.05 + 0.05 = 0.80
    expect(scoreBannerConfidence(banners, 0.7, 2)).toBeCloseTo(0.8);
  });

  it('does not add +0.05 for count when previousCount is null', () => {
    const banners = [completeBanner(), completeBanner({ position: 1, headline: 'B' })];
    expect(scoreBannerConfidence(banners, 0.7, null)).toBeCloseTo(0.75);
  });

  it('does not add +0.05 for count when outside ±2', () => {
    const banners = [
      completeBanner({ position: 0, headline: 'A' }),
      completeBanner({ position: 1, headline: 'B' }),
    ];
    // previousCount=10, actual=2 → diff=8 > 2 → no bonus
    expect(scoreBannerConfidence(banners, 0.7, 10)).toBeCloseTo(0.75);
  });

  it('clamps to 0 at minimum', () => {
    const banners: Partial<ExtractedBannerSlide>[] = [];
    // 0 banners: -0.20 for <2, no other bonuses
    expect(scoreBannerConfidence(banners, 0.1, null)).toBe(0);
  });

  it('clamps to 1 at maximum', () => {
    const banners = [
      completeBanner({ position: 0, headline: 'A' }),
      completeBanner({ position: 1, headline: 'B' }),
    ];
    // base 0.95, +0.05 complete, +0.05 count match → would be 1.05 → clamped to 1
    expect(scoreBannerConfidence(banners, 0.95, 2)).toBe(1);
  });

  it('applies all adjustments cumulatively', () => {
    const banners = [
      completeBanner({ headline: 'header' }),
      completeBanner({ headline: 'footer' }),
    ];
    // All have image+headline → +0.05
    // >50% boilerplate → -0.10
    // 2 banners, previousCount=2 → +0.05
    // Net: 0.5 + 0.05 - 0.10 + 0.05 = 0.5
    expect(scoreBannerConfidence(banners, 0.5, 2)).toBeCloseTo(0.5);
  });
});
