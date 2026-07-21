/**
 * Internal orchestration entry point for the Nissan Australia official APIs.
 *
 * The runner is intentionally not mounted on a daily schedule. It defaults to
 * dry-run and can only write staged records when an authenticated control
 * plane explicitly passes `dryRun: false`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MoltbotEnv } from '../types';
import {
  NISSAN_AU_MODELS,
  NissanOfficialClient,
  syncNissanOffers,
  syncNissanPaceCatalog,
  type NissanChoicesModelConfig,
  type NissanModelSlug,
  type NissanOfferSyncResult,
  type NissanPaceSyncResult,
} from './nissan-sync';

type NissanCredentialEnv = Pick<
  MoltbotEnv,
  'NISSAN_PACE_API_KEY' | 'NISSAN_CHOICES_API_KEY' | 'NISSAN_CHOICES_CLIENT_KEY'
>;

export interface NissanOfficialSyncOptions {
  /** Defaults to true. `false` writes staged rows but does not publish them. */
  dryRun?: boolean;
  /** Defaults to all six supported Nissan Australia models. */
  modelSlugs?: NissanModelSlug[];
  /** Location passed to PACE. Regional driveaway prices use their state postcodes. */
  catalogPostcode?: string;
  modelYears?: Partial<Record<NissanModelSlug, string>>;
  /** Stamped into staged model/product provenance for later reviewed promotion. */
  sourceRunId?: string;
  /** Only supply Choices IDs verified from a Nissan-owned response or approved fixture. */
  choicesConfigs?: Partial<Record<NissanModelSlug, NissanChoicesModelConfig>>;
  /** Defaults to true. Offers use the same official Choices credentials. */
  includeOffers?: boolean;
  now?: () => Date;
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

export interface NissanOfficialSyncResult {
  dryRun: boolean;
  catalog: NissanPaceSyncResult;
  offers: NissanOfferSyncResult | null;
  health: NissanOfficialSyncHealth;
  errors: string[];
}

export type NissanSourceHealthStatus = 'healthy' | 'degraded' | 'failed' | 'skipped';

export interface NissanSourceHealth {
  status: NissanSourceHealthStatus;
  requestCount: number;
  recordsFetched: number;
  lastSuccessfulAt: string | null;
  errors: string[];
}

export interface NissanOfficialSyncHealth {
  connector: 'nissan-official-v1';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  sources: {
    pace: NissanSourceHealth;
    choices: NissanSourceHealth;
    offers: NissanSourceHealth;
  };
}

function sourceHealth(input: {
  requested: boolean;
  requestCount: number;
  recordsFetched: number;
  completedAt: string;
  errors: string[];
}): NissanSourceHealth {
  if (!input.requested) {
    return {
      status: 'skipped',
      requestCount: 0,
      recordsFetched: 0,
      lastSuccessfulAt: null,
      errors: [],
    };
  }
  const status: NissanSourceHealthStatus = input.recordsFetched === 0
    ? 'failed'
    : input.errors.length > 0 ? 'degraded' : 'healthy';
  return {
    status,
    requestCount: input.requestCount,
    recordsFetched: input.recordsFetched,
    lastSuccessfulAt: input.recordsFetched > 0 ? input.completedAt : null,
    errors: input.errors,
  };
}

/**
 * Run the complete official Nissan ingestion workflow without publishing.
 *
 * Database writes, when explicitly enabled, remain staged because the catalog
 * normalizer sets model/product availability to `staged`. This function does
 * not activate Nissan for dealers and does not generate model-page artifacts.
 */
export async function runNissanOfficialSync(
  supabase: SupabaseClient,
  env: NissanCredentialEnv,
  options: NissanOfficialSyncOptions = {},
): Promise<NissanOfficialSyncResult> {
  const dryRun = options.dryRun !== false;
  const clock = options.now || (() => new Date());
  const startedAtDate = clock();
  const client = new NissanOfficialClient({
    paceApiKey: env.NISSAN_PACE_API_KEY,
    choicesApiKey: env.NISSAN_CHOICES_API_KEY,
    choicesClientKey: env.NISSAN_CHOICES_CLIENT_KEY,
    fetch: options.fetch,
  });

  const catalog = await syncNissanPaceCatalog(supabase, {
    client,
    dryRun,
    modelSlugs: options.modelSlugs,
    modelYears: options.modelYears,
    sourceRunId: options.sourceRunId,
    choicesConfigs: options.choicesConfigs,
    postcode: options.catalogPostcode || '3000',
    now: options.now,
  });

  const offers = options.includeOffers === false
    ? null
    : await syncNissanOffers(supabase, { client, dryRun, now: options.now });

  const completedAtDate = clock();
  const completedAt = completedAtDate.toISOString();
  const catalogErrors = catalog.errors;
  const choicesErrors = catalogErrors.filter(error => /choices/i.test(error));
  const paceErrors = catalogErrors.filter(error => !/choices/i.test(error));
  const requestedModels = options.modelSlugs?.length
    ?? Object.keys(NISSAN_AU_MODELS).length;
  const choicesRequested = Object.keys(options.choicesConfigs || {}).length > 0;
  const offersRequested = options.includeOffers !== false;
  const health: NissanOfficialSyncHealth = {
    connector: 'nissan-official-v1',
    startedAt: startedAtDate.toISOString(),
    completedAt,
    durationMs: Math.max(0, completedAtDate.getTime() - startedAtDate.getTime()),
    sources: {
      pace: sourceHealth({
        requested: requestedModels > 0,
        requestCount: requestedModels,
        recordsFetched: catalog.versionsFetched,
        completedAt,
        errors: paceErrors,
      }),
      choices: sourceHealth({
        requested: choicesRequested,
        requestCount: catalog.choicesRequests,
        recordsFetched: catalog.regionalPricingRows,
        completedAt,
        errors: choicesErrors,
      }),
      offers: sourceHealth({
        requested: offersRequested,
        requestCount: offersRequested ? 1 : 0,
        recordsFetched: offers?.offersFetched || 0,
        completedAt,
        errors: offers?.errors || [],
      }),
    },
  };

  return {
    dryRun,
    catalog,
    offers,
    health,
    errors: [
      ...catalog.errors.map(error => `catalog: ${error}`),
      ...(offers?.errors || []).map(error => `offers: ${error}`),
    ],
  };
}
