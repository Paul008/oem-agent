/**
 * Nissan Australia official API connector primitives.
 *
 * Upstream boundary:
 * - PACE GraphQL for model/version data
 * - Choices for postcode-based pricing
 * - Nissan AU/CDN for published source assets
 * - Helios for 360 imagery
 *
 * This module deliberately contains no ADME/ADUS fallback. Every outbound URL
 * is checked against an exact Nissan first-party host allowlist and redirects
 * are refused so an allowlisted URL cannot bounce to an unreviewed origin.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const PACE_GRAPHQL_URL = 'https://gq-apn-prod.nissanpace.com/graphql';
const CHOICES_BASE_URL = 'https://ap.nissan-api.net/v2';
const HELIOS_URL = 'https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris';
const NISSAN_AU_ORIGIN = 'https://www.nissan.com.au';
const NISSAN_OFFERS_URL = `${NISSAN_AU_ORIGIN}/offers.html`;
const DEFAULT_TIMEOUT_MS = 30_000;

export const NISSAN_OFFICIAL_HOSTS = new Set([
  'gq-apn-prod.nissanpace.com',
  'ap.nissan-api.net',
  'www.nissan.com.au',
  'navara.nissan.com.au',
  'www-asia.nissan-cdn.net',
  'ms-prd.apn.mediaserver.heliosnissan.net',
]);

export const NISSAN_AU_MODELS = {
  qashqai: {
    modelCode: '30128', name: 'QASHQAI', bodyType: 'SUV', category: 'suv',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/qashqai.html',
  },
  'new-x-trail': {
    modelCode: '70049', name: 'NEW X-TRAIL', bodyType: 'SUV', category: 'suv',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/new-x-trail.html',
  },
  patrol: {
    modelCode: '30170', name: 'Patrol', bodyType: 'SUV', category: 'suv',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/patrol.html',
  },
  'all-new-navara': {
    modelCode: '30316', name: 'All-New Navara', bodyType: 'Ute', category: 'commercial',
    sourceUrl: 'https://navara.nissan.com.au/',
  },
  z: {
    modelCode: '30273', name: 'Z', bodyType: 'Coupe', category: 'sports',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/Z.html',
  },
  ariya: {
    modelCode: '30179', name: 'ARIYA', bodyType: 'SUV', category: 'electric',
    sourceUrl: 'https://www.nissan.com.au/vehicles/browse-range/ariya.html',
  },
} as const;

export type NissanModelSlug = keyof typeof NISSAN_AU_MODELS;
export type NissanState = 'nsw' | 'vic' | 'qld' | 'sa' | 'wa' | 'tas' | 'act' | 'nt';
type NissanFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const NISSAN_STATE_POSTCODES: Record<NissanState, string> = {
  nsw: '2000',
  vic: '3000',
  qld: '4000',
  sa: '5000',
  wa: '6000',
  tas: '7000',
  act: '2600',
  nt: '0800',
};

interface NissanOfficialClientOptions {
  paceApiKey?: string;
  choicesApiKey?: string;
  choicesClientKey?: string;
  fetch?: NissanFetch;
  timeoutMs?: number;
}

export interface PaceVersion {
  specCode: string;
  name: string;
  image: { small?: string; medium?: string; large?: string; altText?: string } | null;
  versionTags: string[];
  mainFeatures: Array<{
    disclaimerNumber?: string;
    info?: { key?: string; values?: string[] };
  }>;
  price: {
    label?: string;
    amount?: number;
    amountFormatted?: string;
    labelCaveat?: string;
    description?: string;
  } | null;
  colors: Array<{
    image?: { small?: string; medium?: string; large?: string; altText?: string };
    colorCode?: string;
  }>;
  powerTrainName?: string;
  gradeName?: string;
  gradeId?: string;
  eimCode?: string;
  engine?: { fuelType?: string };
  additionalPrices?: unknown;
  versionAdditionalPrices?: unknown;
  offer?: unknown;
  discount?: unknown;
}

export interface PaceVersionExplorer {
  versions: PaceVersion[];
  model: {
    modelName?: string;
    programCode?: string;
    phase?: string;
    modelKind?: string;
    commercialKind?: string | null;
    choiceId?: string;
  };
}

export interface NissanChoice {
  choiceId: string;
  category: string;
  label?: string;
  price?: number | Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface NissanChoicesResponse {
  choices: NissanChoice[];
  [key: string]: unknown;
}

export interface NissanApiOffer {
  id: string | number;
  offerType?: string;
  offerTypeTitle?: string;
  title?: { headline?: string; strapline?: string };
  model?: { code?: string; name?: string };
  grade?: { code?: string };
  version?: { code?: string };
  applicability?: string;
  highlight?: string;
  category?: string;
  legals?: { main?: { details?: string } };
  images?: {
    preview?: {
      largeStdRes?: string;
      largeHiRes?: string;
      mediumStdRes?: string;
      disclaimer?: string;
    };
  };
  offerSortOrder?: number;
}

export interface NissanOffersResponse {
  offers: NissanApiOffer[];
  totalResults?: number;
  [key: string]: unknown;
}

interface NissanSnapshotInput {
  slug: NissanModelSlug;
  modelCode: string;
  modelYear?: string;
  fetchedAt: string;
  sourceRunId?: string;
  explorer: PaceVersionExplorer;
}

export interface NissanSnapshot {
  model: Record<string, unknown>;
  products: Array<{
    row: Record<string, unknown>;
    pricing: Record<string, unknown> | null;
    colors: Array<Record<string, any>>;
  }>;
}

type ChoicesStateResponses = Record<NissanState, {
  postcode: string;
  response: NissanChoicesResponse;
}>;

export function assertNissanOfficialUrl(input: string | URL): URL {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  if (url.protocol !== 'https:') {
    throw new Error('Nissan upstream URLs must use HTTPS');
  }
  if (url.username || url.password) {
    throw new Error('Nissan upstream URLs must not contain credentials');
  }
  if (!NISSAN_OFFICIAL_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error(`Nissan upstream host is not allowlisted: ${url.hostname}`);
  }
  return url;
}

export function eimToSa(eimCode: string | null | undefined, modelYear: string): string | null {
  if (!eimCode || eimCode.length < 18) return null;
  if (!/^\d{4}$/.test(modelYear)) {
    throw new Error('Nissan model year must use YYYY format');
  }

  const value = (character: string): string => character === '-' ? '' : character;
  const parts = [
    `1_${value(eimCode[0])}`,
    `2_${value(eimCode[1])}${value(eimCode[2])}`,
    `4_${value(eimCode[3])}`,
    `5_${value(eimCode[4])}`,
    `6_${value(eimCode[5])}`,
    `7_${value(eimCode[6])}`,
    `11_${value(eimCode[10])}`,
    `12_${value(eimCode[11])}`,
    `13_${value(eimCode[12])}`,
    `14_${value(eimCode[13])}`,
    `15_${value(eimCode[14])}`,
    `16_${value(eimCode[15])}`,
    `17_${value(eimCode[16])}`,
    `18_${value(eimCode[17])}`,
  ];

  return `${parts.join(',')},${modelYear},,AU,PE_ON`;
}

export function buildHeliosFrameUrls(input: {
  vehicle: string;
  paint: string;
  sa?: string | null;
  view: 'exterior' | 'interior';
  width?: number;
}): string[] {
  const vehicle = input.vehicle.trim();
  const paint = input.paint.trim();
  if (!vehicle || !paint) return [];

  const width = input.width ?? 2000;
  if (!Number.isInteger(width) || width < 320 || width > 4000) {
    throw new Error('Nissan Helios width must be an integer between 320 and 4000');
  }

  const prefix = input.view === 'exterior' ? 'E' : 'I';
  return Array.from({ length: 36 }, (_, index) => {
    const url = assertNissanOfficialUrl(HELIOS_URL);
    url.search = new URLSearchParams({
      fabric: 'G',
      paint,
      vehicle,
      sa: input.sa || '',
      pov: `${prefix}${String(index + 1).padStart(2, '0')}`,
      width: String(width),
      client: 'nis',
      brand: 'nisglo',
    }).toString();
    return url.toString();
  });
}

/** Map Choices `category=version` rows onto the PACE spec codes for one postcode per state. */
export function buildChoicesStatePricing(input: {
  specCodes: string[];
  responses: ChoicesStateResponses;
  fetchedAt: string;
}): Map<string, Record<string, unknown>> {
  const fetchedAt = new Date(input.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) throw new Error('Choices fetchedAt must be an ISO timestamp');
  const uniqueSpecCodes = [...new Set(input.specCodes.map(code => code.trim()).filter(Boolean))];
  const rows = new Map<string, Record<string, unknown>>();

  for (const specCode of uniqueSpecCodes) {
    rows.set(specCode, {
      price_type: 'driveaway',
      rrp: null,
      driveaway_nsw: null,
      driveaway_vic: null,
      driveaway_qld: null,
      driveaway_sa: null,
      driveaway_wa: null,
      driveaway_tas: null,
      driveaway_act: null,
      driveaway_nt: null,
      price_qualifier: 'Postcode-based Nissan driveaway price',
      source_url: CHOICES_BASE_URL,
      source_price_type: 'Retail with VAT',
      source_postcodes: { ...NISSAN_STATE_POSTCODES },
      fetched_at: fetchedAt.toISOString(),
    });
  }

  for (const state of Object.keys(NISSAN_STATE_POSTCODES) as NissanState[]) {
    const stateResponse = input.responses[state];
    if (!stateResponse) throw new Error(`Missing Nissan Choices response for ${state.toUpperCase()}`);
    if (stateResponse.postcode !== NISSAN_STATE_POSTCODES[state]) {
      throw new Error(`Unexpected Nissan Choices postcode for ${state.toUpperCase()}`);
    }
    for (const choice of stateResponse.response.choices) {
      if (choice.category.toLowerCase() !== 'version') continue;
      const row = rows.get(choice.choiceId);
      const price = typeof choice.price === 'number'
        ? finitePositiveNumber(choice.price)
        : isRecord(choice.price) ? finitePositiveNumber(choice.price.amount) : null;
      if (row && price) row[`driveaway_${state}`] = price;
    }
  }

  return rows;
}

