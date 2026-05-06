/**
 * Parse Ford Build & Price HAR exports (scripts/ford-nukleus-hars/*.har),
 * extract the Nukleus catalog codes per nameplate, and persist them to
 * vehicle_models.meta_json.nukleus_codes so the Worker can replay Nukleus
 * POSTs without walking the SPA.
 *
 * Also writes docs/ford-nukleus-endpoints.md — the endpoint inventory
 * discovered across all HARs (which Nukleus paths exist, what request
 * shape they take, sample response size).
 *
 * Run:  pnpm tsx scripts/parse-ford-nukleus-hars.ts [--apply]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const APPLY = process.argv.includes('--apply');
const HAR_DIR = path.resolve(__dirname, 'ford-nukleus-hars');
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function isNukleus(url: string): boolean {
  return /imgservices\.ford\.com|\/api\/buy\/nukleus\//.test(url);
}

interface NukleusCall {
  source: string;           // HAR filename
  method: string;
  url: string;
  pathname: string;         // host + path (no query)
  status: number;
  reqBody: any;
  resSize: number;
  resSample: any;
  startedAt: string;
}

interface PerNameplateCodes {
  nameplate: string;
  catalogId?: string;
  series: Set<string>;
  bodyStyle: Set<string>;
  powertrain: Set<string>;
  vehicleColor: Set<string>;
  baseSiteId?: string;
  lang?: string;
  endpoints: Set<string>;
  sampleRequests: Record<string, any>; // endpoint → one request body
}

function emptyCodes(nameplate: string): PerNameplateCodes {
  return {
    nameplate,
    series: new Set(),
    bodyStyle: new Set(),
    powertrain: new Set(),
    vehicleColor: new Set(),
    endpoints: new Set(),
    sampleRequests: {},
  };
}

function harvestFromBody(codes: PerNameplateCodes, body: any): void {
  if (!body || typeof body !== 'object') return;
  const filters = body.filters ?? body;
  if (filters.catalogId) codes.catalogId = String(filters.catalogId);
  if (filters.series) codes.series.add(String(filters.series));
  if (filters.bodyStyle) codes.bodyStyle.add(String(filters.bodyStyle));
  if (filters.powertrain) codes.powertrain.add(String(filters.powertrain));
  if (filters.vehicleColor) codes.vehicleColor.add(String(filters.vehicleColor));
  const markers = body.markers ?? {};
  if (markers.baseSiteId) codes.baseSiteId = String(markers.baseSiteId);
  if (markers.lang) codes.lang = String(markers.lang);
}

function parseHar(file: string): NukleusCall[] {
  const raw = fs.readFileSync(file, 'utf8');
  let har: any;
  try { har = JSON.parse(raw); } catch (e: any) { console.error(`  parse error in ${file}: ${e.message}`); return []; }
  const entries = har?.log?.entries ?? [];
  const out: NukleusCall[] = [];
  for (const e of entries) {
    const url = e.request?.url ?? '';
    if (!isNukleus(url)) continue;
    let reqBody: any = null;
    const rawBody = e.request?.postData?.text;
    if (rawBody) { try { reqBody = JSON.parse(rawBody); } catch { reqBody = rawBody.slice(0, 500); } }
    let resText = e.response?.content?.text ?? '';
    // Some HAR exports base64-encode bodies
    if (e.response?.content?.encoding === 'base64') {
      try { resText = Buffer.from(resText, 'base64').toString('utf8'); } catch { /* ignore */ }
    }
    let resSample: any = null;
    try { resSample = JSON.parse(resText); } catch { resSample = resText.slice(0, 200); }
    let pathname = url;
    try { const u = new URL(url); pathname = `${u.hostname}${u.pathname}`; } catch { /* ignore */ }
    out.push({
      source: path.basename(file),
      method: e.request?.method ?? 'GET',
      url,
      pathname,
      status: e.response?.status ?? 0,
      reqBody,
      resSize: (e.response?.content?.size ?? resText.length) as number,
      resSample,
      startedAt: e.startedDateTime ?? '',
    });
  }
  return out;
}

