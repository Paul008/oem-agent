/** Authenticated control surface for staged Nissan ingestion and page review. */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { AppEnv } from '../types';
import { NISSAN_MODEL_PAGE_BUILD_PLAN } from '../design/nissan-page-builder';
import {
  publishNissanModelPageCandidate,
  stageNissanModelPageCandidate,
  validateNissanModelPageArtifact,
} from '../design/nissan-page-candidates';
import {
  NISSAN_AU_MODELS,
  NissanOfficialClient,
  syncNissanOffers,
  type NissanModelSlug,
} from '../sync/nissan-sync';
import { runNissanOfficialSync } from '../sync/nissan-official-runner';
import { saveNissanOfficialRunEvidence } from '../sync/nissan-official-run-evidence';
import type { NissanOfficialRunEvidence } from '../sync/nissan-official-run-evidence';
import {
  promoteNissanCatalog,
  rollbackNissanCatalog,
  validateNissanCatalogPromotionEvidence,
} from '../sync/nissan-catalog-lifecycle';
import {
  promoteNissanOffers,
  rollbackNissanOffers,
  validateNissanOfferPromotionEvidence,
} from '../sync/nissan-offer-lifecycle';
import {
  saveNissanOfficialOfferRunEvidence,
  type NissanOfficialOfferRunEvidence,
} from '../sync/nissan-official-offer-evidence';
import { createSupabaseClient } from '../utils/supabase';

export const nissanOfficialAdmin = new Hono<AppEnv>();

function isNissanModelSlug(value: string): value is NissanModelSlug {
  return Object.prototype.hasOwnProperty.call(NISSAN_AU_MODELS, value);
}

function buildTarget(modelSlug: NissanModelSlug) {
  return NISSAN_MODEL_PAGE_BUILD_PLAN.find(target => target.modelSlug === modelSlug)!;
}

function validCandidateId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(value);
}

function validNissanRunId(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,80}$/.test(value);
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

function requireNissanOperator(c: Context<AppEnv>): Response | null {
  const email = c.get('accessUser')?.email?.trim().toLowerCase();
  if (!email) {
    return c.json({ error: 'Authenticated Nissan operator identity is required' }, 401);
  }
  if ((c.env.DEV_MODE === 'true' || c.env.E2E_TEST_MODE === 'true') && email === 'dev@localhost') {
    return null;
  }
  const operators = new Set(
    (c.env.NISSAN_OFFICIAL_OPERATORS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (!operators.has(email)) {
    return c.json({ error: 'Nissan official action is not authorized for this user' }, 403);
  }
  return null;
}

nissanOfficialAdmin.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  return next();
});

/** Return the official connector and page-builder plan without calling upstreams. */
nissanOfficialAdmin.get('/plan', (c) => c.json({
  oem_id: 'nissan-au',
  mode: 'staged',
  scheduled: false,
  models: NISSAN_MODEL_PAGE_BUILD_PLAN,
}));

/**
 * Exercise one model against Nissan-owned APIs with zero database mutations.
 * Staged writes remain code-only until credentials, fixtures, and data review
 * have been approved; this route cannot be switched into write mode.
 */
