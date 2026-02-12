-- Create UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable Row Level Security
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;

-- ============================================================================
-- Table: oems
-- ============================================================================
CREATE TABLE oems (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  config_json JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE oems ENABLE ROW LEVEL SECURITY;

CREATE POLICY oems_service_role_policy ON oems
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_oems_is_active ON oems(is_active);

-- ============================================================================
-- Table: import_runs
-- ============================================================================
CREATE TABLE import_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  pages_checked INT DEFAULT 0,
  changes_found INT DEFAULT 0,
  error_log TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_runs_service_role_policy ON import_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_import_runs_oem_id ON import_runs(oem_id);
CREATE INDEX idx_import_runs_status ON import_runs(status);
CREATE INDEX idx_import_runs_created_at ON import_runs(created_at);

-- ============================================================================
-- Table: source_pages
-- ============================================================================
CREATE TABLE source_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  last_hash TEXT,
  last_checked_at TIMESTAMPTZ,
  last_rendered_at TIMESTAMPTZ,
  consecutive_no_change INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE source_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY source_pages_service_role_policy ON source_pages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_source_pages_oem_id ON source_pages(oem_id);
CREATE INDEX idx_source_pages_url ON source_pages(url);
CREATE INDEX idx_source_pages_is_active ON source_pages(is_active);
CREATE INDEX idx_source_pages_last_checked_at ON source_pages(last_checked_at);

-- ============================================================================
-- Table: products
-- ============================================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  external_key TEXT,
  source_url TEXT,
  title TEXT,
  subtitle TEXT,
  body_type TEXT,
  fuel_type TEXT,
  availability TEXT,
  price_amount NUMERIC,
  price_currency TEXT,
  price_type TEXT,
  price_raw_string TEXT,
  price_qualifier TEXT,
  disclaimer_text TEXT,
  primary_image_r2_key TEXT,
  gallery_image_count INT DEFAULT 0,
  key_features JSONB,
  cta_links JSONB,
  variants JSONB,
  meta_json JSONB,
  content_hash TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_service_role_policy ON products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_products_oem_id ON products(oem_id);
CREATE INDEX idx_products_external_key ON products(external_key);
CREATE INDEX idx_products_content_hash ON products(content_hash);
CREATE INDEX idx_products_updated_at ON products(updated_at);

-- ============================================================================
-- Table: product_images
-- ============================================================================
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  position INT,
  alt_text TEXT,
  sha256 TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_images_service_role_policy ON product_images
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);
CREATE INDEX idx_product_images_r2_key ON product_images(r2_key);

-- ============================================================================
-- Table: product_versions
-- ============================================================================
CREATE TABLE product_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  snapshot_json JSONB,
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_versions_service_role_policy ON product_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_product_versions_product_id ON product_versions(product_id);
CREATE INDEX idx_product_versions_import_run_id ON product_versions(import_run_id);

-- ============================================================================
-- Table: offers
-- ============================================================================
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  external_key TEXT,
  source_url TEXT,
  title TEXT,
  description TEXT,
  offer_type TEXT,
  applicable_models JSONB,
  price_amount NUMERIC,
  price_currency TEXT,
  price_type TEXT,
  price_raw_string TEXT,
  saving_amount NUMERIC,
  validity_start TIMESTAMPTZ,
  validity_end TIMESTAMPTZ,
  validity_raw TEXT,
  cta_text TEXT,
  cta_url TEXT,
  hero_image_r2_key TEXT,
  disclaimer_text TEXT,
  disclaimer_html TEXT,
  eligibility TEXT,
  content_hash TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY offers_service_role_policy ON offers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_offers_oem_id ON offers(oem_id);
CREATE INDEX idx_offers_external_key ON offers(external_key);
CREATE INDEX idx_offers_content_hash ON offers(content_hash);
CREATE INDEX idx_offers_updated_at ON offers(updated_at);

-- ============================================================================
-- Table: offer_assets
-- ============================================================================
CREATE TABLE offer_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  asset_type TEXT,
  position INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE offer_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY offer_assets_service_role_policy ON offer_assets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_offer_assets_offer_id ON offer_assets(offer_id);
CREATE INDEX idx_offer_assets_r2_key ON offer_assets(r2_key);

-- ============================================================================
-- Table: offer_versions
-- ============================================================================
CREATE TABLE offer_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  snapshot_json JSONB,
  content_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE offer_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY offer_versions_service_role_policy ON offer_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_offer_versions_offer_id ON offer_versions(offer_id);
CREATE INDEX idx_offer_versions_import_run_id ON offer_versions(import_run_id);

-- ============================================================================
-- Table: offer_products
-- ============================================================================
CREATE TABLE offer_products (
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, product_id)
);

ALTER TABLE offer_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY offer_products_service_role_policy ON offer_products
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_offer_products_offer_id ON offer_products(offer_id);
CREATE INDEX idx_offer_products_product_id ON offer_products(product_id);

-- ============================================================================
-- Table: banners
-- ============================================================================
CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  page_url TEXT,
  position INT,
  headline TEXT,
  sub_headline TEXT,
  cta_text TEXT,
  cta_url TEXT,
  image_url_desktop TEXT,
  image_url_mobile TEXT,
  image_r2_key TEXT,
  image_sha256 TEXT,
  disclaimer_text TEXT,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY banners_service_role_policy ON banners
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_banners_oem_id ON banners(oem_id);
CREATE INDEX idx_banners_page_url ON banners(page_url);

