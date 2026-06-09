import type { SupabaseClient } from '@supabase/supabase-js';

const OEM_ID = 'mitsubishi-au';
const GRAPHQL_URL = 'https://store.mitsubishi-motors.com.au/graphql';
const OEM_SITE = 'https://www.mitsubishi-motors.com.au';
const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'] as const;
const GRAPHQL_TIMEOUT_MS = 30_000;
const ASSET_FOLDER_TIMEOUT_MS = 15_000;
const ACCESSORY_ASSET_LIMIT = 10_000;

const CATEGORY_IDS = {
  asx: 'NTMz',
  'asx-25my': 'NTMz',
  outlander: 'NTUz',
  'outlander-25my': 'NTUz',
  'outlander-26my': 'NTUz',
  'outlander-phev': 'NTUz',
  'outlander-plug-in-hybrid-ev': 'NTUz',
  'outlander-plug-in-hybrid-ev-24my': 'NTUz',
  'eclipse-cross': 'NDM2',
  'eclipse-cross-24my': 'NDM2',
  'eclipse-cross-phev': 'NDM2',
  'eclipse-cross-plug-in-hybrid-ev': 'NDM2',
  triton: 'NTQx',
  'triton-25my': 'NTQx',
  'triton-26my': 'NTQx',
  'all-new-triton': 'NTQx',
  'all-new-triton-25my': 'NTQx',
  'pajero-sport': 'NTAz',
} as const;

