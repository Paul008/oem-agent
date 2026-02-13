/**
 * Skill: oem-extract — Product/Offer/Banner Extraction
 *
 * Triggered by: oem-crawl skill (after full render detects a change)
 *
 * Extraction priority (deterministic first, LLM fallback):
 * 1. JSON-LD structured data
 * 2. OpenGraph meta tags
 * 3. CSS selector extraction (OEM-specific — uses lib/extractors/)
 * 4. LLM normalisation fallback (Groq GPT-OSS 120B) — only if <80% field coverage
 *
 * Output:
 * - Extracted data mapped to canonical schemas (product.v1, offer.v1, banner.v1)
 * - Content hash for change detection
 * - Upserted to Supabase with diff computation
 * - Change events fired if data differs from current record
 */

import type {
  ExtractedProduct,
  ExtractedOffer,
  ExtractedBannerSlide,
  ExtractionResult,
  ChangeEvent
} from '../../lib/shared/types';

interface ExtractPayload {
  oem_id: string;
  url: string;
  page_type: string;
  rendered_html: string;       // Full rendered DOM from oem-crawl
  screenshot_r2_key?: string;  // Screenshot path in R2 if captured
}

interface ContainerEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GROQ_API_KEY: string;
}

/**
 * Extract product data from rendered HTML
 *
 * Fields extracted:
 * - title, subtitle, body_type, fuel_type, availability
 * - price (amount, currency, type, qualifier)
 * - Vehicle specs: engine_size, cylinders, transmission, gears, drive, doors, seats
 * - key_features: OEM marketing features (e.g., "Apple CarPlay", "Blind Spot Monitor")
 * - variants: Different trim levels with their own specs
 * - images: primary and gallery
 */
async function extractProduct(
  html: string,
  url: string,
  oemId: string
): Promise<ExtractedProduct | null> {
  // TODO: Implement extraction logic
  // 1. Try JSON-LD first (most reliable)
  // 2. Fall back to OEM-specific CSS selectors
  // 3. Use LLM for normalisation if coverage < 80%

  // Example structure for extracted product:
  // return {
  //   title: "2024 Suzuki S-Cross",
  //   subtitle: "JYB Series",
  //   body_type: "suv",
  //   fuel_type: "petrol",
  //   availability: "available",
  //   price: { amount: 32990, currency: "AUD", type: "driveaway", raw_string: "$32,990 DAP" },
  //   // Vehicle specifications
  //   engine_size: "1373",
  //   cylinders: 4,
  //   transmission: "Sports Automatic",
  //   gears: 6,
  //   drive: "Front Wheel Drive",
  //   doors: 5,
  //   seats: 5,
  //   // OEM marketing features
  //   key_features: [
  //     "Apple CarPlay & Android Auto",
  //     "Adaptive Cruise Control",
  //     "Blind Spot Monitor",
  //     "Lane Departure Warning"
  //   ],
  //   variants: [...],
  //   primary_image_url: "https://...",
  //   gallery_image_urls: [...]
  // };

  return null;
}

/**
 * Extract offer data from rendered HTML
 */
async function extractOffer(
  html: string,
  url: string,
  oemId: string
): Promise<ExtractedOffer | null> {
  // TODO: Implement extraction logic
  return null;
}

/**
 * Extract banner slides from rendered HTML
 */
async function extractBanners(
  html: string,
  url: string,
  oemId: string
): Promise<ExtractedBannerSlide[]> {
  // TODO: Implement extraction logic
  return [];
}

export async function handler(
  env: ContainerEnv,
  payload: Record<string, unknown>
): Promise<ExtractionResult> {
  const { oem_id, url, page_type, rendered_html } = payload as unknown as ExtractPayload;

  console.log(`[oem-extract] Extracting from ${url} (${oem_id}, ${page_type})`);

  const results: ExtractionResult = { products: 0, offers: 0, banners: 0, changes: 0 };

  // Extract based on page type
  switch (page_type) {
    case 'vehicle': {
      const product = await extractProduct(rendered_html, url, oem_id);
      if (product) {
        // TODO: Upsert to Supabase
        // TODO: Compute diff and create change_event if needed
        results.products = 1;
      }
      break;
    }

    case 'offers': {
      const offer = await extractOffer(rendered_html, url, oem_id);
      if (offer) {
        // TODO: Upsert to Supabase
        results.offers = 1;
      }
      break;
    }

    case 'homepage': {
      const banners = await extractBanners(rendered_html, url, oem_id);
      if (banners.length > 0) {
        // TODO: Upsert to Supabase
        results.banners = banners.length;
      }
      break;
    }
  }

  console.log(`[oem-extract] Done: ${JSON.stringify(results)}`);
  return results;
}
