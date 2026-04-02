-- Renault Australia OEM record
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES (
  'renault-au',
  'Renault Australia',
  'https://www.renault.com.au',
  '{
    "homepage": "/",
    "vehicles_index": "/vehicles/",
    "offers": "/special-offers/",
    "news": "/news/",
    "brand_colors": ["#EFDF00", "#000000"],
    "framework": "gatsby",
    "platform": "imotor",
    "notes": "Gatsby 5.14.6 + i-motor CMS (same platform as LDV). All data via page-data.json."
  }'::jsonb,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  config_json = EXCLUDED.config_json,
  is_active = EXCLUDED.is_active;

-- Source pages for crawling
INSERT INTO source_pages (oem_id, url, page_type, is_active) VALUES
  ('renault-au', 'https://www.renault.com.au/', 'homepage', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/scenic-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/koleos/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/duster/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/megane-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/arkana/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/master-van/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/kangoo/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/kangoo-e-tech/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/vehicles/trafic/', 'vehicle', true),
  ('renault-au', 'https://www.renault.com.au/special-offers/', 'offers', true),
  ('renault-au', 'https://www.renault.com.au/news/', 'news', true)
ON CONFLICT DO NOTHING;
