/**
 * Brochure Mirror Workflow
 *
 * Durable pipeline that mirrors bot-blocked OEM brochure PDFs into R2, then
 * extracts variant specs from them.
 *
 * Why this exists: some OEM hosts (Ford / Akamai) block Cloudflare egress IPs
 * outright — a plain Worker fetch, and even Cloudflare Browser Rendering, get
 * 403, while an ordinary residential IP succeeds. So the PDF fetch cannot
 * happen on Cloudflare. This Workflow orchestrates on Cloudflare but delegates
 * the actual fetch to an Apify actor running on rotating residential IPs
 * (each request is effectively a fresh clean-IP hit, sidestepping both the
 * IP-reputation block and Akamai's velocity rate-limiter). The bytes come back
 * via the actor's key-value store, land in R2, and the existing vision
 * extractor runs against the R2-served copy (which the Worker CAN reach).
 *
 * Steps (each durable + independently retried):
 *   1. list-brochures  — original (un-mirrored) brochure URLs for the OEM
 *   2. apify-fetch     — one actor run fetches all PDFs off-Cloudflare → KV store
 *   3. mirror-<slug>   — download from Apify KV → R2 → repoint brochure_url
 *   4. extract-<slug>  — vision spec extraction from the mirrored PDF
 */

import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';

import type { MoltbotEnv } from '../types';
import type { OemId } from '../oem/types';
import { createSupabaseClient } from '../utils/supabase';
import { runApifyActor, getKeyValueRecord } from '../sync/apify-client';

export interface BrochureMirrorParams {
  /** OEM to mirror brochures for, e.g. 'ford-au'. */
  oemId: string;
  /** Re-extract even if extracted within the last 30 days. */
  force?: boolean;
  /** Override the Apify PDF-fetch actor id (else env.APIFY_PDF_FETCH_ACTOR_ID). */
  actorId?: string;
  /** Apify proxy groups (default RESIDENTIAL). */
  proxyGroups?: string[];
  /** Apify proxy country (default AU). */
  countryCode?: string;
}

interface BrochureRef {
  modelId: string;
  slug: string;
  url: string;
  filename: string;
}

interface FetchOutcome {
  slug: string;
  url: string;
  ok: boolean;
  status: number;
  size: number;
  kvKey: string | null;
}

