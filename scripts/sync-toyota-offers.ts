/**
 * Toyota Current Offers Sync
 *
 * Crawls https://www.toyota.com.au/current-offers with real Chrome (bypasses
 * bot management) plus each per-offer detail page, resolves footnote
 * disclaimers from the site's disclaimers API, and upserts one row per retail
 * offer into `offers` (oem_id 'toyota-au', external_key `tau-<slug>`).
 *
 * meta_json is shaped to match the legacy WordPress feed rows (external_key
 * 'wp-%') so the consuming theme's normalizeToyotaOffer reads them unchanged.
 * REQUIRED meta_json fields: id, title:{rendered}, slug, model, thumb,
 * disclaimer, end_date, offer_sub, variant_sub.
 *
 * Does NOT touch the existing 'wp-%' rows. If the page yields no offers after
 * 3 genuine attempts it stops and writes nothing (junk skeleton rows are what
 * this replaces).
 *
 * Run: npx tsx scripts/sync-toyota-offers.ts
 */
import puppeteer from 'puppeteer';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OEM_ID = 'toyota-au';
const OFFERS_URL = 'https://www.toyota.com.au/current-offers';
const DISCLAIMERS_API = '/main/api/v1/toyota/currentoffers/disclaimers/all?tablePrefix=web';

