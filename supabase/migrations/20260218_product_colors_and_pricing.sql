-- ============================================================================
-- Product Colors: one product → many exterior color options
-- Each color has its own swatch, gallery images, and price delta
-- ============================================================================

CREATE TABLE product_colors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color_code TEXT NOT NULL,           -- OEM code e.g. 'ABP', 'SWP'
  color_name TEXT NOT NULL,           -- Human name e.g. 'Aurora Black Pearl'
  color_type TEXT,                    -- 'solid', 'metallic', 'pearl', 'matte'
  is_standard BOOLEAN DEFAULT false,  -- true if included in base price
  price_delta NUMERIC DEFAULT 0,      -- additional cost for this color (e.g. 618.00)
  swatch_url TEXT,                    -- small color swatch image
  hero_image_url TEXT,                -- main vehicle image in this color
  gallery_urls JSONB DEFAULT '[]',    -- array of gallery image URLs for this color
  hex_code TEXT,                      -- approximate hex color for UI rendering
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, color_code)
);

ALTER TABLE product_colors ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_colors_service_role_policy ON product_colors
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_product_colors_product_id ON product_colors(product_id);
CREATE INDEX idx_product_colors_color_code ON product_colors(color_code);

-- ============================================================================
-- Product Pricing: per-state drive-away pricing for each product
-- Supports multiple price types (standard paint, premium paint, etc.)
-- ============================================================================

CREATE TABLE product_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_type TEXT NOT NULL DEFAULT 'standard',  -- 'standard', 'premium', 'matte'
  rrp NUMERIC,                        -- manufacturer recommended retail price
  driveaway_nsw NUMERIC,
  driveaway_vic NUMERIC,
  driveaway_qld NUMERIC,
  driveaway_wa NUMERIC,
  driveaway_sa NUMERIC,
  driveaway_tas NUMERIC,
  driveaway_act NUMERIC,
  driveaway_nt NUMERIC,
  price_qualifier TEXT,               -- 'from', 'driveaway', 'estimated'
  effective_date DATE,                -- when this pricing became effective
  source_url TEXT,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, price_type)
);

ALTER TABLE product_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_pricing_service_role_policy ON product_pricing
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_product_pricing_product_id ON product_pricing(product_id);
CREATE INDEX idx_product_pricing_price_type ON product_pricing(price_type);

-- ============================================================================
-- Interior Options: one product → many interior trims
-- ============================================================================

CREATE TABLE product_interiors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  interior_code TEXT NOT NULL,        -- OEM code
  interior_name TEXT NOT NULL,        -- e.g. 'Black Artificial Leather'
  material TEXT,                      -- 'cloth', 'leather', 'artificial_leather', 'suede'
  is_standard BOOLEAN DEFAULT true,
  price_delta NUMERIC DEFAULT 0,
  swatch_url TEXT,
  image_url TEXT,                     -- interior photo
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, interior_code)
);

ALTER TABLE product_interiors ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_interiors_service_role_policy ON product_interiors
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX idx_product_interiors_product_id ON product_interiors(product_id);

-- ============================================================================
-- Helpful views
-- ============================================================================

-- Full product view with pricing and color count
CREATE OR REPLACE VIEW product_catalog AS
SELECT
  p.id,
  p.oem_id,
  p.title,
  p.subtitle,
  p.body_type,
  p.fuel_type,
  p.external_key,
  pp_std.rrp,
  pp_std.driveaway_nsw,
  pp_prem.driveaway_nsw AS driveaway_nsw_premium,
  (pp_prem.driveaway_nsw - pp_std.driveaway_nsw) AS premium_paint_delta,
  (SELECT COUNT(*) FROM product_colors pc WHERE pc.product_id = p.id) AS color_count,
  p.primary_image_r2_key AS hero_image,
  p.source_url,
  p.updated_at
FROM products p
LEFT JOIN product_pricing pp_std ON pp_std.product_id = p.id AND pp_std.price_type = 'standard'
LEFT JOIN product_pricing pp_prem ON pp_prem.product_id = p.id AND pp_prem.price_type = 'premium'
ORDER BY p.oem_id, p.title;
