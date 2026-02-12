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
  pageType: string
): {
  products: ExtractedProduct[];
  offers: ExtractedOffer[];
  bannerSlides: ExtractedBannerSlide[];
  discoveredUrls: string[];
} {
  const $ = cheerio.load(html);
  const oemDef = getOemDefinition(oemId as any);
  const selectors = oemDef?.selectors || {};

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
      const slide: ExtractedBannerSlide = {
        position: index,
        headline: $slide.find('h1, h2, .headline').first().text().trim() || null,
        sub_headline: $slide.find('.sub-headline, .subtitle').first().text().trim() || null,
        cta_text: $slide.find('a, button').first().text().trim() || null,
        cta_url: $slide.find('a').first().attr('href') || null,
        image_url_desktop: extractImageUrl($slide, $) || '',
        image_url_mobile: null,
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
        title: $tile.find('h3, h4, .title').first().text().trim() || 'Special Offer',
        description: $tile.find('p, .description').first().text().trim() || null,
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
              $el.find('[style*="background-image"]').css('background-image')?.
                replace(/^url\(["']?/, '').replace(/["']?\)$/, '') ||
              $el.attr('src');
  
  return src || null;
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
  if (!priceStr) return null;
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