nissanOfficialAdmin.post('/dry-run', async (c) => {
  const body = await c.req.json<{
    model_slug?: string;
    catalog_postcode?: string;
    include_offers?: boolean;
    dry_run?: boolean;
    choices?: { config_code?: string; choice_ids?: string[] };
  }>().catch(() => null);

  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.dry_run === false) {
    return c.json({ error: 'This endpoint is dry-run only; staged writes are not enabled' }, 400);
  }

  const modelSlug = String(body.model_slug || '');
  if (!isNissanModelSlug(modelSlug)) {
    return c.json({
      error: 'model_slug must be one of the supported Nissan Australia models',
      allowed: Object.keys(NISSAN_AU_MODELS),
    }, 400);
  }
  if (body.catalog_postcode && !/^\d{4}$/.test(body.catalog_postcode)) {
    return c.json({ error: 'catalog_postcode must contain four digits' }, 400);
  }
  const choicesConfigCode = body.choices?.config_code?.trim();
  const choicesIds = body.choices?.choice_ids;
  if (body.choices && (
    !choicesConfigCode
    || !/^[A-Za-z0-9._:-]{1,100}$/.test(choicesConfigCode)
    || !Array.isArray(choicesIds)
    || choicesIds.length < 1
    || choicesIds.length > 100
    || choicesIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(id))
  )) {
    return c.json({
      error: 'choices requires a valid config_code and 1-100 verified choice_ids',
    }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (!c.env.NISSAN_PACE_API_KEY) {
    return c.json({ error: 'NISSAN_PACE_API_KEY is not configured' }, 503);
  }
  if ((body.include_offers !== false || body.choices) && (
    !c.env.NISSAN_CHOICES_API_KEY || !c.env.NISSAN_CHOICES_CLIENT_KEY
  )) {
    return c.json({
      error: 'Nissan Choices credentials are required when include_offers is enabled',
    }, 503);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await runNissanOfficialSync(supabase, c.env, {
    dryRun: true,
    modelSlugs: [modelSlug],
    catalogPostcode: body.catalog_postcode || '3000',
    includeOffers: body.include_offers !== false,
    choicesConfigs: body.choices && choicesConfigCode && choicesIds
      ? { [modelSlug]: { configCode: choicesConfigCode, choiceIds: choicesIds } }
      : undefined,
  });

  return c.json(result, result.catalog.modelsFetched > 0 ? 200 : 502);
});

/**
 * Write one official PACE catalog as inactive/staged rows and retain a
 * redacted operator audit record. Offers use their own independently gated
 * staged run so catalog and campaign review remain separate decisions.
 */
nissanOfficialAdmin.post('/stage', async (c) => {
  const body = await c.req.json<{
    model_slug?: string;
    catalog_postcode?: string;
    include_offers?: boolean;
    confirmation?: string;
    choices?: { config_code?: string; choice_ids?: string[] };
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'STAGE_NISSAN_OFFICIAL_DATA') {
    return c.json({ error: 'confirmation must equal STAGE_NISSAN_OFFICIAL_DATA' }, 400);
  }
  if (body.include_offers === true) {
    return c.json({
      error: 'Use the separately confirmed stage-offers endpoint for Nissan offers',
    }, 400);
  }

  const modelSlug = String(body.model_slug || '');
  if (!isNissanModelSlug(modelSlug)) {
    return c.json({
      error: 'model_slug must be one of the supported Nissan Australia models',
      allowed: Object.keys(NISSAN_AU_MODELS),
    }, 400);
  }
  if (body.catalog_postcode && !/^\d{4}$/.test(body.catalog_postcode)) {
    return c.json({ error: 'catalog_postcode must contain four digits' }, 400);
  }
  const choicesConfigCode = body.choices?.config_code?.trim();
  const choicesIds = body.choices?.choice_ids;
  if (body.choices && (
    !choicesConfigCode
    || !/^[A-Za-z0-9._:-]{1,100}$/.test(choicesConfigCode)
    || !Array.isArray(choicesIds)
    || choicesIds.length < 1
    || choicesIds.length > 100
    || choicesIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9._:-]{1,100}$/.test(id))
  )) {
    return c.json({
      error: 'choices requires a valid config_code and 1-100 verified choice_ids',
    }, 400);
  }

  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_STAGED_WRITES_ENABLED !== 'true') {
    return c.json({ error: 'Nissan staged writes are disabled' }, 503);
  }
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is required for Nissan run evidence' }, 503);
  }
  if (!c.env.NISSAN_PACE_API_KEY) {
    return c.json({ error: 'NISSAN_PACE_API_KEY is not configured' }, 503);
  }
  if (body.choices && (!c.env.NISSAN_CHOICES_API_KEY || !c.env.NISSAN_CHOICES_CLIENT_KEY)) {
    return c.json({ error: 'Nissan Choices credentials are required for Choices pricing' }, 503);
  }

  const operatorEmail = c.get('accessUser')!.email;
  const runId = crypto.randomUUID();
  const evidenceInput = {
    actorEmail: operatorEmail,
    modelSlugs: [modelSlug],
    secretValues: [
      c.env.NISSAN_PACE_API_KEY,
      c.env.NISSAN_CHOICES_API_KEY,
      c.env.NISSAN_CHOICES_CLIENT_KEY,
    ],
    runId,
  } as const;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  try {
    const result = await runNissanOfficialSync(supabase, c.env, {
      dryRun: false,
      modelSlugs: [modelSlug],
      catalogPostcode: body.catalog_postcode || '3000',
      includeOffers: false,
      sourceRunId: runId,
      choicesConfigs: body.choices && choicesConfigCode && choicesIds
        ? { [modelSlug]: { configCode: choicesConfigCode, choiceIds: choicesIds } }
        : undefined,
    });
    const saved = await saveNissanOfficialRunEvidence(c.env.OEM_PAGE_BUCKET, {
      ...evidenceInput,
      result,
    });
    const status = result.catalog.modelsUpserted === 0
      ? 502
      : result.errors.length > 0 || result.catalog.catalogsRejected > 0 ? 207 : 200;
    return c.json({ ...result, run_id: runId, evidence_key: saved.key }, status);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    try {
      const saved = await saveNissanOfficialRunEvidence(c.env.OEM_PAGE_BUCKET, {
        ...evidenceInput,
        failure,
      });
      return c.json({
        error: 'Nissan staged sync failed',
        run_id: runId,
        evidence_key: saved.key,
      }, 502);
    } catch {
      return c.json({
        error: 'Nissan staged sync failed and durable evidence could not be written',
        run_id: runId,
      }, 502);
    }
  }
});

