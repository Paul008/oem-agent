/**
 * OEM Registry
 * 
 * Configuration for all 13 Australian automotive OEMs.
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
    hasSubBrands?: boolean;
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
    offers: '/au/offers.html',
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
    heroSlides: '.hero-carousel .slide, [class*="hero"] [class*="carousel"]',
    offerTiles: '.offer-tile, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true,
    isAEM: true,
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
    requiresBrowserRendering: true,
    requiresPostcode: true,
    defaultPostcode: '2000',
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
    requiresBrowserRendering: true,
    isAEM: true,
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
    requiresBrowserRendering: true,
    isAEM: true,
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
    heroSlides: '.hero-carousel, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true,
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
    requiresBrowserRendering: true,
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
    requiresBrowserRendering: true,
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
    requiresBrowserRendering: true,
    isNextJs: true,
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
    requiresBrowserRendering: true,
    isNextJs: true,
    hasSubBrands: true,
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
    heroSlides: '.hero, [class*="hero"]',
    offerTiles: '.offer, [class*="offer"]',
  },
  flags: {
    requiresBrowserRendering: true,
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
    requiresBrowserRendering: true,
    isAEM: true,
    hasSubBrands: true,
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
  },
};

// ============================================================================
// Registry Collection
// ============================================================================

export const oemRegistry: Record<OemId, OemDefinition> = {
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
};

export const allOemIds: OemId[] = Object.keys(oemRegistry) as OemId[];

export function getOemDefinition(id: OemId): OemDefinition | undefined {
  return oemRegistry[id];
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
-- Seed data for 13 Australian OEMs
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