function parseAuDate(day: string, month: string, year: string, endOfDay: boolean): string | null {
  const fullYear = year.length === 2 ? Number(`20${year}`) : Number(year);
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  const date = new Date(Date.UTC(
    fullYear,
    monthIndex,
    dayNumber,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0,
  ));
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== monthIndex ||
    date.getUTCDate() !== dayNumber
  ) return null;
  return date.toISOString();
}

function offerValidity(legalText: string): { start: string | null; end: string | null } {
  const date = '(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})';
  const window = legalText.match(new RegExp(
    `purchased\\s+(?:between|from)\\s+${date}\\s*(?:to|and|until|–|-)\\s*${date}`,
    'i',
  ));
  if (window) {
    return {
      start: parseAuDate(window[1], window[2], window[3], false),
      end: parseAuDate(window[4], window[5], window[6], true),
    };
  }
  return { start: null, end: null };
}

function headlineAmount(headline: string, pattern: RegExp): number | null {
  const match = headline.match(pattern);
  return match ? finitePositiveNumber(Number(match[1].replace(/,/g, ''))) : null;
}

function normalizeOfferModel(offer: NissanApiOffer): string | null {
  const raw = offer.model?.name?.trim();
  if (!raw) return null;
  if (/^navara$/i.test(raw) && /all[- ]?new/i.test(offer.applicability || '')) {
    return 'All-New Navara';
  }
  const registry = Object.values(NISSAN_AU_MODELS).find(model =>
    model.name.toLowerCase() === raw.toLowerCase(),
  );
  return registry?.name || raw;
}

