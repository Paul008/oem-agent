-- Atomic reviewed promotion/rollback for official Nissan staged catalogs.
-- This migration does not activate any row by itself; only service-role RPCs
-- with exact model/run/count inputs can change visibility.

CREATE TABLE IF NOT EXISTS nissan_catalog_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES vehicle_models(id) ON DELETE RESTRICT,
  model_slug TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  reviewer_email TEXT NOT NULL,
  expected_products INTEGER NOT NULL CHECK (expected_products > 0),
  promoted_product_ids UUID[] NOT NULL,
  prior_model_active BOOLEAN NOT NULL,
  prior_model_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  prior_product_states JSONB NOT NULL DEFAULT '{}'::jsonb,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ,
  rollback_reviewer_email TEXT,
  UNIQUE (model_slug, source_run_id)
);

ALTER TABLE nissan_catalog_promotions ENABLE ROW LEVEL SECURITY;

CREATE POLICY nissan_catalog_promotions_service_role_policy
  ON nissan_catalog_promotions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_nissan_catalog_promotions_model
  ON nissan_catalog_promotions (model_slug, promoted_at DESC);

CREATE OR REPLACE FUNCTION promote_nissan_catalog(
  p_model_slug TEXT,
  p_source_run_id TEXT,
  p_reviewer_email TEXT,
  p_expected_products INTEGER
)
RETURNS TABLE (
  promotion_id UUID,
  model_slug TEXT,
  products_promoted INTEGER,
  source_run_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_model vehicle_models%ROWTYPE;
  v_existing nissan_catalog_promotions%ROWTYPE;
  v_product_ids UUID[];
  v_prior_product_states JSONB;
  v_total_products INTEGER;
  v_staged_products INTEGER;
  v_promotion_id UUID;
BEGIN
  IF p_model_slug NOT IN (
    'qashqai', 'new-x-trail', 'patrol', 'all-new-navara', 'z', 'ariya'
  ) THEN
    RAISE EXCEPTION 'Unsupported Nissan model slug';
  END IF;
  IF p_source_run_id IS NULL
    OR p_source_run_id !~ '^[a-z0-9][a-z0-9-]{0,80}$' THEN
    RAISE EXCEPTION 'Invalid Nissan source run id';
  END IF;
  IF p_reviewer_email IS NULL
    OR length(btrim(p_reviewer_email)) NOT BETWEEN 3 AND 200
    OR position('@' IN p_reviewer_email) < 2 THEN
    RAISE EXCEPTION 'A named Nissan reviewer email is required';
  END IF;
  IF p_expected_products IS NULL OR p_expected_products < 1 THEN
    RAISE EXCEPTION 'Expected Nissan product count must be positive';
  END IF;

  SELECT * INTO v_existing
  FROM nissan_catalog_promotions
  WHERE nissan_catalog_promotions.model_slug = p_model_slug
    AND nissan_catalog_promotions.source_run_id = p_source_run_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'This Nissan promotion was already rolled back';
    END IF;
    RETURN QUERY SELECT
      v_existing.id,
      v_existing.model_slug,
      cardinality(v_existing.promoted_product_ids),
      v_existing.source_run_id;
    RETURN;
  END IF;

  SELECT * INTO v_model
  FROM vehicle_models
  WHERE oem_id = 'nissan-au'
    AND slug = p_model_slug
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staged Nissan model was not found';
  END IF;
  IF v_model.is_active THEN
    RAISE EXCEPTION 'Nissan model is already active without this promotion record';
  END IF;
  IF COALESCE(v_model.meta_json->>'staged', 'false') <> 'true'
    OR COALESCE(v_model.meta_json->>'source_system', '') <> 'nissan-pace'
    OR COALESCE(v_model.meta_json->>'source_run_id', '') <> p_source_run_id THEN
    RAISE EXCEPTION 'Nissan model provenance does not match the reviewed staged run';
  END IF;

  -- Lock the exact product set before validating counts or changing visibility.
  PERFORM id FROM products
  WHERE oem_id = 'nissan-au' AND model_id = v_model.id
  FOR UPDATE;

  SELECT
    count(*)::INTEGER,
    count(*) FILTER (
      WHERE availability = 'staged'
        AND COALESCE(meta_json->>'staged', 'false') = 'true'
        AND COALESCE(meta_json->>'source_system', '') = 'nissan-pace'
        AND COALESCE(meta_json->>'source_run_id', '') = p_source_run_id
    )::INTEGER,
    array_agg(id ORDER BY id),
    jsonb_object_agg(
      id::TEXT,
      jsonb_build_object(
        'availability', availability,
        'meta_json', COALESCE(meta_json, '{}'::jsonb)
      )
      ORDER BY id
    )
  INTO v_total_products, v_staged_products, v_product_ids, v_prior_product_states
  FROM products
  WHERE oem_id = 'nissan-au' AND model_id = v_model.id;

  IF v_total_products <> p_expected_products
    OR v_staged_products <> p_expected_products
    OR cardinality(v_product_ids) <> p_expected_products THEN
    RAISE EXCEPTION 'Nissan staged product set does not match the reviewed run count';
  END IF;

  UPDATE vehicle_models
  SET
    is_active = true,
    meta_json = COALESCE(meta_json, '{}'::jsonb)
      || jsonb_build_object(
        'staged', false,
        'promoted_at', now(),
        'promoted_by', lower(btrim(p_reviewer_email)),
        'source_run_id', p_source_run_id
      ),
    updated_at = now()
  WHERE id = v_model.id AND oem_id = 'nissan-au';

  UPDATE products
  SET
    availability = 'available',
    meta_json = COALESCE(meta_json, '{}'::jsonb)
      || jsonb_build_object(
        'staged', false,
        'promoted_at', now(),
        'promoted_by', lower(btrim(p_reviewer_email)),
        'source_run_id', p_source_run_id
      ),
    updated_at = now()
  WHERE oem_id = 'nissan-au' AND id = ANY(v_product_ids);

  INSERT INTO nissan_catalog_promotions (
    model_id,
    model_slug,
    source_run_id,
    reviewer_email,
    expected_products,
    promoted_product_ids,
    prior_model_active,
    prior_model_meta,
    prior_product_states
  ) VALUES (
    v_model.id,
    p_model_slug,
    p_source_run_id,
    lower(btrim(p_reviewer_email)),
    p_expected_products,
    v_product_ids,
    v_model.is_active,
    COALESCE(v_model.meta_json, '{}'::jsonb),
    COALESCE(v_prior_product_states, '{}'::jsonb)
  )
  RETURNING id INTO v_promotion_id;

  RETURN QUERY SELECT
    v_promotion_id,
    p_model_slug,
    p_expected_products,
    p_source_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION rollback_nissan_catalog(
  p_promotion_id UUID,
  p_reviewer_email TEXT
)
RETURNS TABLE (
  promotion_id UUID,
  model_slug TEXT,
  products_rolled_back INTEGER,
  source_run_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion nissan_catalog_promotions%ROWTYPE;
  v_matching_products INTEGER;
BEGIN
  IF p_reviewer_email IS NULL
    OR length(btrim(p_reviewer_email)) NOT BETWEEN 3 AND 200
    OR position('@' IN p_reviewer_email) < 2 THEN
    RAISE EXCEPTION 'A named Nissan rollback reviewer email is required';
  END IF;

  SELECT * INTO v_promotion
  FROM nissan_catalog_promotions
  WHERE id = p_promotion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nissan catalog promotion was not found';
  END IF;
  IF v_promotion.rolled_back_at IS NOT NULL THEN
    RETURN QUERY SELECT
      v_promotion.id,
      v_promotion.model_slug,
      cardinality(v_promotion.promoted_product_ids),
      v_promotion.source_run_id;
    RETURN;
  END IF;

  PERFORM id FROM vehicle_models
  WHERE id = v_promotion.model_id AND oem_id = 'nissan-au'
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_models
    WHERE id = v_promotion.model_id
      AND oem_id = 'nissan-au'
      AND is_active = true
      AND COALESCE(meta_json->>'source_run_id', '') = v_promotion.source_run_id
  ) THEN
    RAISE EXCEPTION 'Nissan model changed after promotion; rollback refused';
  END IF;

  PERFORM id FROM products
  WHERE oem_id = 'nissan-au' AND id = ANY(v_promotion.promoted_product_ids)
  FOR UPDATE;

  SELECT count(*)::INTEGER INTO v_matching_products
  FROM products
  WHERE oem_id = 'nissan-au'
    AND id = ANY(v_promotion.promoted_product_ids)
    AND availability = 'available'
    AND COALESCE(meta_json->>'source_run_id', '') = v_promotion.source_run_id;

  IF v_matching_products <> cardinality(v_promotion.promoted_product_ids) THEN
    RAISE EXCEPTION 'Nissan products changed after promotion; rollback refused';
  END IF;

  UPDATE vehicle_models
  SET
    is_active = v_promotion.prior_model_active,
    meta_json = v_promotion.prior_model_meta
      || jsonb_build_object(
        'rolled_back_at', now(),
        'rolled_back_by', lower(btrim(p_reviewer_email))
      ),
    updated_at = now()
  WHERE id = v_promotion.model_id AND oem_id = 'nissan-au';

  UPDATE products AS p
  SET
    availability = COALESCE(
      v_promotion.prior_product_states->p.id::TEXT->>'availability',
      'staged'
    ),
    meta_json = COALESCE(
      v_promotion.prior_product_states->p.id::TEXT->'meta_json',
      '{}'::jsonb
    ) || jsonb_build_object(
      'rolled_back_at', now(),
      'rolled_back_by', lower(btrim(p_reviewer_email))
    ),
    updated_at = now()
  WHERE p.oem_id = 'nissan-au'
    AND p.id = ANY(v_promotion.promoted_product_ids);

  UPDATE nissan_catalog_promotions
  SET
    rolled_back_at = now(),
    rollback_reviewer_email = lower(btrim(p_reviewer_email))
  WHERE id = v_promotion.id
    AND rolled_back_at IS NULL;

  RETURN QUERY SELECT
    v_promotion.id,
    v_promotion.model_slug,
    cardinality(v_promotion.promoted_product_ids),
    v_promotion.source_run_id;
END;
$$;

REVOKE ALL ON FUNCTION promote_nissan_catalog(TEXT, TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rollback_nissan_catalog(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_nissan_catalog(TEXT, TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION rollback_nissan_catalog(UUID, TEXT)
  TO service_role;
GRANT SELECT, INSERT, UPDATE ON nissan_catalog_promotions TO service_role;
