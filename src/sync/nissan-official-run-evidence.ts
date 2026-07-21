/** Durable, explicitly redacted evidence for operator-triggered Nissan runs. */

import type { NissanModelSlug } from './nissan-sync';
import type {
  NissanOfficialSyncHealth,
  NissanOfficialSyncResult,
  NissanSourceHealth,
} from './nissan-official-runner';

export type NissanRunEvidenceStatus = 'success' | 'partial' | 'failed';

export interface NissanOfficialRunEvidence {
  id: string;
  actor_email: string;
  mode: 'staged-catalog';
  status: NissanRunEvidenceStatus;
  model_slugs: NissanModelSlug[];
  recorded_at: string;
  health: NissanOfficialSyncHealth | null;
  catalog: {
    models_fetched: number;
    versions_fetched: number;
    catalogs_rejected: number;
    models_upserted: number;
    products_upserted: number;
    colors_upserted: number;
    pricing_upserted: number;
    choices_requests: number;
    regional_pricing_rows: number;
    drift_warnings: string[];
    errors: string[];
  };
  offers: { requested: false; written: false };
  errors: string[];
}

interface SaveNissanOfficialRunEvidenceInput {
  actorEmail: string;
  modelSlugs: readonly NissanModelSlug[];
  result?: NissanOfficialSyncResult;
  failure?: string;
  /** Credential values are accepted only so any accidental appearance can be removed. */
  secretValues?: readonly (string | undefined)[];
  runId?: string;
  recordedAt?: string;
}

function safeRunId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(value)) {
    throw new Error('Invalid Nissan run evidence id');
  }
  return value;
}

function redactError(value: string, secretValues: readonly (string | undefined)[]): string {
  let redacted = String(value)
    .replace(/(https?:\/\/[^\s?'"<>]+)\?[^\s'"<>]+/gi, '$1?[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(api[_-]?key|client[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  for (const secret of secretValues.filter((item): item is string => !!item)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted.slice(0, 1000);
}

function redactSourceHealth(
  source: NissanSourceHealth,
  secrets: readonly (string | undefined)[],
): NissanSourceHealth {
  return { ...source, errors: source.errors.map(error => redactError(error, secrets)) };
}

function redactHealth(
  health: NissanOfficialSyncHealth,
  secrets: readonly (string | undefined)[],
): NissanOfficialSyncHealth {
  return {
    ...health,
    sources: {
      pace: redactSourceHealth(health.sources.pace, secrets),
      choices: redactSourceHealth(health.sources.choices, secrets),
      offers: redactSourceHealth(health.sources.offers, secrets),
    },
  };
}

function evidenceStatus(
  result: NissanOfficialSyncResult | undefined,
  expectedModels: number,
): NissanRunEvidenceStatus {
  if (!result || result.catalog.modelsUpserted === 0) return 'failed';
  if (
    result.errors.length > 0
    || result.catalog.catalogsRejected > 0
    || result.catalog.modelsUpserted !== expectedModels
  ) return 'partial';
  return 'success';
}

export async function saveNissanOfficialRunEvidence(
  bucket: R2Bucket,
  input: SaveNissanOfficialRunEvidenceInput,
): Promise<{ key: string; evidence: NissanOfficialRunEvidence }> {
  const id = safeRunId(input.runId || crypto.randomUUID());
  const recordedAt = input.recordedAt || new Date().toISOString();
  if (Number.isNaN(new Date(recordedAt).getTime())) {
    throw new Error('Invalid Nissan run evidence timestamp');
  }
  const secrets = input.secretValues || [];
  const catalog = input.result?.catalog;
  const errors = [
    ...(input.result?.errors || []),
    ...(input.failure ? [input.failure] : []),
  ].map(error => redactError(error, secrets));
  const evidence: NissanOfficialRunEvidence = {
    id,
    actor_email: input.actorEmail.trim().toLowerCase(),
    mode: 'staged-catalog',
    status: evidenceStatus(input.result, input.modelSlugs.length),
    model_slugs: [...input.modelSlugs],
    recorded_at: new Date(recordedAt).toISOString(),
    health: input.result ? redactHealth(input.result.health, secrets) : null,
    catalog: {
      models_fetched: catalog?.modelsFetched || 0,
      versions_fetched: catalog?.versionsFetched || 0,
      catalogs_rejected: catalog?.catalogsRejected || 0,
      models_upserted: catalog?.modelsUpserted || 0,
      products_upserted: catalog?.productsUpserted || 0,
      colors_upserted: catalog?.colorsUpserted || 0,
      pricing_upserted: catalog?.pricingUpserted || 0,
      choices_requests: catalog?.choicesRequests || 0,
      regional_pricing_rows: catalog?.regionalPricingRows || 0,
      drift_warnings: (catalog?.driftWarnings || []).map(error => redactError(error, secrets)),
      errors: (catalog?.errors || []).map(error => redactError(error, secrets)),
    },
    // Catalog evidence deliberately excludes the separately reviewed offer lifecycle.
    offers: { requested: false, written: false },
    errors,
  };
  const serialized = JSON.stringify(evidence, null, 2);
  const key = `nissan-official/runs/${id}.json`;
  const writeOptions: R2PutOptions = {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      oem_id: 'nissan-au',
      mode: evidence.mode,
      status: evidence.status,
    },
  };
  await bucket.put(key, serialized, writeOptions);
  await bucket.put('nissan-official/runs/latest.json', serialized, writeOptions);
  return { key, evidence };
}