/** Normalize the official Choices offers response without dropping legal or applicability fields. */
export function normalizeNissanOffers(
  response: NissanOffersResponse,
  fetchedAtInput: string,
  sourceRunId?: string,
): Array<Record<string, unknown>> {
  const fetchedAt = new Date(fetchedAtInput);
  if (Number.isNaN(fetchedAt.getTime())) throw new Error('Nissan offer fetchedAt must be an ISO timestamp');
  if (sourceRunId && !/^[a-z0-9][a-z0-9-]{0,80}$/.test(sourceRunId)) {
    throw new Error('Nissan offer source run id is invalid');
  }

  return response.offers.map(offer => {
    const headline = offer.title?.headline?.trim() || `${normalizeOfferModel(offer) || 'Nissan'} Offer`;
    const apiType = offer.offerType?.toLowerCase() || '';
    const driveaway = headlineAmount(headline, /\$\s*([\d,]+)\s+DRIVEAWAY/i);
    const financeMatch = headline.match(/([\d.]+)\s*%\s*FINANCE/i);
    const genericAmount = headlineAmount(headline, /\$\s*([\d,]+)/i);
    const offerType = apiType.includes('driveaway') || driveaway
      ? 'driveaway'
      : apiType.includes('finance') || financeMatch
        ? 'finance'
        : genericAmount ? 'discount' : 'promotional';
    const legal = offer.legals?.main?.details?.trim() || null;
    const validity = offerValidity(legal || '');
    const model = normalizeOfferModel(offer);
    const preview = offer.images?.preview;
    const rawHero = preview?.largeStdRes || preview?.largeHiRes || preview?.mediumStdRes || null;
    const hero = rawHero ? assertNissanOfficialUrl(rawHero).toString() : null;

    return {
      oem_id: 'nissan-au',
      lifecycle_status: 'staged',
      source_run_id: sourceRunId || null,
      external_key: `nissan-offer-${String(offer.id)}`,
      source_url: NISSAN_OFFERS_URL,
      title: headline,
      description: offer.title?.strapline?.trim() || offer.highlight?.trim() || null,
      offer_type: offerType,
      applicable_models: model ? [model] : [],
      price_amount: offerType === 'driveaway' ? driveaway : null,
      price_currency: 'AUD',
      price_type: offerType === 'driveaway' ? 'driveaway' : null,
      price_raw_string: headline,
      saving_amount: offerType === 'discount' ? genericAmount : null,
      validity_start: validity.start,
      validity_end: validity.end,
      validity_raw: legal,
      cta_text: 'View offer',
      cta_url: NISSAN_OFFERS_URL,
      hero_image_r2_key: hero,
      disclaimer_text: legal,
      eligibility: offer.applicability || null,
      last_seen_at: fetchedAt.toISOString(),
      meta_json: {
        source_system: 'nissan-choices-offers',
        source_run_id: sourceRunId || null,
        source_host: new URL(CHOICES_BASE_URL).hostname,
        connector_version: 'nissan-official-v1',
        model_code: offer.model?.code || null,
        grade_code: offer.grade?.code || null,
        version_code: offer.version?.code || null,
        finance_rate: financeMatch ? Number(financeMatch[1]) : null,
        api_offer_type: offer.offerType || null,
        offer_type_title: offer.offerTypeTitle || null,
        image_disclaimer: preview?.disclaimer || null,
        offer_sort_order: offer.offerSortOrder ?? null,
        fetched_at: fetchedAt.toISOString(),
      },
    };
  });
}

function pacePriceType(label: string | undefined): 'driveaway' | 'rrp' | 'mlp' | null {
  const value = label?.trim().toLowerCase() || '';
  if (!value) return null;
  if (value.includes('driveaway') || value.includes('drive away')) return 'driveaway';
  if (value.includes('recommended retail') || value === 'rrp') return 'rrp';
  if (value.includes('manufacturer') || value.includes('list price') || value === 'mlp') return 'mlp';
  return null;
}

function finitePositiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function firstOfficialImage(image: PaceVersion['image'] | PaceVersion['colors'][number]['image']): string | null {
  const raw = image?.large || image?.medium || image?.small;
  if (!raw) return null;
  return assertNissanOfficialUrl(raw).toString();
}

function featureSnapshot(features: PaceVersion['mainFeatures']): {
  list: string[];
  specs: Record<string, string[]>;
} {
  const list: string[] = [];
  const specs: Record<string, string[]> = {};
  for (const feature of features || []) {
    const key = feature.info?.key?.trim() || 'Features';
    const values = (feature.info?.values || []).map(value => String(value).trim()).filter(Boolean);
    if (values.length === 0) continue;
    specs[key] = [...(specs[key] || []), ...values];
    for (const value of values) if (!list.includes(value)) list.push(value);
  }
  return { list, specs };
}

/**
 * Convert a validated PACE response to normalized, still-staged Supabase rows.
 * PACE price labels are retained verbatim and mapped conservatively: an MLP is
 * never copied into any driveaway state field. Choices enrichment owns those.
 */
