/**
 * Seed discovered_apis table from OEM-variants repo API discovery data.
 * Run: node dashboard/scripts/seed-discovered-apis.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const apis = [
  // ═══════════════ FORD ═══════════════
  {
    oem_id: 'ford-au',
    url: 'https://www.servicescache.ford.com/api/polk/v4/describe',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      params: { locale: 'en_AU', retrieve: 'images,specs,featuresMkt,selectedMkt,featureImages,featureSpecs,keyFeatures,keyFeaturesModel,keyFeaturesWalkup,uscCodes,prices,featurePrices,content,disclaimers', config: '{catalogId}~{series},{powertrain},{paint}', postCode: '3000', productType: 'P' },
      returns: ['variant_codes', 'pricing', 'images', 'specs', 'features'],
      discovery_source: 'discoverFordPolkApi.js',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://ford-api.b-cdn.net/api/polk/v4/load',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { locale: 'en_AU', retrieve: 'images,selectedMkt', config: '{catalogId}~{series},{powertrain},{paint}' },
      returns: ['images', 'selected_marketing'],
      discovery_source: 'ford-api-reference.json',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.imgservices.ford.com/api/buy/vehicle/polk/update',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      params: { locale: 'en_AU', retrieve: 'images,specs,featuresMkt,selectedMkt', config: '{catalogId}~{series},{powertrain},{paint}' },
      returns: ['variant_codes', 'pricing', 'images', 'specs'],
      discovery_source: 'discoverFordPolkApi.js',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.imgservices.ford.com/api/buy/vehicle/polk/describe',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['detailed_specs', 'images', 'features'],
      discovery_source: 'discoverFordPolkApi.js',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.ford.com.au/content/ford/au/en_au.vehiclesmenu.data',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'config',
    reliability_score: 0.8,
    status: 'verified',
    schema_json: {
      returns: ['categories', 'nameplates', 'navigation_data'],
      note: 'Requires browser session cookies',
      discovery_source: 'ford-api-reference.json',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.ford.com.au/price/{Model}',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'pricing',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { postalCode: '3000', usageType: 'P' },
      returns: ['driveaway_prices', 'variants', 'filters'],
      note: 'Requires browser - Akamai blocks direct requests. Returns RSC data.',
      models: ['Ranger', 'Everest', 'Mustang', 'F-150'],
      discovery_source: 'ford-url-discovery-2026-02.json',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.ford.com.au/price/{Model}/summary',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'pricing',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { series: 'Grade code', powerTrain: 'Powertrain code', bodyStyle: 'Body style code', postalCode: '3000', usageType: 'P', paint: 'Optional paint code' },
      returns: ['driveaway_price', 'colors', 'interior', 'options', 'accessories'],
      note: 'Full configurator page. Requires browser session.',
      discovery_source: 'ford-api-reference.json',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.gpas-cache.ford.com/guid/{GUID}.png',
    method: 'GET',
    content_type: 'image/png',
    response_type: 'image',
    data_type: 'other',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      params: { catalogId: '{CATALOG_ID}', imformat: 'chrome' },
      returns: ['vehicle_image'],
      required_headers: { Referer: 'https://www.ford.com.au/', 'Sec-Fetch-Dest': 'image' },
      note: 'GPAS CDN. Requires specific headers or returns 403.',
      discovery_source: 'ford-api-reference.json',
    },
  },
  {
    oem_id: 'ford-au',
    url: 'https://www.ford.com.au/latest-offers/',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'offers',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['offer_cards', 'disclaimers', 'images'],
      note: 'HTML scraping via Cheerio/Puppeteer',
      discovery_source: 'scrapeFordOffersPage.js',
    },
  },

  // ═══════════════ KIA ═══════════════
  {
    oem_id: 'kia-au',
    url: 'https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByModel',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      params: { regionCode: 'VIC' },
      returns: ['models', 'model_codes', 'rrp_prices', 'offer_prices', 'driveaway_prices'],
      note: 'Returns 41 models with 200+ trims. Direct API access, no browser needed.',
      discovery_source: 'fetchKiaModels.js',
    },
  },
  {
    oem_id: 'kia-au',
    url: 'https://www.kia.com/api/kia_australia/common/trimPrice.selectPriceByTrim',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.95,
    status: 'verified',
    schema_json: {
      params: { regionCode: 'VIC', modelCode: '{modelCode}' },
      returns: ['trim_codes', 'trim_names', 'specifications', 'pricing'],
      discovery_source: 'fetchKiaModelDetails.js',
    },
  },
  {
    oem_id: 'kia-au',
    url: 'https://www.kia.com/api/kia_australia/base/carInfo.selectVehicleList',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['vehicle_list', 'brochure_urls'],
      discovery_source: 'fetchKiaBrochures.js',
    },
  },

  // ═══════════════ TOYOTA ═══════════════
  {
    oem_id: 'toyota-au',
    url: 'https://www.toyota.com.au/main/api/v1/finance/grades',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.8,
    status: 'verified',
    schema_json: {
      returns: ['grade_ids', 'grade_names', 'model_mapping'],
      note: 'May require browser due to Akamai protection.',
      discovery_source: 'fetchToyotaVariants.js',
    },
  },
  {
    oem_id: 'toyota-au',
    url: 'https://www.toyota.com.au/main/api/v1/toyotavehicles/range/grades/variants/',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.8,
    status: 'verified',
    schema_json: {
      returns: ['variants', 'pricing', 'specifications'],
      note: 'Variant details per grade. Append grade ID to URL.',
      discovery_source: 'fetchToyotaVariants.js',
    },
  },
  {
    oem_id: 'toyota-au',
    url: 'https://www.toyota.com.au/main/api/v1/toyotavehicles/range/grades/variants/trims/',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.8,
    status: 'verified',
    schema_json: {
      returns: ['trims', 'specifications', 'features'],
      discovery_source: 'fetchToyotaVariants.js',
    },
  },
  {
    oem_id: 'toyota-au',
    url: 'https://www.toyota.com.au/main/api/v1/toyotavehicles/image/360/all/',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'other',
    reliability_score: 0.8,
    status: 'verified',
    schema_json: {
      returns: ['360_exterior_images', '360_interior_images'],
      note: 'E01-E36 exterior angles, I01-I36 interior angles.',
      discovery_source: 'fetchToyotaVariants.js',
    },
  },
  {
    oem_id: 'toyota-au',
    url: 'https://toyota-api.b-cdn.net/main/api/v1/toyota/currentoffers/all',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'offers',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { tablePrefix: 'web' },
      returns: ['current_offers', 'pricing', 'validity_dates'],
      discovery_source: 'fetchToyotaOffersDirect.js',
    },
  },
  {
    oem_id: 'toyota-au',
    url: 'https://toyota-api.b-cdn.net/main/api/v1/toyota/currentoffers/disclaimers/all',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'offers',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { tablePrefix: 'web' },
      returns: ['disclaimers', 'terms_and_conditions'],
      discovery_source: 'fetchToyotaOffersApify.js',
    },
  },

  // ═══════════════ HYUNDAI ═══════════════
  {
    oem_id: 'hyundai-au',
    url: 'https://www.hyundai.com/content/api/au/hyundai/v3/carpricecalculator/models',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['model_list', 'model_codes'],
      discovery_source: 'fetchHyundaiVariants.js',
    },
  },
  {
    oem_id: 'hyundai-au',
    url: 'https://www.hyundai.com/content/api/au/hyundai/v3/carpricecalculator',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      params: { postcode: 'Australian postcode' },
      returns: ['variants', 'driveaway_pricing', 'specifications'],
      discovery_source: 'fetchHyundaiVariants.js',
    },
  },

  // ═══════════════ NISSAN ═══════════════
  {
    oem_id: 'nissan-au',
    url: 'https://gq-apn-prod.nissanpace.com/graphql',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['mlp_pricing', 'eim_codes', 'specifications'],
      note: 'GraphQL API. Requires specific query structure.',
      discovery_source: 'fetchNissanVariants.js',
    },
  },
  {
    oem_id: 'nissan-au',
    url: 'https://ap.nissan-api.net/v2',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['location_based_pricing', 'driveaway_prices'],
      note: 'Choices API for location-based driveaway pricing.',
      discovery_source: 'fetchNissanVariants.js',
    },
  },
  {
    oem_id: 'nissan-au',
    url: 'https://ms-prd.apn.mediaserver.heliosnissan.net/iris/iris',
    method: 'GET',
    content_type: 'image/jpeg',
    response_type: 'image',
    data_type: 'other',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { fabric: 'G', paint: '{code}', vehicle: '{vehicle_code}', pov: 'E01,cgd', width: '2000', brand: 'nisglo' },
      returns: ['360_vehicle_images'],
      note: 'Helios media server. E01-E36 exterior, I01-I36 interior angles.',
      discovery_source: 'fetchNissanVariants.js',
    },
  },

  // ═══════════════ GWM ═══════════════
  {
    oem_id: 'gwm-au',
    url: 'https://api.storyblok.com/v2/cdn/stories',
    method: 'GET',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'products',
    reliability_score: 0.9,
    status: 'verified',
    schema_json: {
      params: { content_type: 'AUModel', token: 'required' },
      returns: ['model_specifications', 'pricing', 'variants', 'images'],
      note: 'Storyblok CMS API. Direct access with public token.',
      discovery_source: 'fetchGwmModelsApi.js',
    },
  },
  {
    oem_id: 'gwm-au',
    url: 'https://www.gwmanz.com/au/offers/',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'offers',
    reliability_score: 0.85,
    status: 'verified',
    schema_json: {
      returns: ['offer_pricing', 'disclaimers', 'banners'],
      note: 'HTML scraping via Cheerio.',
      discovery_source: 'fetchGwmOffersCheerio.js',
    },
  },

  // ═══════════════ ISUZU ═══════════════
  {
    oem_id: 'isuzu-au',
    url: 'https://www.isuzuute.com.au/',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'offers',
    reliability_score: 0.7,
    status: 'verified',
    schema_json: {
      selectors: { offerCard: '.iua-card-deals', vehicleName: '.icd-figure__title', price: '.icd-details__title', image: '.icd-figure__image img' },
      returns: ['offer_cards', 'driveaway_prices', 'disclaimers'],
      note: 'Homepage offers section. HTML scraping via Cheerio.',
      discovery_source: 'fetchIsuzuOffers.js',
    },
  },

  // ═══════════════ FOTON ═══════════════
  {
    oem_id: 'foton-au',
    url: 'https://www.fotonaustralia.com.au/api/v1/custompricing/vehicles',
    method: 'POST',
    content_type: 'application/json',
    response_type: 'json',
    data_type: 'pricing',
    reliability_score: 0.85,
    status: 'discovered',
    schema_json: {
      required_headers: { 'Api-Key': 'Cdl7SZbG-swkp-VvdV-mFw2-b4P6-dJh6L8TJ' },
      body: { postCode: '2000', modelId: '{modelId}', variantIds: ['V7-4x2'], colorIndex: 0 },
      returns: ['rdp_pricing', 'mlp_pricing', 'government_charges_breakdown'],
      note: 'Postcode-gated RDP pricing. Returns full government charges breakdown (stamp duty, CTP, rego, luxury car tax). Api-Key header required.',
      discovery_source: 'browser network interception',
    },
  },

  // ═══════════════ SUZUKI ═══════════════
  {
    oem_id: 'suzuki-au',
    url: 'https://www.suzuki.com.au/models',
    method: 'GET',
    content_type: 'text/html',
    response_type: 'html',
    data_type: 'products',
    reliability_score: 0.6,
    status: 'discovered',
    schema_json: {
      returns: ['model_list', 'pricing'],
      note: 'Finance calculator requires browser. Brochures form-gated.',
      discovery_source: 'fetchSuzukiVariants.js',
    },
  },
]

async function seed() {
  console.log(`Inserting ${apis.length} discovered APIs...`)

  // Upsert in batches (unique on oem_id + url)
  const { data, error } = await supabase
    .from('discovered_apis')
    .upsert(apis, { onConflict: 'oem_id,url', ignoreDuplicates: false })
    .select('id, oem_id, url')

  if (error) {
    console.error('Error:', error.message)
    process.exit(1)
  }

  console.log(`Successfully upserted ${data.length} APIs:`)
  const byOem = {}
  data.forEach(d => { byOem[d.oem_id] = (byOem[d.oem_id] || 0) + 1 })
  Object.entries(byOem).sort().forEach(([oem, count]) => {
    console.log(`  ${oem}: ${count} APIs`)
  })
}

seed()
