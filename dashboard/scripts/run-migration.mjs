#!/usr/bin/env node
// Run DDL migration against Supabase via Management API
// Usage: node run-migration.mjs

const ACCESS_TOKEN = 'sbp_a79e1ee2b7a9b7977c1d7afa5f8df6c4085a972b'
const PROJECT_REF = 'nnihmdmsglkxpmilmjjc'

async function runSQL(sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`
    },
    body: JSON.stringify({ query: sql })
  })
  const data = await res.json()
  if (res.status >= 400) {
    console.error(`FAILED [${label}]:`, JSON.stringify(data))
    return false
  }
  console.log(`OK [${label}]`)
  return data
}

console.log('Creating accessories table...')
await runSQL(`
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
  meta_json JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(oem_id, external_key)
);
`, 'create accessories')

console.log('Creating indexes on accessories...')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessories_oem_id ON accessories(oem_id)`, 'idx oem_id')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessories_parent_id ON accessories(parent_id)`, 'idx parent_id')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessories_category ON accessories(category)`, 'idx category')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessories_slug ON accessories(slug)`, 'idx slug')

console.log('Enabling RLS on accessories...')
await runSQL(`ALTER TABLE accessories ENABLE ROW LEVEL SECURITY`, 'rls accessories')
await runSQL(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accessories' AND policyname = 'service_role_all_accessories') THEN
    CREATE POLICY "service_role_all_accessories" ON accessories FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
`, 'policy accessories')

console.log('Creating accessory_models table...')
await runSQL(`
CREATE TABLE IF NOT EXISTS accessory_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accessory_id UUID NOT NULL REFERENCES accessories(id) ON DELETE CASCADE,
  model_id UUID NOT NULL REFERENCES vehicle_models(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(accessory_id, model_id)
);
`, 'create accessory_models')

console.log('Creating indexes on accessory_models...')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessory_models_accessory_id ON accessory_models(accessory_id)`, 'idx accessory_id')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_accessory_models_model_id ON accessory_models(model_id)`, 'idx model_id')

console.log('Enabling RLS on accessory_models...')
await runSQL(`ALTER TABLE accessory_models ENABLE ROW LEVEL SECURITY`, 'rls accessory_models')
await runSQL(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'accessory_models' AND policyname = 'service_role_all_accessory_models') THEN
    CREATE POLICY "service_role_all_accessory_models" ON accessory_models FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
`, 'policy accessory_models')

// Verify
console.log('\nVerifying...')
const tables = await runSQL(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN ('accessories', 'accessory_models')
  ORDER BY tablename
`, 'verify tables')
console.log('Tables:', tables?.map(t => t.tablename))

const indexes = await runSQL(`
  SELECT indexname FROM pg_indexes
  WHERE schemaname = 'public' AND tablename IN ('accessories', 'accessory_models')
  ORDER BY indexname
`, 'verify indexes')
console.log('Indexes:', indexes?.map(i => i.indexname))

console.log('\nMigration complete!')