async function main() {
  if (!fs.existsSync(HAR_DIR)) {
    console.error(`No HAR directory at ${HAR_DIR} — create it and drop .har files inside.`);
    process.exit(1);
  }
  const hars = fs.readdirSync(HAR_DIR).filter((f) => f.toLowerCase().endsWith('.har')).map((f) => path.join(HAR_DIR, f));
  if (!hars.length) {
    console.error(`No .har files in ${HAR_DIR} — nothing to parse.`);
    process.exit(1);
  }
  console.log(`Parsing ${hars.length} HAR file(s)...\n`);

  const allCalls: NukleusCall[] = [];
  for (const h of hars) {
    console.log(`  ${path.basename(h)}`);
    const calls = parseHar(h);
    console.log(`    → ${calls.length} Nukleus calls`);
    allCalls.push(...calls);
  }
  if (!allCalls.length) {
    console.error('\nNo Nukleus calls found in any HAR. Did you walk past the model-select screen into body-style / series / accessories?');
    process.exit(1);
  }

  // Group by nameplate (learn nameplate from request body; fall back to HAR filename)
  const byNameplate = new Map<string, PerNameplateCodes>();
  for (const c of allCalls) {
    const nameplate = c.reqBody?.filters?.nameplate
      ?? c.reqBody?.nameplate
      ?? path.basename(c.source, '.har');
    const key = slugify(String(nameplate));
    if (!key) continue;
    const codes = byNameplate.get(key) ?? emptyCodes(String(nameplate));
    harvestFromBody(codes, c.reqBody);
    const epKey = `${c.method} ${c.pathname}`;
    codes.endpoints.add(epKey);
    if (!codes.sampleRequests[epKey] && c.reqBody) codes.sampleRequests[epKey] = c.reqBody;
    byNameplate.set(key, codes);
  }

  console.log('\n=== Nameplate → codes extracted ===');
  for (const [slug, c] of byNameplate) {
    console.log(`\n${slug}  (from "${c.nameplate}")`);
    console.log(`  catalogId:    ${c.catalogId ?? '(none)'}`);
    console.log(`  series:       ${[...c.series].join(', ') || '(none)'}`);
    console.log(`  bodyStyle:    ${[...c.bodyStyle].join(', ') || '(none)'}`);
    console.log(`  powertrain:   ${[...c.powertrain].join(', ') || '(none)'}`);
    console.log(`  vehicleColor: ${[...c.vehicleColor].join(', ') || '(none)'}`);
    console.log(`  baseSiteId:   ${c.baseSiteId ?? '(none)'}  lang: ${c.lang ?? '(none)'}`);
    console.log(`  endpoints:    ${c.endpoints.size}`);
  }

  // Endpoint inventory across all HARs
  const epCounts = new Map<string, number>();
  const epSampleReq = new Map<string, any>();
  const epSampleRes = new Map<string, any>();
  const epSampleStatus = new Map<string, number>();
  for (const c of allCalls) {
    const key = `${c.method} ${c.pathname}`;
    epCounts.set(key, (epCounts.get(key) ?? 0) + 1);
    if (!epSampleReq.has(key) && c.reqBody) epSampleReq.set(key, c.reqBody);
    if (!epSampleRes.has(key) && c.resSample) { epSampleRes.set(key, c.resSample); epSampleStatus.set(key, c.status); }
  }

  const md: string[] = [];
  md.push('# Ford Nukleus API — endpoint inventory\n');
  md.push(`Extracted from ${hars.length} HAR file(s) on ${new Date().toISOString()}.\n`);
  md.push(`Total Nukleus calls observed: ${allCalls.length}\n`);
  md.push('## Endpoints\n');
  md.push('| Method + path | hits |');
  md.push('|---|---|');
  for (const [k, v] of [...epCounts.entries()].sort((a, b) => b[1] - a[1])) md.push(`| \`${k}\` | ${v} |`);
  for (const [ep, count] of [...epCounts.entries()].sort((a, b) => b[1] - a[1])) {
    md.push(`\n## ${ep}  (×${count}, status ${epSampleStatus.get(ep) ?? '?'})`);
    const req = epSampleReq.get(ep);
    if (req) {
      md.push('<details><summary>sample request body</summary>\n\n```json');
      md.push(JSON.stringify(req, null, 2).slice(0, 3000));
      md.push('```\n</details>');
    }
    const res = epSampleRes.get(ep);
    if (res) {
      md.push('<details><summary>sample response (truncated)</summary>\n\n```json');
      md.push((typeof res === 'string' ? res : JSON.stringify(res, null, 2)).slice(0, 3000));
      md.push('```\n</details>');
    }
  }

  const docDir = path.resolve(__dirname, '..', 'docs');
  fs.mkdirSync(docDir, { recursive: true });
  const docFile = path.join(docDir, 'ford-nukleus-endpoints.md');
  fs.writeFileSync(docFile, md.join('\n'));
  console.log(`\nEndpoint inventory → ${docFile}`);

  // Persist to vehicle_models.meta_json.nukleus_codes
  const { data: models, error: mErr } = await s
    .from('vehicle_models')
    .select('id, slug, name, meta_json')
    .eq('oem_id', 'ford-au');
  if (mErr) throw mErr;

  const updates: Array<{ id: string; slug: string; codes: any }> = [];
  const orphanKeys: string[] = [];

  for (const [key, c] of byNameplate) {
    // Match on slug first, then by normalized name
    let match = models!.find((m) => m.slug === key);
    if (!match) match = models!.find((m) => slugify(m.name) === key);
    if (!match) { orphanKeys.push(key); continue; }

    const codes = {
      catalogId: c.catalogId ?? null,
      series: [...c.series],
      bodyStyle: [...c.bodyStyle],
      powertrain: [...c.powertrain],
      vehicleColor: [...c.vehicleColor],
      baseSiteId: c.baseSiteId ?? 'aus',
      lang: c.lang ?? 'en_AU',
      endpoints: [...c.endpoints],
      sampleRequests: c.sampleRequests,
      capturedAt: new Date().toISOString(),
    };
    updates.push({ id: match.id, slug: match.slug, codes });
  }

  console.log(`\n=== Persist plan ===`);
  console.log(`  updates: ${updates.length}`);
  if (orphanKeys.length) console.log(`  unmapped nameplate keys: ${orphanKeys.join(', ')}`);

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to persist codes to vehicle_models.meta_json.nukleus_codes');
    return;
  }

  for (const u of updates) {
    const existing = models!.find((m) => m.id === u.id);
    const newMeta = { ...(existing?.meta_json ?? {}), nukleus_codes: u.codes };
    const { error } = await s.from('vehicle_models').update({ meta_json: newMeta }).eq('id', u.id);
    if (error) console.error(`  ${u.slug}: ${error.message}`);
    else console.log(`  ${u.slug} ✓`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
