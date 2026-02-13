-- ============================================================================
-- Vector Embeddings for Semantic Search
-- ============================================================================
-- Requires: pgvector extension (enabled in Supabase by default)

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Product Embeddings
-- ============================================================================
-- Stores vector embeddings for product semantic search

CREATE TABLE product_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Embedding vector (1536 dimensions for OpenAI, 768 for smaller models)
  -- Using 768 for cost efficiency with open-source models
  embedding vector(768),

  -- Source text that was embedded
  source_text TEXT NOT NULL,

  -- Embedding model used
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',

  -- Hash of source text for change detection
  content_hash TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(product_id)
);

ALTER TABLE product_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_embeddings_service_role_policy ON product_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create HNSW index for fast similarity search
-- ef_construction: higher = better recall but slower build
-- m: higher = better recall but more memory
CREATE INDEX idx_product_embeddings_vector ON product_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_product_embeddings_product_id ON product_embeddings(product_id);
CREATE INDEX idx_product_embeddings_content_hash ON product_embeddings(content_hash);

-- ============================================================================
-- Offer Embeddings
-- ============================================================================

CREATE TABLE offer_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  embedding vector(768),
  source_text TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(offer_id)
);

ALTER TABLE offer_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY offer_embeddings_service_role_policy ON offer_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_offer_embeddings_vector ON offer_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_offer_embeddings_offer_id ON offer_embeddings(offer_id);

-- ============================================================================
-- Change Event Embeddings
-- ============================================================================
-- For pattern detection and clustering across OEMs

CREATE TABLE change_event_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  change_event_id UUID NOT NULL REFERENCES change_events(id) ON DELETE CASCADE,
  embedding vector(768),
  source_text TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  content_hash TEXT NOT NULL,

  -- Cluster assignment (computed periodically)
  cluster_id INTEGER,
  cluster_label TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(change_event_id)
);

ALTER TABLE change_event_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY change_event_embeddings_service_role_policy ON change_event_embeddings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_change_event_embeddings_vector ON change_event_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_change_event_embeddings_change_event_id ON change_event_embeddings(change_event_id);
CREATE INDEX idx_change_event_embeddings_cluster_id ON change_event_embeddings(cluster_id);

-- ============================================================================
-- Semantic Search Functions
-- ============================================================================

