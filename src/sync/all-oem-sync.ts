/**
 * All-OEM Data Sync
 *
 * Runs inside the Cloudflare Worker on the daily oem-data-sync cron.
 * Fetches colors, pricing, specs, and variant data from OEM APIs that provide
 * structured data (not just HTML crawl).
 *
 * OEM-specific syncs:
 *   - Kia:        BYO pages → colors + 8-state driveaway pricing (separate kia-colors.ts)
 *   - Hyundai:    CGI configurator + v3 specifications API → specs, colors + national pricing
 *   - Mazda:      /build/ BuildMyMazda payload → specs, colors + state driveaway pricing + accessories
 *   - Mitsubishi: Magento GraphQL → colors + pricing + state driveaway
 *   - VW:         OneHub API → products, colors (4-angle), pricing, offers, brochures
 *   - GWM:        Storyblok CDN → pricing, colors/gallery, accessories
 *   - GAC:        Signed official API → products, RRP pricing, colors
 *
 * Generic sync:
 *   - All OEMs:   Refresh variant_pricing from products.price_amount
 *   - All OEMs:   Auto-fix offer images from variant_colors (fallback)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { syncMitsubishiGraphql, type MitsubishiSyncResult } from './mitsubishi-sync';

const STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'] as const;

function allStates(amount: number | null) {
  if (!amount) return {};
  const row: Record<string, number> = {};
  for (const s of STATES) row[`driveaway_${s}`] = amount;
  return row;
}

function pf(v?: string | number | null): number | null {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return n > 0 && n < 999999 ? Math.round(n * 100) / 100 : null;
}

function slugify(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type SpecsSection = Record<string, string | number>;
type SpecsJson = Record<string, SpecsSection>;

function parseSpecNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSpecWithUnit(value: unknown, unit: RegExp): number | null {
  if (value === null || value === undefined) return null;
  const match = String(value).replace(/,/g, '').match(unit);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDisplacementCc(value: unknown): number | null {
  const cc = parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*cc/i);
  if (cc !== null) return Math.round(cc);

  const litres = parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*(?:l|litre|litres)\b/i);
  return litres !== null ? Math.round(litres * 1000) : null;
}

function parsePowerKw(value: unknown): number | null {
  return parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*kW/i);
}

function parseTorqueNm(value: unknown): number | null {
  return parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*Nm/i);
}

function parseKg(value: unknown): number | null {
  return parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*kg/i);
}

function parseMm(value: unknown): number | null {
  return parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*mm/i);
}

function parseLitres(value: unknown): number | null {
  return parseSpecWithUnit(value, /(\d+(?:\.\d+)?)\s*(?:l|litre|litres)\b/i);
}

function parseGears(value: unknown): number | null {
  const match = String(value ?? '').match(/(\d+)\s*(?:-\s*)?speed/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function compactSection(values: Record<string, unknown>): SpecsSection | null {
  const entries = Object.entries(values).filter(([, value]) => {
    if (value === null || value === undefined || value === '') return false;
    if (typeof value === 'number' && Number.isNaN(value)) return false;
    return typeof value === 'string' || typeof value === 'number';
  }) as Array<[string, string | number]>;
  return entries.length ? Object.fromEntries(entries) : null;
}

function addSpecsSection(specs: SpecsJson, key: string, values: Record<string, unknown>): void {
  const section = compactSection(values);
  if (section) specs[key] = section;
}

function numericSpecValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return parseSpecNumber(value);
}

function productPatchFromSpecs(specsJson: SpecsJson): Record<string, unknown> {
  const patch: Record<string, unknown> = { specs_json: specsJson };
  const engine = specsJson.engine ?? {};
  const transmission = specsJson.transmission ?? {};
  const capacity = specsJson.capacity ?? {};

  const displacementCc = numericSpecValue(engine.displacement_cc);
  if (displacementCc) patch.engine_size = `${(displacementCc / 1000).toFixed(1)}L`;

  const cylinders = numericSpecValue(engine.cylinders);
  if (cylinders !== null) patch.cylinders = cylinders;

  if (typeof transmission.type === 'string' && transmission.type) patch.transmission = transmission.type;

  const gears = numericSpecValue(transmission.gears);
  if (gears !== null) patch.gears = gears;

  if (typeof transmission.drive === 'string' && transmission.drive) patch.drive = transmission.drive;

  const doors = numericSpecValue(capacity.doors);
  if (doors !== null) patch.doors = doors;

  const seats = numericSpecValue(capacity.seats);
  if (seats !== null) patch.seats = seats;

  return patch;
}

export interface AllOemSyncResult {
  hyundai: { colors: number; pricing: number; specs: number; errors: string[] };
  mazda: { colors: number; pricing: number; specs: number; accessories: number; errors: string[] };
  mitsubishi: MitsubishiSyncResult;
  volkswagen: { products: number; colors: number; pricing: number; offers: number; errors: string[] };
  foton: { products: number; colors: number; pricing: number; errors: string[] };
  gwm: { pricing: number; colors: number; accessories: number; accessoryLinks: number; unmatched: number; errors: string[] };
  gac: { models: number; products: number; colors: number; pricing: number; errors: string[] };
  generic_pricing: { oems: number; products: number };
  offer_images_fixed: number;
}

// ============================================================================
// HYUNDAI — CGI Configurator embedded in model pages
// ============================================================================

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#34;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

interface HyundaiCgiData {
  modelName?: string;
  fscGroup?: {
    fscGroupId?: string;
    fscGroupName?: string;
  };
  fscSubGroups: Array<{
    subGroupId?: string;
    subGroupName?: string;
    subGroupDisplayName?: string;
    variants: Array<{
      variantId?: string;
      variantDescription: string;
      bodyType?: string;
      engineNTrans?: string;
      isElectric?: boolean;
      fscs: Array<{
        fscId?: string;
        fscLowPrice?: number;
        fscHighPrice?: number;
        defaultFront34ImageUrl?: string;
        desktopImageUrl?: string;
        mobileImageUrl?: string;
        badgeImageUrl?: string;
        baseColours: Array<{
          code: string;
          name: string;
          hex?: string;
          exteriorImages?: Array<{ imageName: string; path: string }>;
        }>;
      }>;
    }>;
  }>;
}

interface HyundaiSpecApiResponse {
  specVersion?: Array<{
    category?: Array<{
      subCategory?: Array<{
        name?: string;
        specification?: Array<{
          name?: string;
          values?: Array<{ value?: string | null }>;
        }>;
      }>;
    }>;
  }>;
}

type HyundaiSpecMap = Record<string, Record<string, string>>;

const HYUNDAI_SPEC_API = 'https://www.hyundai.com/content/api/au/hyundai/v3/specifications';

const HYUNDAI_MODELS = [
  { slug: 'venue', aliases: ['venue'], url: '/au/en/cars/suvs/venue' },
  { slug: 'kona', aliases: ['kona'], url: '/au/en/cars/suvs/kona' },
  { slug: 'kona-hybrid', aliases: ['kona-hybrid', 'kona'], url: '/au/en/cars/suvs/kona/konahybrid' },
  { slug: 'kona-electric', aliases: ['kona-electric', 'kona'], url: '/au/en/cars/eco/kona-electric' },
  { slug: 'tucson', aliases: ['tucson'], url: '/au/en/cars/suvs/tucson' },
  { slug: 'tucson-hybrid', aliases: ['tucson-hybrid', 'tucson'], url: '/au/en/cars/suvs/tucson-hybrid' },
  { slug: 'santa-fe', aliases: ['santa-fe'], url: '/au/en/cars/suvs/santa-fe' },
  { slug: 'santa-fe-hybrid', aliases: ['santa-fe-hybrid', 'santa-fe'], url: '/au/en/cars/suvs/santa-fe-hybrid' },
  { slug: 'palisade', aliases: ['palisade'], url: '/au/en/cars/suvs/palisade' },
  { slug: 'staria', aliases: ['staria'], url: '/au/en/cars/people-movers-and-commercial/staria' },
  { slug: 'staria-load', aliases: ['staria-load', 'staria'], url: '/au/en/cars/people-movers-and-commercial/staria-load' },
  { slug: 'inster', aliases: ['inster'], url: '/au/en/cars/eco/inster' },
  { slug: 'ioniq-5', aliases: ['ioniq-5', 'ioniq5'], url: '/au/en/cars/eco/ioniq5' },
  { slug: 'ioniq-5-n', aliases: ['ioniq-5-n', 'ioniq5-n', 'ioniq5n'], url: '/au/en/cars/eco/ioniq5n' },
  { slug: 'ioniq-6', aliases: ['ioniq-6', 'ioniq6'], url: '/au/en/cars/eco/ioniq6-2023' },
  { slug: 'ioniq-6-n', aliases: ['ioniq-6-n', 'ioniq6-n'], url: '/au/en/cars/eco/ioniq6-n-ryi' },
  { slug: 'ioniq-9', aliases: ['ioniq-9', 'ioniq9'], url: '/au/en/cars/eco/ioniq9' },
  { slug: 'elexio', aliases: ['elexio'], url: '/au/en/cars/eco/elexio-ryi' },
  { slug: 'i30', aliases: ['i30'], url: '/au/en/cars/small-cars/i30' },
  { slug: 'i30-n-line', aliases: ['i30-n-line', 'i30'], url: '/au/en/cars/small-cars/i30/n-line' },
  { slug: 'i30-sedan', aliases: ['i30-sedan', 'i30'], url: '/au/en/cars/small-cars/i30/sedan' },
  { slug: 'i30-sedan-hybrid', aliases: ['i30-sedan-hybrid', 'i30-sedan', 'i30'], url: '/au/en/cars/small-cars/i30/i30-sedan-hybrid' },
  { slug: 'i30-sedan-n-line', aliases: ['i30-sedan-n-line', 'i30-sedan', 'i30'], url: '/au/en/cars/small-cars/i30/n-line-sedan' },
  { slug: 'sonata-n-line', aliases: ['sonata-n-line', 'sonata'], url: '/au/en/cars/mid-size/sonata-n-line' },
  { slug: 'i20-n', aliases: ['i20-n'], url: '/au/en/cars/sports-cars/i20-n' },
  { slug: 'i30-n', aliases: ['i30-n'], url: '/au/en/cars/sports-cars/i30-n' },
  { slug: 'i30-sedan-n', aliases: ['i30-sedan-n', 'i30-sedan'], url: '/au/en/cars/sports-cars/i30-sedan-n' },
];

function extractCgiData(html: string): HyundaiCgiData | null {
  const re = /data-src="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const decoded = decodeHtmlEntities(m[1]);
    if (!decoded.startsWith('{')) continue;
    try {
      const json = JSON.parse(decoded);
      if (json.fscSubGroups) return json;
    } catch { /* skip */ }
  }
  return null;
}

function hyundaiUrl(path?: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  return trimmed.startsWith('/')
    ? `https://www.hyundai.com${trimmed}`
    : `https://www.hyundai.com/${trimmed}`;
}

function deriveColorType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('pearl')) return 'pearl';
  if (lower.includes('metallic')) return 'metallic';
  if (lower.includes('mica')) return 'mica';
  if (lower.includes('matte')) return 'matte';
  return 'solid';
}

