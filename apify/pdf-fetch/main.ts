/**
 * PDF Fetch Apify Actor
 *
 * Generic brochure/PDF fetcher that runs on Apify's rotating residential IPs
 * to bypass IP-reputation blocks and velocity rate-limiters (e.g. Ford AU /
 * Akamai, which 403s Cloudflare egress but serves ordinary residential IPs).
 *
 * Input:  { items: [{ slug, url }], proxyGroups?, countryCode?, delayMs? }
 * Output: one dataset item { storeId, fetchedAt, total, ok, results }
 *         where each ok result's PDF is saved to the default key-value store
 *         under `results[].kvKey`, retrievable via the Apify API.
 */

import { Actor } from 'apify';
import { gotScraping } from 'got-scraping';

interface Item { slug: string; url: string; }

interface FetchOutcome {
  slug: string;
  url: string;
  ok: boolean;
  status: number;
  size: number;
  kvKey: string | null;
  error?: string;
}

await Actor.init();

const input = (await Actor.getInput()) as {
  items?: Item[];
  proxyGroups?: string[];
  countryCode?: string;
  delayMs?: number;
} | null;

const items = input?.items ?? [];
const delayMs = input?.delayMs ?? 2000;
const proxyGroups = input?.proxyGroups ?? ['RESIDENTIAL'];
const countryCode = input?.countryCode ?? 'AU';

console.log(`[pdf-fetch] ${items.length} URL(s) | proxy=${proxyGroups.join(',')} country=${countryCode}`);

const proxyConfiguration = await Actor.createProxyConfiguration({
  groups: proxyGroups,
  countryCode,
});

const results: FetchOutcome[] = [];

for (let i = 0; i < items.length; i++) {
  const { slug, url } = items[i];
  const kvKey = `pdf_${slug.replace(/[^a-zA-Z0-9!_.'()-]/g, '-')}`;
  try {
    // Fresh proxy session per URL → a new residential IP each time, so the
    // origin never sees velocity from a single address.
    const proxyUrl = proxyConfiguration ? await proxyConfiguration.newUrl(`s_${i}_${Date.now()}`) : undefined;
    const res = await gotScraping({
      url,
      proxyUrl,
      responseType: 'buffer',
      timeout: { request: 60_000 },
      throwHttpErrors: false,
      headers: { accept: 'application/pdf,*/*' },
    });
    const body = res.body as Buffer;
    const isPdf = Buffer.isBuffer(body) && body.subarray(0, 4).toString('latin1') === '%PDF';
    if (res.statusCode === 200 && isPdf) {
      await Actor.setValue(kvKey, body, { contentType: 'application/pdf' });
      results.push({ slug, url, ok: true, status: res.statusCode, size: body.length, kvKey });
      console.log(`[pdf-fetch] OK   ${slug}  ${body.length}b  -> ${kvKey}`);
    } else {
      results.push({ slug, url, ok: false, status: res.statusCode, size: 0, kvKey: null });
      console.log(`[pdf-fetch] FAIL ${slug}  status=${res.statusCode} isPdf=${isPdf}`);
    }
  } catch (err) {
    results.push({ slug, url, ok: false, status: 0, size: 0, kvKey: null, error: String(err) });
    console.log(`[pdf-fetch] ERR  ${slug}  ${err}`);
  }
  if (i < items.length - 1) await new Promise((r) => setTimeout(r, delayMs));
}

const storeId = Actor.getEnv().defaultKeyValueStoreId;
await Actor.pushData({
  storeId,
  fetchedAt: new Date().toISOString(),
  total: items.length,
  ok: results.filter((r) => r.ok).length,
  results,
});

console.log(`[pdf-fetch] Done: ${results.filter((r) => r.ok).length}/${items.length} ok | store=${storeId}`);

await Actor.exit();