/** Promote one successful staged run only after its reviewed page is public. */
nissanOfficialAdmin.post('/promote-catalog', async (c) => {
  const body = await c.req.json<{
    model_slug?: string;
    source_run_id?: string;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'PROMOTE_REVIEWED_NISSAN_CATALOG') {
    return c.json({
      error: 'confirmation must equal PROMOTE_REVIEWED_NISSAN_CATALOG',
    }, 400);
  }
  const modelSlug = String(body.model_slug || '');
  const sourceRunId = String(body.source_run_id || '');
  if (!isNissanModelSlug(modelSlug)) {
    return c.json({ error: 'model_slug is not a supported Nissan Australia model' }, 400);
  }
  if (!validNissanRunId(sourceRunId)) {
    return c.json({ error: 'source_run_id is invalid' }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_CATALOG_PROMOTION_ENABLED !== 'true') {
    return c.json({ error: 'Nissan catalog promotion is disabled' }, 503);
  }
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is required for Nissan promotion' }, 503);
  }

  const runObject = await c.env.OEM_PAGE_BUCKET.get(`nissan-official/runs/${sourceRunId}.json`);
  if (!runObject) return c.json({ error: 'Nissan staged run evidence was not found' }, 409);
  let evidence: NissanOfficialRunEvidence;
  try {
    evidence = await runObject.json<NissanOfficialRunEvidence>();
  } catch {
    return c.json({ error: 'Nissan staged run evidence is invalid' }, 409);
  }
  const evidenceErrors = validateNissanCatalogPromotionEvidence(
    evidence,
    modelSlug,
    sourceRunId,
  );
  if (evidenceErrors.length > 0) {
    return c.json({ error: 'Nissan staged run is not eligible for promotion', details: evidenceErrors }, 409);
  }

  const target = buildTarget(modelSlug);
  const pageObject = await c.env.OEM_PAGE_BUCKET.get(
    `pages/definitions/nissan-au/${modelSlug}/latest.json`,
  );
  if (!pageObject) return c.json({ error: 'Reviewed Nissan model page was not found' }, 409);
  const pageMetadata = pageObject.customMetadata || {};
  const pageReviewer = pageMetadata.reviewed_by?.trim();
  const pageCandidateId = pageMetadata.candidate_id?.trim();
  if (
    pageMetadata.pipeline !== 'nissan-official-candidate-v1'
    || pageMetadata.oem_id !== 'nissan-au'
    || pageMetadata.model_slug !== modelSlug
    || !pageReviewer
    || !pageCandidateId
  ) {
    return c.json({ error: 'Nissan model page lacks reviewed publication metadata' }, 409);
  }
  let page: import('../oem/types').VehicleModelPage;
  try {
    page = await pageObject.json<import('../oem/types').VehicleModelPage>();
  } catch {
    return c.json({ error: 'Reviewed Nissan model page is invalid' }, 409);
  }
  const pageErrors = validateNissanModelPageArtifact(target, page);
  if (pageErrors.length > 0) {
    return c.json({ error: 'Reviewed Nissan model page failed revalidation', details: pageErrors }, 409);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await promoteNissanCatalog(supabase, {
    modelSlug,
    sourceRunId,
    reviewedBy: c.get('accessUser')!.email,
    expectedProducts: evidence.catalog.products_upserted,
  });
  if (!result.success) {
    return c.json({ error: 'Nissan catalog promotion was rejected' }, 409);
  }
  return c.json({
    ...result,
    page_candidate_id: pageCandidateId,
    page_reviewed_by: pageReviewer,
  });
});

/** Atomically restore the exact staged state captured by one promotion. */
nissanOfficialAdmin.post('/rollback-catalog', async (c) => {
  const body = await c.req.json<{
    promotion_id?: string;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'ROLLBACK_NISSAN_CATALOG') {
    return c.json({ error: 'confirmation must equal ROLLBACK_NISSAN_CATALOG' }, 400);
  }
  const promotionId = String(body.promotion_id || '');
  if (!validUuid(promotionId)) return c.json({ error: 'promotion_id is invalid' }, 400);
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_CATALOG_ROLLBACK_ENABLED !== 'true') {
    return c.json({ error: 'Nissan catalog rollback is disabled' }, 503);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await rollbackNissanCatalog(supabase, {
    promotionId,
    reviewedBy: c.get('accessUser')!.email,
  });
  if (!result.success) return c.json({ error: 'Nissan catalog rollback was rejected' }, 409);
  return c.json(result);
});

/** Stage current first-party Choices offers as non-public rows with immutable evidence. */
nissanOfficialAdmin.post('/stage-offers', async (c) => {
  const body = await c.req.json<{ confirmation?: string }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'STAGE_NISSAN_OFFICIAL_OFFERS') {
    return c.json({ error: 'confirmation must equal STAGE_NISSAN_OFFICIAL_OFFERS' }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_OFFER_STAGING_ENABLED !== 'true') {
    return c.json({ error: 'Nissan offer staging is disabled' }, 503);
  }
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is required for Nissan offer evidence' }, 503);
  }
  if (!c.env.NISSAN_CHOICES_API_KEY || !c.env.NISSAN_CHOICES_CLIENT_KEY) {
    return c.json({ error: 'Nissan Choices credentials are required for offer staging' }, 503);
  }

  const operatorEmail = c.get('accessUser')!.email;
  const runId = crypto.randomUUID();
  const evidenceInput = {
    actorEmail: operatorEmail,
    secretValues: [c.env.NISSAN_CHOICES_API_KEY, c.env.NISSAN_CHOICES_CLIENT_KEY],
    runId,
  } as const;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const client = new NissanOfficialClient({
    choicesApiKey: c.env.NISSAN_CHOICES_API_KEY,
    choicesClientKey: c.env.NISSAN_CHOICES_CLIENT_KEY,
  });

  try {
    const result = await syncNissanOffers(supabase, {
      client,
      dryRun: false,
      sourceRunId: runId,
    });
    const saved = await saveNissanOfficialOfferRunEvidence(c.env.OEM_PAGE_BUCKET, {
      ...evidenceInput,
      result,
    });
    const status = result.offersUpserted === 0
      ? 502
      : result.errors.length > 0 || result.offersUpserted !== result.offersFetched ? 207 : 200;
    return c.json({ ...result, run_id: runId, evidence_key: saved.key }, status);
  } catch (error) {
    const failure = error instanceof Error ? error.message : String(error);
    try {
      const saved = await saveNissanOfficialOfferRunEvidence(c.env.OEM_PAGE_BUCKET, {
        ...evidenceInput,
        failure,
      });
      return c.json({
        error: 'Nissan offer staging failed',
        run_id: runId,
        evidence_key: saved.key,
      }, 502);
    } catch {
      return c.json({
        error: 'Nissan offer staging failed and durable evidence could not be written',
        run_id: runId,
      }, 502);
    }
  }
});

