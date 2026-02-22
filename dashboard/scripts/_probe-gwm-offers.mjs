#!/usr/bin/env node

/**
 * Probe GWM offers from Supabase and Storyblok CDN
 */

const SUPABASE_URL = 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const STORYBLOK_API = 'https://api.storyblok.com/v2/cdn/stories';
const STORYBLOK_TOKEN = 'rII785g9nG3hemzhYNQvQwtt';
const STORYBLOK_CV = '1771462289';
const STORYBLOK_HEADERS = {
  'Origin': 'https://www.gwmanz.com',
  'Referer': 'https://www.gwmanz.com/',
};

// --- Supabase helpers ---

async function supabaseGet(table, params = '') {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

// --- Storyblok helpers ---

async function storyblokGet(params = {}) {
  const qs = new URLSearchParams({
    token: STORYBLOK_TOKEN,
    cv: STORYBLOK_CV,
    version: 'published',
    ...params,
  });
  const url = `${STORYBLOK_API}?${qs}`;
  const res = await fetch(url, { headers: STORYBLOK_HEADERS });
  if (!res.ok) {
    const body = await res.text();
    return { stories: [], error: `${res.status} ${body.slice(0, 200)}` };
  }
  return res.json();
}

function printStories(label, data) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'─'.repeat(60)}`);
  if (data.error) {
    console.log(`  ERROR: ${data.error}`);
    return;
  }
  const stories = data.stories || [];
  console.log(`  Found: ${stories.length} stories`);
  for (const s of stories) {
    console.log(`\n  [${s.full_slug}] "${s.name}"`);
    console.log(`    uuid: ${s.uuid}`);
    console.log(`    created: ${s.created_at}`);
    if (s.content) {
      const keys = Object.keys(s.content);
      console.log(`    content keys: ${keys.join(', ')}`);
      // Print interesting string values (not objects/arrays)
      for (const k of keys) {
        const v = s.content[k];
        if (typeof v === 'string' && v.length > 0 && v.length < 300 && k !== '_uid' && k !== 'component') {
          console.log(`    ${k}: ${v}`);
        }
        if (Array.isArray(v) && v.length > 0) {
          console.log(`    ${k}: [${v.length} items]`);
          // Show first item keys if object
          if (typeof v[0] === 'object' && v[0] !== null) {
            console.log(`      first item keys: ${Object.keys(v[0]).join(', ')}`);
          }
        }
      }
    }
  }
  if (stories.length === 0) {
    console.log('  (no results)');
  }
}

// --- Main ---

async function main() {
  console.log('='.repeat(60));
  console.log('GWM OFFERS PROBE');
  console.log('='.repeat(60));

  // -- Part 1: Supabase offers --
  console.log('\n' + '='.repeat(60));
  console.log('PART 1: SUPABASE OFFERS FOR GWM');
  console.log('='.repeat(60));

  try {
    const offers = await supabaseGet('offers', 'oem_id=eq.gwm-au&select=*');
    console.log(`\nFound ${offers.length} offers for gwm-au`);
    for (const o of offers) {
      console.log(`\n  ID: ${o.id}`);
      console.log(`  Title: ${o.title}`);
      console.log(`  Source URL: ${o.source_url}`);
      console.log(`  Hero Image R2: ${o.hero_image_r2_key}`);
      console.log(`  Type: ${o.offer_type}`);
      console.log(`  Status: ${o.status}`);
      console.log(`  Start: ${o.starts_at}`);
      console.log(`  End: ${o.ends_at}`);
      console.log(`  Created: ${o.created_at}`);
      // Print all other non-null fields
      const skip = new Set(['id','title','source_url','hero_image_r2_key','offer_type','status','starts_at','ends_at','created_at','oem_id','updated_at']);
      for (const [k, v] of Object.entries(o)) {
        if (!skip.has(k) && v !== null && v !== undefined) {
          const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200);
          console.log(`  ${k}: ${val}`);
        }
      }
    }
  } catch (err) {
    console.log(`Error fetching offers: ${err.message}`);
  }

  // Also check banners table
  try {
    const banners = await supabaseGet('banners', 'oem_id=eq.gwm-au&select=*');
    console.log(`\nFound ${banners.length} banners for gwm-au`);
    for (const b of banners) {
      console.log(`\n  ID: ${b.id}`);
      console.log(`  Title: ${b.title || b.name || '(no title)'}`);
      const skip = new Set(['id','title','name','oem_id']);
      for (const [k, v] of Object.entries(b)) {
        if (!skip.has(k) && v !== null && v !== undefined) {
          const val = typeof v === 'object' ? JSON.stringify(v).slice(0, 200) : String(v).slice(0, 200);
          console.log(`  ${k}: ${val}`);
        }
      }
    }
  } catch (err) {
    console.log(`Error fetching banners: ${err.message}`);
  }

  // -- Part 2: Storyblok searches --
  console.log('\n' + '='.repeat(60));
  console.log('PART 2: STORYBLOK CDN SEARCHES');
  console.log('='.repeat(60));

  // Search by starts_with
  const prefixes = ['offers', 'promotions', 'deals', 'specials', 'offer', 'promo', 'sale', 'campaign'];
  for (const prefix of prefixes) {
    const data = await storyblokGet({ starts_with: prefix, per_page: '25' });
    printStories(`starts_with="${prefix}"`, data);
  }

  // Search by search_term
  const searchTerms = ['offer', 'abn', 'driveaway', 'promotion', 'deal', 'special', 'bonus', 'price', 'finance', 'campaign'];
  for (const term of searchTerms) {
    const data = await storyblokGet({ search_term: term, per_page: '25' });
    printStories(`search_term="${term}"`, data);
  }

  // -- Part 3: Top-level content structure --
  console.log('\n' + '='.repeat(60));
  console.log('PART 3: TOP-LEVEL STORYBLOK STRUCTURE (level=1)');
  console.log('='.repeat(60));

  const topLevel = await storyblokGet({ level: '1', per_page: '100' });
  printStories('All top-level stories (level=1)', topLevel);

  // Also try level=2 to see what is under top folders
  const level2 = await storyblokGet({ level: '2', per_page: '100' });
  printStories('Level 2 stories', level2);

  // -- Part 4: Explore known GWM content areas --
  console.log('\n' + '='.repeat(60));
  console.log('PART 4: EXPLORE KNOWN GWM CONTENT AREAS');
  console.log('='.repeat(60));

  const knownPrefixes = ['car-configurator', 'page', 'pages', 'home', 'news', 'blog', 'content'];
  for (const prefix of knownPrefixes) {
    const data = await storyblokGet({ starts_with: prefix, per_page: '10' });
    if (data.stories && data.stories.length > 0) {
      printStories(`starts_with="${prefix}" (first 10)`, data);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('PROBE COMPLETE');
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
