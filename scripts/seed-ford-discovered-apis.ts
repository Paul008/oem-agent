/**
 * Seed ford-au entries in `discovered_apis` with the endpoints we
 * reverse-engineered this session. Registering these means:
 *  - Future crawls / devs don't have to re-discover them
 *  - The oem-api-discover skill can use them as known-good patterns
 *  - Sample request bodies are captured so other code paths can POST directly
 *
 * Run:  pnpm tsx scripts/seed-ford-discovered-apis.ts [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

interface Api {
  url: string;
  method: string;
  content_type: string | null;
  response_type: string;
  data_type: string;
  status: 'active' | 'investigating' | 'blocked';
  reliability_score: number;
  sample_request_headers: Record<string, string>;
  sample_request_body: any;
  schema_json: any;
}

const FORD_APIS: Api[] = [
  {
    url: 'https://www.imgservices.ford.com/api/buy/vehicle/polk/update',
    method: 'PUT',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'build_calculator',
    status: 'active',
    reliability_score: 0.9,
    sample_request_headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.ford.com.au',
      'Referer': 'https://www.ford.com.au/',
    },
    sample_request_body: {
      configState: '<base64-encoded JSON with catalogId + wersCodes + selectedFeatures + conditionalDefaultPrecendence>',
      displayContext: 'VISTA',
      feature: '<WERS code being toggled>',
      locale: 'en_AU',
      postCode: '3000',
      productType: 'P',
      retrieve: 'images,specs,featuresMkt,selectedMkt,featureImages,featureSpecs,keyFeatures,keyFeaturesModel,keyFeaturesWalkup,uscCodes,prices,featurePrices,content,disclaimers',
      suppressDisplayContext: true,
      unselect: false,
    },
    schema_json: {
      description: 'Stateful build calculator. Takes a pre-encoded configState blob and a single feature toggle; returns updated prices/specs/features. Anonymous access works from CF Worker. Requires seeded configState from HAR or SPA bootstrap.',
      requires: ['configState'],
      returns: ['status', 'data.configState (updated)', 'data.prices', 'data.features', 'data.specs', 'data.disclaimers'],
      anonymous: true,
      tested_from_cf_worker: true,
    },
  },
  {
    url: 'https://www.imgservices.ford.com/api/buy/nukleus/wrapper/accessories/vehicle-features',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'accessories',
    status: 'active',
    reliability_score: 0.9,
    sample_request_headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://www.ford.com.au',
      'Referer': 'https://www.ford.com.au/',
    },
    sample_request_body: {
      filters: {
        catalogId: 'WAPAB-TRA-2021-RangerThaiAUS202600',
        series: 'ABML1_SE#F7',
        bodyStyle: 'CA#BC',
        powertrain: 'DGACX_DR--G_EN-YN_TR-EU',
        popularProductsSize: 10,
        vehicleColor: 'PMYFU',
        nameplate: 'Ranger',
      },
      markers: {
        fields: 'WITH_VEHICLE,WITH_DEALER',
        lang: 'en_AU',
        baseSiteId: 'aus',
        latitude: '-37.81027',
        longitude: '144.96409',
        radius: 1000,
      },
    },
    schema_json: {
      description: 'Accessories for a fully-configured Ford build. Returns popular + categorised accessories, dealer info, part numbers, prices. Requires full config tuple — partial filters return 400.',
      requires: ['filters.catalogId', 'filters.series', 'filters.bodyStyle', 'filters.powertrain', 'filters.vehicleColor', 'filters.nameplate'],
      returns: ['dealerInfo', 'accessoryCategories[].products[]'],
      anonymous: true,
      tested_from_cf_worker: true,
    },
  },
  {
    url: 'https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'nameplate_menu',
    status: 'active',
    reliability_score: 1.0,
    sample_request_headers: { 'Accept': '*/*', 'Referer': 'https://www.ford.com.au/' },
    sample_request_body: null,
    schema_json: {
      description: 'Current Ford AU nameplate menu. Array of categories → nameplates with internal AEM paths + jellybean images. Authoritative source for model lineup; used by scripts/sync-ford-models.ts.',
      requires: [],
      returns: ['[{category, nameplates: [{code, name, path, image, additionalCTA, pricing}]}]'],
      fetched_via: 'puppeteer (Akamai blocks plain curl at 403, but puppeteer with warmed session succeeds)',
      consumed_by: ['scripts/fetch-ford-json.ts', 'scripts/sync-ford-models.ts'],
    },
  },
  {
    url: 'https://www.ford.com.au/price/<Name>',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'build_and_price_page',
    status: 'active',
    reliability_score: 1.0,
    sample_request_headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'text/html',
    },
    sample_request_body: null,
    schema_json: {
      description: 'Build & Price landing page for a nameplate. Plain fetch() works (no cookies needed). HTML contains `self.__next_f.push([1,"..."])` RSC payloads with initialNameplateConfigs (catalogId, nameplateId, nameplateYear, UI labels). Series codes (ABML1_SE#G1 etc.) also visible in DOM markup. Prices are NOT rendered server-side — filled client-side by Nukleus.',
      extract_patterns: {
        catalogId: 'WAPAB-[A-Za-z0-9_-]+',
        seriesCode: 'ABML1_SE#[A-Z0-9]+  (Ranger example)',
        rscBlob: 'self\\.__next_f\\.push\\(\\[1,\\s*"(.+?)"\\]\\)',
      },
      anonymous: true,
      known_nameplate_urls: [
        'https://www.ford.com.au/price/Ranger',
        'https://www.ford.com.au/price/RangerHybrid',
        'https://www.ford.com.au/price/Everest',
        'https://www.ford.com.au/price/F-150',
        'https://www.ford.com.au/price/Mustang',
        'https://www.ford.com.au/price/MustangMach-E',
        'https://www.ford.com.au/price/TransitCustom',
        'https://www.ford.com.au/price/Tourneo',
      ],
    },
  },
  {
    url: 'https://assets.adobedtm.com/effe41ce5952/8925493e320e/99ec13fb4fcd/RCc18793b2e02d4bcc8d371765ab856186-source.min.js',
    method: 'GET',
    content_type: 'application/javascript',
    response_type: 'js',
    data_type: 'catalog_registry_leak',
    status: 'active',
    reliability_score: 0.7,
    sample_request_headers: {},
    sample_request_body: null,
    schema_json: {
      description: 'Adobe DTM Rules JS bundle for Ford AU. Contains regex page-group definitions that embed Ford catalogIds. Useful for harvesting catalogIds without walking the SPA. Stale by ~1 model year.',
      extract_pattern: 'WAPAB-[A-Za-z0-9_-]+',
      coverage_observed: ['Ranger (MY2025.25)', 'Everest (MY2025.25)', 'F-150', 'Mach-E', 'Mustang (MY2025)', 'Transit Custom', 'Tourneo Custom'],
      staleness_note: 'Current live catalogIds (e.g., Ranger MY2026) may not yet be in this bundle.',
    },
  },
  {
    url: 'https://c.go-mpulse.net/api/config.json?d=www.ford.com.au',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'catalog_registry_leak_stale',
    status: 'active',
    reliability_score: 0.5,
    sample_request_headers: { 'Origin': 'https://www.ford.com.au', 'Referer': 'https://www.ford.com.au/' },
    sample_request_body: null,
    schema_json: {
      description: 'Akamai mPulse RUM config. pageGroups regex rules leak historical catalogIds. Lags Adobe DTM; mostly old MY catalogs. Secondary fallback only.',
      coverage_observed: ['RangerAUS202200', 'EverestAUS202200', 'RangerThaiAUS202450', 'EverestAUS202450', 'Mach-EAUS202375', 'F-150AUS202300'],
      full_query_string_required: true,
    },
  },
];