export function buildNissanSnapshot(input: NissanSnapshotInput): NissanSnapshot {
  const registry = NISSAN_AU_MODELS[input.slug];
  if (!registry) throw new Error(`Unsupported Nissan AU model slug: ${input.slug}`);
  if (input.modelCode !== registry.modelCode) {
    throw new Error(`Nissan model code mismatch for ${input.slug}`);
  }
  const fetchedAt = new Date(input.fetchedAt);
  if (Number.isNaN(fetchedAt.getTime())) throw new Error('Nissan fetchedAt must be an ISO timestamp');

  const sourceUrl = assertNissanOfficialUrl(registry.sourceUrl).toString();
  const modelYear = input.modelYear && /^\d{4}$/.test(input.modelYear)
    ? Number(input.modelYear)
    : null;
  if (input.sourceRunId && !/^[a-z0-9][a-z0-9-]{0,80}$/.test(input.sourceRunId)) {
    throw new Error('Nissan sourceRunId is invalid');
  }
  const model = {
    oem_id: 'nissan-au',
    slug: input.slug,
    name: input.explorer.model.modelName || registry.name,
    body_type: registry.bodyType,
    category: registry.category,
    model_year: modelYear,
    is_active: false,
    source_url: sourceUrl,
    // Leave unset until the canonical per-model Nissan configurator URL is
    // confirmed. A guessed URL is worse than no CTA.
    configurator_url: null,
    oem_model_code: input.modelCode,
    meta_json: {
      source_system: 'nissan-pace',
      source_host: new URL(PACE_GRAPHQL_URL).hostname,
      program_code: input.explorer.model.programCode || null,
      choice_id: input.explorer.model.choiceId || null,
      connector_version: 'nissan-official-v1',
      source_run_id: input.sourceRunId || null,
      fetched_at: fetchedAt.toISOString(),
      staged: true,
    },
    updated_at: fetchedAt.toISOString(),
  };

  const products = input.explorer.versions.map(version => {
    const priceType = pacePriceType(version.price?.label);
    const price = finitePositiveNumber(version.price?.amount);
    const qualifier = version.price?.labelCaveat || version.price?.description || version.price?.label || null;
    const features = featureSnapshot(version.mainFeatures || []);
    const primaryImage = firstOfficialImage(version.image);
    const eim = version.eimCode || null;
    const sa = input.modelYear ? eimToSa(eim, input.modelYear) : null;
    const heliosVehicle = eim && eim.length >= 10 ? `8_${eim.slice(7, 10)}` : null;

    const colors = (version.colors || []).flatMap((color, index) => {
      const code = color.colorCode?.trim();
      if (!code) return [];
      const hero = firstOfficialImage(color.image);
      const hasHeliosContext = !!(heliosVehicle && sa);
      return [{
        color_code: code,
        color_name: code,
        color_type: null,
        is_standard: index === 0,
        price_delta: 0,
        swatch_url: null,
        source_swatch_url: null,
        hero_image_url: hero,
        source_hero_url: hero,
        gallery_urls: hero ? [hero] : [],
        source_gallery_urls: hero ? [hero] : [],
        exterior_360_urls: hasHeliosContext
          ? buildHeliosFrameUrls({ vehicle: heliosVehicle!, paint: code, sa, view: 'exterior' })
          : [],
        interior_360_urls: hasHeliosContext
          ? buildHeliosFrameUrls({ vehicle: heliosVehicle!, paint: code, sa, view: 'interior' })
          : [],
        sort_order: index,
      }];
    });

    const row = {
      oem_id: 'nissan-au',
      external_key: `pace:${input.modelCode}:${version.specCode}`,
      title: version.name,
      subtitle: version.gradeName || null,
      variant_name: version.gradeName || version.name,
      variant_code: version.specCode,
      availability: 'staged',
      price_amount: price,
      price_currency: 'AUD',
      price_type: priceType,
      price_raw_string: version.price?.amountFormatted || null,
      price_qualifier: qualifier,
      disclaimer_text: qualifier,
      body_type: registry.bodyType,
      fuel_type: version.engine?.fuelType || version.powerTrainName || null,
      engine_desc: version.powerTrainName || null,
      primary_image_r2_key: primaryImage,
      key_features: features.list,
      specs_json: {
        pace_features: features.specs,
        engine: { fuel_type: version.engine?.fuelType || null },
      },
      source_url: sourceUrl,
      last_seen_at: fetchedAt.toISOString(),
      meta_json: {
        source_system: 'nissan-pace',
        source_host: new URL(PACE_GRAPHQL_URL).hostname,
        source_model_code: input.modelCode,
        spec_code: version.specCode,
        grade_id: version.gradeId || null,
        eim_code: eim,
        connector_version: 'nissan-official-v1',
        source_run_id: input.sourceRunId || null,
        fetched_at: fetchedAt.toISOString(),
        staged: true,
      },
    };

    const pricing = price && priceType ? {
      price_type: priceType,
      rrp: priceType === 'mlp' || priceType === 'rrp' ? price : null,
      driveaway_nsw: null,
      driveaway_vic: null,
      driveaway_qld: null,
      driveaway_wa: null,
      driveaway_sa: null,
      driveaway_tas: null,
      driveaway_act: null,
      driveaway_nt: null,
      price_qualifier: qualifier,
      source_url: PACE_GRAPHQL_URL,
      fetched_at: fetchedAt.toISOString(),
    } : null;

    return { row, pricing, colors };
  });

  return { model, products };
}

const GET_VERSIONS_QUERY = `query GetVersions($marketConfig: MarketConfig!, $modelDataUrl: String!, $filter: [ModelFilters!], $sortBy: SortCriteria, $versionExplorerInput: VersionExplorerInput, $locationDataInput: LocationInput) {
  getVersionExplorerInformation(
    marketConfig: $marketConfig
    modelDataUrl: $modelDataUrl
    filter: $filter
    sortBy: $sortBy
    versionExplorerInput: $versionExplorerInput
    locationDataInput: $locationDataInput
  ) {
    versions {
      specCode
      name
      image { small medium large altText }
      versionTags
      mainFeatures { disclaimerNumber info { key values } }
      price { label amount amountFormatted labelCaveat description }
      colors { image { small medium large altText } colorCode }
      powerTrainName
      gradeName
      gradeId
      eimCode
      engine { fuelType }
      additionalPrices { priceWithTax priceWithoutTax }
      versionAdditionalPrices { priceWithTax priceWithoutTax }
      offer { amount labelCaveat description amountFormatted }
      discount { amount }
    }
    model { modelName programCode phase modelKind commercialKind choiceId }
  }
}`;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredCredential(value: string | undefined, name: string): string {
  const credential = value?.trim();
  if (!credential) throw new Error(`${name} is not configured`);
  return credential;
}

