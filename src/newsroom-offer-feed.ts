/** Read-only, private service-binding feed. Never mounted on the public HTTP router. */
import { WorkerEntrypoint } from 'cloudflare:workers';
import type { MoltbotEnv } from './types';
import { createSupabaseClient } from './utils/supabase';
import { oemRegistry } from './oem/registry';

export class NewsroomOfferFeed extends WorkerEntrypoint<MoltbotEnv> {
  async getOffers(oemId: string) {
    const definition = oemRegistry[oemId];
    if (!definition) return null;
    const checkedAt = new Date().toISOString();
    const cutoff = new Date(Date.now() - 48 * 3600_000).toISOString();
    const db = createSupabaseClient({ url: this.env.SUPABASE_URL, serviceRoleKey: this.env.SUPABASE_SERVICE_ROLE_KEY });
    const { data, error } = await db.from('offers')
      .select('id,title,description,offer_type,price_raw_string,applicable_models,disclaimer_text,eligibility,validity_start,validity_end,validity_raw,source_url,last_seen_at')
      .eq('oem_id', oemId).eq('lifecycle_status', 'active')
      .gte('last_seen_at', cutoff)
      .order('last_seen_at', { ascending: false }).limit(100);
    if (error) throw new Error('OEM offer feed unavailable');
    // These are source candidates, not publication approval. Consumer must validate
    // amounts, market, terms and dates before exposing a summary to readers.
    return { oemId, checkedAt, scope: 'fresh-active-offer-candidates', offers: data || [] };
  }
}
