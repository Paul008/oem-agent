#!/usr/bin/env node
/**
 * Fix Navara MY26 variant_colors with Storyblok hero images from navara.nissan.com.au
 * These were missing because Helios doesn't support the D27 chassis yet.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
);

// Storyblok hero images from navara.nissan.com.au (2560x1440)
// Filenames contain real paint codes: KCX, KCY, RDC, QBJ, NCS, QBH, GAV, ECR
const NAVARA_MY26_IMAGES = {
  'boulder-grey':     'https://a.storyblok.com/f/289030467773147/2560x1440/8b6170cb02/navara-auto-4x4-st-x-dual-cab_boulder-grey_kcx.png',
  'summit-silver':    'https://a.storyblok.com/f/289030467773147/2560x1440/6d4c436bbc/navara-auto-4x4-st-x-dual-cab_summit-silver_kcy.png',
  'horizon-blue':     'https://a.storyblok.com/f/289030467773147/2560x1440/734b299549/navara-auto-4x4-st-x-dual-cab_horizon-blue_rdc.png',
  'blizzard-white':   'https://a.storyblok.com/f/289030467773147/2560x1440/769b2dfc81/navara-auto-4x4-st-x-dual-cab_blizzard-white_qbj_transparent.png',
  'outback-red':      'https://a.storyblok.com/f/289030467773147/2560x1440/9c5506b206/navara-auto-4x4-st-x-dual-cab_outback-red_ncs.png',
  'alpine-white':     'https://a.storyblok.com/f/289030467773147/2560x1440/5baf277773/navara-auto-4x4-st-x-dual-cab_alpine-white_qbh_transparent.png',
  'midnight-black':   'https://a.storyblok.com/f/289030467773147/2560x1440/19de74b8b6/navara-auto-4x4-st-x-dual-cab_midnight-black_gav.png',
  'kimberley-orange': 'https://a.storyblok.com/f/289030467773147/2560x1440/a5db5deed2/navara-auto-4x4-st-x-dual-cab_kimberley-orange_ecr.png',
};

// Get Navara MY26 product IDs (model_code 30316)
const { data: products } = await supabase
  .from('products')
  .select('id, title, meta_json')
  .eq('oem_id', 'nissan-au')
  .filter('meta_json->>model_code', 'eq', '30316');

console.log(`Found ${products.length} Navara MY26 products`);

let updated = 0;

for (const product of products) {
  for (const [colorCode, heroUrl] of Object.entries(NAVARA_MY26_IMAGES)) {
    const { data, error } = await supabase
      .from('variant_colors')
      .update({ hero_image_url: heroUrl })
      .eq('product_id', product.id)
      .eq('color_code', colorCode)
      .select('id');

    if (error) {
      console.error(`  Error updating ${colorCode} for ${product.title}:`, error.message);
    } else if (data?.length) {
      updated++;
    }
  }
}

console.log(`Updated ${updated} variant_colors with Storyblok hero images`);

// Verify
const productIds = products.map(p => p.id);
const { count: withHero } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds)
  .not('hero_image_url', 'is', null);

const { count: total } = await supabase
  .from('variant_colors')
  .select('id', { count: 'exact', head: true })
  .in('product_id', productIds);

console.log(`Navara MY26: ${withHero}/${total} colors now have hero images`);
