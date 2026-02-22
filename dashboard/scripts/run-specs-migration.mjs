#!/usr/bin/env node
// Run specs_json + pdf_embeddings migration against Supabase via Management API
// Usage: cd dashboard/scripts && node run-specs-migration.mjs

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

// Phase 2: specs_json column
console.log('=== Phase 2: specs_json on products ===')
await runSQL(`ALTER TABLE products ADD COLUMN IF NOT EXISTS specs_json JSONB`, 'add specs_json')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_products_specs_json ON products USING GIN (specs_json)`, 'idx specs_json')
await runSQL(`COMMENT ON COLUMN products.specs_json IS 'Standardized vehicle specs: engine, transmission, dimensions, performance, towing, capacity, safety, wheels'`, 'comment specs_json')

// Phase 4: pdf_embeddings table
console.log('\n=== Phase 4: pdf_embeddings table ===')
await runSQL(`
CREATE TABLE IF NOT EXISTS pdf_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  pdf_url TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, source_type, chunk_index)
)
`, 'create pdf_embeddings')

await runSQL(`CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_embedding ON pdf_embeddings USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`, 'idx embedding')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_oem ON pdf_embeddings(oem_id)`, 'idx oem')
await runSQL(`CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_source ON pdf_embeddings(source_type, source_id)`, 'idx source')

// RLS
console.log('\nEnabling RLS on pdf_embeddings...')
await runSQL(`ALTER TABLE pdf_embeddings ENABLE ROW LEVEL SECURITY`, 'rls pdf_embeddings')
await runSQL(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'pdf_embeddings' AND policyname = 'service_role_all_pdf_embeddings') THEN
    CREATE POLICY "service_role_all_pdf_embeddings" ON pdf_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
`, 'policy pdf_embeddings')

// Search function
console.log('\nCreating search function...')
await runSQL(`
CREATE OR REPLACE FUNCTION search_pdfs_semantic(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  filter_oem_id text DEFAULT NULL,
  filter_source_type text DEFAULT NULL
) RETURNS TABLE(
  id uuid,
  source_type text,
  source_id text,
  oem_id text,
  chunk_text text,
  similarity float
)
LANGUAGE sql STABLE AS $$
  SELECT
    pe.id,
    pe.source_type,
    pe.source_id,
    pe.oem_id,
    pe.chunk_text,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM pdf_embeddings pe
  WHERE 1 - (pe.embedding <=> query_embedding) > match_threshold
    AND (filter_oem_id IS NULL OR pe.oem_id = filter_oem_id)
    AND (filter_source_type IS NULL OR pe.source_type = filter_source_type)
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
$$
`, 'create search_pdfs_semantic')

// Verify
console.log('\n=== Verification ===')
const cols = await runSQL(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'products' AND column_name = 'specs_json'
`, 'verify specs_json')
console.log('specs_json column:', cols)

const tables = await runSQL(`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'pdf_embeddings'
`, 'verify pdf_embeddings')
console.log('pdf_embeddings table:', tables)

const funcs = await runSQL(`
  SELECT routine_name FROM information_schema.routines
  WHERE routine_name = 'search_pdfs_semantic'
`, 'verify function')
console.log('search function:', funcs)

console.log('\nMigration complete!')