function validatePostcode(postcode: string): string {
  const value = postcode.trim();
  if (!/^\d{4}$/.test(value)) throw new Error('Nissan postcode must contain four digits');
  return value;
}

function parsePaceResponse(payload: unknown): PaceVersionExplorer {
  if (!isRecord(payload)) throw new Error('Nissan PACE returned a non-object response');
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error('Nissan PACE GraphQL returned errors');
  }

  const explorer = payload.data?.getVersionExplorerInformation;
  if (!isRecord(explorer) || !Array.isArray(explorer.versions) || !isRecord(explorer.model)) {
    throw new Error('Nissan PACE response does not match the GetVersions contract');
  }

  for (const version of explorer.versions) {
    if (!isRecord(version) || typeof version.specCode !== 'string' || typeof version.name !== 'string') {
      throw new Error('Nissan PACE returned an invalid version record');
    }
  }
  return explorer as PaceVersionExplorer;
}

function parseChoicesResponse(payload: unknown): NissanChoicesResponse {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw new Error('Nissan Choices response does not contain a choices array');
  }
  for (const choice of payload.choices) {
    if (!isRecord(choice) || typeof choice.choiceId !== 'string' || typeof choice.category !== 'string') {
      throw new Error('Nissan Choices returned an invalid choice record');
    }
  }
  return payload as NissanChoicesResponse;
}

function parseOffersResponse(payload: unknown): NissanOffersResponse {
  if (!isRecord(payload) || !Array.isArray(payload.offers)) {
    throw new Error('Nissan offers response does not contain an offers array');
  }
  for (const offer of payload.offers) {
    if (!isRecord(offer) || (typeof offer.id !== 'string' && typeof offer.id !== 'number')) {
      throw new Error('Nissan offers returned an invalid offer record');
    }
  }
  return payload as NissanOffersResponse;
}

export class NissanOfficialClient {
  private readonly paceApiKey?: string;
  private readonly choicesApiKey?: string;
  private readonly choicesClientKey?: string;
  private readonly fetchImpl: NissanFetch;
  private readonly timeoutMs: number;

