/** Durable, redacted evidence for an operator-triggered staged Nissan offer run. */

import type { NissanSourceHealth } from './nissan-official-runner';
import type { NissanOfferSyncResult } from './nissan-sync';

export type NissanOfferRunEvidenceStatus = 'success' | 'partial' | 'failed';

export interface NissanOfficialOfferRunEvidence {
  id: string;
  actor_email: string;
  mode: 'staged-offers';
  status: NissanOfferRunEvidenceStatus;
  recorded_at: string;
  source: NissanSourceHealth | null;
  offers: {
    fetched: number;
    upserted: number;
    product_links_upserted: number;
    errors: string[];
  };
  errors: string[];
}

interface SaveNissanOfficialOfferRunEvidenceInput {
  actorEmail: string;
  result?: NissanOfferSyncResult;
  failure?: string;
  secretValues?: readonly (string | undefined)[];
  runId?: string;
  recordedAt?: string;
}

function safeRunId(value: string): string {
  if (!/^[a-z0-9][a-z0-9-]{0,80}$/i.test(value)) {
    throw new Error('Invalid Nissan offer run evidence id');
  }
  return value;
}

function redact(value: string, secretValues: readonly (string | undefined)[]): string {
  let redacted = String(value)
    .replace(/(https?:\/\/[^\s?'\"<>]+)\?[^\s'\"<>]+/gi, '$1?[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(api[_-]?key|client[_-]?key|token|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]');
  for (const secret of secretValues.filter((item): item is string => !!item)) {
    redacted = redacted.split(secret).join('[REDACTED]');
  }
  return redacted.slice(0, 1000);
}

function status(result?: NissanOfferSyncResult): NissanOfferRunEvidenceStatus {
  if (!result || result.offersUpserted < 1) return 'failed';
  if (result.errors.length > 0 || result.offersUpserted !== result.offersFetched) return 'partial';
  return 'success';
}

function sourceHealth(
  result: NissanOfferSyncResult | undefined,
  recordedAt: string,
  secrets: readonly (string | undefined)[],
): NissanSourceHealth | null {
  if (!result) return null;
  const errors = result.errors.map(error => redact(error, secrets));
  return {
    status: result.offersFetched === 0 ? 'failed' : errors.length > 0 ? 'degraded' : 'healthy',
    requestCount: 1,
    recordsFetched: result.offersFetched,
    lastSuccessfulAt: result.offersFetched > 0 ? recordedAt : null,
    errors,
  };
}

export async function saveNissanOfficialOfferRunEvidence(
  bucket: R2Bucket,
  input: SaveNissanOfficialOfferRunEvidenceInput,
): Promise<{ key: string; evidence: NissanOfficialOfferRunEvidence }> {
  const id = safeRunId(input.runId || crypto.randomUUID());
  const recordedAt = input.recordedAt || new Date().toISOString();
  if (Number.isNaN(new Date(recordedAt).getTime())) {
    throw new Error('Invalid Nissan offer run evidence timestamp');
  }
  const secrets = input.secretValues || [];
  const resultErrors = (input.result?.errors || []).map(error => redact(error, secrets));
  const evidence: NissanOfficialOfferRunEvidence = {
    id,
    actor_email: input.actorEmail.trim().toLowerCase(),
    mode: 'staged-offers',
    status: status(input.result),
    recorded_at: new Date(recordedAt).toISOString(),
    source: sourceHealth(input.result, new Date(recordedAt).toISOString(), secrets),
    offers: {
      fetched: input.result?.offersFetched || 0,
      upserted: input.result?.offersUpserted || 0,
      product_links_upserted: input.result?.productLinksUpserted || 0,
      errors: resultErrors,
    },
    errors: [
      ...resultErrors,
      ...(input.failure ? [redact(input.failure, secrets)] : []),
    ],
  };
  const key = `nissan-official/offer-runs/${id}.json`;
  if (await bucket.head(key)) {
    throw new Error(`Nissan offer run evidence ${id} already exists`);
  }
  const serialized = JSON.stringify(evidence, null, 2);
  const writeOptions: R2PutOptions = {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: {
      oem_id: 'nissan-au',
      mode: evidence.mode,
      status: evidence.status,
    },
  };
  await bucket.put(key, serialized, writeOptions);
  await bucket.put('nissan-official/offer-runs/latest.json', serialized, writeOptions);
  return { key, evidence };
}
