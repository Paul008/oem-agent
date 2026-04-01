/**
 * banner-data-filter.ts
 *
 * Heuristics for detecting JSON banner data in arbitrary API responses,
 * normalising varied CMS key names to ExtractedBannerSlide, and adjusting
 * a confidence score based on the quality of the result set.
 */

import type { ExtractedBannerSlide } from '../oem/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BANNER_URL_RE = /banner|hero|carousel|slider|promo|campaign|spotlight|featured|slide|kv/i;

const IMAGE_KEYS = ['image', 'imageUrl', 'image_url', 'img', 'src', 'photo', 'media', 'banner', 'visual'];
const TEXT_KEYS  = ['title', 'heading', 'headline', 'name', 'text', 'alt'];
const LINK_KEYS  = ['link', 'url', 'href', 'cta', 'action'];

const BOILERPLATE_RE = /menu|nav|cookie|privacy|footer|header|sign.?in|log.?in/i;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isObjectArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null;
}

function hasAnyKey(obj: Record<string, unknown>, keys: string[]): boolean {
  const lowerObjKeys = Object.keys(obj).map(k => k.toLowerCase());
  const lowerKeys = keys.map(k => k.toLowerCase());
  return lowerKeys.some(k => lowerObjKeys.includes(k));
}

/**
 * Returns true when the array looks like a banner array:
 *   - 2 or more items
 *   - each item is a plain object
 *   - all items have an image-like key AND (a text-like key OR a link-like key)
 */
function looksLikeBannerArray(arr: unknown): boolean {
  if (!isObjectArray(arr) || arr.length < 2) return false;
  return arr.every(item =>
    hasAnyKey(item, IMAGE_KEYS) &&
    (hasAnyKey(item, TEXT_KEYS) || hasAnyKey(item, LINK_KEYS))
  );
}

// ---------------------------------------------------------------------------
// 1. isBannerData
// ---------------------------------------------------------------------------

/**
 * Heuristic to detect whether a JSON response contains banner data.
 *
 * Returns true when EITHER:
 *   a) The URL matches a banner-related pattern AND the body is an array of
 *      2+ objects (relaxed structural requirement since the URL is already
 *      a strong signal — but single-item arrays are still rejected), OR
 *   b) The body is a top-level or one-level-deep array that structurally
 *      matches the banner shape (image keys + text/link keys, 2+ items).
 */
export function isBannerData(url: string, body: unknown): boolean {
  const urlMatches = BANNER_URL_RE.test(url);

  // --- Top-level array ---
  if (Array.isArray(body)) {
    if (urlMatches) {
      // URL match: require 2+ items of plain objects (structure already implied)
      return isObjectArray(body) && body.length >= 2;
    }
    return looksLikeBannerArray(body);
  }

  // --- Object: search one level deep for a qualifying nested array ---
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const obj = body as Record<string, unknown>;
    for (const value of Object.values(obj)) {
      if (looksLikeBannerArray(value)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// 2. normaliseBannerData
// ---------------------------------------------------------------------------

function pickFirst(item: Record<string, unknown>, candidates: string[]): string | null {
  for (const candidate of candidates) {
    // exact match first
    if (candidate in item && item[candidate] !== undefined && item[candidate] !== null) {
      return String(item[candidate]);
    }
    // case-insensitive fallback
    const lower = candidate.toLowerCase();
    for (const key of Object.keys(item)) {
      if (key.toLowerCase() === lower && item[key] !== undefined && item[key] !== null) {
        return String(item[key]);
      }
    }
  }
  return null;
}

/**
 * Maps varied CMS key names to the canonical ExtractedBannerSlide shape.
 */
export function normaliseBannerData(items: Record<string, unknown>[]): ExtractedBannerSlide[] {
  return items.map((item, index) => {
    const image_url_desktop = pickFirst(item, [
      'image_url_desktop', 'desktopImage', 'imageUrl', 'image_url', 'image',
      'img', 'src', 'media', 'banner', 'visual', 'photo',
    ]) ?? '';

    return {
      position: index,
      headline: pickFirst(item, ['title', 'headline', 'heading', 'name', 'text', 'alt']),
      sub_headline: pickFirst(item, ['subtitle', 'sub_headline', 'subheadline', 'description', 'desc']),
      cta_text: pickFirst(item, ['cta_text', 'ctaText', 'button_text', 'buttonText', 'label']),
      cta_url: pickFirst(item, ['url', 'href', 'link', 'cta_url', 'ctaUrl', 'action']),
      image_url_desktop,
      image_url_mobile: pickFirst(item, [
        'image_url_mobile', 'mobileImage', 'image_mobile', 'mobileSrc',
      ]),
      disclaimer_text: pickFirst(item, ['disclaimer', 'disclaimer_text', 'disclaimerText', 'legal']),
    };
  });
}

// ---------------------------------------------------------------------------
// 3. scoreBannerConfidence
// ---------------------------------------------------------------------------

/**
 * Adjusts a base confidence score up or down based on the quality and shape
 * of the extracted banner set.
 *
 * Rules (applied cumulatively):
 *   +0.05  All banners have both image_url_desktop AND headline
 *   -0.10  >50% of headlines match boilerplate navigation/legal patterns
 *   -0.20  Fewer than 2 banners in the set
 *   +0.05  Banner count is within ±2 of previousCount (when provided)
 *
 * Result is clamped to [0, 1].
 */
export function scoreBannerConfidence(
  banners: Partial<ExtractedBannerSlide>[],
  baseConfidence: number,
  previousCount: number | null,
): number {
  let score = baseConfidence;

  // +0.05: all banners have desktop image AND headline
  const allComplete =
    banners.length > 0 &&
    banners.every(b => b.image_url_desktop !== undefined && b.image_url_desktop !== null && b.image_url_desktop !== '' &&
                       b.headline !== undefined && b.headline !== null && b.headline !== '');
  if (allComplete) score += 0.05;

  // -0.10: >50% of headlines match boilerplate patterns
  if (banners.length > 0) {
    const headlinesWithText = banners.filter(b => b.headline);
    const boilerplateCount = headlinesWithText.filter(b => BOILERPLATE_RE.test(b.headline!)).length;
    if (boilerplateCount / banners.length > 0.5) {
      score -= 0.10;
    }
  }

  // -0.20: fewer than 2 banners
  if (banners.length < 2) {
    score -= 0.20;
  }

  // +0.05: count within ±2 of previousCount
  if (previousCount !== null && Math.abs(banners.length - previousCount) <= 2) {
    score += 0.05;
  }

  return Math.max(0, Math.min(1, score));
}
