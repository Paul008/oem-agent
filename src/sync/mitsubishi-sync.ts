import type { SupabaseClient } from '@supabase/supabase-js';

const OEM_ID = 'mitsubishi-au';
const GRAPHQL_URL = 'https://store.mitsubishi-motors.com.au/graphql';
const OEM_SITE = 'https://www.mitsubishi-motors.com.au';
const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'] as const;

const CATEGORY_IDS = {
  asx: 'NTMz',
  outlander: 'NTUz',
  'eclipse-cross': 'NDM2',
  triton: 'NTQx',
  'pajero-sport': 'NTAz',
} as const;

const BROCHURES: Record<string, string> = {
  triton: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/26MY%20Triton%20Brochure.pdf`,
  outlander: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/26MY%20Outlander%20Brochure.pdf`,
  'pajero-sport': `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/25MY%20Pajero%20Sport%20Brochure.pdf`,
  'eclipse-cross': `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/24MY%20Eclipse%20Cross%20Brochure.pdf`,
  asx: `${OEM_SITE}/content/dam/mmal/pdfs/vehicle-brochures/25MY%20ASX%20Brochure.pdf`,
};

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

function slugify(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
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

function accessoryCategory(item: any): string | null {
  const group = String(item?.accessory_group || '').trim();
  if (group) return group;
  const category = (item?.categories || [])
    .map((c: any) => c?.name)
    .find((name: string) => /pack|exterior|interior|tow|cargo|accessor/i.test(name || ''));
  return category || null;
}

function accessoryPrice(item: any): number | null {
  return pf(item?.price_range?.minimum_price?.final_price?.value)
    ?? pf(item?.price_range?.minimum_price?.regular_price?.value);
}

function accessoryImage(item: any): string | null {
  const gallery = Array.isArray(item?.media_gallery)
    ? item.media_gallery.find((m: any) => !m.disabled && imageUrl(m))
    : null;
  return imageUrl(gallery) || imageUrl(item?.image) || imageUrl(item?.small_image) || imageUrl(item?.thumbnail);
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer csoiilvwl05ejpq0lvnvgnir2lf3wx2p',
      Origin: OEM_SITE,
      Referer: `${OEM_SITE}/`,
    },
    body: JSON.stringify({ query, variables }),
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
    .select('id, slug, name, brochure_url')
    .single();
  if (error) throw error;
  return data;
}

async function upsertProduct(supabase: SupabaseClient, parent: any, variant: any, model: any, category: any): Promise<any> {
  const product = variant.product || {};
  const offer = bestOffer(product);
  const price = offerStatePrice(offer, 'vic') || pf(product?.price_range?.minimum_price?.final_price?.value);
  const variantName = parent?.subrange?.label || parent?.model_1 || parent?.name || product?.name;
  const variantCode = product.sku || parent?.sku;
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
      attributes: variant.attributes || [],
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
        await supabase.from('variant_colors').upsert({
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

        await supabase.from('oem_color_palette').upsert({
          oem_id: OEM_ID,
          color_code: colorCode,
          color_name: value.store_label || value.label,
          color_type: colorType(value.label || ''),
          hex_approx: swatch && String(swatch).startsWith('#') ? swatch : null,
          swatch_url: swatch && !String(swatch).startsWith('#') ? imageUrl({ url: swatch }) : null,
          is_active: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'oem_id,color_code' });
        colors++;
      }
    }

    if (option.attribute_code === 'interior_code') {
      for (const value of option.values || []) {
        const interiorCode = String(value.value_index ?? value.option_slug ?? slugify(value.label));
        const priceDelta = optionPrice(value);
        await supabase.from('variant_interiors').upsert({
          product_id: dbProduct.id,
          interior_code: interiorCode,
          interior_name: value.store_label || value.label,
          material: String(value.label || '').toLowerCase().includes('leather') ? 'leather' : 'cloth',
          is_standard: priceDelta === 0 || String(selected.interior ?? '') === interiorCode,
          price_delta: priceDelta,
          swatch_url: value.swatch_data?.value && !String(value.swatch_data.value).startsWith('#') ? imageUrl({ url: value.swatch_data.value }) : null,
          sort_order: Number(value.value_index) || interiors,
        }, { onConflict: 'product_id,interior_code' });
        interiors++;
      }
    }
  }
  return { colors, interiors };
}