async function main() {
  const { data: existing } = await s.from('discovered_apis').select('id, url, method').eq('oem_id', 'ford-au');
  const seen = new Map((existing ?? []).map((r) => [`${r.method} ${r.url}`, r.id]));

  const inserts: any[] = [];
  const updates: Array<{ id: string; patch: any; key: string }> = [];

  for (const api of FORD_APIS) {
    const key = `${api.method} ${api.url}`;
    const payload = {
      oem_id: 'ford-au',
      url: api.url,
      method: api.method,
      content_type: api.content_type,
      response_type: api.response_type,
      data_type: api.data_type,
      status: api.status,
      reliability_score: api.reliability_score,
      sample_request_headers: api.sample_request_headers,
      sample_request_body: api.sample_request_body,
      schema_json: api.schema_json,
    };
    if (seen.has(key)) updates.push({ id: seen.get(key)!, patch: payload, key });
    else inserts.push(payload);
  }

  console.log(`=== Plan ===`);
  console.log(`  inserts: ${inserts.length}`);
  for (const i of inserts) console.log(`    + ${i.method} ${i.url}`);
  console.log(`  updates: ${updates.length}`);
  for (const u of updates) console.log(`    ~ ${u.key}`);

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply'); return; }

  let ok = 0;
  for (const row of inserts) {
    const { error } = await s.from('discovered_apis').insert(row);
    if (error) {
      if (error.code === '23505' || /duplicate/i.test(error.message)) {
        // Row already exists under a different method or the constraint covers oem_id+url only.
        const { error: uErr } = await s.from('discovered_apis').update({
          method: row.method,
          content_type: row.content_type,
          response_type: row.response_type,
          data_type: row.data_type,
          status: row.status,
          reliability_score: row.reliability_score,
          sample_request_headers: row.sample_request_headers,
          sample_request_body: row.sample_request_body,
          schema_json: row.schema_json,
        }).eq('oem_id', 'ford-au').eq('url', row.url);
        if (uErr) console.error(`  upsert ${row.method} ${row.url}: ${uErr.message}`);
        else { console.log(`  ~ ${row.method} ${row.url} (upserted)`); ok++; }
      } else {
        console.error(`  insert ${row.method} ${row.url}: ${error.message}`);
      }
    } else {
      console.log(`  + ${row.method} ${row.url}`);
      ok++;
    }
  }
  console.log(`\n  inserted/updated ${ok}/${inserts.length}`);
  for (const u of updates) {
    const { error } = await s.from('discovered_apis').update(u.patch).eq('id', u.id);
    if (error) console.error(`  update ${u.key}: ${error.message}`);
    else console.log(`  updated ${u.key} ✓`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