/** Activate exactly one successfully staged and reviewed official offer run. */
nissanOfficialAdmin.post('/promote-offers', async (c) => {
  const body = await c.req.json<{
    source_run_id?: string;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'PROMOTE_REVIEWED_NISSAN_OFFERS') {
    return c.json({ error: 'confirmation must equal PROMOTE_REVIEWED_NISSAN_OFFERS' }, 400);
  }
  const sourceRunId = String(body.source_run_id || '');
  if (!validNissanRunId(sourceRunId)) return c.json({ error: 'source_run_id is invalid' }, 400);
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_OFFER_PROMOTION_ENABLED !== 'true') {
    return c.json({ error: 'Nissan offer promotion is disabled' }, 503);
  }
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is required for Nissan offer promotion' }, 503);
  }

  const runObject = await c.env.OEM_PAGE_BUCKET.get(
    `nissan-official/offer-runs/${sourceRunId}.json`,
  );
  if (!runObject) return c.json({ error: 'Nissan staged offer evidence was not found' }, 409);
  let evidence: NissanOfficialOfferRunEvidence;
  try {
    evidence = await runObject.json<NissanOfficialOfferRunEvidence>();
  } catch {
    return c.json({ error: 'Nissan staged offer evidence is invalid' }, 409);
  }
  const evidenceErrors = validateNissanOfferPromotionEvidence(evidence, sourceRunId);
  if (evidenceErrors.length > 0) {
    return c.json({
      error: 'Nissan staged offer run is not eligible for promotion',
      details: evidenceErrors,
    }, 409);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await promoteNissanOffers(supabase, {
    sourceRunId,
    reviewedBy: c.get('accessUser')!.email,
    expectedOffers: evidence.offers.upserted,
  });
  if (!result.success) return c.json({ error: 'Nissan offer promotion was rejected' }, 409);
  return c.json(result);
});

