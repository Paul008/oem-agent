/**
 * Dealer API — WP-compatible variants endpoint
 *
 * Serves vehicle variant data from Supabase in the same JSON schema
 * as the legacy WordPress REST API, so dealer website components
 * work without modification.
 *
 * GET /api/wp/v2/variants?filter[variant_category]=musso-ev&oem_id=kgm-au
 * GET /api/wp/v2/models?oem_id=kgm-au
 * GET /api/wp/v2/catalog?oem_id=kgm-au
 * GET /api/wp/v2/variants-import?oem=gwm-au  (WP All Import compatible flat JSON)
 */

import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { createSupabaseClient } from '../utils/supabase';

const dealerApi = new Hono<AppEnv>();

// CORS for all dealer-api routes (public, consumed by dealer websites)
dealerApi.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  return next();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Normalize OEM ID — accepts both 'kia' and 'kia-au' */
function normalizeOemId(raw: string): string {
  return raw.includes('-') ? raw : `${raw}-au`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function hashUuid(uuid: string): number {
  let hash = 0;
  for (let i = 0; i < uuid.length; i++) {
    hash = ((hash << 5) - hash) + uuid.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function formatDriveaway(amount: number | null | undefined): string {
  if (!amount) return '';
  return `$${Number(amount).toLocaleString('en-AU')} DRIVEAWAY*`;
}

function formatFeatures(features: string[] | null | undefined): string {
  if (!features || features.length === 0) return '';
  return `<ul>\n${features.map(f => `<li>${f}</li>`).join('\n')}\n</ul>`;
}

function capitalize(s: string | null | undefined): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupBy<T>(items: T[], key: keyof T): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  for (const item of items) {
    const k = String(item[key]);
    (map[k] ??= []).push(item);
  }
  return map;
}

// ── Shared product select columns ─────────────────────────────────────────

const PRODUCT_SELECT = 'id, model_id, title, subtitle, body_type, fuel_type, drivetrain, drive, engine_desc, engine_size, cylinders, transmission, seats, doors, price_amount, price_type, price_raw_string, price_qualifier, disclaimer_text, primary_image_r2_key, key_features, meta_json, specs_json, variant_code, variant_name, external_key, created_at, updated_at';

// ── WP-schema types ────────────────────────────────────────────────────────

interface WpColour {
  images: string;
  swatch_colour_: string;
  swatch_image: string;
  colour_name: string;
  paint_price: string;
  images_360: string;
  images_360_roof: string;
  roof_color: string;
  roof_price: string;
}

interface WpVariant {
  id: number;
  date: string;
  title: { rendered: string };
  slug: string;
  excerpt: { rendered: string };
  metadesc: { rendered: string };
  metatitle: { rendered: string };
  short_desc: string;
  grade_id: string | null;
  features: string;
  em: string;
  vehicle_image: [string, number, number, boolean];
  disclaimer: string;
  model: string;
  grade: string;
  segment: string;
  engine: string;
  fuel: string;
  transmission: string;
  drive_train: string;
  seats: string;
  doors: string;
  colours: WpColour[];
  drive_away: string;
  drive_away_manual: string;
  offer: string;
  offer_price: string;
  offer_disclaimer: string;
  brochure: string | null;
  specifications: any | null;
}

// ── Shared transformation ─────────────────────────────────────────────────

function buildEngine(product: any): string {
  // Build engine string from all available sources
  const specs = product.specs_json?.engine || {};
  const parts: string[] = [];

  if (product.engine_size) parts.push(product.engine_size);
  if (product.cylinders) parts.push(`${product.cylinders}cyl`);
  if (product.engine_desc) parts.push(product.engine_desc);

  if (parts.length > 0) return parts.join(' ');

  // Fallback to specs_json
  const specParts: string[] = [];
  if (specs.displacement_cc) specParts.push(`${(specs.displacement_cc / 1000).toFixed(1)}L`);
  if (specs.cylinders) specParts.push(`${specs.cylinders}cyl`);
  if (specs.type) specParts.push(specs.type);
  if (specs.power_kw) specParts.push(`${specs.power_kw}kW`);

  return specParts.join(' ') || '';
}

function transformProduct(
  product: any,
  modelName: string,
  colors: any[],
  pricingRows: any[],
  hexByCode: Record<string, string>,
): WpVariant {
  const stdPricing = pricingRows.find((p: any) => p.price_type === 'standard');
  const rrpPricing = pricingRows.find((p: any) => p.price_type === 'rrp');
  const pricing = stdPricing || rrpPricing;
  const meta = product.meta_json || {};
  const specs = product.specs_json || {};

  const driveawayAmount = pricing?.driveaway_vic ?? pricing?.driveaway_nsw ?? pricing?.rrp ?? product.price_amount ?? null;

  const wpColours: WpColour[] = colors.map((clr: any) => ({
    images: clr.hero_image_url || '',
    swatch_colour_: hexByCode[clr.color_code] || '',
    swatch_image: clr.swatch_url || '',
    colour_name: clr.color_name || '',
    paint_price: String(clr.price_delta ?? (clr.is_standard ? '0' : '')),
    images_360: '',
    images_360_roof: '',
    roof_color: '',
    roof_price: '',
  }));

  const features = Array.isArray(product.key_features) ? product.key_features : [];

  return {
    id: hashUuid(product.id),
    date: (product.updated_at || product.created_at || new Date().toISOString()).replace('Z', '').split('+')[0],
    title: { rendered: product.title || '' },
    slug: slugify(product.title || ''),
    excerpt: { rendered: '' },
    metadesc: { rendered: '' },
    metatitle: { rendered: product.title || '' },
    short_desc: '',
    grade_id: null,
    features: formatFeatures(features),
    em: product.variant_code || product.external_key || '',
    vehicle_image: [product.primary_image_r2_key || '', 750, 450, false] as [string, number, number, boolean],
    disclaimer: product.disclaimer_text || '',
    model: modelName,
    grade: product.subtitle || product.variant_name || product.body_type || '',
    segment: product.body_type || '',
    engine: buildEngine(product),
    fuel: capitalize(product.fuel_type),
    transmission: product.transmission || meta.transmission || specs.transmission?.type || '',
    drive_train: product.drivetrain || product.drive || meta.drivetrain || '',
    seats: String(product.seats || meta.seats || specs.dimensions?.seats || ''),
    doors: String(product.doors || meta.doors || specs.dimensions?.doors || ''),
    colours: wpColours,
    drive_away: formatDriveaway(driveawayAmount) || product.price_raw_string || '',
    drive_away_manual: '',
    offer: '',
    offer_price: '',
    offer_disclaimer: product.disclaimer_text || product.price_qualifier || pricing?.price_qualifier || '',
    brochure: null,
    specifications: specs.engine || specs.dimensions || specs.performance ? specs : null,
  };
}

// ── Variants endpoint ─────────────────────────────────────────────────────

dealerApi.get('/variants', async (c) => {
  const variantCategory = c.req.query('filter[variant_category]');
  const rawOemId = c.req.query('oem_id');
  const perPage = Math.min(parseInt(c.req.query('per_page') || '100', 10) || 100, 100);
  const page = Math.max(parseInt(c.req.query('page') || '1', 10) || 1, 1);
  const offset = (page - 1) * perPage;

  if (!variantCategory) {
    return c.json({ code: 'rest_missing_parameter', message: 'filter[variant_category] is required', data: { status: 400 } }, 400);
  }
  if (!rawOemId) {
    return c.json({ code: 'rest_missing_parameter', message: 'oem_id is required', data: { status: 400 } }, 400);
  }
  const oemId = normalizeOemId(rawOemId);

  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });

  try {
    const { data: model, error: modelErr } = await supabase
      .from('vehicle_models')
      .select('id, name, slug, body_type, category')
      .eq('oem_id', oemId)
      .eq('slug', variantCategory)
      .maybeSingle();

    if (modelErr) return c.json({ code: 'internal_error', message: modelErr.message }, 500);
    if (!model) return c.json([], 200);

    let { data: products, count, error: prodErr } = await supabase
      .from('products')
      .select(PRODUCT_SELECT, { count: 'exact' })
      .eq('model_id', model.id)
      .order('price_amount', { ascending: true })
      .range(offset, offset + perPage - 1);

    if (prodErr) return c.json({ code: 'internal_error', message: prodErr.message }, 500);

    // Fallback: title match if no model_id linked products (min 3 chars to avoid over-matching)
    if (!products || products.length === 0) {
      if (model.name && model.name.length >= 3) {
        console.warn(`[dealer-api] variants fallback: title ilike for model "${model.name}"`);
        const fallback = await supabase
          .from('products')
          .select(PRODUCT_SELECT, { count: 'exact' })
          .eq('oem_id', oemId)
          .ilike('title', `${model.name}%`)
          .order('price_amount', { ascending: true })
          .range(offset, offset + perPage - 1);
        products = fallback.data;
        count = fallback.count;
      }
    }

    if (!products || products.length === 0) {
      c.header('X-WP-Total', '0');
      c.header('X-WP-TotalPages', '0');
      return c.json([], 200);
    }

    const productIds = products.map((p: any) => p.id);

    const [colorsSettled, pricingSettled, paletteSettled] = await Promise.allSettled([
      supabase.from('variant_colors')
        .select('product_id, color_name, color_code, swatch_url, hero_image_url, gallery_urls, price_delta, is_standard, sort_order')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true }),
      supabase.from('variant_pricing')
        .select('product_id, price_type, driveaway_vic, driveaway_nsw, rrp, price_qualifier')
        .in('product_id', productIds),
      supabase.from('oem_color_palette')
        .select('color_code, hex_approx')
        .eq('oem_id', oemId)
        .eq('is_active', true),
    ]);

    const colorsData = colorsSettled.status === 'fulfilled' ? colorsSettled.value.data || [] : [];
    const pricingData = pricingSettled.status === 'fulfilled' ? pricingSettled.value.data || [] : [];
    const paletteData = paletteSettled.status === 'fulfilled' ? paletteSettled.value.data || [] : [];

    const colorsByProduct = groupBy(colorsData, 'product_id' as any);
    const pricingByProduct = groupBy(pricingData, 'product_id' as any);
    const hexByCode: Record<string, string> = {};
    for (const p of paletteData) hexByCode[p.color_code] = p.hex_approx || '';

    const result = products.map((product: any) =>
      transformProduct(product, model.name, colorsByProduct[product.id] || [], pricingByProduct[product.id] || [], hexByCode),
    );

    c.header('X-WP-Total', String(count || 0));
    c.header('X-WP-TotalPages', String(Math.ceil((count || 0) / perPage)));
    c.header('Cache-Control', 'public, max-age=300');
    return c.json(result);
  } catch (err) {
    console.error('[dealer-api] variants error:', err);
    return c.json({ code: 'internal_error', message: 'Failed to fetch variant data' }, 500);
  }
});

