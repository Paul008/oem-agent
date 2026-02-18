-- ============================================================================
-- Phase 1: Database Restructure — Add new tables (non-breaking)
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- vehicle_models: The missing middle layer between OEMs and variants
-- ============================================================================

CREATE TABLE IF NOT EXISTS vehicle_models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,                    -- 'sportage', 'ev9', 'ranger'
  name TEXT NOT NULL,                    -- 'Sportage', 'EV9', 'Ranger'
  body_type TEXT,                        -- 'SUV', 'Sedan', 'Ute', 'Hatch'
  category TEXT,                         -- 'suv', 'electric', 'hybrid', 'commercial'
  model_year INT,                        -- 2025, 2026
  is_active BOOLEAN DEFAULT true,
  hero_image_url TEXT,
  configurator_url TEXT,                 -- build-and-price entry URL
  source_url TEXT,                       -- main model page URL
  oem_model_code TEXT,                   -- OEM internal code (e.g. 'NQ5_PE_RHD')
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, slug)
);

ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY vehicle_models_service_role_policy ON vehicle_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_vehicle_models_oem_id ON vehicle_models(oem_id);
CREATE INDEX idx_vehicle_models_slug ON vehicle_models(slug);
CREATE INDEX idx_vehicle_models_active ON vehicle_models(oem_id) WHERE is_active = true;

-- ============================================================================
-- Extend products table with model linkage + variant fields
-- ============================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES vehicle_models(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_code TEXT,
  ADD COLUMN IF NOT EXISTS variant_name TEXT,
  ADD COLUMN IF NOT EXISTS drivetrain TEXT,
  ADD COLUMN IF NOT EXISTS engine_desc TEXT;

CREATE INDEX IF NOT EXISTS idx_products_model_id ON products(model_id);
CREATE INDEX IF NOT EXISTS idx_products_variant_code ON products(variant_code);

-- ============================================================================
-- variant_colors: one product → many exterior color options
-- ============================================================================

CREATE TABLE IF NOT EXISTS variant_colors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_type TEXT,                       -- 'solid', 'metallic', 'pearl', 'matte'
  is_standard BOOLEAN DEFAULT false,
  price_delta NUMERIC DEFAULT 0,
  swatch_url TEXT,
  hero_image_url TEXT,
  gallery_urls JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, color_code)
);

ALTER TABLE variant_colors ENABLE ROW LEVEL SECURITY;
CREATE POLICY variant_colors_service_role_policy ON variant_colors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_variant_colors_product_id ON variant_colors(product_id);
CREATE INDEX idx_variant_colors_color_code ON variant_colors(color_code);

-- ============================================================================
-- variant_pricing: per-state, per-paint-type pricing
-- ============================================================================

CREATE TABLE IF NOT EXISTS variant_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL DEFAULT 'standard',  -- 'standard', 'premium', 'matte'
  rrp NUMERIC,
  driveaway_nsw NUMERIC,
  driveaway_vic NUMERIC,
  driveaway_qld NUMERIC,
  driveaway_wa NUMERIC,
  driveaway_sa NUMERIC,
  driveaway_tas NUMERIC,
  driveaway_act NUMERIC,
  driveaway_nt NUMERIC,
  price_qualifier TEXT,
  effective_date DATE,
  source_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, price_type)
);

ALTER TABLE variant_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY variant_pricing_service_role_policy ON variant_pricing
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_variant_pricing_product_id ON variant_pricing(product_id);
CREATE INDEX idx_variant_pricing_type ON variant_pricing(price_type);

-- ============================================================================
-- variant_interiors: one product → many interior trim options
-- ============================================================================

CREATE TABLE IF NOT EXISTS variant_interiors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  interior_code TEXT NOT NULL,
  interior_name TEXT NOT NULL,
  material TEXT,                          -- 'cloth', 'leather', 'artificial_leather', 'suede'
  is_standard BOOLEAN DEFAULT true,
  price_delta NUMERIC DEFAULT 0,
  swatch_url TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, interior_code)
);

ALTER TABLE variant_interiors ENABLE ROW LEVEL SECURITY;
CREATE POLICY variant_interiors_service_role_policy ON variant_interiors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_variant_interiors_product_id ON variant_interiors(product_id);

