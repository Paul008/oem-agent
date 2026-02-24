-- ============================================================================
-- Foton Australia — OEM + Source Pages
-- ============================================================================

-- Insert OEM record
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  'foton-au',
  'Foton Australia',
  'https://www.fotonaustralia.com.au',
  '{
    "homepage": "/",
    "vehicles_index": "/vehicles/foton/",
    "offers": "/",
    "news": "/about-us/news/",
    "schedule": {
      "homepage_minutes": 120,
      "offers_minutes": 240,
      "vehicles_minutes": 720,
      "news_minutes": 1440
    },
    "selectors": {
      "vehicleLinks": "a[href*=\"/ute/\"], a[href*=\"/trucks/series/\"]",
      "heroSlides": ".hero, [class*=\"hero\"]",
      "offerTiles": "[class*=\"offer\"], [class*=\"promo\"]"
    },
    "flags": {
      "requiresBrowserRendering": false
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

-- Seed source pages (8 pages)
INSERT INTO source_pages (oem_id, url, page_type, status, created_at, updated_at) VALUES
-- Homepage
('foton-au', 'https://www.fotonaustralia.com.au/', 'homepage', 'active', now(), now()),
-- Category pages
('foton-au', 'https://www.fotonaustralia.com.au/vehicles/foton/', 'category', 'active', now(), now()),
('foton-au', 'https://www.fotonaustralia.com.au/trucks/series/', 'category', 'active', now(), now()),
-- Vehicle pages
('foton-au', 'https://www.fotonaustralia.com.au/ute/tunland/', 'vehicle', 'active', now(), now()),
('foton-au', 'https://www.fotonaustralia.com.au/trucks/series/aumark-s/', 'vehicle', 'active', now(), now()),
-- Accessories
('foton-au', 'https://www.fotonaustralia.com.au/ownership/accessories/', 'other', 'active', now(), now()),
-- News
('foton-au', 'https://www.fotonaustralia.com.au/about-us/news/', 'news', 'active', now(), now()),
-- Dealer locator
('foton-au', 'https://www.fotonaustralia.com.au/find-a-dealer/', 'other', 'active', now(), now())
ON CONFLICT (oem_id, url) DO NOTHING;
