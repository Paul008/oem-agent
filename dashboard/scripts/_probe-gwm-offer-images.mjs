#!/usr/bin/env node
/**
 * Probe GWM Storyblok for offer/banner images
 * Looking at offers/, special-offers, car-configurator variants, and offer sub-pages
 */

const TOKEN = 'rII785g9nG3hemzhYNQvQwtt';
const CV = '1771462289';
const BASE = 'https://api.storyblok.com/v2/cdn/stories';
const HEADERS = {
  Origin: 'https://www.gwmanz.com',
  Referer: 'https://www.gwmanz.com/',
};

async function fetchStory(slug, params = {}) {
  const url = new URL(`${BASE}/${slug}`);
  url.searchParams.set('token', TOKEN);
  url.searchParams.set('cv', CV);
  url.searchParams.set('version', 'published');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    return { error: res.status, statusText: res.statusText, url: url.toString() };
  }
  return res.json();
}

async function fetchStories(params = {}) {
  const url = new URL(BASE);
  url.searchParams.set('token', TOKEN);
  url.searchParams.set('cv', CV);
  url.searchParams.set('version', 'published');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers: HEADERS });
  if (!res.ok) {
    return { error: res.status, statusText: res.statusText, url: url.toString() };
  }
  return res.json();
}

/** Truncate arrays deeper than top level to keep output readable */
function truncateDeep(obj, maxArrayItems = 3, depth = 0) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    const slice = obj.slice(0, maxArrayItems);
    const mapped = slice.map((item) => truncateDeep(item, maxArrayItems, depth + 1));
    if (obj.length > maxArrayItems) {
      mapped.push(`... +${obj.length - maxArrayItems} more items (${obj.length} total)`);
    }
    return mapped;
  }
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = truncateDeep(v, maxArrayItems, depth + 1);
    }
    return out;
  }
  return obj;
}

function printSection(title, data) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
  console.log(JSON.stringify(truncateDeep(data, 3), null, 2));
}

async function main() {
  // 1. Fetch "offers/" story (the page itself)
  console.log('>>> Fetching offers/ story...');
  const offersStory = await fetchStory('offers', {
    resolve_relations: '',
    resolve_links: 'story',
  });
  printSection('1. STORY: offers/', offersStory);

  // 2. Fetch "special-offers" story
  console.log('\n>>> Fetching special-offers story...');
  const specialOffers = await fetchStory('special-offers', {
    resolve_relations: '',
    resolve_links: 'story',
  });
  printSection('2. STORY: special-offers', specialOffers);

  // 3. Fetch a car-configurator variant to see hero/banner images
  const variantSlug = 'car-configurator/models/haval-h6/au/haval-h6-lux-2025';
  console.log(`\n>>> Fetching variant: ${variantSlug}...`);
  const variant = await fetchStory(variantSlug, {
    resolve_relations: '',
  });
  printSection(`3. STORY: ${variantSlug}`, variant);

  // 4. Fetch all stories under offers/ (sub-pages)
  console.log('\n>>> Fetching stories starts_with=offers/ ...');
  const offerSubPages = await fetchStories({
    starts_with: 'offers/',
    per_page: '25',
    resolve_relations: '',
  });
  printSection('4. STORIES starts_with=offers/', offerSubPages);

  // 5. Also try "special-offers/" sub-pages
  console.log('\n>>> Fetching stories starts_with=special-offers/ ...');
  const specialOfferSub = await fetchStories({
    starts_with: 'special-offers/',
    per_page: '25',
    resolve_relations: '',
  });
  printSection('5. STORIES starts_with=special-offers/', specialOfferSub);

  // 6. Search for any story with "offer" in slug
  console.log('\n>>> Searching for stories with "offer" in slug...');
  const offerSearch = await fetchStories({
    search_term: 'offer',
    per_page: '25',
  });
  printSection('6. SEARCH: "offer" stories', offerSearch);

  // 7. Also check for banners/ content
  console.log('\n>>> Fetching stories starts_with=banners/ ...');
  const banners = await fetchStories({
    starts_with: 'banners/',
    per_page: '25',
  });
  printSection('7. STORIES starts_with=banners/', banners);

  // 8. Check promotions/ content
  console.log('\n>>> Fetching stories starts_with=promotions/ ...');
  const promos = await fetchStories({
    starts_with: 'promotions/',
    per_page: '25',
  });
  printSection('8. STORIES starts_with=promotions/', promos);

  // Summary: extract all image URLs found
  console.log('\n' + '='.repeat(80));
  console.log('  SUMMARY: Image URLs found');
  console.log('='.repeat(80));

  const allData = JSON.stringify([offersStory, specialOffers, variant, offerSubPages, specialOfferSub, offerSearch, banners, promos]);
  const imageUrls = new Set();
  const regex = /https?:\/\/a\.storyblok\.com[^"\\,\s\]})]+/g;
  let match;
  while ((match = regex.exec(allData)) !== null) {
    imageUrls.add(match[0]);
  }

  if (imageUrls.size === 0) {
    console.log('No a.storyblok.com image URLs found in any response.');
  } else {
    console.log(`Found ${imageUrls.size} unique image URLs:`);
    for (const url of [...imageUrls].sort().slice(0, 30)) {
      console.log(`  ${url}`);
    }
    if (imageUrls.size > 30) {
      console.log(`  ... +${imageUrls.size - 30} more`);
    }
  }
}

main().catch(console.error);