-- Search products by semantic similarity
CREATE OR REPLACE FUNCTION search_products_semantic(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_oem_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  product_id UUID,
  oem_id TEXT,
  title TEXT,
  subtitle TEXT,
  price_amount NUMERIC,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.oem_id,
    p.title,
    p.subtitle,
    p.price_amount,
    1 - (pe.embedding <=> query_embedding) AS similarity
  FROM product_embeddings pe
  JOIN products p ON pe.product_id = p.id
  WHERE
    (filter_oem_id IS NULL OR p.oem_id = filter_oem_id)
    AND 1 - (pe.embedding <=> query_embedding) > match_threshold
  ORDER BY pe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Find similar products (cross-OEM comparison)
CREATE OR REPLACE FUNCTION find_similar_products(
  source_product_id UUID,
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 10,
  exclude_same_oem BOOLEAN DEFAULT false
)
RETURNS TABLE (
  product_id UUID,
  oem_id TEXT,
  title TEXT,
  subtitle TEXT,
  price_amount NUMERIC,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
  source_embedding vector(768);
  source_oem_id TEXT;
BEGIN
  -- Get source product embedding
  SELECT pe.embedding, p.oem_id
  INTO source_embedding, source_oem_id
  FROM product_embeddings pe
  JOIN products p ON pe.product_id = p.id
  WHERE pe.product_id = source_product_id;

  IF source_embedding IS NULL THEN
    RAISE EXCEPTION 'Product % has no embedding', source_product_id;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS product_id,
    p.oem_id,
    p.title,
    p.subtitle,
    p.price_amount,
    1 - (pe.embedding <=> source_embedding) AS similarity
  FROM product_embeddings pe
  JOIN products p ON pe.product_id = p.id
  WHERE
    pe.product_id != source_product_id
    AND (NOT exclude_same_oem OR p.oem_id != source_oem_id)
    AND 1 - (pe.embedding <=> source_embedding) > match_threshold
  ORDER BY pe.embedding <=> source_embedding
  LIMIT match_count;
END;
$$;

-- Search offers by semantic similarity
CREATE OR REPLACE FUNCTION search_offers_semantic(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.7,
  match_count INT DEFAULT 10,
  filter_oem_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  offer_id UUID,
  oem_id TEXT,
  title TEXT,
  description TEXT,
  offer_type TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id AS offer_id,
    o.oem_id,
    o.title,
    o.description,
    o.offer_type,
    1 - (oe.embedding <=> query_embedding) AS similarity
  FROM offer_embeddings oe
  JOIN offers o ON oe.offer_id = o.id
  WHERE
    (filter_oem_id IS NULL OR o.oem_id = filter_oem_id)
    AND 1 - (oe.embedding <=> query_embedding) > match_threshold
  ORDER BY oe.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Find similar change events (pattern detection)
CREATE OR REPLACE FUNCTION find_similar_changes(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.75,
  match_count INT DEFAULT 20,
  days_back INT DEFAULT 30
)
RETURNS TABLE (
  change_event_id UUID,
  oem_id TEXT,
  entity_type TEXT,
  event_type TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ce.id AS change_event_id,
    ce.oem_id,
    ce.entity_type,
    ce.event_type,
    ce.summary,
    ce.created_at,
    1 - (cee.embedding <=> query_embedding) AS similarity
  FROM change_event_embeddings cee
  JOIN change_events ce ON cee.change_event_id = ce.id
  WHERE
    ce.created_at > NOW() - (days_back || ' days')::INTERVAL
    AND 1 - (cee.embedding <=> query_embedding) > match_threshold
  ORDER BY cee.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================================================
-- Embedding Update Triggers
-- ============================================================================

-- Track when products need re-embedding
CREATE OR REPLACE FUNCTION mark_product_embedding_stale()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete old embedding when product content changes
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.subtitle IS DISTINCT FROM NEW.subtitle
     OR OLD.key_features IS DISTINCT FROM NEW.key_features THEN
    DELETE FROM product_embeddings WHERE product_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_embedding_stale
  AFTER UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION mark_product_embedding_stale();

-- Track when offers need re-embedding
CREATE OR REPLACE FUNCTION mark_offer_embedding_stale()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.title IS DISTINCT FROM NEW.title
     OR OLD.description IS DISTINCT FROM NEW.description THEN
    DELETE FROM offer_embeddings WHERE offer_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_offer_embedding_stale
  AFTER UPDATE ON offers
  FOR EACH ROW
  EXECUTE FUNCTION mark_offer_embedding_stale();

-- ============================================================================
-- Views for Monitoring
-- ============================================================================

-- Products without embeddings (need processing)
CREATE VIEW products_pending_embedding AS
SELECT p.id, p.oem_id, p.title, p.updated_at
FROM products p
LEFT JOIN product_embeddings pe ON p.id = pe.product_id
WHERE pe.id IS NULL
ORDER BY p.updated_at DESC;

-- Offers without embeddings
CREATE VIEW offers_pending_embedding AS
SELECT o.id, o.oem_id, o.title, o.updated_at
FROM offers o
LEFT JOIN offer_embeddings oe ON o.id = oe.offer_id
WHERE oe.id IS NULL
ORDER BY o.updated_at DESC;

-- Change events without embeddings
CREATE VIEW change_events_pending_embedding AS
SELECT ce.id, ce.oem_id, ce.entity_type, ce.summary, ce.created_at
FROM change_events ce
LEFT JOIN change_event_embeddings cee ON ce.id = cee.change_event_id
WHERE cee.id IS NULL
ORDER BY ce.created_at DESC;

-- Embedding coverage stats
CREATE VIEW embedding_coverage_stats AS
SELECT
  'products' AS table_name,
  (SELECT COUNT(*) FROM products) AS total_rows,
  (SELECT COUNT(*) FROM product_embeddings) AS embedded_rows,
  ROUND(
    (SELECT COUNT(*)::NUMERIC FROM product_embeddings) /
    NULLIF((SELECT COUNT(*) FROM products), 0) * 100,
    2
  ) AS coverage_percent
UNION ALL
SELECT
  'offers',
  (SELECT COUNT(*) FROM offers),
  (SELECT COUNT(*) FROM offer_embeddings),
  ROUND(
    (SELECT COUNT(*)::NUMERIC FROM offer_embeddings) /
    NULLIF((SELECT COUNT(*) FROM offers), 0) * 100,
    2
  )
UNION ALL
SELECT
  'change_events',
  (SELECT COUNT(*) FROM change_events),
  (SELECT COUNT(*) FROM change_event_embeddings),
  ROUND(
    (SELECT COUNT(*)::NUMERIC FROM change_event_embeddings) /
    NULLIF((SELECT COUNT(*) FROM change_events), 0) * 100,
    2
  );