/** Atomically restore the exact offer visibility states captured by one promotion. */
nissanOfficialAdmin.post('/rollback-offers', async (c) => {
  const body = await c.req.json<{
    promotion_id?: string;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'ROLLBACK_NISSAN_OFFERS') {
    return c.json({ error: 'confirmation must equal ROLLBACK_NISSAN_OFFERS' }, 400);
  }
  const promotionId = String(body.promotion_id || '');
  if (!validUuid(promotionId)) return c.json({ error: 'promotion_id is invalid' }, 400);
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (c.env.NISSAN_OFFER_ROLLBACK_ENABLED !== 'true') {
    return c.json({ error: 'Nissan offer rollback is disabled' }, 503);
  }

  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  const result = await rollbackNissanOffers(supabase, {
    promotionId,
    reviewedBy: c.get('accessUser')!.email,
  });
  if (!result.success) return c.json({ error: 'Nissan offer rollback was rejected' }, 409);
  return c.json(result);
});

/** Generate a non-public review candidate using the existing adaptive/GAC pipeline. */
nissanOfficialAdmin.post('/build-candidate', async (c) => {
  const body = await c.req.json<{
    model_slug?: string;
    force_clone?: boolean;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'BUILD_NISSAN_REVIEW_CANDIDATE') {
    return c.json({
      error: 'confirmation must equal BUILD_NISSAN_REVIEW_CANDIDATE',
    }, 400);
  }
  const modelSlug = String(body.model_slug || '');
  if (!isNissanModelSlug(modelSlug)) {
    return c.json({ error: 'model_slug is not a supported Nissan Australia model' }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (!c.env.BROWSER) return c.json({ error: 'BROWSER binding is not configured' }, 503);
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is not configured' }, 503);
  }

  const target = buildTarget(modelSlug);
  const pageBucket = c.env.OEM_PAGE_BUCKET;
  const supabase = createSupabaseClient({
    url: c.env.SUPABASE_URL,
    serviceRoleKey: c.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  // Factual model/variant data must be staged before page generation.
  const { data: model, error: modelError } = await supabase
    .from('vehicle_models')
    .select('id, source_url')
    .eq('oem_id', 'nissan-au')
    .eq('slug', modelSlug)
    .maybeSingle();
  if (modelError) return c.json({ error: `Nissan model preflight failed: ${modelError.message}` }, 502);
  if (!model) return c.json({ error: 'Run the official staged Nissan sync before building this page' }, 409);
  if (normalizedUrl(model.source_url) !== normalizedUrl(target.sourceUrl)) {
    return c.json({ error: 'Staged model source_url does not match the reviewed Nissan source' }, 409);
  }
  const { count: productCount, error: productError } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('oem_id', 'nissan-au')
    .eq('model_id', model.id);
  if (productError) return c.json({ error: `Nissan variant preflight failed: ${productError.message}` }, 502);
  if (!productCount) return c.json({ error: 'No staged official Nissan variants exist for this model' }, 409);

  const [{ AiRouter }, { AdaptivePipeline }] = await Promise.all([
    import('../ai/router'),
    import('../design/pipeline'),
  ]);
  const aiRouter = new AiRouter({
    groq: c.env.GROQ_API_KEY,
    together: c.env.TOGETHER_API_KEY,
    moonshot: c.env.MOONSHOT_API_KEY,
    anthropic: c.env.ANTHROPIC_API_KEY,
    google: c.env.GOOGLE_API_KEY,
  }, supabase, c.env.AI);
  const pipeline = new AdaptivePipeline({
    aiRouter,
    r2Bucket: pageBucket,
    browser: c.env.BROWSER,
    supabase,
    vectorize: c.env.UX_KNOWLEDGE,
    googleApiKey: c.env.GOOGLE_API_KEY,
  });
  const result = await stageNissanModelPageCandidate(
    pageBucket,
    pipeline,
    target,
    { forceClone: body.force_clone === true },
  );

  return c.json({
    ...result,
    review_url: result.success
      ? `/api/v1/oem-agent/admin/nissan-official/candidates/${modelSlug}/${result.candidateId}`
      : null,
  }, result.success ? 201 : 422);
});

/** Read and revalidate a candidate for human review; never returns credentials. */
nissanOfficialAdmin.get('/candidates/:modelSlug/:candidateId', async (c) => {
  const modelSlug = c.req.param('modelSlug');
  const candidateId = c.req.param('candidateId');
  if (!isNissanModelSlug(modelSlug) || !validCandidateId(candidateId)) {
    return c.json({ error: 'Invalid Nissan model slug or candidate id' }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is not configured' }, 503);
  }
  const target = buildTarget(modelSlug);
  const key = `pages/candidates/nissan-au/${modelSlug}/${candidateId}.json`;
  const object = await c.env.OEM_PAGE_BUCKET.get(key);
  if (!object) return c.json({ error: 'Nissan page candidate not found' }, 404);
  const page = await object.json<import('../oem/types').VehicleModelPage>();
  return c.json({
    candidate_id: candidateId,
    candidate_key: key,
    status: object.customMetadata?.candidate_status || 'unknown',
    metadata: object.customMetadata || {},
    validation_errors: validateNissanModelPageArtifact(target, page),
    page,
  });
});

/** Publish only a named reviewer's fully validated candidate. */
nissanOfficialAdmin.post('/publish-candidate', async (c) => {
  const body = await c.req.json<{
    model_slug?: string;
    candidate_id?: string;
    confirmation?: string;
  }>().catch(() => null);
  if (!body) return c.json({ error: 'A JSON request body is required' }, 400);
  if (body.confirmation !== 'PUBLISH_REVIEWED_NISSAN_PAGE') {
    return c.json({
      error: 'confirmation must equal PUBLISH_REVIEWED_NISSAN_PAGE',
    }, 400);
  }
  const modelSlug = String(body.model_slug || '');
  const candidateId = String(body.candidate_id || '');
  if (!isNissanModelSlug(modelSlug) || !validCandidateId(candidateId)) {
    return c.json({ error: 'Invalid Nissan model slug or candidate id' }, 400);
  }
  const operatorError = requireNissanOperator(c);
  if (operatorError) return operatorError;
  if (!c.env.OEM_PAGE_BUCKET) {
    return c.json({ error: 'OEM_PAGE_BUCKET binding is not configured' }, 503);
  }
  const reviewer = c.get('accessUser')!.email;

  const result = await publishNissanModelPageCandidate(
    c.env.OEM_PAGE_BUCKET,
    buildTarget(modelSlug),
    candidateId,
    { reviewedBy: reviewer },
  );
  return c.json(result, result.success ? 200 : 422);
});