-- ============================================================================
-- oem_color_palette: master color reference per OEM
-- Avoids duplicating color metadata across thousands of variant_colors rows
-- ============================================================================

CREATE TABLE IF NOT EXISTS oem_color_palette (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_type TEXT,                        -- 'solid', 'metallic', 'pearl', 'matte'
  hex_approx TEXT,                        -- e.g. '#1A1A2E' for UI rendering
  swatch_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, color_code)
);

ALTER TABLE oem_color_palette ENABLE ROW LEVEL SECURITY;
CREATE POLICY oem_color_palette_service_role_policy ON oem_color_palette
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_oem_color_palette_oem_id ON oem_color_palette(oem_id);

-- ============================================================================
-- Add model_id to offers for proper linking
-- ============================================================================

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES vehicle_models(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_offers_model_id ON offers(model_id);

-- ============================================================================
-- Useful views
-- ============================================================================

-- Product catalog with model info and pricing
CREATE OR REPLACE VIEW product_catalog AS
SELECT
  p.id,
  p.oem_id,
  vm.name AS model_name,
  vm.slug AS model_slug,
  vm.body_type AS model_body_type,
  vm.category AS model_category,
  p.title,
  p.variant_code,
  p.variant_name,
  p.fuel_type,
  p.drivetrain,
  p.engine_desc,
  p.price_amount AS rrp,
  vp_std.driveaway_nsw,
  vp_prem.driveaway_nsw AS driveaway_nsw_premium,
  COALESCE(vp_prem.driveaway_nsw - vp_std.driveaway_nsw, 0) AS premium_paint_delta,
  (SELECT COUNT(*) FROM variant_colors vc WHERE vc.product_id = p.id) AS color_count,
  p.primary_image_r2_key AS hero_image,
  p.source_url,
  p.external_key,
  p.updated_at
FROM products p
LEFT JOIN vehicle_models vm ON p.model_id = vm.id
LEFT JOIN variant_pricing vp_std ON vp_std.product_id = p.id AND vp_std.price_type = 'standard'
LEFT JOIN variant_pricing vp_prem ON vp_prem.product_id = p.id AND vp_prem.price_type = 'premium'
ORDER BY p.oem_id, vm.name, p.variant_name;

-- Model overview with variant/color counts and price range
CREATE OR REPLACE VIEW model_overview AS
SELECT
  vm.id,
  vm.oem_id,
  vm.name,
  vm.slug,
  vm.body_type,
  vm.category,
  vm.model_year,
  vm.hero_image_url,
  vm.configurator_url,
  COUNT(DISTINCT p.id) AS variant_count,
  COUNT(DISTINCT vc.color_code) AS color_count,
  MIN(p.price_amount) AS price_from,
  MAX(p.price_amount) AS price_to,
  MIN(vp.driveaway_nsw) AS driveaway_from,
  MAX(vp.driveaway_nsw) AS driveaway_to,
  vm.updated_at
FROM vehicle_models vm
LEFT JOIN products p ON p.model_id = vm.id
LEFT JOIN variant_colors vc ON vc.product_id = p.id
LEFT JOIN variant_pricing vp ON vp.product_id = p.id AND vp.price_type = 'standard'
GROUP BY vm.id
ORDER BY vm.oem_id, vm.name;

-- OEM summary dashboard
CREATE OR REPLACE VIEW oem_dashboard AS
SELECT
  o.id AS oem_id,
  o.name AS oem_name,
  (SELECT COUNT(*) FROM vehicle_models vm WHERE vm.oem_id = o.id AND vm.is_active) AS model_count,
  (SELECT COUNT(*) FROM products p WHERE p.oem_id = o.id) AS variant_count,
  (SELECT COUNT(*) FROM offers of2 WHERE of2.oem_id = o.id) AS offer_count,
  (SELECT COUNT(*) FROM variant_colors vc 
   JOIN products p ON vc.product_id = p.id 
   WHERE p.oem_id = o.id) AS color_entries,
  (SELECT COUNT(*) FROM variant_pricing vp 
   JOIN products p ON vp.product_id = p.id 
   WHERE p.oem_id = o.id) AS pricing_entries,
  (SELECT MAX(p.updated_at) FROM products p WHERE p.oem_id = o.id) AS last_product_update
FROM oems o
WHERE o.is_active = true
ORDER BY o.name;