// ── Models list endpoint ───────────────────────────────────────────────────

dealerApi.get('/models', async (c) => {
  const rawOemId = c.req.query('oem_id');
  if (!rawOemId) {
    return c.json({ code: 'rest_missing_parameter', message: 'oem_id is required', data: { status: 400 } }, 400);
  }
  const oemId = normalizeOemId(rawOemId);

  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });

  try {
    const { data: models, error } = await supabase
      .from('vehicle_models')
      .select('id, slug, name, body_type, category, model_year, hero_image_url, is_active')
      .eq('oem_id', oemId)
      .eq('is_active', true)
      .order('name');

    if (error) return c.json({ code: 'internal_error', message: error.message }, 500);

    c.header('Cache-Control', 'public, max-age=300');
    return c.json(models || []);
  } catch (err) {
    console.error('[dealer-api] models error:', err);
    return c.json({ code: 'internal_error', message: 'Failed to fetch models' }, 500);
  }
});

// ── Full catalog endpoint — all models + variants for an OEM ──────────────

dealerApi.get('/catalog', async (c) => {
  const rawOemId = c.req.query('oem_id');
  if (!rawOemId) {
    return c.json({ code: 'rest_missing_parameter', message: 'oem_id is required', data: { status: 400 } }, 400);
  }
  const oemId = normalizeOemId(rawOemId);

  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });

  try {
    const { data: models, error: modelsErr } = await supabase
      .from('vehicle_models')
      .select('id, slug, name, body_type, category, model_year, hero_image_url')
      .eq('oem_id', oemId)
      .eq('is_active', true)
      .order('name');

    if (modelsErr) return c.json({ code: 'internal_error', message: modelsErr.message }, 500);
    if (!models || models.length === 0) return c.json([], 200);

    const modelIds = models.map((m: any) => m.id);

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('model_id', modelIds)
      .order('price_amount', { ascending: true });

    if (prodErr) return c.json({ code: 'internal_error', message: prodErr.message }, 500);

    const allProducts = products || [];
    const productIds = allProducts.map((p: any) => p.id);

    const [colorsSettled, pricingSettled, paletteSettled] = await Promise.allSettled([
      productIds.length > 0
        ? supabase.from('variant_colors')
            .select('product_id, color_name, color_code, swatch_url, hero_image_url, gallery_urls, price_delta, is_standard, sort_order')
            .in('product_id', productIds)
            .order('sort_order', { ascending: true })
        : { data: [], error: null },
      productIds.length > 0
        ? supabase.from('variant_pricing')
            .select('product_id, price_type, driveaway_vic, driveaway_nsw, rrp, price_qualifier')
            .in('product_id', productIds)
        : { data: [], error: null },
      supabase.from('oem_color_palette')
        .select('color_code, hex_approx')
        .eq('oem_id', oemId)
        .eq('is_active', true),
    ]);

    const colorsData = colorsSettled.status === 'fulfilled' ? colorsSettled.value.data || [] : [];
    const pricingData = pricingSettled.status === 'fulfilled' ? pricingSettled.value.data || [] : [];
    const paletteData = paletteSettled.status === 'fulfilled' ? paletteSettled.value.data || [] : [];

    const colorsByProduct = groupBy(colorsData, 'product_id' as any);
    const pricingByProduct = groupBy(pricingData, 'product_id' as any);
    const productsByModel = groupBy(allProducts, 'model_id' as any);
    const hexByCode: Record<string, string> = {};
    for (const p of paletteData) hexByCode[p.color_code] = p.hex_approx || '';

    const catalog = models.map((model: any) => {
      const modelProducts = (productsByModel[model.id] || []) as any[];
      const variants = modelProducts.map((product: any) =>
        transformProduct(product, model.name, colorsByProduct[product.id] || [], pricingByProduct[product.id] || [], hexByCode),
      );

      return {
        model: model.name,
        slug: model.slug,
        body_type: model.body_type || '',
        category: model.category || '',
        model_year: model.model_year,
        hero_image_url: model.hero_image_url || '',
        variant_count: variants.length,
        variants,
      };
    });

    // Fetch universal disclaimer from OEM config
    const { data: oemRecord } = await supabase
      .from('oems')
      .select('config_json')
      .eq('id', oemId)
      .single();
    const universalDisclaimer = (oemRecord?.config_json as any)?.universal_disclaimer || null;

    c.header('Cache-Control', 'public, max-age=300');
    return c.json({
      models: catalog,
      universal_disclaimer: universalDisclaimer,
    });
  } catch (err) {
    console.error('[dealer-api] catalog error:', err);
    return c.json({ code: 'internal_error', message: 'Failed to fetch catalog' }, 500);
  }
});