export class BrochureMirrorWorkflow extends WorkflowEntrypoint<MoltbotEnv, BrochureMirrorParams> {
  async run(event: WorkflowEvent<BrochureMirrorParams>, step: WorkflowStep) {
    const { oemId, force = false, actorId, proxyGroups, countryCode } = event.payload;
    const mediaBase = (this.env.MEDIA_BASE_URL || 'https://oemmedia.driveagent.io').replace(/\/+$/, '');
    const resolvedActorId = actorId || this.env.APIFY_PDF_FETCH_ACTOR_ID;

    if (!this.env.APIFY_TOKEN) throw new Error('APIFY_TOKEN not configured');
    if (!resolvedActorId) throw new Error('No Apify PDF-fetch actor id (set APIFY_PDF_FETCH_ACTOR_ID or pass actorId)');

    // ── Step 1: list un-mirrored brochures for this OEM ──
    const brochures = await step.do('list-brochures', async (): Promise<BrochureRef[]> => {
      const supabase = createSupabaseClient({ url: this.env.SUPABASE_URL, serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY });
      const { data, error } = await supabase
        .from('vehicle_models')
        .select('id, slug, brochure_url')
        .eq('oem_id', oemId)
        .not('brochure_url', 'is', null);
      if (error) throw new Error(`list-brochures: ${error.message}`);
      return (data ?? [])
        // Skip rows already pointing at our own media host (idempotent re-runs).
        .filter((m: { brochure_url: string }) => !String(m.brochure_url).includes('/media/brochures/'))
        .map((m: { id: string; slug: string; brochure_url: string }) => ({
          modelId: m.id,
          slug: m.slug,
          url: m.brochure_url,
          filename: fileNameFromUrl(m.brochure_url),
        }));
    });

    if (brochures.length === 0) {
      return { oemId, brochures: 0, mirrored: 0, note: 'no un-mirrored brochures found' };
    }

    // ── Step 2: fetch every PDF off-Cloudflare via one Apify actor run ──
    const fetched = await step.do(
      'apify-fetch',
      { retries: { limit: 2, delay: '30 seconds', backoff: 'exponential' }, timeout: '10 minutes' },
      async (): Promise<{ storeId: string; results: FetchOutcome[] }> => {
        const run = await runApifyActor({
          token: this.env.APIFY_TOKEN!,
          actorId: resolvedActorId,
          input: {
            items: brochures.map((b) => ({ slug: b.slug, url: b.url })),
            proxyGroups: proxyGroups ?? ['RESIDENTIAL'],
            countryCode: countryCode ?? 'AU',
            delayMs: 2000,
          },
          timeoutSecs: 540,
          pollIntervalSecs: 15,
        });
        const item = (run.items?.[0] ?? {}) as { storeId?: string; results?: FetchOutcome[] };
        const storeId = item.storeId || run.keyValueStoreId;
        if (!storeId) throw new Error('Apify run returned no key-value store id');
        return { storeId, results: item.results ?? [] };
      },
    );

    const okCount = fetched.results.filter((r) => r.ok).length;

    // ── Step 3+4: per brochure — mirror to R2, repoint, then extract ──
    let mirrored = 0;
    let extracted = 0;
    const failures: string[] = [];

    for (const b of brochures) {
      const outcome = fetched.results.find((r) => r.slug === b.slug);
      if (!outcome || !outcome.ok || !outcome.kvKey) {
        failures.push(`${b.slug}: fetch failed (status ${outcome?.status ?? 'n/a'})`);
        continue;
      }

      const r2Key = `brochures/${oemId}/${b.slug}/${b.filename}`;
      const mediaUrl = `${mediaBase}/media/brochures/${oemId}/${b.slug}/${b.filename}`;

      await step.do(
        `mirror-${b.slug}`,
        { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' } },
        async () => {
          const bytes = await getKeyValueRecord(this.env.APIFY_TOKEN!, fetched.storeId, outcome.kvKey!);
          await this.env.MOLTBOT_BUCKET.put(r2Key, bytes, {
            httpMetadata: { contentType: 'application/pdf' },
          });
          const supabase = createSupabaseClient({ url: this.env.SUPABASE_URL, serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY });
          const { error } = await supabase.from('vehicle_models').update({ brochure_url: mediaUrl }).eq('id', b.modelId);
          if (error) throw new Error(`repoint ${b.slug}: ${error.message}`);
          return { r2Key, size: bytes.byteLength };
        },
      );
      mirrored++;

      const extractResult = await step.do(
        `extract-${b.slug}`,
        { retries: { limit: 1, delay: '15 seconds', backoff: 'constant' }, timeout: '6 minutes' },
        async () => {
          const supabase = createSupabaseClient({ url: this.env.SUPABASE_URL, serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY });
          const { AiRouter } = await import('../ai/router');
          const aiRouter = new AiRouter(
            {
              groq: this.env.GROQ_API_KEY,
              together: this.env.TOGETHER_API_KEY,
              moonshot: this.env.MOONSHOT_API_KEY,
              anthropic: this.env.ANTHROPIC_API_KEY,
              google: this.env.GOOGLE_API_KEY,
            },
            supabase,
          );
          const { executePdfSpecExtractionVision } = await import('../sync/pdf-spec-extractor');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await executePdfSpecExtractionVision(supabase, aiRouter as any, {
            modelIds: [b.modelId],
            force: true,
            browser: this.env.BROWSER,
          });
        },
      );
      if ((extractResult?.models_processed ?? 0) > 0) extracted++;

      // Small spacing so a burst of Gemini/vision calls doesn't hit provider limits.
      await step.sleep(`gap-${b.slug}`, '3 seconds');
    }

    return {
      oemId,
      brochures: brochures.length,
      fetched_ok: okCount,
      mirrored,
      extracted,
      failures,
    };
  }
}

function fileNameFromUrl(url: string): string {
  try {
    const name = new URL(url).pathname.split('/').pop();
    return decodeURIComponent(name || 'brochure.pdf');
  } catch {
    return 'brochure.pdf';
  }
}

// Kept for readers: OemId is the canonical OEM identifier type used across the
// codebase; oemId params should be one of its values (e.g. 'ford-au').
export type { OemId };
