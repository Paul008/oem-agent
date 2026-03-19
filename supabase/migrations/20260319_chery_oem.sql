-- Chery Australia OEM onboarding (18th OEM)
-- Framework: Drupal CMS (SSR, no browser rendering needed)
-- Models: 14 (Tiggo 4/4H/7/7SH/8PM/8SH/9SH, Omoda 5/5GT/E5/E5RYI, C5, E5, Tiggo 7 Pro SE)
-- Sub-brand: Omoda
-- Brand color: #EB5757

INSERT INTO oems (id, name, base_url, is_active, config_json)
VALUES (
  'chery-au',
  'Chery Australia',
  'https://cherymotor.com.au',
  true,
  '{
    "homepage": "/",
    "vehicles_index": "/models",
    "offers": "/buying/offers",
    "news": "/news",
    "sub_brands": ["omoda"],
    "brand_color": "#EB5757",
    "framework": "drupal",
    "schedule": {
      "homepage_minutes": 1440,
      "offers_minutes": 1440,
      "vehicles_minutes": 720,
      "news_minutes": 1440
    }
  }'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  is_active = EXCLUDED.is_active,
  config_json = EXCLUDED.config_json;

-- Source pages
INSERT INTO source_pages (oem_id, url, page_type, status) VALUES
  ('chery-au', 'https://cherymotor.com.au/', 'homepage', 'active'),
  ('chery-au', 'https://cherymotor.com.au/buying/offers', 'offers', 'active'),
  ('chery-au', 'https://cherymotor.com.au/news', 'news', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-4', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-4-hybrid', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-7', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-7-super-hybrid', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-8-pro-max', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-8-super-hybrid', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-9-super-hybrid', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/chery-c5', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/chery-e5', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/omoda-5', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/omoda-5-gt', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/omoda-e5', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/omoda-e5-ryi', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/models/tiggo-7-pro-specialedition', 'vehicle', 'active'),
  ('chery-au', 'https://cherymotor.com.au/accessories', 'other', 'active')
ON CONFLICT DO NOTHING;

-- Vehicle models
INSERT INTO vehicle_models (oem_id, slug, name, source_url) VALUES
  ('chery-au', 'tiggo-4', 'Tiggo 4', 'https://cherymotor.com.au/models/tiggo-4'),
  ('chery-au', 'tiggo-4-hybrid', 'Tiggo 4 Hybrid', 'https://cherymotor.com.au/models/tiggo-4-hybrid'),
  ('chery-au', 'tiggo-7', 'Tiggo 7', 'https://cherymotor.com.au/models/tiggo-7'),
  ('chery-au', 'tiggo-7-super-hybrid', 'Tiggo 7 Super Hybrid', 'https://cherymotor.com.au/models/tiggo-7-super-hybrid'),
  ('chery-au', 'tiggo-8-pro-max', 'Tiggo 8 Pro Max', 'https://cherymotor.com.au/models/tiggo-8-pro-max'),
  ('chery-au', 'tiggo-8-super-hybrid', 'Tiggo 8 Super Hybrid', 'https://cherymotor.com.au/models/tiggo-8-super-hybrid'),
  ('chery-au', 'tiggo-9-super-hybrid', 'Tiggo 9 Super Hybrid', 'https://cherymotor.com.au/models/tiggo-9-super-hybrid'),
  ('chery-au', 'chery-c5', 'Chery C5', 'https://cherymotor.com.au/models/chery-c5'),
  ('chery-au', 'chery-e5', 'Chery E5', 'https://cherymotor.com.au/models/chery-e5'),
  ('chery-au', 'omoda-5', 'Omoda 5', 'https://cherymotor.com.au/models/omoda-5'),
  ('chery-au', 'omoda-5-gt', 'Omoda 5 GT', 'https://cherymotor.com.au/models/omoda-5-gt'),
  ('chery-au', 'omoda-e5', 'Omoda E5', 'https://cherymotor.com.au/models/omoda-e5'),
  ('chery-au', 'omoda-e5-ryi', 'Omoda E5 RYI', 'https://cherymotor.com.au/models/omoda-e5-ryi')
ON CONFLICT DO NOTHING;
