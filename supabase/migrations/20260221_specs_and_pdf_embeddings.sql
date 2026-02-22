-- Migration: Add specs_json to products + pdf_embeddings table for vectorized PDFs
-- Phase 2 (specs) + Phase 4 (PDF vectorization)

-- ============================================================================
-- Phase 2: specs_json column on products
-- ============================================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS specs_json JSONB;

CREATE INDEX IF NOT EXISTS idx_products_specs_json ON products USING GIN (specs_json);

COMMENT ON COLUMN products.specs_json IS 'Standardized vehicle specs: engine, transmission, dimensions, performance, towing, capacity, safety, wheels';

-- ============================================================================
-- Phase 4: pdf_embeddings table for vectorized brochures + brand guidelines
-- ============================================================================

CREATE TABLE IF NOT EXISTS pdf_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,           -- 'brochure' or 'guidelines'
  source_id TEXT NOT NULL,             -- vehicle_models.id or oem_portals.id
  oem_id TEXT NOT NULL REFERENCES oems(id),
  pdf_url TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(source_id, source_type, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_embedding ON pdf_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_oem ON pdf_embeddings(oem_id);
CREATE INDEX IF NOT EXISTS idx_pdf_embeddings_source ON pdf_embeddings(source_type, source_id);

-- Semantic search function for PDF chunks
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
$$;
