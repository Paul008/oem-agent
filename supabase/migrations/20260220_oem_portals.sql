-- OEM Portals table for storing marketing portal credentials
CREATE TABLE IF NOT EXISTS oem_portals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  portal_name TEXT NOT NULL,
  portal_url TEXT,
  portal_platform TEXT,
  username TEXT,
  password TEXT,
  marketing_contact TEXT,
  guidelines_pdf_url TEXT,
  notes TEXT,
  monday_item_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, portal_url)
);

-- Enable RLS
ALTER TABLE oem_portals ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY "service_role_all" ON oem_portals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read access
CREATE POLICY "authenticated_read" ON oem_portals
  FOR SELECT TO authenticated USING (true);

-- Add brochure_url column to vehicle_models
ALTER TABLE vehicle_models ADD COLUMN IF NOT EXISTS brochure_url TEXT;