  constructor(options: NissanOfficialClientOptions) {
    this.paceApiKey = options.paceApiKey;
    this.choicesApiKey = options.choicesApiKey;
    this.choicesClientKey = options.choicesClientKey;
    this.fetchImpl = options.fetch || fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async fetchPaceVersions(input: {
    slug: NissanModelSlug;
    modelCode: string;
    postcode: string;
  }): Promise<PaceVersionExplorer> {
    const apiKey = requiredCredential(this.paceApiKey, 'NISSAN_PACE_API_KEY');
    const postcode = validatePostcode(input.postcode);
    if (!/^\d+$/.test(input.modelCode)) throw new Error('Nissan model code must be numeric');

    const payload = await this.fetchOfficialJson(PACE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: NISSAN_AU_ORIGIN,
        Referer: `${NISSAN_AU_ORIGIN}/`,
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        operationName: 'GetVersions',
        query: GET_VERSIONS_QUERY,
        variables: {
          marketConfig: {
            brand: 'NISSAN',
            country: 'AU',
            language: 'en',
            metadata: { clientApp: '[WEB]VERSION_EXPLORER' },
          },
          modelDataUrl: `/content/nissan_prod/en_AU/index/vehicles/browse-range/${input.slug}/version-explorer/jcr:content/core.versionexplorerdata.json`,
          filter: [],
          sortBy: null,
          versionExplorerInput: {
            modelCode: input.modelCode,
            gradeSpecCode: '',
            powerTrainSpecCode: '',
          },
          locationDataInput: { location: postcode },
        },
      }),
    });

    return parsePaceResponse(payload);
  }

  async fetchChoices(input: {
    modelCode: string;
    configCode: string;
    choiceIds: string[];
    postcode: string;
  }): Promise<NissanChoicesResponse> {
    const apiKey = requiredCredential(this.choicesApiKey, 'NISSAN_CHOICES_API_KEY');
    const clientKey = requiredCredential(this.choicesClientKey, 'NISSAN_CHOICES_CLIENT_KEY');
    const postcode = validatePostcode(input.postcode);
    if (!/^\d+$/.test(input.modelCode)) throw new Error('Nissan model code must be numeric');
    if (!input.configCode.trim()) throw new Error('Nissan Choices config code is required');
    if (input.choiceIds.length === 0 || input.choiceIds.some(id => !id.trim())) {
      throw new Error('Nissan Choices requires at least one non-empty choice ID');
    }

    const url = assertNissanOfficialUrl(
      `${CHOICES_BASE_URL}/models/${encodeURIComponent(input.modelCode)}/configuration/${encodeURIComponent(input.configCode)}/choices`,
    );
    url.search = new URLSearchParams({
      useTransitionalData: 'false',
      choicePriceType: 'Retail with VAT',
      filterByChoiceIDs: input.choiceIds.join(','),
      conflictTypes: 'NONE',
      priceMethod: 'version',
      priceType: 'Retail with VAT',
      includeBestOffer: 'false',
      regionalPriceLocation: postcode,
      regionalPriceLocationType: 'postCode',
    }).toString();

    const payload = await this.fetchOfficialJson(url, {
      headers: {
        Accept: 'application/json',
        Origin: NISSAN_AU_ORIGIN,
        Referer: `${NISSAN_AU_ORIGIN}/`,
        apiKey,
        clientKey,
      },
    });
    return parseChoicesResponse(payload);
  }

  async fetchOffers(): Promise<NissanOffersResponse> {
    const apiKey = requiredCredential(this.choicesApiKey, 'NISSAN_CHOICES_API_KEY');
    const clientKey = requiredCredential(this.choicesClientKey, 'NISSAN_CHOICES_CLIENT_KEY');
    const url = assertNissanOfficialUrl(`${CHOICES_BASE_URL}/offers`);
    url.search = new URLSearchParams({
      'offerTags.name': '3',
      includeLegals: 'true',
      start: '0',
      size: '100',
      includeResults: 'true',
      includeFilteredFacets: 'false',
      includePreFilteredFacets: 'false',
    }).toString();

    const payload = await this.fetchOfficialJson(url, {
      headers: {
        Accept: 'application/json',
        Origin: NISSAN_AU_ORIGIN,
        Referer: `${NISSAN_AU_ORIGIN}/`,
        apiKey,
        clientKey,
      },
    });
    return parseOffersResponse(payload);
  }

  private async fetchOfficialJson(input: string | URL, init: RequestInit): Promise<unknown> {
    const url = assertNissanOfficialUrl(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), {
        ...init,
        redirect: 'manual',
        signal: controller.signal,
      });

      if (response.status >= 300 && response.status < 400) {
        throw new Error('Nissan upstream redirect refused');
      }
      if (!response.ok) {
        throw new Error(`Nissan upstream request failed with HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        throw new Error('Nissan upstream returned a non-JSON response');
      }
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface NissanPaceSyncResult {
  dryRun: boolean;
  modelsFetched: number;
  versionsFetched: number;
  catalogsRejected: number;
  modelsUpserted: number;
  productsUpserted: number;
  colorsUpserted: number;
  pricingUpserted: number;
  choicesRequests: number;
  regionalPricingRows: number;
  driftWarnings: string[];
  errors: string[];
}

export interface NissanCatalogDriftAssessment {
  accepted: boolean;
  approvalRequired: boolean;
  existingCount: number;
  incomingCount: number;
  shrinkRatio: number;
  reason: string | null;
}

/**
 * Fail closed when an upstream schema incident would materially shrink a
 * previously staged model catalog. The default permits ordinary fluctuation
 * up to 30%; anything larger requires a separately authenticated approval.
 */
export function assessNissanCatalogDrift(input: {
  existingCount: number;
  incomingCount: number;
  maxShrinkRatio?: number;
  approveMaterialShrink?: boolean;
}): NissanCatalogDriftAssessment {
  const { existingCount, incomingCount } = input;
  const maxShrinkRatio = input.maxShrinkRatio ?? 0.3;
  if (!Number.isInteger(existingCount) || existingCount < 0) {
    throw new Error('Existing Nissan version count must be a non-negative integer');
  }
  if (!Number.isInteger(incomingCount) || incomingCount < 0) {
    throw new Error('Incoming Nissan version count must be a non-negative integer');
  }
  if (!Number.isFinite(maxShrinkRatio) || maxShrinkRatio < 0 || maxShrinkRatio >= 1) {
    throw new Error('Nissan maximum catalog shrink ratio must be between 0 and 1');
  }

  const shrinkRatio = existingCount > 0 && incomingCount < existingCount
    ? (existingCount - incomingCount) / existingCount
    : 0;
  if (incomingCount === 0) {
    return {
      accepted: false,
      approvalRequired: existingCount > 0,
      existingCount,
      incomingCount,
      shrinkRatio,
      reason: 'PACE returned zero versions',
    };
  }

  const materialShrink = existingCount > 0 && shrinkRatio > maxShrinkRatio;
  const accepted = !materialShrink || input.approveMaterialShrink === true;
  return {
    accepted,
    approvalRequired: materialShrink,
    existingCount,
    incomingCount,
    shrinkRatio,
    reason: materialShrink
      ? `Nissan version catalog shrank by ${(shrinkRatio * 100).toFixed(1)}% (${existingCount} to ${incomingCount})`
      : null,
  };
}

export interface NissanChoicesModelConfig {
  configCode: string;
  choiceIds: string[];
}

interface NissanPaceSyncOptions {
  client: Pick<NissanOfficialClient, 'fetchPaceVersions'> & Partial<Pick<NissanOfficialClient, 'fetchChoices'>>;
  /** Defaults to true. A caller must explicitly opt into staged DB writes. */
  dryRun?: boolean;
  modelSlugs?: NissanModelSlug[];
  modelYears?: Partial<Record<NissanModelSlug, string>>;
  /** Immutable operator run id stamped into staged rows for reviewed promotion. */
  sourceRunId?: string;
  choicesConfigs?: Partial<Record<NissanModelSlug, NissanChoicesModelConfig>>;
  postcode: string;
  /** Explicit, audited override for a non-empty material shrink. */
  approveMaterialCatalogShrink?: boolean;
  maxCatalogShrinkRatio?: number;
  /** Test/control-plane seam; production defaults to staged database counts. */
  getExistingVersionCount?: (slug: NissanModelSlug) => Promise<number>;
  now?: () => Date;
}

async function readExistingNissanVersionCount(
  supabase: SupabaseClient,
  slug: NissanModelSlug,
): Promise<number> {
  const { data: model, error: modelError } = await supabase
    .from('vehicle_models')
    .select('id')
    .eq('oem_id', 'nissan-au')
    .eq('slug', slug)
    .maybeSingle();
  if (modelError) throw new Error(`vehicle_models drift baseline failed: ${modelError.message}`);
  if (!model?.id) return 0;

  const { count, error: productError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('oem_id', 'nissan-au')
    .eq('model_id', model.id);
  if (productError) throw new Error(`products drift baseline failed: ${productError.message}`);
  if (count === null) throw new Error('products drift baseline did not return a count');
  return count;
}

/**
 * Fetch and optionally persist a staged PACE catalog.
 *
 * This is intentionally not registered in the daily all-OEM scheduler yet.
 * Access approval, redacted live fixtures, and reviewed Choices identifiers
 * must land before scheduled/published mode.
 * Dry-run is the default and performs no Supabase query or mutation.
 */
export async function syncNissanPaceCatalog(
  supabase: SupabaseClient,
  options: NissanPaceSyncOptions,
): Promise<NissanPaceSyncResult> {
  const dryRun = options.dryRun !== false;
  const slugs = options.modelSlugs || Object.keys(NISSAN_AU_MODELS) as NissanModelSlug[];
  const now = options.now || (() => new Date());
  const result: NissanPaceSyncResult = {
    dryRun,
    modelsFetched: 0,
    versionsFetched: 0,
    catalogsRejected: 0,
    modelsUpserted: 0,
    productsUpserted: 0,
    colorsUpserted: 0,
    pricingUpserted: 0,
    choicesRequests: 0,
    regionalPricingRows: 0,
    driftWarnings: [],
    errors: [],
  };

  for (const slug of slugs) {
    const registry = NISSAN_AU_MODELS[slug];
    if (!registry) {
      result.errors.push(`${slug}: unsupported Nissan model slug`);
      continue;
    }

    try {
      const explorer = await options.client.fetchPaceVersions({
        slug,
        modelCode: registry.modelCode,
        postcode: options.postcode,
      });
      result.modelsFetched++;
      result.versionsFetched += explorer.versions.length;

      if (explorer.versions.length === 0) {
        result.errors.push(`${slug}: PACE returned zero versions; staged records were not changed`);
        result.catalogsRejected++;
        continue;
      }

      if (!dryRun) {
        try {
          const existingCount = await (options.getExistingVersionCount
            ? options.getExistingVersionCount(slug)
            : readExistingNissanVersionCount(supabase, slug));
          const drift = assessNissanCatalogDrift({
            existingCount,
            incomingCount: explorer.versions.length,
            maxShrinkRatio: options.maxCatalogShrinkRatio,
            approveMaterialShrink: options.approveMaterialCatalogShrink,
          });
          if (!drift.accepted) {
            result.catalogsRejected++;
            result.errors.push(`${slug}: catalog drift rejected: ${drift.reason}`);
            continue;
          }
          if (drift.approvalRequired && drift.reason) {
            result.driftWarnings.push(`${slug}: approved catalog drift: ${drift.reason}`);
          }
        } catch (error) {
          result.catalogsRejected++;
          result.errors.push(
            `${slug}: catalog drift baseline failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }
      }

      const snapshot = buildNissanSnapshot({
        slug,
        modelCode: registry.modelCode,
        modelYear: options.modelYears?.[slug],
        fetchedAt: now().toISOString(),
        sourceRunId: options.sourceRunId,
        explorer,
      });

      let regionalPricing = new Map<string, Record<string, unknown>>();
      const choicesConfig = options.choicesConfigs?.[slug];
      if (choicesConfig) {
        if (!options.client.fetchChoices) {
          result.errors.push(`${slug}: Choices config supplied but client.fetchChoices is unavailable`);
        } else {
          try {
            const stateEntries = await Promise.all(
              (Object.keys(NISSAN_STATE_POSTCODES) as NissanState[]).map(async state => {
                const postcode = NISSAN_STATE_POSTCODES[state];
                const response = await options.client.fetchChoices!({
                  modelCode: registry.modelCode,
                  configCode: choicesConfig.configCode,
                  choiceIds: choicesConfig.choiceIds,
                  postcode,
                });
                result.choicesRequests++;
                return [state, { postcode, response }] as const;
              }),
            );
            regionalPricing = buildChoicesStatePricing({
              specCodes: explorer.versions.map(version => version.specCode),
              responses: Object.fromEntries(stateEntries) as ChoicesStateResponses,
              fetchedAt: now().toISOString(),
            });

            for (const [specCode, row] of regionalPricing) {
              const missing = (Object.keys(NISSAN_STATE_POSTCODES) as NissanState[])
                .filter(state => !finitePositiveNumber(row[`driveaway_${state}`]));
              if (missing.length > 0) {
                regionalPricing.delete(specCode);
                result.errors.push(
                  `${slug}/${specCode}: incomplete Choices pricing (${missing.map(s => s.toUpperCase()).join(', ')})`,
                );
              }
            }
            result.regionalPricingRows += regionalPricing.size;
          } catch (error) {
            result.errors.push(`${slug}: Choices pricing failed: ${error instanceof Error ? error.message : String(error)}`);
            regionalPricing = new Map();
          }
        }
      }
      if (dryRun) continue;

      const { data: model, error: modelError } = await supabase
        .from('vehicle_models')
        .upsert(snapshot.model, { onConflict: 'oem_id,slug' })
        .select('id')
        .single();
      if (modelError || !model?.id) {
        result.errors.push(`${slug}: vehicle_models upsert failed: ${modelError?.message || 'missing id'}`);
        continue;
      }
      result.modelsUpserted++;

      for (const product of snapshot.products) {
        const externalKey = String(product.row.external_key);
        const productRow = { ...product.row, model_id: model.id };
        const { data: existing, error: findError } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', 'nissan-au')
          .eq('external_key', externalKey)
          .maybeSingle();
        if (findError) {
          result.errors.push(`${slug}/${externalKey}: product lookup failed: ${findError.message}`);
          continue;
        }

        let productId: string | null = null;
        if (existing?.id) {
          const { error } = await supabase.from('products').update(productRow).eq('id', existing.id);
          if (error) {
            result.errors.push(`${slug}/${externalKey}: product update failed: ${error.message}`);
            continue;
          }
          productId = existing.id;
        } else {
          const { data: inserted, error } = await supabase
            .from('products')
            .insert(productRow)
            .select('id')
            .single();
          if (error || !inserted?.id) {
            result.errors.push(`${slug}/${externalKey}: product insert failed: ${error?.message || 'missing id'}`);
            continue;
          }
          productId = inserted.id;
        }
        result.productsUpserted++;

        if (product.colors.length > 0) {
          const colorRows = product.colors.map(color => ({ ...color, product_id: productId }));
          const { error } = await supabase
            .from('variant_colors')
            .upsert(colorRows, { onConflict: 'product_id,color_code' });
          if (error) {
            result.errors.push(`${slug}/${externalKey}: color upsert failed: ${error.message}`);
          } else {
            result.colorsUpserted += colorRows.length;
          }
        }

        const pricingRows = [
          product.pricing,
          regionalPricing.get(String(product.row.variant_code)) || null,
        ].filter((row): row is Record<string, unknown> => !!row);
        for (const pricingRow of pricingRows) {
          const { error } = await supabase
            .from('variant_pricing')
            .upsert({ ...pricingRow, product_id: productId }, {
              onConflict: 'product_id,price_type',
            });
          if (error) {
            result.errors.push(
              `${slug}/${externalKey}/${String(pricingRow.price_type)}: pricing upsert failed: ${error.message}`,
            );
          } else {
            result.pricingUpserted++;
          }
        }
      }
    } catch (error) {
      result.errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

export interface NissanOfferSyncResult {
  dryRun: boolean;
  offersFetched: number;
  offersUpserted: number;
  productLinksUpserted: number;
  errors: string[];
}

interface NissanOfferSyncOptions {
  client: Pick<NissanOfficialClient, 'fetchOffers'>;
  /** Defaults to true; publishing requires an explicit false. */
  dryRun?: boolean;
  /** Required for staged writes and persisted into every offer row. */
  sourceRunId?: string;
  now?: () => Date;
}

/** Fetch and optionally upsert current Nissan offers without destructive empty-set behavior. */
export async function syncNissanOffers(
  supabase: SupabaseClient,
  options: NissanOfferSyncOptions,
): Promise<NissanOfferSyncResult> {
  const dryRun = options.dryRun !== false;
  const result: NissanOfferSyncResult = {
    dryRun,
    offersFetched: 0,
    offersUpserted: 0,
    productLinksUpserted: 0,
    errors: [],
  };

  if (!dryRun && !/^[a-z0-9][a-z0-9-]{0,80}$/.test(options.sourceRunId || '')) {
    result.errors.push('A valid Nissan offer source run id is required for staged writes');
    return result;
  }

  try {
    const response = await options.client.fetchOffers();
    result.offersFetched = response.offers.length;
    if (response.offers.length === 0) {
      result.errors.push('Nissan offers API returned zero offers; existing offers were retained');
      return result;
    }
    if (!dryRun && !Number.isInteger(response.totalResults)) {
      result.errors.push('Nissan offers API omitted a valid totalResults count; snapshot was not staged');
      return result;
    }
    if (!dryRun && Number(response.totalResults) !== response.offers.length) {
      result.errors.push(
        `Nissan offers API returned ${response.offers.length} of ${response.totalResults} offers; truncated snapshot was not staged`,
      );
      return result;
    }
    if (
      !dryRun
      && new Set(response.offers.map(offer => String(offer.id))).size !== response.offers.length
    ) {
      result.errors.push('Nissan offers API returned duplicate offer ids; snapshot was not staged');
      return result;
    }

    const rows = normalizeNissanOffers(
      response,
      (options.now || (() => new Date()))().toISOString(),
      options.sourceRunId,
    );
    if (dryRun) return result;

    for (const row of rows) {
      const canonicalExternalKey = String(row.external_key);
      // A staged refresh must never mutate the currently active offer row.
      // Version the storage identity by reviewed run while retaining the
      // Nissan source identity in metadata for audit and deduplication.
      const externalKey = `${canonicalExternalKey}--${options.sourceRunId}`;
      const applicableModels = Array.isArray(row.applicable_models)
        ? row.applicable_models.filter((model): model is string => typeof model === 'string')
        : [];
      let modelId: string | null = null;
      if (applicableModels[0]) {
        const { data: model } = await supabase
          .from('vehicle_models')
          .select('id')
          .eq('oem_id', 'nissan-au')
          .ilike('name', applicableModels[0])
          .maybeSingle();
        modelId = model?.id || null;
      }

      const offerRow = {
        ...row,
        external_key: externalKey,
        model_id: modelId,
        meta_json: {
          ...(isRecord(row.meta_json) ? row.meta_json : {}),
          canonical_external_key: canonicalExternalKey,
        },
      };
      const { data: existing, error: findError } = await supabase
        .from('offers')
        .select('id')
        .eq('oem_id', 'nissan-au')
        .eq('external_key', externalKey)
        .maybeSingle();
      if (findError) {
        result.errors.push(`${externalKey}: offer lookup failed: ${findError.message}`);
        continue;
      }

      let offerId: string | null = null;
      if (existing?.id) {
        const { error } = await supabase.from('offers').update(offerRow).eq('id', existing.id);
        if (error) {
          result.errors.push(`${externalKey}: offer update failed: ${error.message}`);
          continue;
        }
        offerId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from('offers')
          .insert(offerRow)
          .select('id')
          .single();
        if (error || !inserted?.id) {
          result.errors.push(`${externalKey}: offer insert failed: ${error?.message || 'missing id'}`);
          continue;
        }
        offerId = inserted.id;
      }
      result.offersUpserted++;

      const meta = isRecord(row.meta_json) ? row.meta_json : {};
      const versionCode = typeof meta.version_code === 'string' ? meta.version_code : null;
      let products: Array<{ id: string }> = [];
      if (versionCode) {
        const { data, error } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', 'nissan-au')
          .eq('variant_code', versionCode);
        if (error) {
          result.errors.push(`${externalKey}: product link lookup failed: ${error.message}`);
          continue;
        }
        products = data || [];
      } else if (modelId) {
        const { data, error } = await supabase
          .from('products')
          .select('id')
          .eq('oem_id', 'nissan-au')
          .eq('model_id', modelId);
        if (error) {
          result.errors.push(`${externalKey}: model product lookup failed: ${error.message}`);
          continue;
        }
        products = data || [];
      }

      if (products.length > 0) {
        const links = products.map(product => ({ offer_id: offerId, product_id: product.id }));
        const { error } = await supabase
          .from('offer_products')
          .upsert(links, { onConflict: 'offer_id,product_id' });
        if (error) {
          result.errors.push(`${externalKey}: offer-product link failed: ${error.message}`);
        } else {
          result.productLinksUpserted += links.length;
        }
      }
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}