async function upsertPricing(supabase: SupabaseClient, productId: string, offer: any): Promise<boolean> {
  const amount = offerStatePrice(offer, 'vic');
  if (!amount) return false;
  await supabase.from('variant_pricing').upsert({
    product_id: productId,
    price_type: 'standard',
    ...pricingPayloadFromOffer(offer),
  }, { onConflict: 'product_id,price_type' });
  return true;
}

async function upsertOffer(supabase: SupabaseClient, productId: string, modelId: string, sku: string, offer: any, group: string): Promise<boolean> {
  if (!offer?.title && !offer?.short_description && !offer?.offer_id) return false;
  const externalKey = `${group}:${offer.offer_id || sku}:${slugify(offer.title || offer.short_description || 'offer')}`;
  const price = offerStatePrice(offer, 'vic');
  const row = {
    oem_id: OEM_ID,
    external_key: externalKey,
    model_id: modelId,
    source_url: `${OEM_SITE}/offers.html?group=${group}`,
    title: offer.title || offer.short_description || 'Mitsubishi offer',
    description: offer.description || offer.short_description || null,
    offer_type: offerType(offer, group),
    applicable_models: [sku],
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

  const { data: existing } = await supabase
    .from('offers')
    .select('id')
    .eq('oem_id', OEM_ID)
    .eq('external_key', externalKey)
    .maybeSingle();

  let offerId = existing?.id;
  if (offerId) {
    const { error } = await supabase.from('offers').update(row).eq('id', offerId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from('offers').insert(row).select('id').single();
    if (error) throw error;
    offerId = data.id;
  }

  await supabase.from('offer_products').upsert({ offer_id: offerId, product_id: productId });
  return true;
}

async function upsertAccessories(
  supabase: SupabaseClient,
  accessorySkusByModel: Map<string, Set<string>>,
  modelIdBySlug: Map<string, string>,
): Promise<number> {
  const skus = [...new Set([...accessorySkusByModel.values()].flatMap(set => [...set]))].filter(Boolean);
  if (!skus.length) return 0;

  let count = 0;
  for (let i = 0; i < skus.length; i += 25) {
    const batch = skus.slice(i, i + 25);
    const data = await gql<{ products?: { items?: any[] } }>(ACCESSORY_QUERY, { skus: batch });
    for (const item of data.products?.items || []) {
      if (!item?.sku) continue;
      const descriptionHtml = item.description?.html || item.short_description?.html || null;
      const payload = {
        oem_id: OEM_ID,
        external_key: item.sku,
        name: item.name || item.sku,
        slug: slugify(item.url_key || item.name || item.sku),
        part_number: item.sku,
        category: accessoryCategory(item),
        price: accessoryPrice(item),
        description_html: descriptionHtml,
        image_url: accessoryImage(item),
        inc_fitting: 'none',
        meta_json: {
          stock_status: item.stock_status,
          categories: item.categories || [],
          short_description: item.short_description?.html || null,
          disclaimer: stripHtml(descriptionHtml).match(/Disclaimer:?\s*(.*)$/i)?.[1] || null,
          media_gallery: item.media_gallery || [],
          media_gallery_entries: item.media_gallery_entries || [],
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
        const modelId = modelIdBySlug.get(modelSlug);
        if (!modelId) continue;
        await supabase.from('accessory_models').upsert({
          accessory_id: accessory.id,
          model_id: modelId,
        }, { onConflict: 'accessory_id,model_id' });
      }
      count++;
    }
  }
  return count;
}

async function seedDiscoveredApis(supabase: SupabaseClient): Promise<number> {
  const rows = [
    {
      oem_id: OEM_ID,
      url: GRAPHQL_URL,
      method: 'POST',
      content_type: 'application/json',
      response_type: 'json',
      sample_request_headers: {
        'Content-Type': 'application/json',
        Origin: OEM_SITE,
        Referer: `${OEM_SITE}/`,
      },
      sample_request_body: 'GetVehiclesInRange / GetProductsBySkuList GraphQL operations',
      data_type: 'products',
      schema_json: {
        capabilities: ['variants', 'colors', 'interiors', 'pricing', 'offers', 'compatible_accessories'],
        operations: ['GetVehiclesInRange', 'GetProductsBySkuList'],
        category_uids: CATEGORY_IDS,
      },
      reliability_score: 0.95,
      status: 'verified',
      last_successful_call: new Date().toISOString(),
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
      schema_json: { capabilities: ['accessory_images'], template_params: ['model', 'year'] },
      reliability_score: 0.85,
      status: 'verified',
      last_successful_call: new Date().toISOString(),
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
      schema_json: { capabilities: ['shared_accessory_images'] },
      reliability_score: 0.8,
      status: 'verified',
      last_successful_call: new Date().toISOString(),
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
      schema_json: { capabilities: ['offer_hero_banners', 'mobile_banners', 'offer_cards'] },
      reliability_score: 0.75,
      status: 'verified',
      last_successful_call: new Date().toISOString(),
      call_count: 1,
      error_count: 0,
    },
  ];

  const { error } = await supabase.from('discovered_apis').upsert(rows, { onConflict: 'oem_id,url' });
  if (error) throw error;
  return rows.length;
}

export async function syncMitsubishiGraphql(supabase: SupabaseClient): Promise<MitsubishiSyncResult> {
  const result = emptyResult();
  const modelIdBySlug = new Map<string, string>();
  const accessorySkusByModel = new Map<string, Set<string>>();

  try {
    result.discoveredApis = await seedDiscoveredApis(supabase);

    const ids = [...new Set(Object.values(CATEGORY_IDS))];
    const data = await gql<{ categories?: { items?: any[] } }>(RANGE_QUERY, { ids });
    const categories = data.categories?.items || [];

    for (const category of categories) {
      const model = await upsertVehicleModel(supabase, category);
      modelIdBySlug.set(model.slug, model.id);
      if (model.brochure_url) result.brochures++;

      const modelAccessories = accessorySkusByModel.get(model.slug) || new Set<string>();
      accessorySkusByModel.set(model.slug, modelAccessories);

      for (const parent of category?.products?.items || []) {
        for (const variant of parent?.variants || []) {
          const dbProduct = await upsertProduct(supabase, parent, variant, model, category);
          result.products++;

          const selected = {
            exterior: variant?.product?.exterior_code,
            interior: variant?.product?.interior_code,
          };
          const optionCounts = await upsertColorsAndInteriors(supabase, dbProduct, parent, selected);
          result.colors += optionCounts.colors;
          result.interiors += optionCounts.interiors;

          const offer = bestOffer(variant.product);
          if (await upsertPricing(supabase, dbProduct.id, offer)) result.pricing++;

          for (const group of ['private', 'business', 'mmba']) {
            const groupOffer = variant?.product?.offer?.[group];
            if (await upsertOffer(supabase, dbProduct.id, model.id, variant?.product?.sku || parent?.sku, groupOffer, group)) {
              result.offers++;
            }
          }

          for (const accessory of variant?.product?.compatible_accessories || []) {
            if (accessory?.sku) modelAccessories.add(accessory.sku);
          }
        }
      }
    }

    result.accessories = await upsertAccessories(supabase, accessorySkusByModel, modelIdBySlug);
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
