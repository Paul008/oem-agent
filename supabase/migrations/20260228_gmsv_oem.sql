-- ============================================================================
-- GMSV Australia — OEM + Source Pages
-- ============================================================================

-- Insert OEM record
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  'gmsv-au',
  'GMSV Australia',
  'https://www.gmspecialtyvehicles.com',
  '{
    "homepage": "/au-en",
    "vehicles_index": "/au-en/chevrolet/trucks",
    "offers": "/au-en",
    "schedule": {
      "homepage_minutes": 120,
      "offers_minutes": 240,
      "vehicles_minutes": 720,
      "news_minutes": 1440
    },
    "sub_brands": ["chevrolet", "corvette", "gmc"],
    "selectors": {
      "vehicleLinks": "a[href*=\"/trucks/silverado\"], a[href*=\"/corvette/\"], a[href*=\"/gmc/\"]",
      "heroSlides": "[role=\"tabpanel\"] a, .hero-carousel",
      "offerTiles": "[class*=\"offer\"], [class*=\"promo\"]"
    },
    "flags": {
      "requiresBrowserRendering": true,
      "hasSubBrands": true
    }
  }',
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active,
  updated_at = now();

-- Seed source pages
INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
-- Homepage
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en', 'homepage', 'active', now(), now()),
-- Vehicle index pages
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks', 'category', 'active', now(), now()),
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/corvette', 'category', 'active', now(), now()),
-- Silverado models
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-ltz-premium', 'vehicle', 'active', now(), now()),
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-zr2', 'vehicle', 'active', now(), now()),
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/trucks/silverado-2500hd', 'vehicle', 'active', now(), now()),
-- Corvette models
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/corvette/stingray', 'vehicle', 'active', now(), now()),
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/chevrolet/corvette/2025-eray', 'vehicle', 'active', now(), now()),
('gmsv-au', 'https://www.gmspecialtyvehicles.com/performance/corvette/z06', 'vehicle', 'active', now(), now()),
-- GMC
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/gmc/yukon-denali', 'vehicle', 'active', now(), now()),
-- Accessories
('gmsv-au', 'https://www.gmspecialtyvehicles.com/au-en/accessories', 'other', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;
