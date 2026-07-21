-- Backward-compatible offer visibility lifecycle plus atomic Nissan promotion.
-- Existing offers remain active; official Nissan writes enter as staged.

ALTER TABLE offers
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS source_run_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_lifecycle_status_check'
  ) THEN
    ALTER TABLE offers ADD CONSTRAINT offers_lifecycle_status_check
      CHECK (lifecycle_status IN ('staged', 'active', 'retired'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_offers_public_lifecycle
  ON offers (oem_id, lifecycle_status, validity_end);
CREATE INDEX IF NOT EXISTS idx_offers_source_run
  ON offers (oem_id, source_run_id) WHERE source_run_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS nissan_offer_promotions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_run_id TEXT NOT NULL UNIQUE,
  reviewer_email TEXT NOT NULL,
  expected_offers INTEGER NOT NULL CHECK (expected_offers > 0),
  promoted_offer_ids UUID[] NOT NULL,
  changed_offer_ids UUID[] NOT NULL,
  previous_offer_states JSONB NOT NULL,
  promoted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rolled_back_at TIMESTAMPTZ,
  rollback_reviewer_email TEXT
);

ALTER TABLE nissan_offer_promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY nissan_offer_promotions_service_role_policy
  ON nissan_offer_promotions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION promote_nissan_offers(
  p_source_run_id TEXT,
  p_reviewer_email TEXT,
  p_expected_offers INTEGER
)
RETURNS TABLE (
  promotion_id UUID,
  offers_promoted INTEGER,
  offers_retired INTEGER,
  source_run_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing nissan_offer_promotions%ROWTYPE;
  v_promoted_ids UUID[];
  v_changed_ids UUID[];
  v_previous_states JSONB;
  v_staged_count INTEGER;
  v_retired_count INTEGER;
  v_promotion_id UUID;
BEGIN
  IF p_source_run_id IS NULL
    OR p_source_run_id !~ '^[a-z0-9][a-z0-9-]{0,80}$' THEN
    RAISE EXCEPTION 'Invalid Nissan offer source run id';
  END IF;
  IF p_reviewer_email IS NULL
    OR length(btrim(p_reviewer_email)) NOT BETWEEN 3 AND 200
    OR position('@' IN p_reviewer_email) < 2 THEN
    RAISE EXCEPTION 'A named Nissan offer reviewer email is required';
  END IF;
  IF p_expected_offers IS NULL OR p_expected_offers < 1 THEN
    RAISE EXCEPTION 'Expected Nissan offer count must be positive';
  END IF;

  SELECT * INTO v_existing
  FROM nissan_offer_promotions AS promotion
  WHERE promotion.source_run_id = p_source_run_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.rolled_back_at IS NOT NULL THEN
      RAISE EXCEPTION 'This Nissan offer promotion was already rolled back';
    END IF;
    RETURN QUERY SELECT
      v_existing.id,
      cardinality(v_existing.promoted_offer_ids),
      cardinality(v_existing.changed_offer_ids) - cardinality(v_existing.promoted_offer_ids),
      v_existing.source_run_id;
    RETURN;
  END IF;

  -- Serialize Nissan offer visibility transitions against sync/promotion runs.
  PERFORM id FROM offers WHERE oem_id = 'nissan-au' FOR UPDATE;

  SELECT count(*)::INTEGER, array_agg(id ORDER BY id)
  INTO v_staged_count, v_promoted_ids
  FROM offers
  WHERE oem_id = 'nissan-au'
    AND lifecycle_status = 'staged'
    AND source_run_id = p_source_run_id
    AND COALESCE(meta_json->>'source_system', '') = 'nissan-choices-offers'
    AND COALESCE(meta_json->>'source_run_id', '') = p_source_run_id;

  IF v_staged_count <> p_expected_offers
    OR cardinality(v_promoted_ids) <> p_expected_offers THEN
    RAISE EXCEPTION 'Nissan staged offer set does not match the reviewed run count';
  END IF;

  SELECT
    array_agg(id ORDER BY id),
    jsonb_object_agg(id::TEXT, lifecycle_status ORDER BY id),
    count(*) FILTER (WHERE lifecycle_status = 'active')::INTEGER
  INTO v_changed_ids, v_previous_states, v_retired_count
  FROM offers
  WHERE oem_id = 'nissan-au'
    AND (lifecycle_status = 'active' OR id = ANY(v_promoted_ids));

  UPDATE offers
  SET lifecycle_status = 'retired', updated_at = now()
  WHERE oem_id = 'nissan-au' AND lifecycle_status = 'active';

  UPDATE offers
  SET
    lifecycle_status = 'active',
    meta_json = COALESCE(meta_json, '{}'::jsonb)
      || jsonb_build_object(
        'staged', false,
        'promoted_at', now(),
        'promoted_by', lower(btrim(p_reviewer_email)),
        'source_run_id', p_source_run_id
      ),
    updated_at = now()
  WHERE oem_id = 'nissan-au' AND id = ANY(v_promoted_ids);

  INSERT INTO nissan_offer_promotions (
    source_run_id,
    reviewer_email,
    expected_offers,
    promoted_offer_ids,
    changed_offer_ids,
    previous_offer_states
  ) VALUES (
    p_source_run_id,
    lower(btrim(p_reviewer_email)),
    p_expected_offers,
    v_promoted_ids,
    v_changed_ids,
    v_previous_states
  )
  RETURNING id INTO v_promotion_id;

  RETURN QUERY SELECT
    v_promotion_id,
    p_expected_offers,
    COALESCE(v_retired_count, 0),
    p_source_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION rollback_nissan_offers(
  p_promotion_id UUID,
  p_reviewer_email TEXT
)
RETURNS TABLE (
  promotion_id UUID,
  offers_rolled_back INTEGER,
  source_run_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion nissan_offer_promotions%ROWTYPE;
  v_matching_count INTEGER;
BEGIN
  IF p_reviewer_email IS NULL
    OR length(btrim(p_reviewer_email)) NOT BETWEEN 3 AND 200
    OR position('@' IN p_reviewer_email) < 2 THEN
    RAISE EXCEPTION 'A named Nissan offer rollback reviewer email is required';
  END IF;

  SELECT * INTO v_promotion
  FROM nissan_offer_promotions
  WHERE id = p_promotion_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nissan offer promotion was not found';
  END IF;
  IF v_promotion.rolled_back_at IS NOT NULL THEN
    RETURN QUERY SELECT
      v_promotion.id,
      cardinality(v_promotion.changed_offer_ids),
      v_promotion.source_run_id;
    RETURN;
  END IF;

  PERFORM id FROM offers
  WHERE oem_id = 'nissan-au' AND id = ANY(v_promotion.changed_offer_ids)
  FOR UPDATE;

  SELECT count(*)::INTEGER INTO v_matching_count
  FROM jsonb_each_text(v_promotion.previous_offer_states) AS previous(offer_id, status)
  JOIN offers ON offers.id = previous.offer_id::UUID
  WHERE offers.oem_id = 'nissan-au'
    AND offers.lifecycle_status = CASE previous.status
      WHEN 'staged' THEN 'active'
      WHEN 'active' THEN 'retired'
      ELSE previous.status
    END;

  IF v_matching_count <> cardinality(v_promotion.changed_offer_ids) THEN
    RAISE EXCEPTION 'Nissan offers changed after promotion; rollback refused';
  END IF;

  UPDATE offers
  SET lifecycle_status = previous.status,
      updated_at = now()
  FROM jsonb_each_text(v_promotion.previous_offer_states) AS previous(offer_id, status)
  WHERE offers.id = previous.offer_id::UUID
    AND offers.oem_id = 'nissan-au';

  UPDATE offers
  SET meta_json = COALESCE(meta_json, '{}'::jsonb)
      || jsonb_build_object(
        'rolled_back_at', now(),
        'rolled_back_by', lower(btrim(p_reviewer_email))
      )
  WHERE oem_id = 'nissan-au'
    AND id = ANY(v_promotion.promoted_offer_ids);

  UPDATE nissan_offer_promotions
  SET
    rolled_back_at = now(),
    rollback_reviewer_email = lower(btrim(p_reviewer_email))
  WHERE id = v_promotion.id
    AND rolled_back_at IS NULL;

  RETURN QUERY SELECT
    v_promotion.id,
    cardinality(v_promotion.changed_offer_ids),
    v_promotion.source_run_id;
END;
$$;

REVOKE ALL ON FUNCTION promote_nissan_offers(TEXT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION rollback_nissan_offers(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promote_nissan_offers(TEXT, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION rollback_nissan_offers(UUID, TEXT)
  TO service_role;
GRANT SELECT, INSERT, UPDATE ON nissan_offer_promotions TO service_role;