const slugify = (value: string) =>
  (value || '')
    .replace(/\[[A-Za-z]{1,3}\d{1,3}\]/g, '') // drop footnote markers e.g. [F31]
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Decode &amp; LAST so already-decoded ampersands aren't re-processed.
const decodeEntities = (s: string) =>
  (s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');

// Stable positive integer id derived from the slug (theme uses it as a key).
const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const footnoteCodes = (text: string) => {
  const found = text.match(/\[[A-Za-z]{1,3}\d{1,3}\]/g) || [];
  return [...new Set(found)];
};

// Build disclaimer HTML mirroring the wp feed: one <p>[CODE] …</p> per footnote.
function buildDisclaimerHtml(codes: string[], discMap: Record<string, string>): string {
  const parts: string[] = [];
  for (const code of codes) {
    const raw = discMap[code];
    if (!raw) continue;
    let html = decodeEntities(raw).trim();
    if (/^<p[\s>]/i.test(html)) {
      html = html.replace(/^<p([^>]*)>/i, `<p$1>${code} `);
    } else {
      html = `<p>${code} ${html}</p>`;
    }
    parts.push(html);
  }
  return parts.join('\r\n');
}

// Best-effort offer end date -> YYYY-MM-DD, from the subtitle/disclaimer text.
// Build the string from calendar components (never via toISOString, which would
// shift a local-midnight date back a day in +10/+11 timezones).
function parseEndDate(text: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const m1 = text.match(/end(?:s|ing)?[^.]*?(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
  if (m1) {
    const d = new Date(m1[1]);
    if (!isNaN(+d)) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const dmy = [...text.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
  if (dmy.length) {
    const [, dd, mm, yy] = dmy[dmy.length - 1];
    if (+mm >= 1 && +mm <= 12 && +dd >= 1 && +dd <= 31) return `${yy}-${pad(+mm)}-${pad(+dd)}`;
  }
  return '';
}

interface ModelRow { id: string; name: string; slug: string }

// Match a model name inside offer text (longest name first for specificity).
function buildModelMatcher(models: ModelRow[]) {
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const phrases = models
    .map((m) => ({ p: norm(m.name), name: m.name, id: m.id }))
    .filter((x) => x.p)
    .sort((a, b) => b.p.length - a.p.length);
  return (text: string): { name: string; id: string | null } => {
    const t = norm(text);
    for (const { p, name, id } of phrases) {
      const re = new RegExp(`(?:^| )${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`);
      if (re.test(t)) return { name, id };
    }
    return { name: '', id: null };
  };
}

// NOTE: page.evaluate receives STRING scripts — tsx/esbuild rewrites serialized
// functions with a __name helper that doesn't exist in the page context.
const LIST_SCRIPT = `(() => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const imgSrc = (i) => {
    if (!i) return null;
    let s = i.currentSrc || i.getAttribute('src') || '';
    if (!s) {
      const ss = i.getAttribute('srcset') || (i.closest('picture') && i.closest('picture').querySelector('source')?.getAttribute('srcset')) || '';
      s = (ss.split(',').pop() || '').trim().split(' ')[0] || '';
    }
    return s ? (s.startsWith('http') ? s : location.origin + s) : null;
  };
  return Array.from(document.querySelectorAll('.ty-offer-card')).map((c) => {
    let a = c.closest('a') || c.querySelector('a');
    if (!a) { let p = c; for (let i = 0; i < 6 && p; i++) { p = p.parentElement; if (p && p.tagName === 'A') { a = p; break; } } }
    return {
      type: clean((c.querySelector('.ty-offer-card__header-heading--co') || {}).textContent),
      title: clean((c.querySelector('.ty-offer-card__header-title') || {}).textContent),
      subtitle: clean((c.querySelector('.ty-offer-card__header-subtitle') || {}).textContent),
      img: imgSrc(c.querySelector('img')),
      href: a ? a.getAttribute('href') : null,
    };
  }).filter((c) => c.title);
})()`;

const DETAIL_SCRIPT = `(() => {
  const clean = (t) => (t || '').replace(/\\s+/g, ' ').trim();
  const txt = (sel) => clean((document.querySelector(sel) || {}).textContent);
  const first = (sel) => { const e = document.querySelector(sel); return e ? clean(e.textContent) : ''; };
  const heroImg = document.querySelector('.ty-co-details__image');
  let hero = heroImg ? (heroImg.currentSrc || heroImg.getAttribute('src') || '') : '';
  if (hero && !hero.startsWith('http')) hero = location.origin + hero;
  return {
    title: txt('.ty-co-details__title'),
    subTitle: txt('.ty-co-details__sub-title'),
    descText: txt('.ty-co-details__description-text'),
    offerTitle: first('.ty-offer-card__offer-title'),
    offerDescLarge: first('.ty-offer-card__offer-description-large'),
    hero,
  };
})()`;

async function fetchDisclaimers(page: any): Promise<Record<string, string>> {
  const result = await page.evaluate(`(async () => {
    try {
      const res = await fetch('${DISCLAIMERS_API}', { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  })()`);
  const map: Record<string, string> = {};
  const list = result?.data?.disclaimers || [];
  for (const d of list) if (d.reference) map[d.reference] = d.description || '';
  return map;
}

async function upsertOffer(row: Record<string, any>) {
  const { data: existing } = await supabase
    .from('offers')
    .select('id')
    .eq('oem_id', OEM_ID)
    .eq('external_key', row.external_key)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('offers').update(row).eq('id', existing.id);
    if (error) throw error;
    return 'updated';
  }
  const { error } = await supabase.from('offers').insert(row);
  if (error) throw error;
  return 'inserted';
}

async function main() {
  const { data: models } = await supabase
    .from('vehicle_models')
    .select('id, name, slug')
    .eq('oem_id', OEM_ID);
  const matchModel = buildModelMatcher((models as ModelRow[]) || []);

  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36');

  // Load the offers list, retrying up to 3 times before giving up.
  let cards: any[] = [];
  for (let attempt = 1; attempt <= 3 && cards.length === 0; attempt++) {
    console.log(`[Offers] loading ${OFFERS_URL} (attempt ${attempt})`);
    await page.goto(OFFERS_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 2500));
    for (let s = 0; s <= 6; s++) {
      await page.evaluate(`window.scrollTo(0, document.body.scrollHeight * ${s} / 6)`);
      await new Promise((r) => setTimeout(r, 400));
    }
    cards = await page.evaluate(LIST_SCRIPT);
    console.log(`  found ${cards.length} offer cards`);
  }

  if (cards.length === 0) {
    await browser.close();
    console.error('[Offers] ABORT: no offer cards found after 3 attempts — writing nothing.');
    process.exit(1);
  }

  const discMap = await fetchDisclaimers(page);
  console.log(`[Offers] disclaimer references: ${Object.keys(discMap).length}`);

  let inserted = 0;
  let updated = 0;
  const seen: string[] = [];

  for (const card of cards) {
    const detailUrl = card.href
      ? (card.href.startsWith('http') ? card.href : 'https://www.toyota.com.au' + card.href)
      : OFFERS_URL;

    let detail: any = {};
    if (card.href) {
      try {
        await page.goto(detailUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise((r) => setTimeout(r, 1500));
        detail = await page.evaluate(DETAIL_SCRIPT);
      } catch (e: any) {
        console.warn(`  [detail error] ${card.title}: ${e.message}`);
      }
    }

    const titleText: string = detail.title || card.title;
    const variantSub: string = card.subtitle || detail.subTitle || '';
    const offerSub: string = detail.offerTitle || card.type || '';
    const description: string = detail.descText || '';
    const featuresText: string = detail.offerDescLarge || '';
    const thumb: string = card.img || detail.hero || '';
    const slug = slugify(titleText);
    const externalKey = `tau-${slug}`;

    const model = matchModel(`${titleText} ${offerSub} ${variantSub}`);
    const codes = footnoteCodes(`${titleText} ${variantSub}`);
    const disclaimerHtml = buildDisclaimerHtml(codes, discMap);
    const endDate = parseEndDate(`${variantSub} ${featuresText} ${disclaimerHtml}`);
    const id = hashId(slug);

    const metaJson = {
      id,
      date: new Date().toISOString(),
      slug,
      grade: null,
      model: model.name,
      price: '',
      thumb,
      title: { rendered: titleText },
      excerpt: { rendered: description },
      variant: model.name,
      end_date: endDate,
      features: featuresText,
      grade_id: titleText,
      metadesc: { rendered: '' },
      metatitle: { rendered: slug },
      offer_sub: offerSub,
      disclaimer: disclaimerHtml,
      drive_away: '',
      offer_badge: null,
      offer_title: '',
      variant_sub: variantSub,
      variant_spill: '',
      source: 'toyota.com.au/current-offers',
    };

    const row: Record<string, any> = {
      oem_id: OEM_ID,
      external_key: externalKey,
      source_url: detailUrl,
      title: titleText,
      description,
      offer_type: 'retail',
      hero_image_r2_key: thumb || null,
      disclaimer_html: disclaimerHtml || null,
      validity_end: endDate || null,
      model_id: model.id,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      meta_json: metaJson,
    };

    try {
      const outcome = await upsertOffer(row);
      if (outcome === 'inserted') inserted++;
      else updated++;
      seen.push(externalKey);
      console.log(`  ${outcome === 'inserted' ? '➕' : '♻️'} ${externalKey} | model=${model.name || '?'} | codes=${codes.join(',') || 'none'} | end=${endDate || '-'}`);
    } catch (e: any) {
      console.error(`  [upsert error] ${externalKey}: ${e.message}`);
    }
  }

  await browser.close();
  console.log(`\n=== Done === offers: ${cards.length}, inserted: ${inserted}, updated: ${updated}`);
  console.log(`external_keys: ${seen.join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
