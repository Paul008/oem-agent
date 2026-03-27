-- supabase/migrations/20260327_brand_recipes.sql

-- brand_recipes: OEM-specific section recipes
CREATE TABLE brand_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, pattern, variant)
);

ALTER TABLE brand_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_recipes_service_role_policy ON brand_recipes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_brand_recipes_oem ON brand_recipes(oem_id) WHERE is_active = true;

-- default_recipes: fallback recipes when OEM doesn't have a specific one
CREATE TABLE default_recipes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern TEXT NOT NULL,
  variant TEXT NOT NULL,
  label TEXT NOT NULL,
  resolves_to TEXT NOT NULL,
  defaults_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pattern, variant)
);

ALTER TABLE default_recipes ENABLE ROW LEVEL SECURITY;

CREATE POLICY default_recipes_service_role_policy ON default_recipes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