const BROCHURES: Record<string, string> = {
  triton: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/26MY%20Triton%20Brochure.pdf`,
  outlander: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/26MY%20Outlander%20Brochure.pdf`,
  'pajero-sport': `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/25MY%20Pajero%20Sport%20Brochure.pdf`,
  'eclipse-cross': `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/24MY%20Eclipse%20Cross%20Brochure.pdf`,
  asx: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/25MY%20ASX%20Brochure.pdf`,
};

const MITSUBISHI_API_DOCS = `# Mitsubishi Motors Australia API Architecture

## Canonical Source

Mitsubishi Australia exposes a Magento GraphQL storefront at \`https://store.mitsubishi-motors.com.au/graphql\`. OEM Agent treats this as the canonical Mitsubishi source for catalog data.

Dealer-facing endpoints such as \`/api/wp/v2/catalog\`, \`/api/wp/v2/models\`, and \`/api/wp/v2/variants\` are downstream Supabase projections. They should not be treated as the upstream Mitsubishi source API.

## Endpoint

| URL | Method | Auth | Notes |
| --- | --- | --- | --- |
| \`https://store.mitsubishi-motors.com.au/graphql\` | POST | Bearer storefront token | Introspection is disabled. Requests should send \`Origin: https://www.mitsubishi-motors.com.au\` and \`Referer: https://www.mitsubishi-motors.com.au/\`. |

The storefront token currently used by the dealer theme and OEM Agent is the public Magento bearer token captured from Mitsubishi's site.

## Operations Used By OEM Agent

### GetVehiclesInRange

Fetches model families by category UID and returns configurable vehicle products. OEM Agent uses this for models, variants, colours, interiors, state pricing, and offers.

Variables:

\`\`\`json
{ "ids": ["NTMz", "NTUz", "NDM2", "NTQx", "NTAz"] }
\`\`\`

Category UID map:

| Model | UID |
| --- | --- |
| ASX | \`NTMz\` |
| Outlander / Outlander PHEV | \`NTUz\` |
| Eclipse Cross / Eclipse Cross PHEV | \`NDM2\` |
| Triton | \`NTQx\` |
| Pajero Sport | \`NTAz\` |

Important fields:

| GraphQL field | Supabase target |
| --- | --- |
| \`categories.items[].name/year/url_key\` | \`vehicle_models.name\`, \`model_year\`, \`slug\`, \`source_url\`, \`configurator_url\` |
| \`products.items[].body_style/fuel_type/drive_type/transmission/seats\` | \`products.body_type\`, \`fuel_type\`, \`drive\`, \`transmission\`, \`seats\` |
| \`variants[].product.sku/name/image/exterior_code/interior_code/option_pack\` | \`products.external_key\`, \`variant_code\`, \`primary_image_r2_key\`, \`meta_json\` |
| \`configurable_options[exterior_code]\` | \`variant_colors\`, \`oem_color_palette\` |
| \`configurable_options[interior_code]\` | \`variant_interiors\` |
| \`variants[].product.offer.private/business/mmba.price\` | \`variant_pricing\`, \`products.price_amount\`, \`products.price_qualifier\` |
| \`variants[].product.offer.*\` | \`offers\`, \`offer_products\` |
| \`compatible_accessories[].sku\` | Accessory SKU queue for \`GetProductsBySkuList\` |

### GetProductsBySkuList

Fetches accessory product detail by SKU batches collected from \`compatible_accessories\`.

Important fields:

| GraphQL field | Supabase target |
| --- | --- |
| \`sku\`, \`name\`, \`url_key\` | \`accessories.external_key\`, \`name\`, \`slug\`, \`part_number\` |
| \`accessory_group\`, \`categories\` | \`accessories.category\`, \`meta_json.categories\` |
| \`price_range.minimum_price\` | \`accessories.price\` |
| \`description.html\`, \`short_description.html\` | \`accessories.description_html\`, \`meta_json.disclaimer\` |
| \`media_gallery\`, \`media_gallery_entries\`, \`image\` | \`accessories.image_url\`, \`meta_json.media_gallery\` |

Accessory rows are linked to models through \`accessory_models\` using the compatible accessory SKUs discovered in the vehicle operation.

## AEM Asset Endpoints

Mitsubishi accessory imagery is better resolved through AEM asset folder JSON when GraphQL images are placeholders.

| URL pattern | Purpose |
| --- | --- |
| \`https://www.mitsubishi-motors.com.au/api/assets/mmal/accessories/{model}/{year}.json?limit=10000\` | Model/year accessory image lookup |
| \`https://www.mitsubishi-motors.com.au/api/assets/mmal/accessories/general.json?limit=10000\` | Shared accessory image fallback |

The sync matches images to accessory SKUs and stores the image source in \`accessories.meta_json.image_source\`.

## Brochure And PDF Spec Flow

The Mitsubishi sync writes current brochure URLs onto \`vehicle_models.brochure_url\` for ASX, Eclipse Cross, Outlander, Pajero Sport, and Triton. The PDF embedding and spec extraction flow consumes those model-level brochure URLs through \`pdf_embeddings\` and \`vehicle_models.extracted_specs\`.

## Current Sync Contract

\`executeAllOemSync()\` runs \`syncMitsubishiGraphql()\` during the daily \`oem-data-sync\` cron. The expected Mitsubishi outputs are:

- \`vehicle_models\`: active model families with brochure URLs and configurator URLs.
- \`products\`: one row per GraphQL variant SKU.
- \`variant_colors\`: exterior paint options from \`configurable_options.exterior_code\`.
- \`variant_interiors\`: interior trim options from \`configurable_options.interior_code\`.
- \`variant_pricing\`: state driveaway pricing from offer price blocks.
- \`offers\` and \`offer_products\`: private, business, and MMBA offer records linked to products.
- \`accessories\` and \`accessory_models\`: compatible accessory catalog and model links.
- \`discovered_apis\`: source API documentation rows for dashboard visibility.

## Legacy App Notes

The Mornington Mitsubishi legacy app contains a newer GraphQL client in \`src/services/offer-test-single.js\` with the same endpoint, token, category UID mapping, and state pricing concepts. Older legacy services still call WordPress/CDN endpoints; those should not be copied into OEM Agent as source-of-truth catalog ingestion.
`;

export interface MitsubishiSyncResult {
  products: number;
  colors: number;
  pricing: number;
  offers: number;
  accessories: number;
  interiors: number;
  brochures: number;
  discoveredApis: number;
  errors: string[];
}

interface ModelSyncMeta {
  id: string;
  slug: string;
  name?: string | null;
  model_year?: number | null;
}

interface AccessoryImageFiles {
  primaryAccessoryImages: string[];
  secondaryAccessoryImages: string[];
}

function emptyResult(): MitsubishiSyncResult {
  return {
    products: 0,
    colors: 0,
    pricing: 0,
    offers: 0,
    accessories: 0,
    interiors: 0,
    brochures: 0,
    discoveredApis: 0,
    errors: [],
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function pushSyncError(result: MitsubishiSyncResult, scope: string, error: unknown): void {
  result.errors.push(`${scope}: ${errorMessage(error)}`);
}

function variantScope(category: any, parent: any, variant: any): string {
  const model = modelSlugFromCategory(category) || 'unknown-model';
  const sku = variant?.product?.sku || parent?.sku || 'unknown-sku';
  const name = parent?.name || parent?.model_1 || variant?.product?.name || '';
  return [model, sku, name].filter(Boolean).join(' / ');
}

function slugify(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugifyPathSegment(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b\d{2}my\b/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function modelYearSlug(value: unknown): string {
  const year = String(value || '').trim().toLowerCase();
  if (!year) return '';
  if (year.endsWith('my')) return year;
  const fourDigitYear = year.match(/\d{4}/)?.[0];
  return fourDigitYear ? `${fourDigitYear.slice(-2)}my` : year;
}

function pf(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(/[$,]/g, ''));
  return Number.isFinite(n) && n > 0 && n < 999999 ? Math.round(n * 100) / 100 : null;
}

function stripHtml(value: string | null | undefined): string {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseModelYear(value: unknown): number | null {
  const year = String(value || '').match(/\d{4}/)?.[0] || String(value || '').match(/\d{2}(?=MY)/i)?.[0];
  if (!year) return null;
  const n = Number(year);
  return n > 99 ? n : 2000 + n;
}

function mapBodyType(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes('ute') || lower.includes('pick')) return 'Ute';
  if (lower.includes('suv')) return 'SUV';
  if (lower.includes('hatch')) return 'Hatch';
  return raw;
}

function modelSlugFromCategory(category: any): string {
  const raw = slugify(category?.url_key || category?.name);
  if (raw.includes('pajero')) return 'pajero-sport';
  if (raw.includes('eclipse')) return 'eclipse-cross';
  if (raw.includes('outlander')) return 'outlander';
  if (raw.includes('triton')) return 'triton';
  if (raw.includes('asx')) return 'asx';
  return raw;
}

function modelNameFromSlug(slug: string, fallback: string): string {
  const names: Record<string, string> = {
    asx: 'ASX',
    triton: 'Triton',
    outlander: 'Outlander',
    'pajero-sport': 'Pajero Sport',
    'eclipse-cross': 'Eclipse Cross',
  };
  return names[slug] || fallback;
}

function imageUrl(image: any): string | null {
  const url = image?.url || image?.file || null;
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/content/')) return `${OEM_SITE}${url}`;
  if (url.startsWith('/')) return `https://store.mitsubishi-motors.com.au${url}`;
  return url;
}

function colorType(label: string): string {
  const lower = label.toLowerCase();
  if (lower.includes('diamond') || lower.includes('pearl')) return 'pearl';
  if (lower.includes('metallic') || lower.includes('mica')) return 'metallic';
  if (lower.includes('matte')) return 'matte';
  return 'solid';
}

function optionPrice(value: any, group = 'private'): number {
  const p = value?.pricing?.[group] || value?.pricing?.private || {};
  return pf(p.vic_value ?? p.value ?? p.nsw_value ?? p.qld_value) || 0;
}

function offerStatePrice(offer: any, state: typeof STATES[number]): number | null {
  const statePrice = pf(offer?.price?.[state]?.value);
  return statePrice ?? pf(offer?.price?.value);
}

function pricingPayloadFromOffer(offer: any): Record<string, number | string | null> {
  const row: Record<string, number | string | null> = {
    rrp: offerStatePrice(offer, 'vic'),
    price_qualifier: offer?.price?.override_label || offer?.price?.label || 'Drive away',
    source_url: OEM_SITE,
    fetched_at: new Date().toISOString(),
  };
  for (const state of STATES) row[`driveaway_${state}`] = offerStatePrice(offer, state);
  return row;
}

function bestOffer(variantProduct: any): any | null {
  return variantProduct?.offer?.private || variantProduct?.offer?.business || variantProduct?.offer?.mmba || null;
}

function disclaimerText(offer: any): string {
  const disclaimers = Array.isArray(offer?.disclaimers)
    ? offer.disclaimers.map((d: any) => [d.marker, d.text].filter(Boolean).join(' ')).filter(Boolean)
    : [];
  const priceDisclaimer = offer?.price?.disclaimer;
  return [priceDisclaimer, ...disclaimers].filter(Boolean).join('\n\n');
}

function offerType(offer: any, group: string): string {
  if (group === 'business') return 'business';
  if (group === 'mmba') return 'lease';
  const text = `${offer?.title || ''} ${offer?.short_description || ''}`.toLowerCase();
  if (text.includes('saving') || text.includes('save')) return 'discount';
  if (text.includes('fuel card')) return 'fuel_card';
  if (text.includes('finance')) return 'finance';
  return 'driveaway';
}

function normaliseAccessoryCategoryLabel(category: unknown): string {
  const label = stripHtml(String(category || '')).replace(/^\d+[\s._-]*/, '');
  const labels: Record<string, string> = {
    packs: 'Packs',
    'accessory-packs': 'Packs',
    exterior: 'Exterior',
    'tow-cargo': 'Tow/Cargo',
    'tow-cargo-and-load-carrying': 'Tow/Cargo',
    'tow-and-cargo': 'Tow/Cargo',
    interior: 'Interior',
  };
  return labels[slugify(label)] || label;
}

function accessoryCategory(item: any): string | null {
  const group = normaliseAccessoryCategoryLabel(item?.accessory_group);
  if (group) return group;

  const preferred = ['packs', 'exterior', 'tow-cargo', 'interior'];
  const categories = (item?.categories || [])
    .map((c: any) => c?.name)
    .filter((name: string) => name && name.toLowerCase() !== 'accessories')
    .map((name: string) => {
      const label = normaliseAccessoryCategoryLabel(name);
      return { label, key: slugify(label) };
    });

  const preferredMatch = categories.find((category: { key: string }) => preferred.includes(category.key));
  return preferredMatch?.label || categories[0]?.label || null;
}

function accessoryPrice(item: any): number | null {
  const productPrice = pf(item?.price_range?.minimum_price?.final_price?.value)
    ?? pf(item?.price_range?.minimum_price?.regular_price?.value);
  if (productPrice) return productPrice;

  const variantPrices = (item?.variants || [])
    .map((variant: any) => pf(variant?.product?.price_range?.minimum_price?.final_price?.value))
    .filter((price: number | null): price is number => price != null);
  return variantPrices.length ? Math.min(...variantPrices) : null;
}

function isPlaceholderImage(url: string | null | undefined): boolean {
  return !url || /placeholder|no_selection|missing/i.test(url);
}

function accessoryCatalogEntryImage(item: any): string | null {
  const entry = Array.isArray(item?.media_gallery_entries)
    ? item.media_gallery_entries
      .filter((image: any) => !image.disabled && image.media_type !== 'external-video')
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .find((image: any) => image.file)
    : null;
  return entry?.file ? `https://store.mitsubishi-motors.com.au/media/catalog/product${entry.file}` : null;
}

function accessoryGraphqlImage(item: any): string | null {
  const gallery = Array.isArray(item?.media_gallery)
    ? item.media_gallery
      .filter((m: any) => !m.disabled)
      .sort((a: any, b: any) => (a.position || 0) - (b.position || 0))
      .map((m: any) => imageUrl(m))
      .find((url: string | null) => !isPlaceholderImage(url))
    : null;

  const variantImage = (item?.variants || [])
    .map((variant: any) => imageUrl(variant?.product?.image))
    .find((url: string | null) => !isPlaceholderImage(url));

  const candidates = [
    gallery,
    accessoryCatalogEntryImage(item),
    imageUrl(item?.small_image),
    imageUrl(item?.image),
    imageUrl(item?.thumbnail),
    variantImage,
  ];
  return candidates.find((url) => !isPlaceholderImage(url)) || null;
}

function sortAccessoryImages(a: string, b: string): number {
  const aHasSuffix = /_[^/]+$/.test(a.replace(/\.[^.]+(?:\/renditions\/original)?$/i, ''));
  const bHasSuffix = /_[^/]+$/.test(b.replace(/\.[^.]+(?:\/renditions\/original)?$/i, ''));
  if (!aHasSuffix && !bHasSuffix) return 0;
  if (aHasSuffix && bHasSuffix) return a.localeCompare(b);
  return aHasSuffix ? 1 : -1;
}

function accessorySkuCandidates(item: any): string[] {
  return [...new Set([
    item?.sku,
    item?.sku?.replace(/ZZ$/i, ''),
    ...(item?.variants || []).flatMap((variant: any) => [
      variant?.product?.sku,
      variant?.product?.sku?.replace(/ZZ$/i, ''),
    ]),
  ].filter(Boolean))] as string[];
}

function findAemAccessoryImage(item: any, imageFiles: AccessoryImageFiles): string | null {
  const skuCandidates = accessorySkuCandidates(item);
  const findMatch = (images: string[]): string | null => {
    for (const sku of skuCandidates) {
      const match = images.filter((url) => url.includes(sku)).sort(sortAccessoryImages)[0];
      if (match) return match;
    }
    return null;
  };

  return findMatch(imageFiles.primaryAccessoryImages) || findMatch(imageFiles.secondaryAccessoryImages);
}

function accessoryImage(item: any, imageFiles: AccessoryImageFiles): { url: string | null; source: string | null } {
  const aemImage = findAemAccessoryImage(item, imageFiles);
  if (aemImage) return { url: aemImage, source: 'aem' };
  const graphqlImage = accessoryGraphqlImage(item);
  return { url: graphqlImage, source: graphqlImage ? 'graphql' : null };
}

async function fetchAccessoryAssetFolder(path: string): Promise<string[]> {
  const cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
  if (!cleanPath) return [];

  const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const url = `${OEM_SITE}/api/assets/mmal/accessories/${cleanPath}.json?limit=${ACCESSORY_ASSET_LIMIT}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'oem-agent/1.0 Mitsubishi accessory sync' },
      signal: timeout ? timeout(ASSET_FOLDER_TIMEOUT_MS) : undefined,
    });
    if (!response.ok) return [];
    const data = await response.json() as { entities?: Array<{ class?: string[]; properties?: { name?: string } }> };
    return (data.entities || [])
      .filter((entity) => entity.class?.includes('assets/asset'))
      .map((entity) => entity.properties?.name ? `${OEM_SITE}/content/dam/mmal/accessories/${cleanPath}/${entity.properties.name}` : null)
      .filter((url): url is string => Boolean(url));
  } catch {
    return [];
  }
}

async function getAccessoryImageFiles(modelMetaBySlug: Map<string, ModelSyncMeta>): Promise<AccessoryImageFiles> {
  const primaryPaths = [...new Set([...modelMetaBySlug.values()]
    .map((model) => {
      const modelSlug = slugifyPathSegment(model.slug || model.name || '');
      const year = modelYearSlug(model.model_year);
      return modelSlug && year ? `${modelSlug}/${year}` : null;
    })
    .filter((path): path is string => Boolean(path)))];

  const [primaryGroups, secondaryGroups] = await Promise.all([
    Promise.all(primaryPaths.map(fetchAccessoryAssetFolder)),
    Promise.all(['general'].map(fetchAccessoryAssetFolder)),
  ]);

  return {
    primaryAccessoryImages: primaryGroups.flat(),
    secondaryAccessoryImages: secondaryGroups.flat(),
  };
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const timeout = (AbortSignal as typeof AbortSignal & { timeout?: (ms: number) => AbortSignal }).timeout;
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer csoiilvwl05ejpq0lvnvgnir2lf3wx2p',
      Origin: OEM_SITE,
      Referer: `${OEM_SITE}/`,
    },
    body: JSON.stringify({ query, variables }),
    signal: timeout ? timeout(GRAPHQL_TIMEOUT_MS) : undefined,
  });
  const json = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || json.errors || !json.data) {
    throw new Error(json.errors?.map(e => e.message).filter(Boolean).join('; ') || `Mitsubishi GraphQL ${response.status}`);
  }
  return json.data;
}

const RANGE_QUERY = `
fragment PriceDetails on StateOfferPrice {
  value
  label
  override_label
}

fragment OfferDetails on Offer {
  offer_id
  description
  short_description
  special_offer_flag
  price_group
  caption
  category
  range_offer
  seats
  disclaimers { marker text }
  image
  title
  price {
    label
    value
    override_label
    disclaimer
    sa { ...PriceDetails }
    wa { ...PriceDetails }
    nt { ...PriceDetails }
    qld { ...PriceDetails }
    nsw { ...PriceDetails }
    vic { ...PriceDetails }
    act { ...PriceDetails }
    tas { ...PriceDetails }
  }
}

fragment ConfigurableOptionsPrice on StatePriceLabel {
  value
  label
  sa_value
  wa_value
  nt_value
  qld_value
  nsw_value
  tas_value
  act_value
  vic_value
}

query GetVehiclesInRange($ids: [String]!) {
  categories(filters: {category_uid: {in: $ids}}) {
    items {
      name
      year
      url_key
      products {
        items {
          body_style
          seats
          sku
          name
          model_1
          fuel_type
          drive_type
          subrange { label path }
          transmission
          offer {
            private { short_description special_offer_flag }
            business { short_description special_offer_flag }
            mmba { short_description special_offer_flag }
          }
          ... on ConfigurableProduct {
            variants {
              product {
                offer {
                  private { ...OfferDetails }
                  business { ...OfferDetails }
                  mmba { ...OfferDetails }
                }
                sku
                name
                image { url label }
                small_image { url label }
                thumbnail { url label }
                exterior_code
                option_pack
                interior_code
                compatible_accessories { sku }
              }
              attributes { code value_index label }
            }
            configurable_options {
              attribute_code
              values {
                label
                option_slug
                store_label
                pricing {
                  business { ...ConfigurableOptionsPrice }
                  private { ...ConfigurableOptionsPrice }
                  mmba { ...ConfigurableOptionsPrice }
                }
                swatch_data { value }
                value_index
              }
            }
          }
        }
      }
    }
  }
}`;

const ACCESSORY_QUERY = `
query GetProductsBySkuList($skus: [String]!) {
  products(filter: {sku: {in: $skus}}) {
    items {
      __typename
      sku
      name
      url_key
      accessory_group
      stock_status
      image { url label }
      small_image { url label }
      thumbnail { url label }
      media_gallery { url label position disabled }
      media_gallery_entries { id file label position disabled media_type }
      price_range {
        minimum_price {
          regular_price { value currency }
          final_price { value currency }
        }
      }
      categories { name url_key uid }
      short_description { html }
      description { html }
      ... on ConfigurableProduct {
        variants {
          product {
            sku
            name
            image { url label }
            price_range {
              minimum_price {
                final_price { value currency }
              }
            }
          }
        }
        configurable_options {
          attribute_code
          values {
            label
            value_index
            swatch_data { value }
          }
        }
      }
    }
  }
}`;

async function upsertVehicleModel(supabase: SupabaseClient, category: any): Promise<any> {
  const slug = modelSlugFromCategory(category);
  const name = modelNameFromSlug(slug, category?.name || slug);
  const brochure = BROCHURES[slug] || null;
  const modelYear = parseModelYear(category?.year);
  const payload = {
    oem_id: OEM_ID,
    slug,
    name,
    body_type: slug === 'triton' ? 'Ute' : 'SUV',
    category: slug === 'triton' ? 'ute' : 'suv',
    model_year: modelYear,
    brochure_url: brochure,
    source_url: `${OEM_SITE}/vehicles/${slug}/overview.html`,
    configurator_url: `${OEM_SITE}/buying-tools/build-and-price.html#/${slug}?group=private`,
    meta_json: { category_uid: category?.uid, category_url_key: category?.url_key, category_year: category?.year },
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('vehicle_models')
    .upsert(payload, { onConflict: 'oem_id,slug' })
    .select('id, slug, name, brochure_url, model_year')
    .single();
  if (error) throw error;
  return data;
}

async function upsertProduct(supabase: SupabaseClient, parent: any, variant: any, model: any, category: any): Promise<any> {
  const product = variant?.product || {};
  const offer = bestOffer(product);
  const price = offerStatePrice(offer, 'vic') || pf(product?.price_range?.minimum_price?.final_price?.value);
  const variantName = parent?.subrange?.label || parent?.model_1 || parent?.name || product?.name;
  const variantCode = product.sku || parent?.sku;
  if (!variantCode) throw new Error('missing variant SKU');
  const title = [model.name, variantName].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const primaryImage = imageUrl(product.image) || imageUrl(product.small_image) || imageUrl(product.thumbnail);

  const payload = {
    oem_id: OEM_ID,
    external_key: variantCode,
    model_id: model.id,
    source_url: `${OEM_SITE}/offers/${model.slug}.html?group=private&sku=${parent?.sku || variantCode}`,
    title,
    subtitle: variantName,
    body_type: mapBodyType(parent?.body_style) || model?.body_type || null,
    fuel_type: parent?.fuel_type || null,
    drivetrain: parent?.drive_type || null,
    drive: parent?.drive_type || null,
    transmission: parent?.transmission || null,
    seats: pf(parent?.seats),
    price_amount: price,
    price_currency: 'AUD',
    price_type: price ? 'driveaway' : null,
    price_raw_string: price ? `$${Number(price).toLocaleString('en-AU')}` : null,
    price_qualifier: offer?.price?.override_label || offer?.price?.label || null,
    disclaimer_text: disclaimerText(offer),
    primary_image_r2_key: primaryImage,
    gallery_image_count: primaryImage ? 1 : 0,
    variants: parent?.variants || [],
    variant_code: variantCode,
    variant_name: variantName,
    availability: 'available',
    meta_json: {
      sku: variantCode,
      parent_sku: parent?.sku,
      model_1: parent?.model_1,
      model_year: category?.year,
      exterior_code: product.exterior_code,
      interior_code: product.interior_code,
      option_pack: product.option_pack,
      attributes: variant?.attributes || [],
      compatible_accessories: (product.compatible_accessories || []).map((a: any) => a.sku).filter(Boolean),
      mitsubishi_offer: offer || null,
    },
    content_hash: `${variantCode}:${price || ''}:${product.exterior_code || ''}:${product.interior_code || ''}`,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('products')
    .upsert(payload, { onConflict: 'oem_id,external_key' })
    .select('id, external_key, model_id')
    .single();
  if (error) throw error;
  return data;
}

async function upsertColorsAndInteriors(
  supabase: SupabaseClient,
  dbProduct: any,
  parent: any,
  selected: { exterior?: string | number | null; interior?: string | number | null },
): Promise<{ colors: number; interiors: number }> {
  let colors = 0;
  let interiors = 0;
  for (const option of parent.configurable_options || []) {
    if (option.attribute_code === 'exterior_code') {
      for (const value of option.values || []) {
        const colorCode = String(value.value_index ?? value.option_slug ?? slugify(value.label));
        const swatch = value.swatch_data?.value || null;
        const priceDelta = optionPrice(value);
        const { error: colorError } = await supabase.from('variant_colors').upsert({
          product_id: dbProduct.id,
          color_code: colorCode,
          color_name: value.store_label || value.label,
          color_type: colorType(value.label || ''),
          is_standard: priceDelta === 0 || String(selected.exterior ?? '') === colorCode,
          price_delta: priceDelta,
          swatch_url: swatch && !String(swatch).startsWith('#') ? imageUrl({ url: swatch }) : null,
          sort_order: Number(value.value_index) || colors,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'product_id,color_code' });
        if (colorError) throw new Error(`variant color ${colorCode}: ${colorError.message}`);

        const { error: paletteError } = await supabase.from('oem_color_palette').upsert({
          oem_id: OEM_ID,
          color_code: colorCode,
          color_name: value.store_label || value.label,
          color_type: colorType(value.label || ''),
          hex_approx: swatch && String(swatch).startsWith('#') ? swatch : null,
          swatch_url: swatch && !String(swatch).startsWith('#') ? imageUrl({ url: swatch }) : null,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'oem_id,color_code' });
        if (paletteError) throw new Error(`color palette ${colorCode}: ${paletteError.message}`);
        colors++;
      }
    }

    if (option.attribute_code === 'interior_code') {
      for (const value of option.values || []) {
        const interiorCode = String(value.value_index ?? value.option_slug ?? slugify(value.label));
        const priceDelta = optionPrice(value);
        const { error: interiorError } = await supabase.from('variant_interiors').upsert({
          product_id: dbProduct.id,
          interior_code: interiorCode,
          interior_name: value.store_label || value.label,
          material: String(value.label || '').toLowerCase().includes('leather') ? 'leather' : 'cloth',
          is_standard: priceDelta === 0 || String(selected.interior ?? '') === interiorCode,
          price_delta: priceDelta,
          swatch_url: value.swatch_data?.value && !String(value.swatch_data.value).startsWith('#') ? imageUrl({ url: value.swatch_data.value }) : null,
          sort_order: Number(value.value_index) || interiors,
        }, { onConflict: 'product_id,interior_code' });
        if (interiorError) throw new Error(`variant interior ${interiorCode}: ${interiorError.message}`);
        interiors++;
      }
    }
  }
  return { colors, interiors };
}

async function upsertPricing(supabase: SupabaseClient, productId: string, offer: any): Promise<boolean> {
  const amount = offerStatePrice(offer, 'vic');
  if (!amount) return false;
  const { error } = await supabase.from('variant_pricing').upsert({
    product_id: productId,
    price_type: 'standard',
    ...pricingPayloadFromOffer(offer),
  }, { onConflict: 'product_id,price_type' });
  if (error) throw new Error(`variant pricing ${productId}: ${error.message}`);
  return true;
}

async function upsertOffer(supabase: SupabaseClient, productId: string, modelId: string, sku: string | null | undefined, offer: any, group: string): Promise<boolean> {
  if (!offer?.title && !offer?.short_description && !offer?.offer_id) return false;
  const skuKey = sku || offer.offer_id || 'unknown-sku';
  const externalKey = `${group}:${offer.offer_id || skuKey}:${slugify(offer.title || offer.short_description || 'offer')}`;
  const price = offerStatePrice(offer, 'vic');
  const row = {
    oem_id: OEM_ID,
    external_key: externalKey,
    model_id: modelId,
    source_url: `${OEM_SITE}/offers.html?group=${group}`,
    title: offer.title || offer.short_description || 'Mitsubishi offer',
    description: offer.description || offer.short_description || null,
    offer_type: offerType(offer, group),
    applicable_models: sku ? [sku] : [],
    price_amount: price,
    price_currency: 'AUD',
    price_type: price ? 'driveaway' : null,
    price_raw_string: price ? `$${Number(price).toLocaleString('en-AU')}` : offer?.price?.label || null,
    cta_text: 'View offer',
    cta_url: `${OEM_SITE}/offers.html?group=${group}`,
    hero_image_r2_key: imageUrl({ url: offer.image }),
    disclaimer_text: disclaimerText(offer),
    disclaimer_html: offer.description || null,
    eligibility: group,
    content_hash: `${externalKey}:${price || ''}:${offer.short_description || ''}`,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: findError } = await supabase
    .from('offers')
    .select('id')
    .eq('oem_id', OEM_ID)
    .eq('external_key', externalKey)
    .maybeSingle();
  if (findError) throw new Error(`find offer ${externalKey}: ${findError.message}`);

  let offerId = existing?.id;
  if (offerId) {
    const { error } = await supabase.from('offers').update(row).eq('id', offerId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('offers').insert(row).select('id').single();
    if (error) throw error;
    offerId = data.id;
  }

  const { error: linkError } = await supabase
    .from('offer_products')
    .upsert({ offer_id: offerId, product_id: productId }, { onConflict: 'offer_id,product_id' });
  if (linkError) throw new Error(`link offer ${externalKey} to product ${productId}: ${linkError.message}`);
  return true;
}

async function upsertAccessories(
  supabase: SupabaseClient,
  accessorySkusByModel: Map<string, Set<string>>,
  modelMetaBySlug: Map<string, ModelSyncMeta>,
): Promise<number> {
  const skus = [...new Set([...accessorySkusByModel.values()].flatMap(set => [...set]))].filter(Boolean);
  if (!skus.length) return 0;

  const accessoryImageFiles = await getAccessoryImageFiles(modelMetaBySlug);
  let count = 0;
  for (let i = 0; i < skus.length; i += 25) {
    const batch = skus.slice(i, i + 25);
    const data = await gql<{ products?: { items?: any[] } }>(ACCESSORY_QUERY, { skus: batch });
    for (const item of data.products?.items || []) {
      if (!item?.sku) continue;
      const descriptionHtml = item.description?.html || item.short_description?.html || null;
      const image = accessoryImage(item, accessoryImageFiles);
      const payload = {
        oem_id: OEM_ID,
        external_key: item.sku,
        name: item.name || item.sku,
        slug: slugify(item.url_key || item.name || item.sku),
        part_number: item.sku,
        category: accessoryCategory(item),
        price: accessoryPrice(item),
        description_html: descriptionHtml,
        image_url: image.url,
        inc_fitting: 'none',
        meta_json: {
          stock_status: item.stock_status,
          categories: item.categories || [],
          short_description: item.short_description?.html || null,
          disclaimer: stripHtml(descriptionHtml).match(/Disclaimer:?\s*(.*)$/i)?.[1] || null,
          image_source: image.source,
          aem_image_url: image.source === 'aem' ? image.url : null,
          media_gallery: item.media_gallery || [],
          media_gallery_entries: item.media_gallery_entries || [],
          configurable_options: item.configurable_options || [],
          variants: (item.variants || []).map((variant: any) => ({
            sku: variant?.product?.sku,
            name: variant?.product?.name,
            price: pf(variant?.product?.price_range?.minimum_price?.final_price?.value),
            image_url: imageUrl(variant?.product?.image),
          })),
        },
        updated_at: new Date().toISOString(),
      };

      const { data: accessory, error } = await supabase
        .from('accessories')
        .upsert(payload, { onConflict: 'oem_id,external_key' })
        .select('id')
        .single();
      if (error) throw error;

      for (const [modelSlug, modelSkus] of accessorySkusByModel) {
        if (!modelSkus.has(item.sku)) continue;
        const modelId = modelMetaBySlug.get(modelSlug)?.id;
        if (!modelId) continue;
        const { error: linkError } = await supabase.from('accessory_models').upsert({
          accessory_id: accessory.id,
          model_id: modelId,
        }, { onConflict: 'accessory_id,model_id' });
        if (linkError) {
          throw new Error(`link accessory ${item.sku} to model ${modelSlug}: ${linkError.message}`);
        }
      }
      count++;
    }
  }
  return count;
}

async function seedDiscoveredApis(supabase: SupabaseClient): Promise<number> {
  const now = new Date().toISOString();
  const rows = [
    {
      oem_id: OEM_ID,
      url: GRAPHQL_URL,
      method: 'POST',
      content_type: 'application/json',
      response_type: 'json',
      sample_request_headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <public-storefront-token>',
        Origin: OEM_SITE,
        Referer: `${OEM_SITE}/`,
      },
      sample_request_body: 'GetVehiclesInRange GraphQL operation with category_uid ids for ASX, Outlander, Eclipse Cross, Triton, and Pajero Sport',
      data_type: 'products',
      schema_json: {
        label: 'Mitsubishi GraphQL catalog',
        operation: 'GetVehiclesInRange',
        source_role: 'canonical_source',
        auth: 'Public Magento storefront bearer token',
        capabilities: ['models', 'variants', 'colors', 'interiors', 'state_pricing', 'offers', 'compatible_accessory_skus', 'brochure_links'],
        maps_to_tables: ['vehicle_models', 'products', 'variant_colors', 'variant_interiors', 'variant_pricing', 'offers', 'offer_products'],
        category_uids: CATEGORY_IDS,
        source_code: 'src/sync/mitsubishi-sync.ts',
        note: 'Canonical Mitsubishi catalog operation used by daily oem-data-sync. Dealer API endpoints are downstream Supabase projections.',
      },
      reliability_score: 0.95,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
    {
      oem_id: OEM_ID,
      url: `${GRAPHQL_URL}#get-products-by-sku-list`,
      method: 'POST',
      content_type: 'application/json',
      response_type: 'json',
      sample_request_headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <public-storefront-token>',
        Origin: OEM_SITE,
        Referer: `${OEM_SITE}/`,
      },
      sample_request_body: 'GetProductsBySkuList GraphQL operation with compatible accessory SKUs collected from vehicle variants',
      data_type: 'accessories',
      schema_json: {
        label: 'Mitsubishi GraphQL accessories',
        operation: 'GetProductsBySkuList',
        source_role: 'canonical_source',
        auth: 'Public Magento storefront bearer token',
        capabilities: ['accessory_catalog', 'accessory_pricing', 'accessory_images', 'accessory_categories', 'model_links'],
        maps_to_tables: ['accessories', 'accessory_models'],
        note: 'Accessory SKUs are discovered from GetVehiclesInRange compatible_accessories and hydrated in SKU batches.',
      },
      reliability_score: 0.95,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
    {
      oem_id: OEM_ID,
      url: `${GRAPHQL_URL}#category-uids`,
      method: 'POST',
      content_type: 'application/json',
      response_type: 'json',
      sample_request_headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer <public-storefront-token>',
        Origin: OEM_SITE,
        Referer: `${OEM_SITE}/`,
      },
      sample_request_body: 'categories(filters: { category_uid: { in: [...] } })',
      data_type: 'config',
      schema_json: {
        label: 'Mitsubishi GraphQL category UID map',
        operation: 'categories',
        source_role: 'source_config',
        category_uids: CATEGORY_IDS,
        model_slugs: Object.keys(BROCHURES),
        note: 'Stable category UIDs used to request Mitsubishi model families from the Magento GraphQL storefront.',
      },
      reliability_score: 0.95,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
    {
      oem_id: OEM_ID,
      url: `${OEM_SITE}/api/assets/mmal/accessories/{model}/{year}.json?limit=10000`,
      method: 'GET',
      content_type: 'application/json',
      response_type: 'json',
      data_type: 'accessories',
      schema_json: {
        label: 'Mitsubishi AEM accessory images',
        operation: 'AEM model/year asset folder',
        source_role: 'image_enrichment',
        capabilities: ['accessory_images', 'model_year_image_fallback'],
        template_params: ['model', 'year'],
        maps_to_tables: ['accessories'],
        note: 'Used when GraphQL accessory images are placeholders or missing.',
      },
      reliability_score: 0.85,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
    {
      oem_id: OEM_ID,
      url: `${OEM_SITE}/api/assets/mmal/accessories/general.json?limit=10000`,
      method: 'GET',
      content_type: 'application/json',
      response_type: 'json',
      data_type: 'accessories',
      schema_json: {
        label: 'Mitsubishi AEM shared accessory images',
        operation: 'AEM general asset folder',
        source_role: 'image_enrichment',
        capabilities: ['shared_accessory_images', 'sku_image_fallback'],
        maps_to_tables: ['accessories'],
        note: 'Shared accessory image fallback matched by accessory SKU.',
      },
      reliability_score: 0.8,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
    {
      oem_id: OEM_ID,
      url: `${OEM_SITE}/offers.html?group=private`,
      method: 'GET',
      content_type: 'text/html',
      response_type: 'html',
      data_type: 'offers',
      schema_json: {
        label: 'Mitsubishi public offers page',
        operation: 'offers.html',
        source_role: 'presentation_enrichment',
        capabilities: ['offer_hero_banners', 'mobile_banners', 'offer_cards'],
        note: 'Presentation source for hero/offer imagery. Structured pricing and offer records come from GraphQL.',
      },
      reliability_score: 0.75,
      status: 'verified',
      last_successful_call: now,
      call_count: 1,
      error_count: 0,
    },
  ];

  const { error } = await supabase.from('discovered_apis').upsert(rows, { onConflict: 'oem_id,url' });
  if (error) throw error;

  const { error: staleAliasError } = await supabase
    .from('discovered_apis')
    .update({
      status: 'stale',
      schema_json: {
        label: 'Mitsubishi GraphQL legacy alias',
        source_role: 'legacy_alias',
        note: 'Replaced by canonical Mitsubishi GraphQL operation rows seeded by syncMitsubishiGraphql().',
      },
    })
    .eq('oem_id', OEM_ID)
    .in('url', [
      `${GRAPHQL_URL}#products`,
      `${GRAPHQL_URL}#categories`,
    ]);
  if (staleAliasError) throw new Error(`Mitsubishi stale API alias cleanup: ${staleAliasError.message}`);

  const { data: existing, error: docLookupError } = await supabase
    .from('oems')
    .select('config_json')
    .eq('id', OEM_ID)
    .single();
  if (docLookupError) throw new Error(`Mitsubishi API doc lookup: ${docLookupError.message}`);

  const configJson = {
    ...(existing?.config_json || {}),
    api_docs: MITSUBISHI_API_DOCS,
  };
  const { error: docError } = await supabase
    .from('oems')
    .update({ config_json: configJson })
    .eq('id', OEM_ID);
  if (docError) throw new Error(`Mitsubishi API doc update: ${docError.message}`);

  return rows.length;
}

export async function syncMitsubishiGraphql(supabase: SupabaseClient): Promise<MitsubishiSyncResult> {
  const result = emptyResult();
  const modelMetaBySlug = new Map<string, ModelSyncMeta>();
  const accessorySkusByModel = new Map<string, Set<string>>();

  try {
    try {
      result.discoveredApis = await seedDiscoveredApis(supabase);
    } catch (error) {
      pushSyncError(result, 'discovered APIs', error);
    }

    const ids = [...new Set(Object.values(CATEGORY_IDS))];
    const data = await gql<{ categories?: { items?: any[] } }>(RANGE_QUERY, { ids });
    const categories = data.categories?.items || [];

    for (const category of categories) {
      let model: any;
      try {
        model = await upsertVehicleModel(supabase, category);
      } catch (error) {
        pushSyncError(result, `model ${modelSlugFromCategory(category) || category?.name || 'unknown'}`, error);
        continue;
      }

      modelMetaBySlug.set(model.slug, model as ModelSyncMeta);
      if (model.brochure_url) result.brochures++;

      const modelAccessories = accessorySkusByModel.get(model.slug) || new Set<string>();
      accessorySkusByModel.set(model.slug, modelAccessories);

      for (const parent of category?.products?.items || []) {
        for (const variant of parent?.variants || []) {
          const scope = variantScope(category, parent, variant);
          let dbProduct: any;

          try {
            dbProduct = await upsertProduct(supabase, parent, variant, model, category);
            result.products++;
          } catch (error) {
            pushSyncError(result, `product ${scope}`, error);
            continue;
          }

          const selected = {
            exterior: variant?.product?.exterior_code,
            interior: variant?.product?.interior_code,
          };
          try {
            const optionCounts = await upsertColorsAndInteriors(supabase, dbProduct, parent, selected);
            result.colors += optionCounts.colors;
            result.interiors += optionCounts.interiors;
          } catch (error) {
            pushSyncError(result, `options ${scope}`, error);
          }

          try {
            const offer = bestOffer(variant?.product);
            if (await upsertPricing(supabase, dbProduct.id, offer)) result.pricing++;
          } catch (error) {
            pushSyncError(result, `pricing ${scope}`, error);
          }

          for (const group of ['private', 'business', 'mmba']) {
            try {
              const groupOffer = variant?.product?.offer?.[group];
              if (await upsertOffer(supabase, dbProduct.id, model.id, variant?.product?.sku || parent?.sku, groupOffer, group)) {
                result.offers++;
              }
            } catch (error) {
              pushSyncError(result, `offer ${group} ${scope}`, error);
            }
          }

          for (const accessory of variant?.product?.compatible_accessories || []) {
            if (accessory?.sku) modelAccessories.add(accessory.sku);
          }
        }
      }
    }

    try {
      result.accessories = await upsertAccessories(supabase, accessorySkusByModel, modelMetaBySlug);
    } catch (error) {
      pushSyncError(result, 'accessories', error);
    }
  } catch (error) {
    pushSyncError(result, 'Mitsubishi GraphQL sync', error);
  }

  return result;
}