-- ============================================================================
-- Table: banner_versions
-- ============================================================================
CREATE TABLE banner_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  import_run_id UUID NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  snapshot_json JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE banner_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY banner_versions_service_role_policy ON banner_versions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_banner_versions_banner_id ON banner_versions(banner_id);
CREATE INDEX idx_banner_versions_import_run_id ON banner_versions(import_run_id);

-- ============================================================================
-- Table: oem_members
-- ============================================================================
CREATE TABLE oem_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE oem_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY oem_members_service_role_policy ON oem_members
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_oem_members_oem_id ON oem_members(oem_id);
CREATE INDEX idx_oem_members_email ON oem_members(email);

-- ============================================================================
-- Table: change_events
-- ============================================================================
CREATE TABLE change_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  import_run_id UUID REFERENCES import_runs(id) ON DELETE SET NULL,
  entity_type TEXT,
  entity_id UUID,
  event_type TEXT,
  severity TEXT,
  summary TEXT,
  diff_json JSONB,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_events_service_role_policy ON change_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_change_events_oem_id ON change_events(oem_id);
CREATE INDEX idx_change_events_import_run_id ON change_events(import_run_id);
CREATE INDEX idx_change_events_entity_type ON change_events(entity_type);
CREATE INDEX idx_change_events_severity ON change_events(severity);
CREATE INDEX idx_change_events_created_at ON change_events(created_at);

-- ============================================================================
-- Table: brand_tokens
-- ============================================================================
CREATE TABLE brand_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  version INT,
  tokens_json JSONB,
  r2_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE brand_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_tokens_service_role_policy ON brand_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_brand_tokens_oem_id ON brand_tokens(oem_id);
CREATE INDEX idx_brand_tokens_version ON brand_tokens(version);

-- ============================================================================
-- Table: page_layouts
-- ============================================================================
CREATE TABLE page_layouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  page_type TEXT,
  version INT,
  viewport TEXT,
  layout_json JSONB,
  r2_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE page_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY page_layouts_service_role_policy ON page_layouts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_page_layouts_oem_id ON page_layouts(oem_id);
CREATE INDEX idx_page_layouts_page_type ON page_layouts(page_type);

-- ============================================================================
-- Table: design_captures
-- ============================================================================
CREATE TABLE design_captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  page_type TEXT,
  screenshot_desktop_r2_key TEXT,
  screenshot_mobile_r2_key TEXT,
  dom_snapshot_r2_key TEXT,
  computed_styles_r2_key TEXT,
  brand_tokens_id UUID REFERENCES brand_tokens(id) ON DELETE SET NULL,
  page_layout_id UUID REFERENCES page_layouts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE design_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY design_captures_service_role_policy ON design_captures
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_design_captures_oem_id ON design_captures(oem_id);
CREATE INDEX idx_design_captures_page_type ON design_captures(page_type);
CREATE INDEX idx_design_captures_brand_tokens_id ON design_captures(brand_tokens_id);
CREATE INDEX idx_design_captures_page_layout_id ON design_captures(page_layout_id);

-- ============================================================================
-- Seed Data: 13 Australian OEMs
-- ============================================================================
INSERT INTO oems (id, name, base_url, config_json, is_active)
VALUES
  ('kia-au', 'Kia Australia', 'https://www.kia.com/au/', '{"region": "AU", "language": "en"}', true),
  ('nissan-au', 'Nissan Australia', 'https://www.nissan.com.au/', '{"region": "AU", "language": "en"}', true),
  ('ford-au', 'Ford Australia', 'https://www.ford.com.au/', '{"region": "AU", "language": "en"}', true),
  ('volkswagen-au', 'Volkswagen Australia', 'https://www.volkswagen.com.au/', '{"region": "AU", "language": "en"}', true),
  ('mitsubishi-au', 'Mitsubishi Motors Australia', 'https://www.mitsubishi-motors.com.au/', '{"region": "AU", "language": "en"}', true),
  ('ldv-au', 'LDV Australia', 'https://www.ldvaucorp.com.au/', '{"region": "AU", "language": "en"}', true),
  ('isuzu-au', 'Isuzu Australia', 'https://www.isuzu.com.au/', '{"region": "AU", "language": "en"}', true),
  ('mazda-au', 'Mazda Australia', 'https://www.mazda.com.au/', '{"region": "AU", "language": "en"}', true),
  ('kgm-au', 'Genesis Australia', 'https://www.genesis.com/au/', '{"region": "AU", "language": "en"}', true),
  ('gwm-au', 'Great Wall Motors Australia', 'https://www.gwmaustralia.com.au/', '{"region": "AU", "language": "en"}', true),
  ('suzuki-au', 'Suzuki Australia', 'https://www.suzuki.com.au/', '{"region": "AU", "language": "en"}', true),
  ('hyundai-au', 'Hyundai Australia', 'https://www.hyundai.com.au/', '{"region": "AU", "language": "en"}', true),
  ('toyota-au', 'Toyota Australia', 'https://www.toyota.com.au/', '{"region": "AU", "language": "en"}', true)
ON CONFLICT (id) DO NOTHING;