function lower(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function metaValue(meta: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = meta[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

function hyundaiGalleryUrls(
  color: { exteriorImages?: Array<{ imageName?: string; path?: string }> },
  fsc: { defaultFront34ImageUrl?: string; desktopImageUrl?: string; mobileImageUrl?: string },
): string[] {
  const order = [
    'front34ImageUrl',
    'rear34ImageUrl',
    'sideImageUrl',
    'frontImageUrl',
    'mainDesktopUrl',
    'mainMobileUrl',
  ];
  const byName = new Map((color.exteriorImages ?? []).map(image => [image.imageName, image.path]));
  const urls = [
    ...order.map(name => hyundaiUrl(byName.get(name))),
    hyundaiUrl(fsc.defaultFront34ImageUrl),
    hyundaiUrl(fsc.desktopImageUrl),
    hyundaiUrl(fsc.mobileImageUrl),
  ].filter((url): url is string => Boolean(url));
  return [...new Set(urls)];
}

function flattenHyundaiSpecs(data: HyundaiSpecApiResponse): HyundaiSpecMap {
  const map: HyundaiSpecMap = {};
  const specVersion = data.specVersion?.[0];
  if (!specVersion?.category) return map;

  for (const category of specVersion.category) {
    for (const subCategory of category.subCategory ?? []) {
      const section = subCategory.name || 'Other';
      if (!map[section]) map[section] = {};
      for (const spec of subCategory.specification ?? []) {
        const name = spec.name?.trim();
        const value = spec.values?.[0]?.value?.trim();
        if (name && value && value !== 'N/A') map[section][name] = value;
      }
    }
  }

  return map;
}

function countHyundaiAirbags(specMap: HyundaiSpecMap): number | null {
  let count = 0;
  for (const [key, value] of Object.entries(specMap.Airbags || {})) {
    if (value !== 'TRUE') continue;
    if (key.includes('Front airbags')) count += 2;
    else if (key.includes('Side (thorax)')) count += 2;
    else if (key.includes('Side Curtain Front')) count += 2;
    else if (key.includes('Side curtain airbag - 2nd Row')) count += 2;
    else count += 1;
  }
  return count || null;
}

function deriveHyundaiFuelType(variantLabel: string, fuelTypeSpec?: string, isElectric?: boolean): string | null {
  const text = `${variantLabel || ''} ${fuelTypeSpec || ''}`.toLowerCase();
  if (text.includes('plug-in') || text.includes('phev')) return 'PHEV';
  if (text.includes('hybrid') || text.includes('hev')) return 'Hybrid';
  if (isElectric || text.includes('electric') || /\bev\b/.test(text) || text.includes('bev')) return 'Electric';
  if (text.includes('diesel')) return 'Diesel';
  if (text.includes('petrol') || text.includes('mpi') || text.includes('gdi') || text.includes('ron')) return 'Petrol';
  return null;
}

function deriveDriveFromText(value: string): string | null {
  if (/\bAWD\b/i.test(value)) return 'AWD';
  if (/\b4WD\b/i.test(value)) return '4WD';
  if (/\bFWD\b/i.test(value)) return 'FWD';
  if (/\bRWD\b/i.test(value)) return 'RWD';
  return null;
}

function deriveHyundaiTransmissionType(value: string): string | null {
  const lowerValue = value.toLowerCase();
  if (lowerValue.includes('manual')) return 'Manual';
  if (
    lowerValue.includes('automatic')
    || lowerValue.includes('dct')
    || lowerValue.includes('ivt')
    || lowerValue.includes('cvt')
    || lowerValue.includes('single-speed')
    || /\b\d+\s*(?:-\s*)?speed\b/i.test(value)
  ) return 'Automatic';
  return null;
}

function parseWheelSize(value: unknown): string | null {
  const match = String(value ?? '').match(/(\d+)\s*x/);
  return match ? `${match[1]}"` : null;
}

function buildHyundaiSpecsJson(data: HyundaiSpecApiResponse, variantLabel: string, isElectric?: boolean): SpecsJson | null {
  const specMap = flattenHyundaiSpecs(data);
  if (Object.keys(specMap).length === 0) return null;

  const engine = specMap.Engine || {};
  const transmission = specMap.Transmission || {};
  const weight = specMap.Weight || {};
  const towing = specMap['Towing capacity'] || {};
  const fuel = specMap['Fuel consumption'] || {};
  const exterior = specMap.Exterior || {};
  const interior = specMap.Interior || {};
  const wheels = specMap['Wheels & tyres'] || specMap['Wheels & Tyres'] || {};

  const specs: SpecsJson = {};
  addSpecsSection(specs, 'engine', {
    type: deriveHyundaiFuelType(variantLabel, engine['Fuel Type'], isElectric),
    displacement_cc: parseDisplacementCc(engine['Cylinder capacity']),
    cylinders: parseSpecNumber(engine['Number of cylinders']),
    power_kw: parsePowerKw(engine['Maximum Power']),
    torque_nm: parseTorqueNm(engine['Maximum Torque']),
  });
  addSpecsSection(specs, 'transmission', {
    type: deriveHyundaiTransmissionType(`${variantLabel} ${transmission.Automatic || transmission.Manual || ''}`),
    gears: parseGears(transmission.Automatic || transmission.Manual),
    drive: deriveDriveFromText(variantLabel),
  });
  addSpecsSection(specs, 'dimensions', {
    length_mm: parseMm(exterior.Length),
    width_mm: parseMm(exterior.Width),
    height_mm: parseMm(exterior.Height || exterior['Height (with roof rails)'] || exterior['Height (without roof rails)']),
    wheelbase_mm: parseMm(exterior.Wheelbase),
    kerb_weight_kg: parseKg(weight['Kerb weight - lightest']),
  });
  addSpecsSection(specs, 'performance', {
    fuel_combined_l100km: parseSpecNumber(fuel['Combined (L/100km)']),
    co2_gkm: parseSpecNumber(fuel['CO2 - combined (g/km)']),
  });
  addSpecsSection(specs, 'towing', {
    braked_kg: parseKg(towing.Braked),
    unbraked_kg: parseKg(towing.Unbraked),
  });
  addSpecsSection(specs, 'capacity', {
    boot_litres: parseLitres(interior['Cargo area - VDA'] || interior['Boot volume - VDA']),
    fuel_tank_litres: parseLitres(fuel['Fuel tank volume']),
  });
  addSpecsSection(specs, 'safety', {
    airbags: countHyundaiAirbags(specMap),
  });
  addSpecsSection(specs, 'wheels', {
    size: parseWheelSize(wheels['Wheel dimensions']),
    type: wheels['Wheel type'] || null,
  });

  return Object.keys(specs).length ? specs : null;
}

async function fetchHyundaiSpecsJson(
  variantId: string | undefined,
  variantLabel: string,
  isElectric: boolean | undefined,
  cache: Map<string, SpecsJson | null>,
): Promise<SpecsJson | null> {
  if (!variantId) return null;
  const cacheKey = variantId.trim();
  if (cache.has(cacheKey)) return cache.get(cacheKey) ?? null;

  const response = await fetch(`${HYUNDAI_SPEC_API}?variantId=${encodeURIComponent(cacheKey)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      Accept: 'application/json',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const json = await response.json() as HyundaiSpecApiResponse;
  const specs = buildHyundaiSpecsJson(json, variantLabel, isElectric);
  cache.set(cacheKey, specs);
  return specs;
}

async function syncHyundai(supabase: SupabaseClient): Promise<AllOemSyncResult['hyundai']> {
  const result = { colors: 0, pricing: 0, specs: 0, errors: [] as string[] };
  const BASE = 'https://www.hyundai.com';
  const OEM_ID = 'hyundai-au';

  const { data: dbModels, error: modelLookupErr } = await supabase
    .from('vehicle_models').select('id, slug').eq('oem_id', OEM_ID);
  const { data: existingProducts, error: productLookupErr } = await supabase
    .from('products').select('id, model_id, title, external_key, variant_code, meta_json, price_amount').eq('oem_id', OEM_ID);
  if (modelLookupErr) result.errors.push(`Hyundai model lookup: ${modelLookupErr.message}`);
  if (productLookupErr) result.errors.push(`Hyundai product lookup: ${productLookupErr.message}`);
  if (modelLookupErr || productLookupErr) return result;

  const modelMap = Object.fromEntries((dbModels ?? []).map(m => [m.slug, m]));
  const products = existingProducts ?? [];
  const specsCache = new Map<string, SpecsJson | null>();

  for (const mp of HYUNDAI_MODELS) {
    const model = mp.aliases.map(alias => modelMap[alias]).find(Boolean);
    if (!model) continue;

    try {
      const res = await fetch(BASE + mp.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });
      if (!res.ok) {
        result.errors.push(`Hyundai ${mp.slug}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const cgi = extractCgiData(html);
      if (!cgi) {
        result.errors.push(`Hyundai ${mp.slug}: CGI configurator payload not found`);
        continue;
      }

      let matchedProducts = 0;
      let unmatchedProducts = 0;

      for (const sg of cgi.fscSubGroups) {
        for (const variant of sg.variants ?? []) {
          for (const fsc of variant.fscs ?? []) {
            if (!fsc.baseColours?.length) continue;
            const gradeName = sg.subGroupDisplayName || sg.subGroupName || variant.variantDescription || cgi.modelName || mp.slug;
            const fallbackExternalKey = `${OEM_ID}-${slugify(`${mp.slug}-${gradeName}`)}`;
            const idNeedles = [fsc.fscId, variant.variantId, sg.subGroupId]
              .map(value => lower(value))
              .filter(Boolean);
            const genericTitleNeedles = new Set([
              mp.slug,
              ...mp.aliases,
              cgi.modelName,
              cgi.fscGroup?.fscGroupName,
            ].map(value => slugify(String(value ?? ''))).filter(Boolean));
            const titleNeedles = [
              gradeName,
              sg.subGroupName,
              sg.subGroupDisplayName,
              variant.variantDescription,
              variant.engineNTrans,
            ]
              .map(value => slugify(String(value ?? '')))
              .filter(needle => needle.length >= 5 && !genericTitleNeedles.has(needle));

            const existing = products.find((product) => {
              const meta = (product.meta_json ?? {}) as Record<string, unknown>;
              const externalKey = lower(product.external_key);
              const variantCode = lower(product.variant_code);
              const metaIdentifiers = [
                metaValue(meta, ['fscId', 'fsc_id', 'fscID']),
                metaValue(meta, ['variantId', 'variant_id']),
                metaValue(meta, ['subGroupId', 'sub_group_id']),
                metaValue(meta, ['modelCode', 'model_code', 'variant_code']),
              ].map(value => lower(value)).filter(Boolean);

              if (idNeedles.some(id => externalKey.includes(id) || variantCode === id || metaIdentifiers.includes(id))) {
                return true;
              }

              if (product.model_id !== model.id) return false;
              const productText = slugify([
                product.title,
                product.external_key,
                product.variant_code,
                metaValue(meta, ['grade', 'grade_name', 'variantName', 'variant_name']),
              ].filter(Boolean).join(' '));

              return titleNeedles.some(needle => productText.includes(needle));
            });
            if (!existing) {
              unmatchedProducts++;
              continue;
            }
            matchedProducts++;
            const specLabel = [gradeName, variant.variantDescription, variant.engineNTrans].filter(Boolean).join(' ');
            let specsJson: SpecsJson | null = null;
            try {
              specsJson = await fetchHyundaiSpecsJson(variant.variantId, specLabel, variant.isElectric, specsCache);
            } catch (e) {
              result.errors.push(`Hyundai specs ${variant.variantId || fallbackExternalKey}: ${e instanceof Error ? e.message : String(e)}`);
            }

            // Upsert colors
            const seenCodes = new Set<string>();
            for (const c of fsc.baseColours) {
              if (seenCodes.has(c.code)) continue;
              seenCodes.add(c.code);
              const galleryUrls = hyundaiGalleryUrls(c, fsc);
              const { error: colorErr } = await supabase.from('variant_colors').upsert({
                product_id: existing.id,
                color_code: c.code,
                color_name: c.name,
                color_type: deriveColorType(c.name),
                swatch_url: c.hex || null,
                hero_image_url: galleryUrls[0] ?? null,
                gallery_urls: galleryUrls,
              }, { onConflict: 'product_id,color_code' });
              if (colorErr) {
                result.errors.push(`Hyundai color ${fallbackExternalKey}/${c.code}: ${colorErr.message}`);
              } else {
                result.colors++;
              }
            }

            // Upsert pricing
            const driveaway = pf(fsc.fscLowPrice);
            if (driveaway) {
              const { error: pricingErr } = await supabase.from('variant_pricing').upsert({
                product_id: existing.id,
                price_type: 'standard',
                rrp: null,
                ...allStates(driveaway),
                price_qualifier: 'Hyundai CGI from-price',
              }, { onConflict: 'product_id,price_type' });
              if (pricingErr) {
                result.errors.push(`Hyundai pricing ${fallbackExternalKey}: ${pricingErr.message}`);
              } else {
                result.pricing++;
                if (existing.price_amount !== driveaway) {
                  const { error: productUpdateErr } = await supabase.from('products').update({
                    price_amount: driveaway,
                    price_type: 'driveaway',
                    price_qualifier: 'Hyundai CGI from-price',
                  }).eq('id', existing.id);
                  if (productUpdateErr) {
                    result.errors.push(`Hyundai product price ${fallbackExternalKey}: ${productUpdateErr.message}`);
                  }
                }
              }
            }

            if (specsJson) {
              const { error: specUpdateErr } = await supabase.from('products')
                .update(productPatchFromSpecs(specsJson))
                .eq('id', existing.id);
              if (specUpdateErr) {
                result.errors.push(`Hyundai specs update ${fallbackExternalKey}: ${specUpdateErr.message}`);
              } else {
                result.specs++;
              }
            }
          }
        }
      }

      if (matchedProducts === 0) {
        result.errors.push(`Hyundai ${mp.slug}: no DB products matched CGI variants`);
      } else if (unmatchedProducts > 0) {
        result.errors.push(`Hyundai ${mp.slug}: ${unmatchedProducts} CGI variants skipped because DB products were not matched`);
      }
    } catch (e) {
      result.errors.push(`${mp.slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// ============================================================================
// MAZDA — /cars/{model}/ pages with ReactDOM.hydrate JSON
// ============================================================================

const MAZDA_MODELS = [
  'bt-50', 'cx-3', 'cx-5', 'cx-60', 'cx-70', 'cx-80', 'cx-90', 'mazda2', 'mazda3', 'mx-5',
];

function extractJsonObjectAt(html: string, startIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let pos = startIdx; pos < html.length; pos++) {
    const ch = html[pos];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return html.slice(startIdx, pos + 1);
    }
  }

  return null;
}

function absolutizeMazdaUrl(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) return trimmed;
  return trimmed.startsWith('/')
    ? `https://www.mazda.com.au${trimmed}`
    : `https://www.mazda.com.au/${trimmed}`;
}

function mazdaModelTitleNeedles(slug: string): string[] {
  const needles = new Set<string>([
    slug.toLowerCase(),
    slug.toLowerCase().replace(/-/g, ' '),
  ]);
  const mazdaNumber = slug.toLowerCase().match(/^mazda(\d)$/);
  if (mazdaNumber) needles.add(`mazda ${mazdaNumber[1]}`);
  return [...needles];
}

interface MazdaBuildColor {
  ref?: string;
  name?: string;
  priceDifference?: number;
  imageSrc?: string;
  imageSrc360?: string[];
  inSituImageSrc360?: string[];
  icon?: string;
  hex?: string[];
}

interface MazdaBuildPrice {
  state?: string;
  price?: number;
  disclaimer?: string;
  disclaimerHeader?: string;
}

interface MazdaBuildVariant {
  name?: string;
  modelCode?: string;
  colors?: MazdaBuildColor[];
  price?: MazdaBuildPrice[];
  children?: Array<{
    grade?: string;
    gradePrefix?: string;
    drivetrain?: string;
    fuelTankCapacity?: string;
    fuelType?: string;
    transmissionDescription?: string;
    transmissionType?: string;
    engineName?: string;
    engineSize?: string;
    maximumPower?: string;
    maximumTorque?: string;
    fuelConsumption?: string;
    features?: string[];
  }>;
}

interface MazdaBuildBodyStyle {
  name?: string;
  children?: MazdaBuildVariant[];
}

interface MazdaBuildAccessory {
  assets?: Array<{
    imageSrc?: string;
    availableModels?: Array<{
      modelCode?: string;
      colorCode?: string;
      interiorDesignCode?: string | null;
    }>;
  }>;
  applicableModels?: string[];
  category?: string;
  conflictingAccessoryTypes?: string[];
  description?: string;
  disclaimer?: string | null;
  featuredModels?: unknown;
  highlightInBuild?: boolean;
  icon?: string | null;
  imageAlt?: string | null;
  imageSrc?: string;
  isFeatured?: boolean;
  isPack?: boolean;
  isTriggerPopup?: boolean;
  media?: Array<{ imageSrc?: string; imageAlt?: string | null }>;
  name?: string;
  partNumber?: string;
  price?: number;
  priceText?: string;
  quantityRequired?: number;
  requiresAccessoryTypes?: string[];
  shortDescription?: string | null;
  sortOrder?: number;
  type?: string;
}

interface MazdaBuildProps {
  accessoryData?: {
    accessories?: MazdaBuildAccessory[];
    categories?: string[];
    description?: string;
    disclaimer?: string;
    warranty?: string;
  };
  data?: {
    children?: MazdaBuildBodyStyle[];
  };
}

function extractMazdaBuildProps(html: string): MazdaBuildProps | null {
  const start = html.indexOf('{"components":[{"name":"BuildMyMazda"');
  if (start < 0) return null;

  const json = extractJsonObjectAt(html, start);
  if (!json) return null;

  const parsed = JSON.parse(json) as { components?: Array<{ name?: string; props?: MazdaBuildProps }> };
  return parsed.components?.find(component => component.name === 'BuildMyMazda')?.props ?? null;
}

function mazdaStateDriveaways(prices?: MazdaBuildPrice[]): Record<string, number | null> {
  const row: Record<string, number | null> = {};
  for (const state of STATES) row[`driveaway_${state}`] = null;
  for (const price of prices ?? []) {
    const state = price.state?.toLowerCase();
    if (!state || !STATES.includes(state as typeof STATES[number])) continue;
    row[`driveaway_${state}`] = pf(price.price);
  }
  return row;
}

type MazdaBuildVariantDetails = NonNullable<MazdaBuildVariant['children']>[number];

interface MazdaModelKnownSpecs {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  wheelbase_mm: number;
  kerb_weight_kg: number;
  doors: number;
  seats: number;
  ancap_stars: number | null;
  airbags: number;
  towing_braked: number;
  towing_unbraked: number;
}

const MAZDA_MODEL_SPECS: Record<string, MazdaModelKnownSpecs> = {
  'mazda2': { length_mm: 4065, width_mm: 1695, height_mm: 1500, wheelbase_mm: 2570, kerb_weight_kg: 1050, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'mazda3': { length_mm: 4460, width_mm: 1795, height_mm: 1435, wheelbase_mm: 2725, kerb_weight_kg: 1354, doors: 5, seats: 5, ancap_stars: 5, airbags: 7, towing_braked: 0, towing_unbraked: 0 },
  'cx-3': { length_mm: 4275, width_mm: 1765, height_mm: 1550, wheelbase_mm: 2570, kerb_weight_kg: 1230, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'cx-5': { length_mm: 4575, width_mm: 1845, height_mm: 1680, wheelbase_mm: 2700, kerb_weight_kg: 1560, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 1800, towing_unbraked: 750 },
  'cx-60': { length_mm: 4745, width_mm: 1890, height_mm: 1680, wheelbase_mm: 2870, kerb_weight_kg: 1770, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 2000, towing_unbraked: 750 },
  'cx-70': { length_mm: 4860, width_mm: 1930, height_mm: 1690, wheelbase_mm: 2870, kerb_weight_kg: 1870, doors: 5, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 2000, towing_unbraked: 750 },
  'cx-80': { length_mm: 4990, width_mm: 1890, height_mm: 1710, wheelbase_mm: 3120, kerb_weight_kg: 1930, doors: 5, seats: 7, ancap_stars: 5, airbags: 6, towing_braked: 2500, towing_unbraked: 750 },
  'cx-90': { length_mm: 5100, width_mm: 1930, height_mm: 1745, wheelbase_mm: 3120, kerb_weight_kg: 2066, doors: 5, seats: 7, ancap_stars: 5, airbags: 6, towing_braked: 2500, towing_unbraked: 750 },
  'mx-5': { length_mm: 3915, width_mm: 1735, height_mm: 1235, wheelbase_mm: 2310, kerb_weight_kg: 1075, doors: 2, seats: 2, ancap_stars: 5, airbags: 6, towing_braked: 0, towing_unbraked: 0 },
  'bt-50': { length_mm: 5280, width_mm: 1870, height_mm: 1790, wheelbase_mm: 3125, kerb_weight_kg: 1910, doors: 4, seats: 5, ancap_stars: 5, airbags: 6, towing_braked: 3500, towing_unbraked: 750 },
};

const MAZDA_ENGINE_DETAILS: Record<string, { displacement_cc: number; cylinders: number }> = {
  'skyactiv-g-1.5': { displacement_cc: 1496, cylinders: 4 },
  'skyactiv-g-2.0': { displacement_cc: 1998, cylinders: 4 },
  'skyactiv-g-2.5': { displacement_cc: 2488, cylinders: 4 },
  'skyactiv-g-2.5t': { displacement_cc: 2488, cylinders: 4 },
  'skyactiv-d-1.8': { displacement_cc: 1759, cylinders: 4 },
  'skyactiv-d-3.3': { displacement_cc: 3283, cylinders: 6 },
  'e-skyactiv-phev-2.5': { displacement_cc: 2488, cylinders: 4 },
  'e-skyactiv-x-2.0': { displacement_cc: 1998, cylinders: 4 },
  'bt50-3.0d': { displacement_cc: 2999, cylinders: 4 },
  'bt50-2.2d': { displacement_cc: 2184, cylinders: 4 },
  'skyactiv-g-3.3t': { displacement_cc: 3283, cylinders: 6 },
};

function deriveMazdaFuelType(fuelType: unknown, engineName: unknown): string {
  const text = `${fuelType || ''} ${engineName || ''}`.toLowerCase();
  if (text.includes('phev') || text.includes('plug-in')) return 'PHEV';
  if (text.includes('hybrid') || text.includes('mhev') || text.includes('e-skyactiv')) return 'Hybrid';
  if (text.includes('diesel') || text.includes('skyactiv-d') || text.includes('skyactiv d')) return 'Diesel';
  if (text.includes('electric')) return 'Electric';
  return 'Petrol';
}

function findMazdaEngineDetails(engineName: unknown, engineSize: unknown): { displacement_cc: number; cylinders: number } | null {
  const name = String(engineName || '').toLowerCase().replace(/\s+/g, '-').replace(/[()]/g, '');
  const size = String(engineSize || '').toLowerCase().replace(/\s+/g, '');
  const sizeNum = size.replace(/l.*/, '');
  const isDiesel = name.includes('skyactiv-d') || name.includes('skyactiv-diesel') || name.includes('diesel');

  if (name.includes('bt-50') || name.includes('isuzu') || (size.startsWith('3.0') && isDiesel)) return MAZDA_ENGINE_DETAILS['bt50-3.0d'];
  if (size.startsWith('2.2') && isDiesel) return MAZDA_ENGINE_DETAILS['bt50-2.2d'];

  const isTurbo = name.includes('turbo') || name.includes('-t');
  const isPhev = name.includes('phev') || name.includes('e-skyactiv-phev');
  const isX = name.includes('skyactiv-x') || name.includes('skyactivx');
  const candidates = [
    isPhev ? `e-skyactiv-phev-${sizeNum}` : null,
    isX ? `e-skyactiv-x-${sizeNum}` : null,
    isDiesel ? `skyactiv-d-${sizeNum}` : null,
    isTurbo ? `skyactiv-g-${sizeNum}t` : null,
    `skyactiv-g-${sizeNum}`,
  ].filter((key): key is string => Boolean(key));

  for (const key of candidates) {
    if (MAZDA_ENGINE_DETAILS[key]) return MAZDA_ENGINE_DETAILS[key];
  }

  const displacementCc = parseDisplacementCc(engineSize);
  return displacementCc ? { displacement_cc: displacementCc, cylinders: displacementCc > 3000 ? 6 : 4 } : null;
}

function estimateMazdaCo2(fuelL100km: number | null, fuelType: string): number | null {
  if (fuelL100km === null) return null;
  const factor = fuelType === 'Diesel' ? 26.2 : 23.2;
  return Math.round((fuelL100km * factor) / 10) * 10;
}

function mazdaDrive(details: MazdaBuildVariantDetails, modelSlug: string): string {
  const raw = String(details.drivetrain || '').toUpperCase();
  if (raw === 'AWD' || raw === '4WD' || raw === 'RWD' || raw === 'FWD') return raw;
  if (['cx-60', 'cx-70', 'cx-80', 'cx-90'].includes(modelSlug)) return 'RWD';
  if (modelSlug === 'bt-50') return '4WD';
  return 'FWD';
}

function buildMazdaSpecsJson(details: MazdaBuildVariantDetails, modelSlug: string): SpecsJson | null {
  const known = MAZDA_MODEL_SPECS[modelSlug];
  const fuelType = deriveMazdaFuelType(details.fuelType, details.engineName);
  const fuelCombined = parseSpecWithUnit(details.fuelConsumption, /(\d+(?:\.\d+)?)\s*l\/100/i);
  const engineDetails = findMazdaEngineDetails(details.engineName, details.engineSize);
  const displacementCc = engineDetails?.displacement_cc ?? parseDisplacementCc(details.engineSize);
  const cylinders = engineDetails?.cylinders ?? null;
  const transmissionText = `${details.transmissionType || ''} ${details.transmissionDescription || ''}`;
  const specs: SpecsJson = {};

  addSpecsSection(specs, 'engine', {
    type: fuelType,
    displacement_cc: displacementCc,
    cylinders,
    power_kw: parsePowerKw(details.maximumPower),
    torque_nm: parseTorqueNm(details.maximumTorque),
  });
  addSpecsSection(specs, 'transmission', {
    type: /manual/i.test(transmissionText) ? 'Manual' : 'Automatic',
    gears: parseGears(transmissionText),
    drive: mazdaDrive(details, modelSlug),
  });
  if (known) {
    addSpecsSection(specs, 'dimensions', {
      length_mm: known.length_mm,
      width_mm: known.width_mm,
      height_mm: known.height_mm,
      wheelbase_mm: known.wheelbase_mm,
      kerb_weight_kg: known.kerb_weight_kg,
    });
    addSpecsSection(specs, 'towing', {
      braked_kg: known.towing_braked || null,
      unbraked_kg: known.towing_unbraked || null,
    });
    addSpecsSection(specs, 'capacity', {
      doors: known.doors,
      seats: known.seats,
      fuel_tank_litres: parseLitres(details.fuelTankCapacity),
    });
    addSpecsSection(specs, 'safety', {
      ancap_stars: known.ancap_stars,
      airbags: known.airbags,
    });
  }
  addSpecsSection(specs, 'performance', {
    fuel_combined_l100km: fuelCombined,
    co2_gkm: estimateMazdaCo2(fuelCombined, fuelType),
  });

  return Object.keys(specs).length ? specs : null;
}

function mazdaAccessoryImage(accessory: MazdaBuildAccessory): string | null {
  const raw = accessory.imageSrc
    ?? accessory.media?.find(item => item.imageSrc)?.imageSrc
    ?? accessory.assets?.find(item => item.imageSrc)?.imageSrc
    ?? null;
  return absolutizeMazdaUrl(raw);
}

async function syncMazda(supabase: SupabaseClient): Promise<AllOemSyncResult['mazda']> {
  const result = { colors: 0, pricing: 0, specs: 0, accessories: 0, errors: [] as string[] };
  const BASE_URL = 'https://www.mazda.com.au';
  const OEM_ID = 'mazda-au';

  const { data: products, error: productLookupErr } = await supabase
    .from('products')
    .select('id, title, external_key, variant_code, meta_json, price_amount')
    .eq('oem_id', OEM_ID);
  if (productLookupErr) {
    result.errors.push(`Mazda product lookup: ${productLookupErr.message}`);
    return result;
  }
  if (!products?.length) return result;

  const { data: dbModels, error: modelLookupErr } = await supabase
    .from('vehicle_models')
    .select('id, slug')
    .eq('oem_id', OEM_ID);
  if (modelLookupErr) {
    result.errors.push(`Mazda model lookup: ${modelLookupErr.message}`);
  }
  const modelMap = Object.fromEntries((dbModels ?? []).map(model => [model.slug, model]));

  for (const slug of MAZDA_MODELS) {
    try {
      const res = await fetch(`${BASE_URL}/build/${slug}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' },
      });
      if (!res.ok) {
        result.errors.push(`Mazda ${slug}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const props = extractMazdaBuildProps(html);
      const bodyStyles = props?.data?.children ?? [];
      if (!props || !bodyStyles.length) {
        result.errors.push(`Mazda ${slug}: BuildMyMazda payload not found`);
        continue;
      }

      const dbModel = modelMap[slug];
      const accessories = props?.accessoryData?.accessories ?? [];
      if (dbModel && accessories.length) {
        for (const [idx, accessory] of accessories.entries()) {
          const name = accessory.name?.trim();
          const externalKey = accessory.partNumber?.trim() || `${slug}-${slugify(name || `accessory-${idx}`)}`;
          if (!name && !externalKey) continue;

          const { data: dbAccessory, error: accessoryErr } = await supabase
            .from('accessories')
            .upsert({
              oem_id: OEM_ID,
              external_key: externalKey,
              name: name || externalKey,
              slug: slugify(name || externalKey),
              part_number: accessory.partNumber || null,
              category: accessory.category || null,
              price: pf(accessory.price) ?? pf(accessory.priceText?.replace(/[$,]/g, '')) ?? null,
              description_html: accessory.description || accessory.shortDescription || null,
              image_url: mazdaAccessoryImage(accessory),
              inc_fitting: 'none',
              meta_json: {
                source: 'build_my_mazda',
                source_url: `${BASE_URL}/build/${slug}`,
                applicable_models: accessory.applicableModels || [],
                assets: accessory.assets || [],
                media: accessory.media || [],
                disclaimer: accessory.disclaimer || props.accessoryData?.disclaimer || null,
                is_pack: accessory.isPack ?? false,
                type: accessory.type || null,
                quantity_required: accessory.quantityRequired ?? null,
                sort_order: accessory.sortOrder ?? idx,
                requires_accessory_types: accessory.requiresAccessoryTypes || [],
                conflicting_accessory_types: accessory.conflictingAccessoryTypes || [],
                categories: props.accessoryData?.categories || [],
              },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'oem_id,external_key' })
            .select('id')
            .single();
          if (accessoryErr) {
            result.errors.push(`Mazda accessory ${slug}/${externalKey}: ${accessoryErr.message}`);
            continue;
          }

          const { error: linkErr } = await supabase.from('accessory_models').upsert({
            accessory_id: dbAccessory.id,
            model_id: dbModel.id,
          }, { onConflict: 'accessory_id,model_id' });
          if (linkErr) {
            result.errors.push(`Mazda accessory link ${slug}/${externalKey}: ${linkErr.message}`);
          } else {
            result.accessories++;
          }
        }
      }

      let matchedProducts = 0;
      for (const bodyStyle of bodyStyles) {
        const bodyName = bodyStyle.name ?? '';
        for (const variant of bodyStyle.children ?? []) {
          const details = (variant.children?.[0] ?? {}) as MazdaBuildVariantDetails;
          const modelCode = variant.modelCode ?? '';
          const gradeName = details.grade ?? [details.gradePrefix, variant.name].filter(Boolean).join(' ');
          const shortGradeName = variant.name ?? gradeName;
          const titleNeedles = mazdaModelTitleNeedles(slug);

          const product = products.find((p) => {
            const meta = (p.meta_json ?? {}) as Record<string, unknown>;
            const title = String(p.title ?? '').toLowerCase();
            const externalKey = String(p.external_key ?? '').toLowerCase();
            const variantCode = String(p.variant_code ?? '').toLowerCase();
            const metaModelCode = String(meta.modelCode ?? meta.model_code ?? meta.variant_code ?? '').toLowerCase();
            const modelCodeLower = modelCode.toLowerCase();
            if (modelCodeLower && (
              variantCode === modelCodeLower ||
              metaModelCode === modelCodeLower ||
              externalKey.includes(modelCodeLower)
            )) return true;

            const grade = String(meta.grade ?? meta.grade_name ?? '').toLowerCase();
            const body = String(meta.body ?? meta.body_style ?? meta.bodyStyle ?? '').toLowerCase();
            const matchesGrade = [gradeName, shortGradeName]
              .filter(Boolean)
              .some(name => grade === String(name).toLowerCase() || title.includes(String(name).toLowerCase()));
            const matchesBody = !bodyName || body === bodyName.toLowerCase() || title.includes(bodyName.toLowerCase());
            const matchesModel = titleNeedles.some(needle => title.includes(needle));
            return matchesGrade && matchesBody && matchesModel;
          });
          if (!product) continue;
          matchedProducts++;

          const specsJson = buildMazdaSpecsJson(details, slug);
          if (specsJson) {
            const { error: specsErr } = await supabase.from('products')
              .update(productPatchFromSpecs(specsJson))
              .eq('id', product.id);
            if (specsErr) {
              result.errors.push(`Mazda specs ${slug}/${modelCode || gradeName}: ${specsErr.message}`);
            } else {
              result.specs++;
            }
          }

          // Update pricing
          const driveaways = mazdaStateDriveaways(variant.price);
          const displayPrice = driveaways.driveaway_vic ?? driveaways.driveaway_nsw ?? null;
          if (displayPrice) {
            const { error: pricingErr } = await supabase.from('variant_pricing').upsert({
              product_id: product.id,
              price_type: 'standard',
              rrp: null,
              ...driveaways,
              price_qualifier: 'Mazda build-and-price driveaway price',
            }, { onConflict: 'product_id,price_type' });
            if (pricingErr) {
              result.errors.push(`Mazda pricing ${slug}/${modelCode || gradeName}: ${pricingErr.message}`);
            } else {
              result.pricing++;
              if (product.price_amount !== displayPrice) {
                const { error: productUpdateErr } = await supabase.from('products').update({
                  price_amount: displayPrice,
                  price_type: 'driveaway',
                  price_qualifier: 'Mazda build-and-price driveaway price',
                }).eq('id', product.id);
                if (productUpdateErr) {
                  result.errors.push(`Mazda product price ${slug}/${modelCode || gradeName}: ${productUpdateErr.message}`);
                }
              }
            }
          }

          for (const [sortOrder, c] of (variant.colors ?? []).entries()) {
            if (!c.ref && !c.name) continue;
            const galleryUrls = [...(c.imageSrc360 ?? []), ...(c.inSituImageSrc360 ?? [])]
              .map(absolutizeMazdaUrl)
              .filter((url): url is string => Boolean(url));
            const heroUrl = absolutizeMazdaUrl(c.imageSrc) ?? galleryUrls[0] ?? null;
            const swatchUrl = absolutizeMazdaUrl(c.icon) ?? c.hex?.[0] ?? null;
            const priceDelta = pf(c.priceDifference) ?? 0;
            const { error: colorErr } = await supabase.from('variant_colors').upsert({
              product_id: product.id,
              color_code: c.ref ?? slugify(c.name ?? 'unknown'),
              color_name: c.name ?? c.ref ?? 'Unknown',
              color_type: deriveColorType(c.name ?? ''),
              is_standard: priceDelta === 0,
              swatch_url: swatchUrl,
              hero_image_url: heroUrl,
              gallery_urls: galleryUrls,
              price_delta: priceDelta,
              sort_order: sortOrder,
            }, { onConflict: 'product_id,color_code' });
            if (colorErr) {
              result.errors.push(`Mazda color ${slug}/${modelCode || gradeName}/${c.ref ?? c.name}: ${colorErr.message}`);
            } else {
              result.colors++;
            }
          }
        }
      }

      if (matchedProducts === 0) {
        result.errors.push(`Mazda ${slug}: no DB products matched BuildMyMazda variants`);
      }
    } catch (e) {
      result.errors.push(`${slug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return result;
}

// ============================================================================
// MITSUBISHI — Magento 2 GraphQL
// ============================================================================

async function syncMitsubishi(supabase: SupabaseClient): Promise<AllOemSyncResult['mitsubishi']> {
  return syncMitsubishiGraphql(supabase);
}

// ============================================================================
// VOLKSWAGEN — OneHub Offers API (complete range)
// ============================================================================

async function syncVolkswagen(supabase: SupabaseClient): Promise<AllOemSyncResult['volkswagen']> {
  const result = { products: 0, colors: 0, pricing: 0, offers: 0, errors: [] as string[] };
  const OEM_ID = 'volkswagen-au';
  const BASE_URL = 'https://www.volkswagen.com.au';

  try {
    // Find valid version (starts at 547, auto-increments)
    let version = 547;
    let data: any[] = [];
    for (let i = 0; i < 50; i++) {
      const res = await fetch(`${BASE_URL}/app/locals/get-onehub-offers?size=200&offset=0&dealer=30140&version=${version}&seperator=:`);
      const json = await res.json() as { status: string; data?: any[] };
      if (json.status === 'success' && json.data?.length) {
        data = json.data;
        break;
      }
      version++;
    }

    if (data.length === 0) {
      result.errors.push('No valid OneHub version found');
      return result;
    }

    // Ensure vehicle_models exist
    const { data: existingModels } = await supabase
      .from('vehicle_models').select('id, slug').eq('oem_id', OEM_ID);
    const modelMap: Record<string, { id: string }> = {};
    for (const m of existingModels ?? []) modelMap[m.slug] = m;

    for (const offer of data) {
      const p = offer.payload;
      if (!p?.model_family) continue;

      const modelSlug = slugify(p.model_family);
      const variantName = p.varient_name || '';
      const driveaway = pf(offer.mrdp);
      const rrp = pf(offer.mrrp);

      // Ensure model exists
      if (!modelMap[modelSlug]) {
        const { data: newModel, error: modelErr } = await supabase
          .from('vehicle_models')
          .upsert({ oem_id: OEM_ID, slug: modelSlug, name: p.model_family, source_url: `${BASE_URL}/en/models/${modelSlug}.html` }, { onConflict: 'oem_id,slug' })
          .select('id').single();
        if (modelErr) {
          result.errors.push(`VW model ${modelSlug}: ${modelErr.message}`);
          continue;
        }
        if (newModel) modelMap[modelSlug] = newModel;
      }
      if (!modelMap[modelSlug]) continue;

      // Upsert product
      const externalKey = `${OEM_ID}-${offer.model_code}`;
      const { data: prod, error: prodErr } = await supabase.from('products').upsert({
        oem_id: OEM_ID,
        external_key: externalKey,
        title: `${p.model_name} ${variantName}`.trim(),
        model_id: modelMap[modelSlug].id,
        price_amount: driveaway || rrp,
        price_type: 'driveaway',
        price_qualifier: 'Manufacturer recommended driveaway price',
        variant_name: variantName,
        variant_code: offer.model_code,
        body_type: (p.body_shape || '').toLowerCase().includes('suv') ? 'suv' : (p.body_shape || '').toLowerCase().includes('hatch') ? 'hatch' : 'suv',
        fuel_type: (p.fuel_type || '').toLowerCase().includes('electric') ? 'electric' : 'petrol',
        engine_size: p.engine_capacity || null,
        transmission: p.transmission_desc || null,
        drive: p.driven_wheels || null,
        key_features: p.features || [],
        specs_json: { engine: { description: p.engine_capacity, power_kw: p.engine_power ? parseInt(p.engine_power) : null } },
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'oem_id,external_key' }).select('id').single();

      if (prodErr) {
        result.errors.push(`VW product ${externalKey}: ${prodErr.message}`);
        continue;
      }
      if (!prod) continue;
      result.products++;

      // Pricing
      if (driveaway) {
        const { error: pricingErr } = await supabase.from('variant_pricing').upsert({
          product_id: prod.id, price_type: 'standard', rrp, ...allStates(driveaway),
        }, { onConflict: 'product_id,price_type' });
        if (pricingErr) {
          result.errors.push(`VW pricing ${externalKey}: ${pricingErr.message}`);
        } else {
          result.pricing++;
        }
      }

      // Colors
      const colours = p.colours || {};
      let sortOrder = 0;
      for (const [prcode, color] of Object.entries(colours) as [string, any][]) {
        const { error: colorErr } = await supabase.from('variant_colors').upsert({
          product_id: prod.id,
          color_code: prcode.replace(/\s/g, '-'),
          color_name: color.name || color.color,
          color_type: deriveColorType(color.name || ''),
          is_standard: color.is_default || parseInt(color.price) === 0,
          price_delta: parseInt(color.price) || 0,
          swatch_url: color.colour_tile || null,
          hero_image_url: color.images?.front || color.images?.right || null,
          gallery_urls: [color.images?.front, color.images?.right, color.images?.back, color.images?.left].filter(Boolean),
          sort_order: sortOrder++,
        }, { onConflict: 'product_id,color_code' });
        if (colorErr) {
          result.errors.push(`VW color ${externalKey}/${prcode}: ${colorErr.message}`);
        } else {
          result.colors++;
        }
      }
    }

    // Upsert offers (one per model family)
    const families = new Set<string>();
    for (const offer of data) {
      const p = offer.payload;
      if (!p?.model_family || families.has(p.model_family)) continue;
      families.add(p.model_family);

      const externalKey = `vw-onehub-${slugify(p.model_family)}`;
      const offerRow = {
        oem_id: OEM_ID,
        external_key: externalKey,
        title: `${p.model_family} — ${p.banner?.banner_heading || 'Driveaway Offer'}`,
        offer_type: 'driveaway_deal',
        price_amount: pf(offer.mrdp),
        applicable_models: [p.model_family],
        hero_image_r2_key: p.hero_image?.detail || p.hero_image?.listing || null,
        validity_start: p.banner?.banner_start_date || null,
        validity_end: p.banner?.banner_end_date || null,
        source_url: `${BASE_URL}/en/models/${slugify(p.model_family)}.html`,
        last_seen_at: new Date().toISOString(),
      };

      const { data: existingOffer, error: findOfferErr } = await supabase
        .from('offers')
        .select('id')
        .eq('oem_id', OEM_ID)
        .eq('external_key', externalKey)
        .maybeSingle();
      if (findOfferErr) {
        result.errors.push(`VW offer lookup ${externalKey}: ${findOfferErr.message}`);
        continue;
      }

      const { error: offerErr } = existingOffer
        ? await supabase.from('offers').update(offerRow).eq('id', existingOffer.id)
        : await supabase.from('offers').insert(offerRow);
      if (offerErr) {
        result.errors.push(`VW offer ${externalKey}: ${offerErr.message}`);
      } else {
        result.offers++;
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

// ============================================================================
// FIX — Auto-fallback offer images from variant_colors
// ============================================================================

async function fixOfferImages(supabase: SupabaseClient): Promise<number> {
  const { data: noImg, error: noImgErr } = await supabase
    .from('offers')
    .select('id, oem_id, applicable_models')
    .is('hero_image_r2_key', null);
  if (noImgErr) return 0;

  let fixed = 0;
  for (const offer of noImg ?? []) {
    const models = offer.applicable_models || [];
    const modelName = models[0];
    if (!modelName) continue;

    // Try matching product by model name
    const { data: products, error: productsErr } = await supabase
      .from('products')
      .select('id')
      .eq('oem_id', offer.oem_id)
      .ilike('title', `%${modelName}%`)
      .limit(1);

    if (productsErr) continue;
    if (!products?.length) continue;

    const { data: colors, error: colorsErr } = await supabase
      .from('variant_colors')
      .select('hero_image_url')
      .eq('product_id', products[0].id)
      .not('hero_image_url', 'is', null)
      .limit(1);

    if (colorsErr) continue;
    if (colors?.[0]?.hero_image_url) {
      const { error: updateErr } = await supabase
        .from('offers')
        .update({ hero_image_r2_key: colors[0].hero_image_url })
        .eq('id', offer.id);
      if (!updateErr) fixed++;
    }
  }

  return fixed;
}

// ============================================================================
// FOTON — Custom Pricing API (state-specific RDP) + Vehicles API (MLP)
// ============================================================================

const FOTON_API_KEY = 'Cdl7SZbG-swkp-VvdV-mFw2-b4P6-dJh6L8TJ';
const FOTON_BASE = 'https://www.fotonaustralia.com.au';

// Model UUIDs from Foton's CMS — maps to customPriceSelector_model_id on each PDP
const FOTON_MODELS: { modelId: string; variantIds: string[] }[] = [
  {
    modelId: 'bf7daf18-0b3e-480f-a4d1-0a3dd0933038', // Tunland
    variantIds: ['V7-4x2', 'V7-4x4', 'V9-L-4x4', 'V9-S-4x4'],
  },
  {
    modelId: '04767f3d-5332-44d3-8b8b-785c5caba2cf', // Aumark S
    variantIds: [
      '5D15-MT-SWB-CAB-CHASSIS', '5D15-MT-SWB-Tipper', '5D15-AMT-SWB-CAB-CHASSIS', '5D15-AMT-SWB-Tipper',
      '5D15-MT-MWB-CAB-CHASSIS', '5D15-MT-MWB-Tipper', '5D15-AMT-MWB-CAB-CHASSIS', '5D15-AMT-MWB-Tipper',
      '6D15-MT-SWB-CAB-CHASSIS', '6D15-MT-SWB-Tipper', '6D15-AMT-SWB-CAB-CHASSIS', '6D15-AMT-SWB-Tipper',
      '6D15-MT-MWB-CAB-CHASSIS', '6D15-MT-MWB-Tipper', '6D15-AMT-MWB-CAB-CHASSIS', '6D15-AMT-MWB-Tipper',
      '8D15-MT-CAB-CHASSIS', '8D15-MT-Tipper', '8D15-AMT-CAB-CHASSIS', '8D15-AMT-Tipper',
      '9D15-MT-CAB-CHASSIS', '9D15-MT-Tipper', '9D15-AMT-CAB-CHASSIS', '9D15-AMT-Tipper',
    ],
  },
];

// Capital city postcodes used to get representative state driveaway prices
const STATE_POSTCODES: Record<string, string> = {
  nsw: '2000', vic: '3000', qld: '4000', wa: '6000',
  sa: '5000', tas: '7000', act: '2600', nt: '0800',
};

interface FotonVariantPrice {
  vehicleVariantId: string;
  variantName: string;
  mlp: number;
  vehicleDriveAwayPrice: number;
}

async function fetchFotonPricing(
  modelId: string, variantIds: string[], postCode: string,
): Promise<FotonVariantPrice[]> {
  const res = await fetch(`${FOTON_BASE}/api/v1/custompricing/vehicles`, {
    method: 'POST',
    headers: { 'Api-Key': FOTON_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ postCode, modelId, variantIds, colorIndex: 0 }),
  });
  if (!res.ok) return [];
  const data = await res.json() as { vehicleVariants?: FotonVariantPrice[] };
  return data.vehicleVariants ?? [];
}

// Foton color dot extraction — matches HTML like:
// <div class="colours_wrapper__colourDots__dot" label="FLARE WHITE" image="/media/..." style="background-color:#fff">
const FOTON_VARIANT_PATTERNS: Record<string, string> = {
  'v7-c-4x2': 'v7 c 4x2', 'v7-4x2': 'v7 c 4x2',
  'v7-c-4x4': 'v7 c 4x4', 'v7-4x4': 'v7 c 4x4',
  'v9-l-4x4': 'v9 l 4x4', 'v9-s-4x4': 'v9 s 4x4',
};

async function scrapeFotonColors(
  supabase: SupabaseClient,
  tunlandProducts: Array<{ id: string; title: string }>,
  html: string,
): Promise<number> {
  let count = 0;
  try {
    // Extract color dot elements with label, image, bg-color
    const dotRegex = /<div\s[^>]*colours_wrapper__colourDots__dot[^>]*>/gi;
    const dots = [...html.matchAll(dotRegex)];
    if (!dots.length) return 0;

    for (const [tag] of dots) {
      const label = tag.match(/\blabel="([^"]*)"/)?.[1];
      const image = tag.match(/\bimage="([^"]*)"/)?.[1];
      const bgHex = tag.match(/background-color:\s*([^;"]+)/)?.[1]?.trim();
      if (!label || !image) continue;

      // Detect variant from image URL
      const imgLower = image.toLowerCase();
      let variantKey: string | null = null;
      for (const [pattern, key] of Object.entries(FOTON_VARIANT_PATTERNS)) {
        if (imgLower.includes(pattern)) { variantKey = key; break; }
      }
      if (!variantKey) continue;
      const matchKey = variantKey;

      // Match to product by title
      const product = tunlandProducts.find(p => p.title.toLowerCase().includes(matchKey));
      if (!product) continue;

      const colorName = label.replace(/\*$/, '').trim();
      const isPremium = label.includes('*');
      const colorCode = colorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const { error } = await supabase.from('variant_colors').upsert({
        product_id: product.id,
        color_code: colorCode,
        color_name: colorName,
        color_type: isPremium ? 'premium' : 'solid',
        is_standard: !isPremium,
        price_delta: isPremium ? 690 : 0,
        swatch_url: bgHex || null,
        hero_image_url: `${FOTON_BASE}${image}?width=1920`,
      }, { onConflict: 'product_id,color_code' });

      if (!error) count++;
    }
  } catch (e) {
    console.warn('[syncFoton] Color scrape failed:', e);
  }
  return count;
}

async function scrapeFotonAumarkWhite(
  supabase: SupabaseClient,
  aumarkProducts: Array<{ id: string; title: string }>,
  html: string,
): Promise<number> {
  let count = 0;
  try {
    // Extract variant names and hero images in page order
    const variantNames = [...html.matchAll(/versionCar">([^<]+)</g)].map(m => m[1].trim().toLowerCase());
    const heroImages = [...html.matchAll(/showcase_container__iframe"[^>]*src="([^"]+)"/g)].map(m => `${FOTON_BASE}${m[1]}${m[1].includes('?') ? '&' : '?'}width=1920`);

    const variantToImage = new Map<string, string>();
    for (let i = 0; i < variantNames.length && i < heroImages.length; i++) {
      variantToImage.set(variantNames[i], heroImages[i]);
    }

    for (const product of aumarkProducts) {
      const heroUrl = variantToImage.get(product.title.toLowerCase()) || null;
      const { error } = await supabase.from('variant_colors').upsert({
        product_id: product.id,
        color_code: 'white',
        color_name: 'White',
        color_type: 'solid',
        is_standard: true,
        price_delta: 0,
        hero_image_url: heroUrl,
      }, { onConflict: 'product_id,color_code' });
      if (!error) count++;
    }
  } catch (e) {
    console.warn('[syncFoton] Aumark S color scrape failed:', e);
  }
  return count;
}

async function syncFotonBrochures(
  supabase: SupabaseClient,
  allProducts: Array<{ id: string; title: string }>,
  tunlandHtml: string,
  aumarkHtml: string,
): Promise<string[]> {
  const errors: string[] = [];
  try {

    // Extract variant→PDF from page HTML (variant name appears before its PDF link)
    function extractBrochureMap(html: string): Map<string, string> {
      const map = new Map<string, string>();
      const parts = html.split('versionCar">');
      for (let i = 1; i < parts.length; i++) {
        const name = parts[i].match(/^([^<]+)/)?.[1]?.trim().toLowerCase();
        const pdf = parts[i].match(/href="([^"]*\.pdf)"/)?.[1];
        if (name && pdf) {
          map.set(name, pdf.startsWith('http') ? pdf : `${FOTON_BASE}${pdf}`);
        }
      }
      return map;
    }

    const tunlandMap = extractBrochureMap(tunlandHtml);
    const aumarkMap = extractBrochureMap(aumarkHtml);

    // Also extract warranty/roadside PDFs
    const tunlandWarranty = tunlandHtml.match(/href="([^"]*roadside[^"]*\.pdf)"/i)?.[1];
    const aumarkWarranty = aumarkHtml.match(/href="([^"]*warranty[^"]*\.pdf)"/i)?.[1];

    for (const product of allProducts) {
      const title = product.title.toLowerCase();
      const isTunland = title.includes('tunland');
      const brochureUrl = isTunland
        ? tunlandMap.get(title.replace('tunland ', ''))
        : aumarkMap.get(title);
      if (!brochureUrl) continue;

      const ctaLinks: Array<{ label: string; url: string; type: string }> = [
        { label: isTunland ? 'Download Brochure' : 'Spec Sheet', url: brochureUrl, type: 'brochure' },
      ];
      const warrantyPdf = isTunland ? tunlandWarranty : aumarkWarranty;
      if (warrantyPdf) {
        const url = warrantyPdf.startsWith('http') ? warrantyPdf : `${FOTON_BASE}${warrantyPdf}`;
        ctaLinks.push({
          label: isTunland ? 'Roadside Assistance Program' : 'Warranty & Service Handbook',
          url, type: 'warranty',
        });
      }

      // Merge with existing cta_links — preserve non-brochure/warranty entries from other sources
      const { data: existing, error: existingErr } = await supabase
        .from('products')
        .select('cta_links')
        .eq('id', product.id)
        .single();
      if (existingErr) {
        errors.push(`Foton brochure links lookup ${product.title}: ${existingErr.message}`);
        continue;
      }
      const existingLinks = (existing?.cta_links as Array<{ label: string; url: string; type: string }>) || [];
      const otherLinks = existingLinks.filter(l => l.type !== 'brochure' && l.type !== 'warranty');
      const { error: updateErr } = await supabase
        .from('products')
        .update({ cta_links: [...otherLinks, ...ctaLinks] })
        .eq('id', product.id);
      if (updateErr) {
        errors.push(`Foton brochure links update ${product.title}: ${updateErr.message}`);
      }
    }

    // Refresh vehicle_models.brochure_url so PDF spec extraction stays unbroken
    // when Foton's Umbraco CMS rotates media filenames (same GUID, new filename).
    // Tunland: all variants share one full spec sheet. Aumark S: pick the 5D15
    // cab chassis variant to match the existing canonical convention.
    const modelBrochures: Record<string, string | undefined> = {
      'tunland': [...tunlandMap.values()][0],
      'aumark-s': aumarkMap.get('5d15 mt swb cab chassis') ?? [...aumarkMap.values()][0],
    };
    const { data: fotonModels, error: modelLookupErr } = await supabase
      .from('vehicle_models')
      .select('id, slug, brochure_url')
      .eq('oem_id', 'foton-au');
    if (modelLookupErr) {
      errors.push(`Foton model brochure lookup: ${modelLookupErr.message}`);
      return errors;
    }
    for (const m of fotonModels ?? []) {
      const fresh = modelBrochures[m.slug as string];
      if (!fresh || fresh === m.brochure_url) continue;
      const { error: modelUpdateErr } = await supabase
        .from('vehicle_models')
        .update({ brochure_url: fresh, extracted_specs: null, extracted_specs_at: null })
        .eq('id', m.id);
      if (modelUpdateErr) {
        errors.push(`Foton model brochure update ${m.slug}: ${modelUpdateErr.message}`);
        continue;
      }
      // Stale embeddings reference the old PDF — drop them so re-vectorize picks up the new one
      const { error: embeddingDeleteErr } = await supabase.from('pdf_embeddings').delete()
        .eq('source_id', m.id).eq('source_type', 'brochure');
      if (embeddingDeleteErr) {
        errors.push(`Foton brochure embedding cleanup ${m.slug}: ${embeddingDeleteErr.message}`);
      }
      console.log(`[syncFoton] Refreshed brochure_url for ${m.slug}: ${fresh}`);
    }
  } catch (e) {
    errors.push(`Foton brochure scrape failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return errors;
}

async function syncFoton(supabase: SupabaseClient): Promise<AllOemSyncResult['foton']> {
  const result = { products: 0, colors: 0, pricing: 0, errors: [] as string[] };
  const OEM_ID = 'foton-au';

  try {
    const { data: dbProducts } = await supabase
      .from('products').select('id, title, price_amount').eq('oem_id', OEM_ID);
    if (!dbProducts?.length) { result.errors.push('No Foton products in DB'); return result; }

    // Fetch both pages once, pass HTML to helpers (avoids duplicate fetches)
    const [tunlandRes, aumarkRes] = await Promise.all([
      fetch(`${FOTON_BASE}/ute/tunland/`).catch(() => null),
      fetch(`${FOTON_BASE}/trucks/series/aumark-s/`).catch(() => null),
    ]);
    const tunlandHtml = tunlandRes?.ok ? await tunlandRes.text() : '';
    const aumarkHtml = aumarkRes?.ok ? await aumarkRes.text() : '';

    // Sync Tunland colors from Foton website (8 colors per variant)
    const tunlandProducts = dbProducts.filter(p => p.title.toLowerCase().includes('tunland'));
    if (tunlandHtml) result.colors = await scrapeFotonColors(supabase, tunlandProducts, tunlandHtml);

    // Aumark S trucks come in white only — scrape hero images from the series page
    const aumarkProducts = dbProducts.filter(p => !p.title.toLowerCase().includes('tunland'));
    if (aumarkHtml) result.colors += await scrapeFotonAumarkWhite(supabase, aumarkProducts, aumarkHtml);

    // Sync brochure/spec sheet links from both pages
    if (tunlandHtml || aumarkHtml) {
      result.errors.push(...await syncFotonBrochures(supabase, dbProducts, tunlandHtml, aumarkHtml));
    }

    // Build a map from variant name → product id (normalise to match API response)
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const productByName = new Map(dbProducts.map(p => [normalise(p.title), p]));

    for (const model of FOTON_MODELS) {
      // Fetch pricing for all 8 states
      const stateData: Record<string, FotonVariantPrice[]> = {};
      for (const [state, postCode] of Object.entries(STATE_POSTCODES)) {
        stateData[state] = await fetchFotonPricing(model.modelId, model.variantIds, postCode);
      }

      // Use NSW as the canonical list of variants
      const nswVariants = stateData.nsw;
      if (!nswVariants?.length) {
        result.errors.push(`No pricing returned for model ${model.modelId}`);
        continue;
      }

      for (const variant of nswVariants) {
        const product = productByName.get(normalise(variant.variantName));
        if (!product) {
          result.errors.push(`No DB product for "${variant.variantName}"`);
          continue;
        }

        // Build state driveaway columns
        const driveaways: Record<string, number | null> = {};
        for (const state of STATES) {
          const sv = stateData[state]?.find(v => v.vehicleVariantId === variant.vehicleVariantId);
          driveaways[`driveaway_${state}`] = sv ? Math.round(sv.vehicleDriveAwayPrice) : null;
        }

        // Upsert variant_pricing with state-specific driveaway prices
        const { error } = await supabase.from('variant_pricing').upsert({
          product_id: product.id,
          price_type: 'standard',
          rrp: variant.mlp,
          ...driveaways,
        }, { onConflict: 'product_id,price_type' });

        if (error) { result.errors.push(`Pricing upsert error: ${error.message}`); continue; }
        result.pricing++;

        const nswDriveaway = driveaways.driveaway_nsw ?? null;
        const vicDriveaway = driveaways.driveaway_vic ?? null;
        const apiDriveaway = variant.vehicleDriveAwayPrice
          ? Math.round(variant.vehicleDriveAwayPrice)
          : null;
        const displayPrice = nswDriveaway ?? vicDriveaway ?? apiDriveaway ?? variant.mlp;

        // Keep MLP in variant_pricing.rrp; products.price_amount should display a driveaway price where available.
        if (product.price_amount !== displayPrice) {
          const { error: productErr } = await supabase.from('products').update({
            price_amount: displayPrice,
            price_type: 'driveaway',
            price_qualifier: displayPrice === variant.mlp ? 'Manufacturer list price' : 'Drive away price',
          }).eq('id', product.id);
          if (productErr) {
            result.errors.push(`Product price update error for ${variant.variantName}: ${productErr.message}`);
          } else {
            result.products++;
          }
        }
      }
    }
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}

// ============================================================================
// GWM — Storyblok CDN
// ============================================================================

const GWM_STORYBLOK_BASE = 'https://api.storyblok.com/v2/cdn/stories';
const GWM_STORYBLOK_TOKEN = 'rII785g9nG3hemzhYNQvQwtt';
const GWM_HEADERS = { Origin: 'https://www.gwmanz.com', Referer: 'https://www.gwmanz.com/' };
const GWM_SB_MODELS = ['cannon', 'cannon-alpha', 'tank-300', 'tank-500', 'haval-h6', 'haval-jolion', 'haval-h6gt', 'haval-h7', 'ora'];
const GWM_SB_TO_DB: Record<string, string> = {
  cannon: 'cannon',
  'cannon-alpha': 'cannon',
  'tank-300': 'tank-300',
  'tank-500': 'tank-500',
  'haval-h6': 'haval-h6',
  'haval-jolion': 'haval-jolion',
  'haval-h6gt': 'haval-h6',
  'haval-h7': 'haval-h7',
  ora: 'ora',
};

interface GwmStory {
  name: string;
  slug: string;
  full_slug: string;
  content?: Record<string, any>;
}

interface GwmStoryblokResponse {
  stories?: GwmStory[];
}

interface GwmVariantStory {
  story: GwmStory;
  modelSlug: string;
  name: string;
  code: string | null;
  retailPrice: number | null;
  abnPrice: number | null;
  imageUrl: string | null;
}

function gwmStoryblokUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams({
    token: GWM_STORYBLOK_TOKEN,
    version: 'published',
    language: 'au',
    ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
  });
  return `${GWM_STORYBLOK_BASE}?${search.toString()}`;
}

async function fetchGwmStories(params: Record<string, string | number>): Promise<GwmStory[]> {
  const res = await fetch(gwmStoryblokUrl(params), { headers: GWM_HEADERS });
  if (!res.ok) throw new Error(`Storyblok HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json() as GwmStoryblokResponse;
  return json.stories ?? [];
}

async function fetchGwmVariants(): Promise<GwmVariantStory[]> {
  const variants: GwmVariantStory[] = [];
  for (let page = 1; page <= 10; page++) {
    const stories = await fetchGwmStories({
      starts_with: 'car-configurator/models/',
      'filter_query[component][in]': 'AUModel',
      per_page: 100,
      page,
    });
    for (const story of stories) {
      const content = story.content ?? {};
      const pathParts = story.full_slug.split('/');
      variants.push({
        story,
        modelSlug: pathParts[2] || 'unknown',
        name: content.name || story.name,
        code: content.code || null,
        retailPrice: pf(content.driveaway_retail_price),
        abnPrice: pf(content.driveaway_abn_price),
        imageUrl: typeof content.image === 'object' ? content.image?.filename || null : content.image || null,
      });
    }
    if (stories.length < 100) break;
  }
  return variants;
}

function normalizeGwmName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b20\d{2}\b/g, '')
    .replace(/driveaway/g, '')
    .replace(/single cc/g, 'single cab')
    .replace(/dual cc/g, 'dual cab')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function gwmMatchScore(productText: string, variantText: string): number {
  if (!productText || !variantText) return 0;
  if (productText === variantText) return 1;
  if (productText.includes(variantText) || variantText.includes(productText)) return 0.9;
  const productWords = new Set(productText.split(' ').filter(word => word.length > 1));
  const variantWords = variantText.split(' ').filter(word => word.length > 1);
  if (!productWords.size || !variantWords.length) return 0;
  const matches = variantWords.filter(word => productWords.has(word)).length;
  return matches / Math.max(productWords.size, variantWords.length);
}

function gwmImageUrls(entries: any[] | undefined): string[] {
  return (entries ?? [])
    .flatMap(entry => (entry.images ?? []).map((image: any) => image?.filename))
    .filter((url: unknown): url is string => typeof url === 'string' && !!url);
}

function gwmColorRows(content: Record<string, any>): Array<{ name: string; hero: string | null; gallery: string[] }> {
  const colors = new Map<string, { name: string; hero: string | null; gallery: string[] }>();
  const sources = [
    ...(content.colours ?? []),
    ...(content.coloursZoomed ?? []),
    ...(content.coloursProportional ?? []),
  ];

  for (const color of sources) {
    const name = color?.name;
    if (!name) continue;
    const code = slugify(name);
    const gallery = gwmImageUrls([color]);
    const existing = colors.get(code) ?? { name, hero: null, gallery: [] };
    existing.gallery = [...new Set([...existing.gallery, ...gallery])];
    existing.hero = existing.hero || gallery[0] || null;
    colors.set(code, existing);
  }

  return [...colors.values()];
}

async function fetchGwmAccessoryStories(sbModel: string): Promise<GwmStory[]> {
  const allStories: GwmStory[] = [];
  for (let page = 1; page <= 5; page++) {
    const stories = await fetchGwmStories({
      by_slugs: `car-configurator/models/${sbModel}/accessories/**`,
      per_page: 100,
      page,
    });
    allStories.push(...stories);
    if (stories.length < 100) break;
  }
  return allStories;
}

async function syncGwm(supabase: SupabaseClient): Promise<AllOemSyncResult['gwm']> {
  const result = { pricing: 0, colors: 0, accessories: 0, accessoryLinks: 0, unmatched: 0, errors: [] as string[] };
  const OEM_ID = 'gwm-au';

  const { data: products, error: productErr } = await supabase
    .from('products')
    .select('id, model_id, title, external_key, variant_code, price_amount, primary_image_r2_key, meta_json')
    .eq('oem_id', OEM_ID);
  const { data: models, error: modelErr } = await supabase
    .from('vehicle_models')
    .select('id, slug, name')
    .eq('oem_id', OEM_ID);
  if (productErr) result.errors.push(`GWM product lookup: ${productErr.message}`);
  if (modelErr) result.errors.push(`GWM model lookup: ${modelErr.message}`);
  if (productErr || modelErr) return result;

  const dbProducts = products ?? [];
  const modelById = Object.fromEntries((models ?? []).map(model => [model.id, model]));
  const modelBySlug = Object.fromEntries((models ?? []).map(model => [model.slug, model]));

  let variants: GwmVariantStory[] = [];
  try {
    variants = await fetchGwmVariants();
  } catch (error) {
    result.errors.push(`GWM Storyblok variants: ${error instanceof Error ? error.message : String(error)}`);
    return result;
  }

  for (const variant of variants) {
    const variantNorm = normalizeGwmName(variant.name);
    let bestProduct: any = null;
    let bestScore = 0;

    for (const product of dbProducts) {
      const model = product.model_id ? modelById[product.model_id] : null;
      const mappedDbSlug = GWM_SB_TO_DB[variant.modelSlug] || variant.modelSlug;
      const modelMatches = !model || model.slug === mappedDbSlug || (mappedDbSlug === 'cannon' && model.slug === 'ute');
      if (!modelMatches) continue;

      const meta = (product.meta_json ?? {}) as Record<string, unknown>;
      const identifiers = [product.external_key, product.variant_code, meta.code, meta.nvicCode, meta.nvic_code]
        .map(value => normalizeGwmName(value))
        .filter(Boolean);
      const codeNorm = normalizeGwmName(variant.code);
      const idScore = codeNorm && identifiers.some(id => id.includes(codeNorm) || codeNorm.includes(id)) ? 1 : 0;
      const titleScore = gwmMatchScore(normalizeGwmName(product.title), variantNorm);
      const score = Math.max(idScore, titleScore);
      if (score > bestScore) {
        bestScore = score;
        bestProduct = product;
      }
    }

    if (!bestProduct || bestScore < 0.55) {
      result.unmatched++;
      continue;
    }

    const retail = variant.retailPrice ?? variant.abnPrice;
    if (retail) {
      const { error: pricingErr } = await supabase.from('variant_pricing').upsert({
        product_id: bestProduct.id,
        price_type: 'standard',
        rrp: null,
        ...allStates(retail),
        price_qualifier: 'GWM Storyblok retail driveaway',
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'product_id,price_type' });
      if (pricingErr) {
        result.errors.push(`GWM pricing ${variant.name}: ${pricingErr.message}`);
      } else {
        result.pricing++;
        const productPatch: Record<string, unknown> = {};
        if (bestProduct.price_amount !== retail) {
          Object.assign(productPatch, {
            price_amount: retail,
            price_type: 'driveaway',
            price_qualifier: 'GWM Storyblok retail driveaway',
          });
        }
        if (variant.imageUrl && !bestProduct.primary_image_r2_key) {
          productPatch.primary_image_r2_key = variant.imageUrl;
        }
        if (Object.keys(productPatch).length > 0) {
          const { error: productUpdateErr } = await supabase.from('products').update(productPatch).eq('id', bestProduct.id);
          if (productUpdateErr) result.errors.push(`GWM product price ${variant.name}: ${productUpdateErr.message}`);
        }
      }
    }

    const colors = gwmColorRows(variant.story.content ?? {});
    for (let index = 0; index < colors.length; index++) {
      const color = colors[index];
      const { error: colorErr } = await supabase.from('variant_colors').upsert({
        product_id: bestProduct.id,
        color_code: slugify(color.name),
        color_name: color.name,
        color_type: deriveColorType(color.name),
        is_standard: true,
        price_delta: 0,
        hero_image_url: color.hero,
        gallery_urls: color.gallery,
        sort_order: index,
      }, { onConflict: 'product_id,color_code' });
      if (colorErr) {
        result.errors.push(`GWM color ${variant.name}/${color.name}: ${colorErr.message}`);
      } else {
        result.colors++;
      }
    }
  }

  const accessoryRows = new Map<string, { row: Record<string, unknown>; modelIds: Set<string> }>();
  for (const sbModel of GWM_SB_MODELS) {
    const dbSlug = GWM_SB_TO_DB[sbModel];
    const dbModel = modelBySlug[dbSlug] || (dbSlug === 'cannon' ? modelBySlug.ute : null);
    try {
      const stories = await fetchGwmAccessoryStories(sbModel);
      for (const story of stories) {
        const content = story.content ?? {};
        const code = content.code || story.slug.toUpperCase();
        if (!code) continue;
        const externalKey = `${OEM_ID}-${code}`;
        const existing = accessoryRows.get(externalKey) ?? {
          row: {
            oem_id: OEM_ID,
            external_key: externalKey,
            name: content.name || story.name,
            slug: slugify(content.name || story.name),
            description_html: typeof content.description === 'string' ? content.description : '',
            part_number: code,
            price: pf(content.price),
            category: story.full_slug.split('/accessories/')[1]?.split('/')[0] || 'general',
            image_url: content.image?.filename || null,
            meta_json: {
              storyblok_slug: story.full_slug,
              source: 'gwm_storyblok',
            },
          },
          modelIds: new Set<string>(),
        };
        if (dbModel?.id) existing.modelIds.add(dbModel.id);
        accessoryRows.set(externalKey, existing);
      }
    } catch (error) {
      result.errors.push(`GWM accessories ${sbModel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (accessoryRows.size) {
    const rows = [...accessoryRows.values()].map(entry => entry.row);
    const { data: upserted, error: accessoryErr } = await supabase
      .from('accessories')
      .upsert(rows, { onConflict: 'oem_id,external_key' })
      .select('id, external_key');
    if (accessoryErr) {
      result.errors.push(`GWM accessory upsert: ${accessoryErr.message}`);
    } else {
      result.accessories = upserted?.length ?? 0;
      const idByExternalKey = Object.fromEntries((upserted ?? []).map(row => [row.external_key, row.id]));
      const joinRows: Array<{ accessory_id: string; model_id: string }> = [];
      for (const [externalKey, entry] of accessoryRows) {
        const accessoryId = idByExternalKey[externalKey];
        if (!accessoryId) continue;
        for (const modelId of entry.modelIds) joinRows.push({ accessory_id: accessoryId, model_id: modelId });
      }
      if (joinRows.length) {
        const { error: joinErr } = await supabase
          .from('accessory_models')
          .upsert(joinRows, { onConflict: 'accessory_id,model_id' });
        if (joinErr) {
          result.errors.push(`GWM accessory links: ${joinErr.message}`);
        } else {
          result.accessoryLinks = joinRows.length;
        }
      }
    }
  }

  return result;
}

// ============================================================================
// GAC — Official signed API
// ============================================================================

const GAC_API_BASE = 'https://eu-www-api.gacgroup.com/gateway/v1/www/api';
const GAC_APP_ID = 'fe-official';
const GAC_SIGN_SECRET = 'fe-official-450etarvpz';
const GAC_CDN = 'https://eu-www-resouce-cdn.gacgroup.com/static/AU/tenant/cms/common';

const GAC_MODELS = [
  {
    vehSeriesCode: 'aion-v',
    vehStyleCode: '2024',
    vehStyleId: 10,
    name: 'AION V',
    body_type: 'SUV',
    category: 'suv',
    fuel: 'electric',
    slug: 'aion-v',
    source_url: 'https://www.gacgroup.com/en-au/suv/aion-v',
    is_active: true,
  },
  {
    vehSeriesCode: 'm8-phev',
    vehStyleCode: '2024',
    vehStyleId: 11,
    name: 'M8 PHEV',
    body_type: 'MPV',
    category: 'mpv',
    fuel: 'plug-in hybrid',
    slug: 'm8-phev',
    source_url: 'https://www.gacgroup.com/en-au/mpv/gac-m8-phev',
    is_active: true,
  },
  {
    vehSeriesCode: 'emzoom',
    vehStyleCode: '2024',
    vehStyleId: 12,
    name: 'EMZOOM',
    body_type: 'SUV',
    category: 'suv',
    fuel: 'petrol',
    slug: 'emzoom',
    source_url: 'https://www.gacgroup.com/en-au/suv/gac-emzoom',
    is_active: true,
  },
  {
    vehSeriesCode: 'aion-ut',
    vehStyleCode: '2025',
    vehStyleId: 13,
    name: 'AION UT',
    body_type: 'Hatch',
    category: 'hatch',
    fuel: 'electric',
    slug: 'aion-ut',
    source_url: 'https://www.gacgroup.com/en-au/hatchback/aion-ut',
    is_active: false,
  },
] as const;

interface GacApiResponse<T> {
  success?: boolean;
  code?: string | number;
  msg?: string;
  data?: T;
}

interface GacConfigResponse {
  vehicleModels?: Array<{
    vehModelId?: string | number;
    vehModelName?: string;
    salePrice?: string | number;
  }>;
  configs?: Array<{
    name?: string;
    content?: Array<{
      name?: string;
      content?: Array<string | number | null>;
    }>;
  }>;
}

interface GacPriceResponse {
  vehicleModels?: Array<{
    id?: string | number;
    name?: string;
    salePrice?: string | number;
    picUrlList?: string[];
  }>;
}

interface GacOptionalResponse {
  list?: Array<{
    optionalId?: string | number;
    name?: string;
    selectPicUrl?: string;
  }>;
}

interface GacPanoramaResponse {
  list?: Array<{
    picUrl?: string;
  }>;
}

interface GacColor {
  name: string;
  swatchUrl: string | null;
  heroUrl: string | null;
  galleryUrls?: string[];
  isStandard: boolean;
  priceDelta: number;
}

const GAC_SECTION_MAP: Record<string, string> = {
  EXTERIOR: 'exterior',
  INTERIOR: 'interior',
  SAFETY: 'safety',
  'ACTIVE AND PASSIVE SAFETY': 'safety',
  'COMFORT AND CONVENIENCE': 'comfort',
  SEATS: 'seats',
  'ENTERTAINMENT AND TECHNOLOGY': 'technology',
  'Entertainment and Technology': 'technology',
  'DRIVING ASSISTANCE': 'safety',
  'Driving Assistance': 'safety',
  'Battery and Range': 'battery',
  'Emission Level': 'engine',
};

const GAC_BASIC_INFO_RULES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /length|width|height|wheelbase|ground clearance|turning|curb weight/i, category: 'dimensions' },
  { pattern: /power|torque|horsepower|engine|displacement|emission/i, category: 'engine' },
  { pattern: /top speed|fuel consumption|vehicle consumption/i, category: 'performance' },
  { pattern: /seating|trunk|luggage|cargo|fuel tank|roof load/i, category: 'capacity' },
  { pattern: /drive mode|drivetrain|transmission|steering/i, category: 'transmission' },
  { pattern: /brake|suspension/i, category: 'chassis' },
  { pattern: /charging/i, category: 'battery' },
];

function classifyGacBasicItem(name: string): string {
  for (const rule of GAC_BASIC_INFO_RULES) {
    if (rule.pattern.test(name)) return rule.category;
  }
  return 'dimensions';
}

function parseGacSpecs(configs: GacConfigResponse['configs'], variantIndex: number): Record<string, Record<string, string | number>> | null {
  const specs: Record<string, Record<string, string | number>> = {};
  for (const section of configs ?? []) {
    for (const item of section.content ?? []) {
      const itemName = item.name?.trim();
      if (!itemName) continue;
      const value = item.content?.[variantIndex] ?? item.content?.[0];
      if (value === null || value === undefined) continue;
      const valueText = String(value).trim();
      if (!valueText || valueText === '-' || valueText === '—' || valueText === '——' || valueText === '━') continue;

      const sectionName = section.name ?? '';
      const category = sectionName === 'BASIC INFORMATION'
        ? classifyGacBasicItem(itemName)
        : (GAC_SECTION_MAP[sectionName] || slugify(sectionName || 'specs'));

      if (!specs[category]) specs[category] = {};
      specs[category][itemName] = value;
    }
  }
  return Object.keys(specs).length ? specs : null;
}

async function gacHmacSha256Upper(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(GAC_SIGN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function gacHeaders(method: 'get' | 'post', body?: unknown, params?: Record<string, string | number>): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const requestId = crypto.randomUUID();
  const parts: string[] = [];

  if (method === 'post' && body !== undefined) {
    parts.push(`body${JSON.stringify(body) || ''}`);
  }
  if (method === 'get' && params) {
    for (const key of Object.keys(params)) parts.push(`${key}${params[key]}`);
  }
  parts.push(`fnc-app-id${GAC_APP_ID}`);
  parts.push(`fnc-requestId${requestId}`);
  parts.push(`fnc-timestamp${timestamp}`);
  parts.sort();

  return {
    'fnc-app-id': GAC_APP_ID,
    'fnc-requestId': requestId,
    'fnc-timestamp': timestamp,
    sig: await gacHmacSha256Upper(parts.join('')),
    locale: 'en',
    region: 'AU',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function gacPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GAC_API_BASE}${path}`, {
    method: 'POST',
    headers: await gacHeaders('post', body),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json() as GacApiResponse<T>;
  if (json.success === false) throw new Error(`${json.msg || 'API error'} (${json.code ?? 'unknown'})`);
  if (json.data === undefined) throw new Error('Missing data payload');
  return json.data;
}

function classifyGacColorType(name: string): string {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('pearl')) return 'pearl';
  if (lowerName.includes('metallic') || lowerName.includes('silver') || lowerName.includes('grey')) return 'metallic';
  if (lowerName.includes('matte')) return 'matte';
  return 'solid';
}

async function fetchGacAionVColors(): Promise<GacColor[]> {
  const data = await gacPost<GacOptionalResponse>('/showroom/vehicle/query/optional', { vehStyleId: 10, opCategoryType: 'color' });
  const colors: GacColor[] = [];
  for (const color of data.list ?? []) {
    if (!color.name) continue;
    let heroUrl: string | null = null;
    let galleryUrls: string[] = [];
    if (color.optionalId !== undefined && color.optionalId !== null) {
      try {
        const panorama = await gacPost<GacPanoramaResponse>('/showroom/vehicle/query/panorama', {
          vehStyleId: 10,
          colorOptionalId: color.optionalId,
        });
        galleryUrls = (panorama.list ?? []).map(image => image.picUrl).filter((url): url is string => Boolean(url));
        heroUrl = galleryUrls[0] ?? null;
      } catch {
        heroUrl = null;
      }
    }
    colors.push({
      name: color.name,
      swatchUrl: color.selectPicUrl ?? null,
      heroUrl,
      galleryUrls,
      isStandard: color.name.toLowerCase() === 'arctic white',
      priceDelta: color.name.toLowerCase() === 'arctic white' ? 0 : 600,
    });
  }
  return colors;
}

function gacStaticColors(modelSlug: string): GacColor[] {
  if (modelSlug === 'emzoom') {
    return [
      { name: 'White', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769045691607-白色.webp`, isStandard: true, priceDelta: 0 },
      { name: 'Silver', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769047348538-银灰.webp`, isStandard: false, priceDelta: 600 },
      { name: 'Light Grey', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769047396637-浅灰.webp`, isStandard: false, priceDelta: 600 },
      { name: 'Graphene Grey', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769047533165-深灰.webp`, isStandard: false, priceDelta: 600 },
      { name: 'Black', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769047619905-黑色.webp`, isStandard: false, priceDelta: 600 },
      { name: 'Galaxy Lilac', swatchUrl: `${GAC_CDN}/202601/1769047695385-车型颜色-紫色.webp`, heroUrl: `${GAC_CDN}/202601/1769047700672-m-紫色.webp`, isStandard: false, priceDelta: 600 },
      { name: 'Red', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769047749118-红色.webp`, isStandard: false, priceDelta: 600 },
    ];
  }

  if (modelSlug === 'm8-phev') {
    return [
      { name: 'White', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769049166815-白色.webp`, isStandard: true, priceDelta: 0 },
      { name: 'Black', swatchUrl: null, heroUrl: `${GAC_CDN}/202601/1769049213124-黑色.webp`, isStandard: false, priceDelta: 1200 },
    ];
  }

  return [];
}

async function syncGac(supabase: SupabaseClient): Promise<AllOemSyncResult['gac']> {
  const result = { models: 0, products: 0, colors: 0, pricing: 0, errors: [] as string[] };
  const OEM_ID = 'gac-au';

  const modelRows = GAC_MODELS.map(model => ({
    oem_id: OEM_ID,
    slug: model.slug,
    name: model.name,
    body_type: model.body_type,
    category: model.category,
    model_year: Number.parseInt(model.vehStyleCode, 10),
    is_active: model.is_active,
    source_url: model.source_url,
    configurator_url: model.source_url,
    meta_json: {
      fuel_type: model.fuel,
      source: 'gac_official_api',
      veh_series_code: model.vehSeriesCode,
      veh_style_code: model.vehStyleCode,
      veh_style_id: model.vehStyleId,
    },
  }));

  const { data: modelData, error: modelErr } = await supabase
    .from('vehicle_models')
    .upsert(modelRows, { onConflict: 'oem_id,slug' })
    .select('id, slug');
  if (modelErr) {
    result.errors.push(`GAC model upsert: ${modelErr.message}`);
    return result;
  }
  result.models = modelData?.length ?? 0;
  const modelIdBySlug = Object.fromEntries((modelData ?? []).map(model => [model.slug, model.id]));
  const productsByModelSlug = new Map<string, Array<{ id: string; external_key: string; title: string }>>();

  for (const model of GAC_MODELS) {
    const modelId = modelIdBySlug[model.slug];
    if (!modelId || !model.is_active) continue;

    try {
      const configData = await gacPost<GacConfigResponse>('/showroom/vehicle/query/config-model', {
        vehSeriesCode: model.vehSeriesCode,
        vehStyleCode: model.vehStyleCode,
      });

      for (let index = 0; index < (configData.vehicleModels ?? []).length; index++) {
        const variant = configData.vehicleModels![index];
        if (!variant.vehModelId || !variant.vehModelName) continue;
        const externalKey = `${OEM_ID}-${model.vehSeriesCode}-${variant.vehModelId}`;
        const price = pf(variant.salePrice);
        const productRow = {
          oem_id: OEM_ID,
          external_key: externalKey,
          source_url: model.source_url,
          title: `${model.name} ${variant.vehModelName}`,
          subtitle: variant.vehModelName,
          body_type: model.body_type,
          fuel_type: model.fuel,
          availability: 'available',
          price_amount: price,
          price_currency: 'AUD',
          price_type: 'rrp',
          price_qualifier: 'Official GAC RRP',
          variant_name: variant.vehModelName,
          variant_code: String(variant.vehModelId),
          model_id: modelId,
          specs_json: parseGacSpecs(configData.configs, index),
          meta_json: {
            source: 'gac_official_api',
            veh_model_id: variant.vehModelId,
            veh_series_code: model.vehSeriesCode,
            veh_style_code: model.vehStyleCode,
            power_type: model.fuel,
          },
          last_seen_at: new Date().toISOString(),
        };

        const { data: product, error: productErr } = await supabase
          .from('products')
          .upsert(productRow, { onConflict: 'oem_id,external_key' })
          .select('id, external_key, title')
          .single();
        if (productErr || !product) {
          result.errors.push(`GAC product ${externalKey}: ${productErr?.message || 'no row returned'}`);
          continue;
        }
        result.products++;
        const products = productsByModelSlug.get(model.slug) ?? [];
        products.push(product);
        productsByModelSlug.set(model.slug, products);
      }
    } catch (error) {
      result.errors.push(`GAC config ${model.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      const priceData = await gacPost<GacPriceResponse>('/showroom/veh-model/query/priceConfigModel', {
        vehSeriesCode: model.vehSeriesCode,
        vehStyleCode: model.vehStyleCode,
      });
      const products = productsByModelSlug.get(model.slug) ?? [];
      for (const variant of priceData.vehicleModels ?? []) {
        if (!variant.id) continue;
        const externalKey = `${OEM_ID}-${model.vehSeriesCode}-${variant.id}`;
        const product = products.find(row => row.external_key === externalKey);
        if (!product) continue;
        const rrp = pf(variant.salePrice);
        const galleryUrls = (variant.picUrlList ?? []).filter(Boolean);
        const heroUrl = galleryUrls[0] ?? null;

        const { error: pricingErr } = await supabase.from('variant_pricing').upsert({
          product_id: product.id,
          price_type: 'rrp',
          rrp,
          price_qualifier: 'Official GAC RRP',
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'product_id,price_type' });
        if (pricingErr) {
          result.errors.push(`GAC pricing ${externalKey}: ${pricingErr.message}`);
        } else {
          result.pricing++;
        }

        if (heroUrl) {
          const { error: imageErr } = await supabase.from('products').update({
            primary_image_r2_key: heroUrl,
            meta_json: {
              source: 'gac_official_api',
              veh_model_id: variant.id,
              veh_series_code: model.vehSeriesCode,
              veh_style_code: model.vehStyleCode,
              gallery_urls: galleryUrls,
            },
          }).eq('id', product.id);
          if (imageErr) result.errors.push(`GAC image ${externalKey}: ${imageErr.message}`);
        }
      }
    } catch (error) {
      result.errors.push(`GAC pricing ${model.slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const colorDataBySlug: Record<string, GacColor[]> = {
    'm8-phev': gacStaticColors('m8-phev'),
    emzoom: gacStaticColors('emzoom'),
  };
  try {
    colorDataBySlug['aion-v'] = await fetchGacAionVColors();
  } catch (error) {
    result.errors.push(`GAC colors aion-v: ${error instanceof Error ? error.message : String(error)}`);
    colorDataBySlug['aion-v'] = [];
  }

  for (const [modelSlug, colors] of Object.entries(colorDataBySlug)) {
    const products = productsByModelSlug.get(modelSlug) ?? [];
    for (const product of products) {
      for (let index = 0; index < colors.length; index++) {
        const color = colors[index];
        const { error: colorErr } = await supabase.from('variant_colors').upsert({
          product_id: product.id,
          color_code: slugify(color.name),
          color_name: color.name,
          color_type: classifyGacColorType(color.name),
          is_standard: color.isStandard,
          price_delta: color.priceDelta,
          swatch_url: color.swatchUrl,
          hero_image_url: color.heroUrl,
          gallery_urls: color.galleryUrls ?? (color.heroUrl ? [color.heroUrl] : []),
          sort_order: index,
        }, { onConflict: 'product_id,color_code' });
        if (colorErr) {
          result.errors.push(`GAC color ${product.external_key}/${color.name}: ${colorErr.message}`);
        } else {
          result.colors++;
        }
      }
    }
  }

  return result;
}

// ============================================================================
// GENERIC — Refresh variant_pricing from products.price_amount for all OEMs
// ============================================================================

async function syncGenericPricing(supabase: SupabaseClient): Promise<AllOemSyncResult['generic_pricing']> {
  const result = { oems: 0, products: 0 };

  // OEMs without dedicated pricing sync — just ensure variant_pricing matches products
  const genericOems = [
    'ford-au', 'nissan-au', 'isuzu-au', 'subaru-au',
    'gmsv-au', 'ldv-au',
    'kgm-au', 'chery-au', 'renault-au',
  ];

  for (const oemId of genericOems) {
    const { data: products } = await supabase
      .from('products')
      .select('id, price_amount')
      .eq('oem_id', oemId)
      .not('price_amount', 'is', null);

    if (!products?.length) continue;

    let updated = 0;
    for (const p of products) {
      if (!p.price_amount || p.price_amount > 999999) continue;
      const { error } = await supabase.from('variant_pricing').upsert({
        product_id: p.id, price_type: 'standard',
        rrp: p.price_amount, ...allStates(p.price_amount),
      }, { onConflict: 'product_id,price_type' });
      if (!error) updated++;
    }

    if (updated > 0) {
      result.oems++;
      result.products += updated;
    }
  }

  return result;
}

// ============================================================================
// Main entry point
// ============================================================================

export async function executeAllOemSync(
  supabase: SupabaseClient,
): Promise<AllOemSyncResult> {
  console.log('[AllOemSync] Starting sync for Hyundai, Mazda, Mitsubishi, VW, Foton, GWM, GAC + generic pricing');

  const [hyundai, mazda, mitsubishi, volkswagen, foton, gwm, gac, generic_pricing] = await Promise.all([
    syncHyundai(supabase).catch(e => ({ colors: 0, pricing: 0, specs: 0, errors: [String(e)] })),
    syncMazda(supabase).catch(e => ({ colors: 0, pricing: 0, specs: 0, accessories: 0, errors: [String(e)] })),
    syncMitsubishi(supabase).catch(e => ({ products: 0, colors: 0, pricing: 0, offers: 0, accessories: 0, interiors: 0, brochures: 0, discoveredApis: 0, errors: [String(e)] })),
    syncVolkswagen(supabase).catch(e => ({ products: 0, colors: 0, pricing: 0, offers: 0, errors: [String(e)] })),
    syncFoton(supabase).catch(e => ({ products: 0, colors: 0, pricing: 0, errors: [String(e)] })),
    syncGwm(supabase).catch(e => ({ pricing: 0, colors: 0, accessories: 0, accessoryLinks: 0, unmatched: 0, errors: [String(e)] })),
    syncGac(supabase).catch(e => ({ models: 0, products: 0, colors: 0, pricing: 0, errors: [String(e)] })),
    syncGenericPricing(supabase).catch(() => ({ oems: 0, products: 0 })),
  ]);

  // Fix any offers missing images (auto-fallback from variant_colors)
  const offer_images_fixed = await fixOfferImages(supabase).catch(() => 0);

  console.log(
    `[AllOemSync] Done — Hyundai: ${hyundai.colors}c/${hyundai.pricing}p/${hyundai.specs}s, ` +
    `Mazda: ${mazda.colors}c/${mazda.pricing}p/${mazda.specs}s/${mazda.accessories}a, ` +
    `Mitsubishi: ${mitsubishi.products}v/${mitsubishi.colors}c/${mitsubishi.pricing}p/${mitsubishi.offers}o/${mitsubishi.accessories}a, ` +
    `VW: ${volkswagen.products}p/${volkswagen.colors}c/${volkswagen.offers}o, ` +
    `Foton: ${foton.products}p/${foton.colors}c/${foton.pricing} pricing, ` +
    `GWM: ${gwm.pricing}p/${gwm.colors}c/${gwm.accessories}a/${gwm.accessoryLinks} links, ` +
    `GAC: ${gac.products}p/${gac.colors}c/${gac.pricing} pricing, ` +
    `Generic: ${generic_pricing.oems} OEMs/${generic_pricing.products} products, ` +
    `Offer images fixed: ${offer_images_fixed}`,
  );

  return { hyundai, mazda, mitsubishi, volkswagen, foton, gwm, gac, generic_pricing, offer_images_fixed };
}