// ── WP All Import endpoint — flat variant list matching oem-variants schema ──

dealerApi.get('/variants-import', async (c) => {
  const oem = c.req.query('oem');
  if (!oem) {
    return c.json({ code: 'rest_missing_parameter', message: 'oem is required', data: { status: 400 } }, 400);
  }

  const oemId = normalizeOemId(oem);

  const supabase = createSupabaseClient({ url: c.env.SUPABASE_URL, serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY });

  try {
    const { data: models, error: modelsErr } = await supabase
      .from('vehicle_models')
      .select('id, slug, name, body_type, category, model_year')
      .eq('oem_id', oemId)
      .eq('is_active', true)
      .order('name');

    if (modelsErr) return c.json({ code: 'internal_error', message: modelsErr.message }, 500);
    if (!models || models.length === 0) return c.json([], 200);

    const modelIds = models.map((m: any) => m.id);
    const modelMap = new Map(models.map((m: any) => [m.id, m]));

    const { data: products, error: prodErr } = await supabase
      .from('products')
      .select(PRODUCT_SELECT)
      .in('model_id', modelIds)
      .order('price_amount', { ascending: true });

    if (prodErr) return c.json({ code: 'internal_error', message: prodErr.message }, 500);

    const allProducts = products || [];
    if (allProducts.length === 0) return c.json([], 200);

    const productIds = allProducts.map((p: any) => p.id);

    const [colorsSettled, pricingSettled, paletteSettled] = await Promise.allSettled([
      supabase.from('variant_colors')
        .select('product_id, color_name, color_code, swatch_url, hero_image_url, gallery_urls, price_delta, is_standard, sort_order')
        .in('product_id', productIds)
        .order('sort_order', { ascending: true }),
      supabase.from('variant_pricing')
        .select('product_id, price_type, driveaway_vic, driveaway_nsw, rrp, price_qualifier')
        .in('product_id', productIds),
      supabase.from('oem_color_palette')
        .select('color_code, hex_approx')
        .eq('oem_id', oemId)
        .eq('is_active', true),
    ]);

    const colorsByProduct = groupBy(colorsSettled.status === 'fulfilled' ? colorsSettled.value.data || [] : [], 'product_id' as any);
    const pricingByProduct = groupBy(pricingSettled.status === 'fulfilled' ? pricingSettled.value.data || [] : [], 'product_id' as any);
    const hexByCode: Record<string, string> = {};
    for (const p of (paletteSettled.status === 'fulfilled' ? paletteSettled.value.data || [] : [])) hexByCode[p.color_code] = p.hex_approx || '';

    // Transform to flat oem-variants schema for WP All Import
    const result = allProducts.map((product: any) => {
      const model = modelMap.get(product.model_id);
      const modelName = model?.name || '';
      const pricingRows = pricingByProduct[product.id] || [];
      const colors = colorsByProduct[product.id] || [];
      const stdPricing = pricingRows.find((p: any) => p.price_type === 'standard');
      const rrpPricing = pricingRows.find((p: any) => p.price_type === 'rrp');
      const pricing = stdPricing || rrpPricing;
      const meta = product.meta_json || {};
      const specs = product.specs_json || {};

      const driveawayAmount = pricing?.driveaway_vic ?? pricing?.driveaway_nsw ?? pricing?.rrp ?? product.price_amount ?? null;

      const wpColors = colors.map((clr: any) => ({
        images: clr.hero_image_url || '',
        paint_price: String(clr.price_delta ?? (clr.is_standard ? '0' : '')),
        swatch_colour_: hexByCode[clr.color_code] || '',
        colour_main_frame_code: clr.color_code || '',
        colour_name: clr.color_name || '',
        images_360: clr.gallery_urls || [],
      }));

      return {
        id: hashUuid(product.id),
        slug_id: product.title || '',
        title: product.title || '',
        slug: slugify(product.title || ''),
        year: String(model?.model_year || ''),
        badge: product.subtitle || product.variant_name || '',
        model: modelName,
        grade_id: modelName,
        grade: product.subtitle || product.variant_name || null,
        segment: product.body_type || '',
        body: product.body_type || '',
        engine: buildEngine(product),
        fuel: capitalize(product.fuel_type),
        transmission: product.transmission || meta.transmission || specs.transmission?.type || '',
        drive_train: product.drivetrain || product.drive || meta.drivetrain || '',
        seats: String(product.seats || meta.seats || specs.dimensions?.seats || ''),
        doors: String(product.doors || meta.doors || specs.dimensions?.doors || ''),
        excerpt: { rendered: '' },
        features: formatFeatures(Array.isArray(product.key_features) ? product.key_features : []),
        vehicle_image: product.primary_image_r2_key || '',
        offer_title: '&nbsp;',
        offer_preview: '&nbsp;',
        offer_disclaimer: '&nbsp;',
        drive_away: formatDriveaway(driveawayAmount) || product.price_raw_string || '',
        disclaimer: product.disclaimer_text || product.price_qualifier || pricing?.price_qualifier || '',
        colors: {
          images: wpColors,
        },
      };
    });

    c.header('Cache-Control', 'public, max-age=300');
    return c.json(result);
  } catch (err) {
    console.error('[dealer-api] variants-import error:', err);
    return c.json({ code: 'internal_error', message: 'Failed to fetch variant data' }, 500);
  }
});

export { dealerApi };
