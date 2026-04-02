/**
 * OEM Registry
 * 
 * Configuration for all 19 Australian automotive OEMs.
 * Based on crawl-config-v1.2 specification.
 */

import type { OemId, OemConfig, Oem } from './types';

export interface OemDefinition {
  id: OemId;
  name: string;
  baseUrl: string;
  config: OemConfig;
  // Extraction hints
  selectors: {
    vehicleLinks?: string;
    heroSlides?: string;
    offerTiles?: string;
    priceDisplay?: string;
  };
  // Special handling flags
  flags: {
    requiresBrowserRendering: boolean;
    requiresPostcode?: boolean;
    defaultPostcode?: string;
    isNextJs?: boolean;
    isAEM?: boolean;
    isGatsby?: boolean;
    hasSubBrands?: boolean;
    /** Frontend framework for extraction strategy and migration detection.
     *  Checked during crawl — if detected framework differs, a change event is logged. */
    framework?: 'gatsby' | 'nextjs' | 'nuxt' | 'aem' | 'react-spa' | 'react-ssr' | 'vue' | 'static' | 'wordpress' | 'sitecore' | 'drupal' | 'inchcape' | 'custom';
  };
}

// ============================================================================
// 1.1 Kia Australia
// ============================================================================
export const kiaAu: OemDefinition = {
  id: 'kia-au',
  name: 'Kia Australia',
  baseUrl: 'https://www.kia.com/au/',
  config: {
    homepage: '/au/main.html',
    vehicles_index: '/au/cars.html',
    offers: '/au/shopping-tools/offers/car-offers.html',
    news: '/au/discover/news.html',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'nav a[href^="/au/cars/"]',
    heroSlides: '.main-type-cpnt .main_wrap',
    offerTiles: '.resultList > li, .offer-tile, [class*="offer-card"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — selectPriceByTrim API for pricing
    isAEM: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.2 Nissan Australia
// ============================================================================
export const nissanAu: OemDefinition = {
  id: 'nissan-au',
  name: 'Nissan Australia',
  baseUrl: 'https://www.nissan.com.au/',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/browse-range.html',
    offers: '/offers.html',
    news: '/about-nissan/news-and-events.html',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    render_config: {
      set_postcode: '2000',
    },
  },
  selectors: {
    vehicleLinks: '.vehicle-list a, [class*="vehicle-card"] a',
    heroSlides: '.hero-slideshow .slide, [class*="hero"] img[src*="hero"]',
    offerTiles: '.offer-tile, [class*="offer"]',
    priceDisplay: '.price, [class*="price"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — server-rendered, postcode gating via JS only
    requiresPostcode: true,
    defaultPostcode: '2000',
    isAEM: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.3 Ford Australia
// ============================================================================
export const fordAu: OemDefinition = {
  id: 'ford-au',
  name: 'Ford Australia',
  baseUrl: 'https://www.ford.com.au/',
  config: {
    homepage: '/',
    offers: '/latest-offers.html',
    news: '/news.html',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/showroom/"]',
    heroSlides: '.billboard, [class*="billboard"]',
    offerTiles: '.offer-card, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — vehiclesmenu.data + GPAS APIs
    isAEM: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.4 Volkswagen Australia
// ============================================================================
export const volkswagenAu: OemDefinition = {
  id: 'volkswagen-au',
  name: 'Volkswagen Australia',
  baseUrl: 'https://www.volkswagen.com.au/',
  config: {
    homepage: '/en.html',
    vehicles_index: '/en/models.html',
    offers: '/app/locals/offers-pricing',
    news: '/en/brand-experience/volkswagen-newsroom/latest-news.html',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    render_required: ['homepage', 'offers'],
  },
  selectors: {
    vehicleLinks: 'a[href^="/en/models/"]',
    heroSlides: '.hero-slideshow, [class*="hero"]',
    offerTiles: '.offer-tile, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true,
    isAEM: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.5 Mitsubishi Motors Australia
// ============================================================================
export const mitsubishiAu: OemDefinition = {
  id: 'mitsubishi-au',
  name: 'Mitsubishi Motors Australia',
  baseUrl: 'https://www.mitsubishi-motors.com.au/',
  config: {
    homepage: '/?group=private',
    offers: '/offers.html',
    news: '/company/news.html',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/vehicles/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — server-rendered, colors from meta_json
    isAEM: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.6 LDV Automotive Australia
// ============================================================================
export const ldvAu: OemDefinition = {
  id: 'ldv-au',
  name: 'LDV Automotive Australia',
  baseUrl: 'https://www.ldvautomotive.com.au/',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/',
    offers: '/special-offers/',
    news: '/ldv-stories/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/vehicles/ldv-"]',
    heroSlides: '[class*="HhCarouselWrapper"] [class*="EmbCarouselItemWrapper"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // Gatsby SSR (i-motor) — full HTML in fetch, hero uses classHhCarouselWrapper/EmbCarouselItemWrapper
    isGatsby: true,
    framework: 'gatsby',
  },
};

// ============================================================================
// 1.7 Isuzu UTE Australia
// ============================================================================
export const isuzuAu: OemDefinition = {
  id: 'isuzu-au',
  name: 'Isuzu UTE Australia',
  baseUrl: 'https://www.isuzuute.com.au/',
  config: {
    homepage: '/',
    offers: '/offers/current-offers',
    news: '/discover/news',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/d-max/"], a[href^="/mu-x/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // Sitecore SSR — traditional server-side CMS
    framework: 'sitecore',
  },
};

// ============================================================================
// 1.8 Mazda Australia
// ============================================================================
export const mazdaAu: OemDefinition = {
  id: 'mazda-au',
  name: 'Mazda Australia',
  baseUrl: 'https://www.mazda.com.au/',
  config: {
    homepage: '/',
    offers: '/offers/',
    news: '/mazda-news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/cars/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // React SSR — vehicle data in ReactDOM.hydrate JSON in HTML, cheap fetch is sufficient
    framework: 'react-ssr',
  },
};

// ============================================================================
// 1.9 KGM (SsangYong) Australia
// ============================================================================
export const kgmAu: OemDefinition = {
  id: 'kgm-au',
  name: 'KGM (SsangYong) Australia',
  baseUrl: 'https://kgm.com.au/',
  config: {
    homepage: '/',
    offers: '/offers',
    news: '/discover-kgm',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/models/"]',
    heroSlides: '.hero-carousel, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // NextJS SSR — server-rendered by default
    isNextJs: true,
    framework: 'nextjs',
  },
};

// ============================================================================
// 1.10 GWM Australia
// ============================================================================
export const gwmAu: OemDefinition = {
  id: 'gwm-au',
  name: 'GWM Australia',
  baseUrl: 'https://www.gwmanz.com/au/',
  config: {
    homepage: '/au/',
    vehicles_index: '/au/models/',
    offers: '/au/offers/',
    news: '/au/news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    sub_brands: ['haval', 'tank', 'cannon', 'ora', 'wey'],
  },
  selectors: {
    vehicleLinks: 'a[href^="/au/models/"]',
    heroSlides: '.hero-carousel, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // Nuxt SSR — Storyblok CMS, server-rendered
    hasSubBrands: true,
    framework: 'nuxt',
  },
};

// ============================================================================
// 1.11 Suzuki Australia
// ============================================================================
export const suzukiAu: OemDefinition = {
  id: 'suzuki-au',
  name: 'Suzuki Australia',
  baseUrl: 'https://www.suzuki.com.au/',
  config: {
    homepage: '/home/',
    vehicles_index: '/vehicles/',
    offers: '/offers/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href^="/vehicles/"]',
    heroSlides: '.hb-2025-refresh__item',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true, // Hero carousel images injected by JS from data-respim attrs
    framework: 'wordpress',
  },
};

// ============================================================================
// 1.12 Hyundai Australia
// ============================================================================
export const hyundaiAu: OemDefinition = {
  id: 'hyundai-au',
  name: 'Hyundai Australia',
  baseUrl: 'https://www.hyundai.com/au/en',
  config: {
    homepage: '/au/en',
    vehicles_index: '/au/en/cars',
    offers: '/au/en/offers',
    news: '/au/en/news',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    sub_brands: ['ioniq', 'n'],
  },
  selectors: {
    vehicleLinks: 'a[href^="/au/en/cars/"]',
    heroSlides: '.hero-carousel, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — CGI Configurator API for colors
    isAEM: true,
    hasSubBrands: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.13 Toyota Australia
// ============================================================================
export const toyotaAu: OemDefinition = {
  id: 'toyota-au',
  name: 'Toyota Australia',
  baseUrl: 'https://www.toyota.com.au/',
  config: {
    homepage: '/',
    vehicles_index: '/all-vehicles',
    offers: '/offers',
    news: '/news',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    sub_brands: ['gr'],
  },
  selectors: {
    vehicleLinks: 'a[href^="/"]:not([href="/"])', // Top-level model paths
    heroSlides: '.hero-carousel, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true,
    isNextJs: true,
    hasSubBrands: true,
    framework: 'nextjs',
  },
};

export const subaruAu: OemDefinition = {
  id: 'subaru-au',
  name: 'Subaru Australia',
  baseUrl: 'https://www.subaru.com.au/',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles',
    offers: '/special-offers',
    news: '/newsroom',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    sub_brands: [],
  },
  selectors: {
    vehicleLinks: 'a[href*="/vehicles/"]',
    heroSlides: '[class*="hero"], [class*="banner"]',
    offerTiles: '[class*="offer"], [class*="special"]',
  },
  flags: {
    requiresBrowserRendering: false, // Inchcape SSR — 188K HTML with model names and vehicle links via cheap fetch
    isNextJs: false,
    hasSubBrands: false,
    framework: 'inchcape',
  },
};

// ============================================================================
// 1.15 GMSV Australia
// ============================================================================
export const gmsvAu: OemDefinition = {
  id: 'gmsv-au',
  name: 'GMSV Australia',
  baseUrl: 'https://www.gmspecialtyvehicles.com',
  config: {
    homepage: '/au-en',
    vehicles_index: '/au-en/chevrolet/trucks',
    offers: '/au-en', // No dedicated offers page — homepage features promos
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
    sub_brands: ['chevrolet', 'corvette', 'gmc'],
  },
  selectors: {
    vehicleLinks: 'a[href*="/trucks/silverado"], a[href*="/corvette/"], a[href*="/gmc/"]',
    heroSlides: '[role="tabpanel"] a, .hero-carousel',
    offerTiles: '[class*="offer"], [class*="promo"]',
  },
  flags: {
    requiresBrowserRendering: false, // AEM SSR — JS for UI interactions only, data in HTML
    isAEM: true,
    hasSubBrands: true,
    framework: 'aem',
  },
};

// ============================================================================
// 1.16 Foton Australia
// ============================================================================
export const fotonAu: OemDefinition = {
  id: 'foton-au',
  name: 'Foton Australia',
  baseUrl: 'https://www.fotonaustralia.com.au',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/foton/',
    offers: '/', // No dedicated offers page
    news: '/about-us/news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/ute/"], a[href*="/trucks/series/"]',
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '[class*="offer"], [class*="promo"]',
  },
  flags: {
    requiresBrowserRendering: false,
    framework: 'custom',
  },
};

// ============================================================================
// 1.17 GAC Australia
// ============================================================================
export const gacAu: OemDefinition = {
  id: 'gac-au',
  name: 'GAC Australia',
  baseUrl: 'https://www.gacgroup.com/en-au/',
  config: {
    homepage: '/',
    vehicles_index: '/en-au/',
    offers: '/', // No dedicated offers page
    schedule: {
      homepage_minutes: 1440,
      offers_minutes: 1440,
      vehicles_minutes: 1440,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/en-au/suv/"], a[href*="/en-au/mpv/"], a[href*="/en-au/hatchback/"]',
    heroSlides: '.hero, [class*="hero"], [class*="banner"]',
    offerTiles: '[class*="offer"], [class*="promo"]',
  },
  flags: {
    requiresBrowserRendering: false, // Nuxt SSR — server-rendered by default
    framework: 'nuxt',
  },
};

// ============================================================================
// 1.19 Renault Australia
// ============================================================================
export const renaultAu: OemDefinition = {
  id: 'renault-au',
  name: 'Renault Australia',
  baseUrl: 'https://www.renault.com.au',
  config: {
    homepage: '/',
    vehicles_index: '/vehicles/',
    offers: '/special-offers/',
    news: '/news/',
    schedule: {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/vehicles/"]',
    heroSlides: '[class*="HhCarouselWrapper"] [class*="EmbCarouselItemWrapper"]',
    offerTiles: '[class*="special"], [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: false,
    isGatsby: true,
    framework: 'gatsby',
  },
};

const cheryAu: OemDefinition = {
  id: 'chery-au',
  name: 'Chery Australia',
  baseUrl: 'https://cherymotor.com.au',
  config: {
    homepage: '/',
    vehicles_index: '/models',
    offers: '/buying/offers',
    news: '/news',
    sub_brands: ['omoda'],
    schedule: {
      homepage_minutes: 1440,
      offers_minutes: 1440,
      vehicles_minutes: 720,
      news_minutes: 1440,
    },
  },
  selectors: {
    vehicleLinks: 'a[href*="/models/"]',
    heroSlides: '.hero, [class*="hero"], [class*="banner"]',
    offerTiles: '[class*="offer"], [class*="promo"], [class*="card"]',
  },
  flags: {
    requiresBrowserRendering: false,
    framework: 'drupal',
  },
};

// ============================================================================
// Registry Collection
// ============================================================================

export const oemRegistry: Record<string, OemDefinition> = {
  'kia-au': kiaAu,
  'nissan-au': nissanAu,
  'ford-au': fordAu,
  'volkswagen-au': volkswagenAu,
  'mitsubishi-au': mitsubishiAu,
  'ldv-au': ldvAu,
  'isuzu-au': isuzuAu,
  'mazda-au': mazdaAu,
  'kgm-au': kgmAu,
  'gwm-au': gwmAu,
  'suzuki-au': suzukiAu,
  'hyundai-au': hyundaiAu,
  'toyota-au': toyotaAu,
  'subaru-au': subaruAu,
  'gmsv-au': gmsvAu,
  'foton-au': fotonAu,
  'gac-au': gacAu,
  'chery-au': cheryAu,
  'renault-au': renaultAu,
};

export const allOemIds: OemId[] = Object.keys(oemRegistry) as OemId[];

export function getOemDefinition(id: OemId): OemDefinition | undefined {
  return oemRegistry[id];
}

/**
 * Resolve an OEM definition from the static registry first, then fall back
 * to the Supabase `oems` table for dynamically onboarded OEMs.
 */
export async function resolveOemDefinition(
  id: OemId,
  supabase: { from: (table: string) => any },
): Promise<OemDefinition | undefined> {
  // 1. Check static registry
  const staticDef = getOemDefinition(id);
  if (staticDef) return staticDef;

  // 2. Fall back to database for dynamically onboarded OEMs
  const { data } = await supabase
    .from('oems')
    .select('id, name, base_url, config_json, is_active')
    .eq('id', id)
    .eq('is_active', true)
    .single();

  if (!data) return undefined;

  const config = data.config_json || {};
  return {
    id: data.id as OemId,
    name: data.name,
    baseUrl: data.base_url,
    config: {
      homepage: config.homepage || data.base_url,
      vehicles_index: config.vehicles_index,
      offers: config.offers || data.base_url,
      news: config.news,
      schedule: config.schedule || {
        homepage_minutes: 60,
        offers_minutes: 120,
        vehicles_minutes: 360,
        news_minutes: 1440,
      },
      render_config: config.render_config,
      render_required: config.render_required,
      sub_brands: config.sub_brands,
    },
    selectors: config.selectors || {},
    flags: config.flags || {
      requiresBrowserRendering: false,
    },
  };
}

export function getAllOemDefinitions(): OemDefinition[] {
  return Object.values(oemRegistry);
}

export function getActiveOemDefinitions(): OemDefinition[] {
  return Object.values(oemRegistry); // All are active by default
}

// ============================================================================
// SQL Seed Data Generator
// ============================================================================

export function generateOemSeedData(): string {
  const values = getAllOemDefinitions().map(oem => {
    const config = {
      ...oem.config,
      selectors: oem.selectors,
      flags: oem.flags,
    };
    return `('${oem.id}', '${oem.name.replace(/'/g, "''")}', '${oem.baseUrl}', '${JSON.stringify(config).replace(/'/g, "''")}', true)`;
  });

  return `
-- Seed data for 19 Australian OEMs
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES
${values.join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();
`;
}
