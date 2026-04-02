/**
 * Extraction Engine
 * 
 * Implements the extraction priority order from spec Section 5.1:
 * 1. JSON-LD (best structured data)
 * 2. OpenGraph meta tags
 * 3. CSS selector extraction (OEM-specific)
 * 4. LLM normalisation (fallback)
 */

import * as cheerio from 'cheerio';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExtractedProduct,
  ExtractedOffer,
  ExtractedBannerSlide,
  ProductMeta,
  ProductVariant,
  ProductCtaLink,
  BodyType,
  FuelType,
  Availability,
  PriceType,
  OfferType,
} from '../oem/types';
import { getOemDefinition } from '../oem/registry';

// ============================================================================
// Selector Override Lookup
// ============================================================================

/**
 * Queries selector_overrides from Supabase for the given OEM and page type,
 * returning only non-expired overrides ordered by descending confidence.
 * Returns a plain Record merging only the DB overrides — callers pass this
 * to extractWithSelectors which merges it over the registry selectors.
 */
export async function getEffectiveSelectors(
  oemId: string,
  pageType: string,
  registrySelectors: Record<string, string | undefined>,
  supabase: SupabaseClient,
): Promise<Record<string, string>> {
  const { data: overrides } = await supabase
    .from('selector_overrides')
    .select('selector_type, selector_value')
    .eq('oem_id', oemId)
    .eq('page_type', pageType)
    .gte('expires_at', new Date().toISOString())
    .order('confidence', { ascending: false });

  if (!overrides?.length) return {};

  const result: Record<string, string> = {};
  for (const override of overrides) {
    result[override.selector_type] = override.selector_value;
  }
  return result;
}

// ============================================================================
// Extraction Result Types
// ============================================================================

export interface ExtractionResult<T> {
  data: T | null;
  confidence: number; // 0-1
  method: 'jsonld' | 'opengraph' | 'css' | 'llm' | 'none';
  coverage: number; // Percentage of required fields filled
  errors?: string[];
}

export interface PageExtractionResult {
  url: string;
  products: ExtractionResult<ExtractedProduct[]>;
  offers: ExtractionResult<ExtractedOffer[]>;
  bannerSlides: ExtractionResult<ExtractedBannerSlide[]>;
  discoveredUrls: string[];
  metadata: {
    title: string;
    description: string;
    jsonLdSchemas: string[];
  };
}

// ============================================================================
// JSON-LD Extraction (Priority 1)
// ============================================================================

export interface JsonLdSchema {
  '@context'?: string;
  '@type': string;
  [key: string]: unknown;
}

export function extractJsonLd(html: string): JsonLdSchema[] {
  const $ = cheerio.load(html);
  const schemas: JsonLdSchema[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const content = $(el).html();
      if (content) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          schemas.push(...parsed);
        } else {
          schemas.push(parsed);
        }
      }
    } catch (e) {
      // Invalid JSON-LD, skip
    }
  });

  return schemas;
}

export function extractProductFromJsonLd(schemas: JsonLdSchema[]): ExtractedProduct | null {
  // Look for Product schema
  const productSchema = schemas.find(s => 
    s['@type'] === 'Product' || 
    (Array.isArray(s['@type']) && s['@type'].includes('Product'))
  );

  if (!productSchema) return null;

  const offers = productSchema.offers as Record<string, unknown> | undefined;
  
  return {
    external_key: productSchema.sku as string | undefined,
    title: productSchema.name as string || '',
    subtitle: productSchema.description as string | undefined,
    availability: mapAvailability(productSchema.availability as string),
    price: offers ? {
      amount: typeof offers.price === 'string' ? parseFloat(offers.price) : null,
      currency: offers.priceCurrency as string || 'AUD',
      type: inferPriceType(offers.price as string, offers.priceValidUntil),
      raw_string: offers.price as string | null,
      qualifier: null,
    } : null,
    meta: {
      json_ld: productSchema,
    },
  };
}

export function extractOffersFromJsonLd(schemas: JsonLdSchema[]): ExtractedOffer[] {
  const offers: ExtractedOffer[] = [];

  // Look for Offer or AggregateOffer schemas
  schemas.forEach(schema => {
    if (schema['@type'] === 'Offer' || schema['@type'] === 'AggregateOffer') {
      offers.push({
        external_key: schema.url as string | undefined,
        title: schema.name as string || 'Special Offer',
        description: schema.description as string | undefined,
        price: {
          amount: typeof schema.price === 'string' ? parseFloat(schema.price) : null,
          type: inferPriceType(schema.price as string),
          raw_string: schema.price as string | undefined,
        },
        cta_url: schema.url as string | undefined,
      });
    }
  });

  return offers;
}

