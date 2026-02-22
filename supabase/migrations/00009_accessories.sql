-- Migration: Add accessories and accessory_models tables
-- Date: 2026-02-19
-- Purpose: Accessory catalog per OEM with many-to-many model linkage

-- ============================================================
-- 1. accessories — accessory catalog per OEM
-- ============================================================
CREATE TABLE IF NOT EXISTS accessories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id) ON DELETE CASCADE,
  external_key TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  part_number TEXT,
  category TEXT,
  price NUMERIC(10,2),
  description_html TEXT,
  image_url TEXT,
  inc_fitting TEXT DEFAULT 'none' CHECK (inc_fitting IN ('includes', 'excludes', 'none')),
  parent_id UUID REFERENCES accessories(id) ON DELETE SET NULL,
  meta_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, external_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accessories_oem_id ON accessories(oem_id);
CREATE INDEX IF NOT EXISTS idx_accessories_parent_id ON accessories(parent_id);
CREATE INDEX IF NOT EXISTS idx_accessories_category ON accessories(category);
CREATE INDEX IF NOT EXISTS idx_accessories_slug ON accessories(slug);

-- RLS
ALTER TABLE accessories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_accessories" ON accessories
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 2. accessory_models — many-to-many join (accessories ↔ vehicle_models)
-- ============================================================
CREATE TABLE IF NOT EXISTS accessory_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id UUID NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(accessory_id, model_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accessory_models_accessory_id ON accessory_models(accessory_id);
CREATE INDEX IF NOT EXISTS idx_accessory_models_model_id ON accessory_models(model_id);

-- RLS
ALTER TABLE accessory_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_accessory_models" ON accessory_models
  FOR ALL TO service_role USING (true) WITH CHECK (true);