// ============================================================================
// OpenGraph Extraction (Priority 2)
// ============================================================================

export interface OpenGraphData {
  title: string;
  description: string;
  image: string;
  type: string;
  url: string;
  site_name: string;
}

export function extractOpenGraph(html: string): Partial<OpenGraphData> {
  const $ = cheerio.load(html);
  const og: Partial<OpenGraphData> = {};

  const getMeta = (property: string): string | undefined => {
    return $(`meta[property="${property}"]`).attr('content') ||
           $(`meta[name="${property}"]`).attr('content');
  };

  og.title = getMeta('og:title') || $('title').text() || '';
  og.description = getMeta('og:description') || getMeta('description') || '';
  og.image = getMeta('og:image') || '';
  og.type = getMeta('og:type') || '';
  og.url = getMeta('og:url') || '';
  og.site_name = getMeta('og:site_name') || '';

  return og;
}

// ============================================================================
// CSS Selector Extraction (Priority 3)
// ============================================================================

export function extractWithSelectors(
  html: string,
  oemId: string,
  pageType: string,
  selectorOverrides?: Record<string, string>
): {
  products: ExtractedProduct[];
  offers: ExtractedOffer[];
  bannerSlides: ExtractedBannerSlide[];
  discoveredUrls: string[];
} {
  const $ = cheerio.load(html);
  const oemDef = getOemDefinition(oemId as any);
  const registrySelectors = oemDef?.selectors || {};
  const selectors = selectorOverrides ? { ...registrySelectors, ...selectorOverrides } : registrySelectors;

  const products: ExtractedProduct[] = [];
  const offers: ExtractedOffer[] = [];
  const bannerSlides: ExtractedBannerSlide[] = [];
  const discoveredUrls: Set<string> = new Set();

  // Extract vehicle links for discovery
  if (selectors.vehicleLinks) {
    $(selectors.vehicleLinks).each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        discoveredUrls.add(resolveUrl(href, oemDef?.baseUrl || ''));
      }
    });
  }

  // Extract hero slides (banners)
  if (selectors.heroSlides) {
    $(selectors.heroSlides).each((index, el) => {
      const $slide = $(el);
      const headlineText = $slide.find('h1, h2, .headline, .big_title .title').first().text().trim();
      const slide: ExtractedBannerSlide = {
        position: index,
        headline: headlineText || $slide.find('img[alt]').first().attr('alt')?.trim() || null,
        sub_headline: $slide.find('.sub-headline, .subtitle, .sub_title span, .kv_desc span').first().text().trim() || null,
        cta_text: $slide.find('.kv_btn span, a.cta, a, button').first().text().trim() || null,
        cta_url: $slide.find('.kv_btn, a.cta, a').first().attr('href') || null,
        image_url_desktop: extractImageUrl($slide, $) || '',
        image_url_mobile: extractBgImageUrl($slide, '.bg-image-default, .bg-image:last-child') ||
                          $slide.find('picture source[media*="320"]').attr('srcset') || null,
        disclaimer_text: $slide.find('.disclaimer, small').first().text().trim() || null,
      };
      bannerSlides.push(slide);
    });
  }

  // Extract offers
  if (selectors.offerTiles) {
    $(selectors.offerTiles).each((_, el) => {
      const $tile = $(el);
      const offer: ExtractedOffer = {
        title: $tile.find('h2, h3, h4, strong, b, .title, .heading').first().text().trim() || 'Special Offer',
        description: $tile.find('p, .description, .subtitle, .sub-title').first().text().trim() || null,
        cta_text: $tile.find('a, button').first().text().trim() || null,
        cta_url: $tile.find('a').first().attr('href') || null,
        hero_image_url: extractImageUrl($tile, $) || null,
      };
      offers.push(offer);
    });
  }

  // Extract price if available
  if (selectors.priceDisplay) {
    $(selectors.priceDisplay).each((_, el) => {
      const priceText = $(el).text().trim();
      // Try to parse price
      const priceMatch = priceText.match(/\$[\d,]+(\.\d{2})?/);
      if (priceMatch && products.length > 0) {
        const priceStr = priceMatch[0].replace(/[$,]/g, '');
        products[0].price = {
          amount: parseFloat(priceStr),
          currency: 'AUD',
          type: inferPriceType(priceText),
          raw_string: priceText,
          qualifier: priceText.toLowerCase().includes('from') ? 'starting from' : null,
        };
      }
    });
  }

  return {
    products,
    offers,
    bannerSlides,
    discoveredUrls: Array.from(discoveredUrls),
  };
}

// ============================================================================
// Subaru-Specific Offer Extraction
// ============================================================================
// Subaru's /special-offers page uses obfuscated CSS Module classes (Inchcape
// AU Web Platform). Generic selectors won't work. Instead we anchor on the
// S3 image CDN pattern and walk up to the parent card element.

const SUBARU_S3_CDN = 'production-cdn-subaru-image-handler.s3.ap-southeast-2.amazonaws.com';

export function extractSubaruOffers(html: string): ExtractedOffer[] {
  const $ = cheerio.load(html);
  const offers: ExtractedOffer[] = [];
  const seen = new Set<string>();

  // Find all images from the Subaru S3 offers CDN
  $(`img[src*="${SUBARU_S3_CDN}/offers/"]`).each((_, el) => {
    const $img = $(el);
    const src = $img.attr('src') || '';
    const alt = $img.attr('alt') || '';

    // Extract the offer slug from the S3 path: /offers/{slug}/{uuid}.jpg
    const slugMatch = src.match(/\/offers\/([^/]+)\//);
    if (!slugMatch) return;
    const slug = slugMatch[1];
    if (seen.has(slug)) return;
    seen.add(slug);

    // Walk up to find the nearest card-like container (typically 2-4 levels up)
    let $card = $img.parent();
    for (let i = 0; i < 4; i++) {
      const parent = $card.parent();
      if (!parent.length) break;
      // Stop if we hit a grid container or a very large element
      const children = parent.children().length;
      if (children > 3) break;
      $card = parent;
    }

    // Extract text content from the card
    const cardText = $card.text().trim();
    const title = alt.replace(/<[^>]+>/g, '').trim() || cardText.substring(0, 120).trim() || `Subaru Offer: ${slug}`;

    // Try to extract price from card text
    let priceAmount: number | null = null;
    const priceMatch = cardText.match(/\$[\d,]+/);
    if (priceMatch) {
      priceAmount = parseFloat(priceMatch[0].replace(/[$,]/g, ''));
    }

    // Determine offer type from slug/title
    let offerType: string = 'promotion';
    if (slug.includes('driveaway')) offerType = 'driveaway';
    else if (slug.includes('special-edition') || slug.includes('onyx') || slug.includes('kiiro') || slug.includes('club-spec')) offerType = 'special_edition';
    else if (slug.includes('accessory') || slug.includes('tow-bar') || slug.includes('spoiler') || slug.includes('alloy') || slug.includes('mudflap') || slug.includes('styling') || slug.includes('cargo') || slug.includes('first-aid') || slug.includes('pack')) offerType = 'accessory';
    else if (slug.includes('servicing') || slug.includes('run-out')) offerType = 'servicing';

    const offer: ExtractedOffer = {
      title,
      description: cardText.length > title.length ? cardText.substring(0, 300).trim() : null,
      offer_type: offerType as OfferType,
      hero_image_url: src,
      cta_text: 'View Offer',
      cta_url: `/special-offers/${slug}`,
      price: priceAmount ? {
        amount: priceAmount,
        type: 'driveaway' as PriceType,
        raw_string: priceMatch?.[0] || null,
        saving_amount: null,
      } : undefined,
    };

    offers.push(offer);
  });

  return offers;
}

// ============================================================================
// LLM Fallback Extraction (Priority 4)
// ============================================================================

export interface LlmExtractionPrompt {
  html: string;
  oemName: string;
  pageType: string;
  url: string;
}

export function generateLlmExtractionPrompt(
  html: string,
  oemId: string,
  pageType: string,
  url: string
): string {
  const oemDef = getOemDefinition(oemId as any);
  
  // Truncate HTML if too long (LLM context limits)
  const maxLength = 50000;
  const truncatedHtml = html.length > maxLength 
    ? html.substring(0, maxLength) + '\n...[truncated]'
    : html;

  return `
You are an expert web scraping assistant. Extract structured data from the following HTML page.

OEM: ${oemDef?.name || oemId}
Page Type: ${pageType}
URL: ${url}

Extract the following information as JSON:
- Products: Array of vehicles with name, price, availability, key features
- Offers: Array of promotional offers with title, description, validity
- Banner Slides: Array of hero carousel slides with headlines, CTAs, image URLs

HTML:
\`\`\`html
${truncatedHtml}
\`\`\`

Respond ONLY with valid JSON in this format:
{
  "products": [...],
  "offers": [...],
  "bannerSlides": [...]
}
`;
}

// ============================================================================
// Main Extraction Engine
// ============================================================================

export class ExtractionEngine {
  /**
   * Extract data from HTML using priority order:
   * 1. JSON-LD
   * 2. OpenGraph
   * 3. CSS selectors
   * 4. LLM fallback (not implemented in this class - call AI router)
   */
  extract(
    html: string,
    oemId: string,
    pageType: string,
    url: string
  ): PageExtractionResult {
    const $ = cheerio.load(html);
    const ogData = extractOpenGraph(html);
    const jsonLdSchemas = extractJsonLd(html);

    // Try JSON-LD first
    const jsonLdProduct = extractProductFromJsonLd(jsonLdSchemas);
    const jsonLdOffers = extractOffersFromJsonLd(jsonLdSchemas);

    // Try CSS selectors
    const selectorData = extractWithSelectors(html, oemId, pageType);

    // Merge results (JSON-LD takes precedence for structured data)
    const products: ExtractedProduct[] = [];
    if (jsonLdProduct) {
      products.push(jsonLdProduct);
    }
    // Add products from selectors if not duplicates
    selectorData.products.forEach(p => {
      if (!products.some(existing => existing.title === p.title)) {
        products.push(p);
      }
    });

    // Merge offers
    const offers: ExtractedOffer[] = [...jsonLdOffers, ...selectorData.offers];

    // Subaru-specific: extract offers from S3 image CDN anchors
    // (CSS classes are obfuscated on Subaru's Inchcape platform)
    if (oemId === 'subaru-au' && pageType === 'offers' && offers.length === 0) {
      const subaruOffers = extractSubaruOffers(html);
      if (subaruOffers.length > 0) {
        console.log(`[ExtractionEngine] Subaru S3-anchored extraction found ${subaruOffers.length} offers`);
        offers.push(...subaruOffers);
      }
    }

    // Calculate coverage for each extraction type
    const productCoverage = this.calculateProductCoverage(products);
    const offerCoverage = this.calculateOfferCoverage(offers);

    return {
      url,
      products: {
        data: products.length > 0 ? products : null,
        confidence: productCoverage,
        method: jsonLdProduct ? 'jsonld' : products.length > 0 ? 'css' : 'none',
        coverage: productCoverage,
      },
      offers: {
        data: offers.length > 0 ? offers : null,
        confidence: offerCoverage,
        method: jsonLdOffers.length > 0 ? 'jsonld' : offers.length > 0 ? 'css' : 'none',
        coverage: offerCoverage,
      },
      bannerSlides: {
        data: selectorData.bannerSlides.length > 0 ? selectorData.bannerSlides : null,
        confidence: selectorData.bannerSlides.length > 0 ? 0.7 : 0,
        method: selectorData.bannerSlides.length > 0 ? 'css' : 'none',
        coverage: selectorData.bannerSlides.length > 0 ? 0.7 : 0,
      },
      discoveredUrls: selectorData.discoveredUrls,
      metadata: {
        title: ogData.title || '',
        description: ogData.description || '',
        jsonLdSchemas: jsonLdSchemas.map(s => s['@type']),
      },
    };
  }

  /**
   * Determine if LLM fallback is needed based on coverage.
   * 
   * From spec Section 10.6 Rule 2: ONLY invoke LLM if deterministic 
   * extraction returns <80% field coverage.
   */
  needsLlmFallback(result: PageExtractionResult): boolean {
    const minCoverage = 0.8;
    
    if (result.products.coverage < minCoverage && result.products.method !== 'llm') {
      return true;
    }
    if (result.offers.coverage < minCoverage && result.offers.method !== 'llm') {
      return true;
    }
    
    return false;
  }

  private calculateProductCoverage(products: ExtractedProduct[]): number {
    if (products.length === 0) return 0;
    
    const requiredFields = ['title', 'availability'];
    const optionalFields = ['price', 'body_type', 'fuel_type', 'variants', 'key_features'];
    
    let totalScore = 0;
    
    products.forEach(p => {
      let score = 0;
      // Required fields: 20% each
      if (p.title) score += 0.2;
      if (p.availability) score += 0.2;
      
      // Optional fields: 10% each
      optionalFields.forEach(field => {
        if ((p as any)[field] !== undefined && (p as any)[field] !== null) {
          score += 0.1;
        }
      });
      
      totalScore += score;
    });
    
    return Math.min(1, totalScore / products.length);
  }

  private calculateOfferCoverage(offers: ExtractedOffer[]): number {
    if (offers.length === 0) return 0;
    
    const fields = ['title', 'description', 'price', 'validity', 'cta_url'];
    
    let totalScore = 0;
    
    offers.forEach(o => {
      let score = 0;
      fields.forEach(field => {
        if ((o as any)[field] !== undefined && (o as any)[field] !== null) {
          score += 0.2;
        }
      });
      totalScore += score;
    });
    
    return Math.min(1, totalScore / offers.length);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function extractImageUrl($el: ReturnType<cheerio.CheerioAPI>, $: cheerio.CheerioAPI): string | null {
  // Try various image sources
  const src = $el.find('img').attr('src') ||
              $el.find('img').attr('data-src') ||
              extractBgImageUrl($el, '[style*="background-image"]') ||
              $el.attr('src');

  return src || null;
}

/** Extract background-image URL from inline style attribute within a container */
function extractBgImageUrl($container: ReturnType<cheerio.CheerioAPI>, selector: string): string | null {
  const el = $container.find(selector).first();
  const style = el.attr('style') || '';
  const match = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
  return match?.[1] || null;
}

function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('//')) return 'https:' + href;
  if (href.startsWith('/')) {
    const url = new URL(baseUrl);
    return `${url.protocol}//${url.host}${href}`;
  }
  return baseUrl + href;
}

function mapAvailability(availability: string | undefined): Availability {
  if (!availability) return 'available';
  const lower = availability.toLowerCase();
  if (lower.includes('instock') || lower.includes('in stock')) return 'available';
  if (lower.includes('outofstock') || lower.includes('out of stock')) return 'discontinued';
  if (lower.includes('preorder') || lower.includes('coming')) return 'coming_soon';
  return 'available';
}

function inferPriceType(priceStr: string | undefined, validUntil?: unknown): PriceType | null {
  if (!priceStr || typeof priceStr !== 'string') return null;
  const lower = priceStr.toLowerCase();
  
  if (lower.includes('driveaway') || lower.includes('drive away')) return 'driveaway';
  if (lower.includes('from') || lower.includes('starting')) return 'from';
  if (lower.includes('rrp') || lower.includes('recommended')) return 'rrp';
  if (lower.includes('week') && !lower.includes('month')) return 'per_week';
  if (lower.includes('month')) return 'per_month';
  if (validUntil) return 'rrp';
  
  return null;
}

// ============================================================================
// HTML Normalization (Section 4.3)
// ============================================================================

/**
 * Normalize HTML before hashing for change detection.
 * 
 * Implements all 12 normalization rules from spec Section 4.3.
 */
export function normalizeHtml(html: string): string {
  const $ = cheerio.load(html);

  // 1. Remove all <script> tags
  $('script').remove();

  // 2. Remove all <noscript> tags
  $('noscript').remove();

  // 3. Remove all <style> tags
  $('style').remove();

  // 4. Remove all HTML comments
  $('*').contents().filter(function() {
    return this.type === 'comment';
  }).remove();

  // 5. Remove all data-* attributes
  $('*').each((_, el) => {
    const attribs = (el as any).attribs;
    if (attribs) {
      Object.keys(attribs).forEach(attr => {
        if (attr.startsWith('data-')) {
          $(el).removeAttr(attr);
        }
      });
    }
  });

  // 6. Remove all class attributes (too noisy from build hashes)
  $('*').removeAttr('class');

  // 7. Remove id attributes that contain hashes or random strings
  $('*').each((_, el) => {
    const id = $(el).attr('id');
    if (id && /[a-f0-9]{8,}/i.test(id)) {
      $(el).removeAttr('id');
    }
  });

  // 8. Strip tracking parameters from URLs
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      $(el).attr('href', stripTrackingParams(href));
    }
  });

  // 9. Normalize whitespace
  let normalized = $.html();
  normalized = normalized.replace(/\s+/g, ' ').trim();

  // 10. Remove known dynamic elements
  $('.cookie-consent, .cookie-banner, #cookie-banner, .chat-widget, .analytics').remove();

  // 11 & 12. Sort attributes and lowercase (handled by cheerio output)
  
  return normalized;
}

function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url, 'https://example.com');
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 
                           'utm_content', 'gclid', 'fbclid', 'sessionid', '_ga', '_gid'];
    paramsToRemove.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.pathname + urlObj.search + urlObj.hash;
  } catch {
    return url;
  }
}

/**
 * Compute SHA256 hash of normalized HTML.
 */
export async function computeHtmlHash(html: string): Promise<string> {
  const normalized = normalizeHtml(html);
  
  // Use Web Crypto API for SHA256
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
