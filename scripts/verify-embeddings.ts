/**
 * Verify Vector Embeddings Setup
 *
 * Run: npx tsx scripts/verify-embeddings.ts
 */

import { createClient } from '@supabase/supabase-js';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Verifying vector embeddings setup...\n');

  // 1. Check tables exist
  console.log('1️⃣ Checking embedding tables...');
  const tables = ['product_embeddings', 'offer_embeddings', 'change_event_embeddings'];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`);
    } else {
      console.log(`   ✅ ${table}: exists (${count ?? 0} rows)`);
    }
  }

  // 2. Check views exist
  console.log('\n2️⃣ Checking monitoring views...');
  const views = [
    'products_pending_embedding',
    'offers_pending_embedding',
    'change_events_pending_embedding',
    'embedding_coverage_stats'
  ];

  for (const view of views) {
    const { data, error } = await supabase
      .from(view)
      .select('*')
      .limit(1);

    if (error) {
      console.log(`   ❌ ${view}: ${error.message}`);
    } else {
      console.log(`   ✅ ${view}: exists`);
    }
  }

  // 3. Check RPC functions exist
  console.log('\n3️⃣ Checking RPC functions...');

  // Test search_products_semantic with a dummy embedding
  const dummyEmbedding = Array(768).fill(0);
  const { error: searchError } = await supabase.rpc('search_products_semantic', {
    query_embedding: `[${dummyEmbedding.join(',')}]`,
    match_threshold: 0.7,
    match_count: 1,
    filter_oem_id: null
  });

  if (searchError) {
    console.log(`   ❌ search_products_semantic: ${searchError.message}`);
  } else {
    console.log('   ✅ search_products_semantic: exists');
  }

  const { error: similarError } = await supabase.rpc('find_similar_products', {
    source_product_id: '00000000-0000-0000-0000-000000000000',
    match_threshold: 0.8,
    match_count: 1,
    exclude_same_oem: true
  });

  // Expected to fail with "Product has no embedding" which confirms function exists
  if (similarError?.message?.includes('Product') || !similarError) {
    console.log('   ✅ find_similar_products: exists');
  } else {
    console.log(`   ❌ find_similar_products: ${similarError.message}`);
  }

  // 4. Check embedding coverage
  console.log('\n4️⃣ Embedding coverage stats:');
  const { data: stats, error: statsError } = await supabase
    .from('embedding_coverage_stats')
    .select('*');

  if (statsError) {
    console.log(`   ❌ Could not fetch stats: ${statsError.message}`);
  } else if (stats) {
    for (const row of stats) {
      const pct = row.coverage_percent ?? 0;
      const icon = pct > 80 ? '🟢' : pct > 50 ? '🟡' : '🔴';
      console.log(`   ${icon} ${row.table_name}: ${row.embedded_rows}/${row.total_rows} (${pct}%)`);
    }
  }

  // 5. Check pending items
  console.log('\n5️⃣ Items pending embedding:');
  const { count: pendingProducts } = await supabase
    .from('products_pending_embedding')
    .select('*', { count: 'exact', head: true });

  const { count: pendingOffers } = await supabase
    .from('offers_pending_embedding')
    .select('*', { count: 'exact', head: true });

  const { count: pendingChanges } = await supabase
    .from('change_events_pending_embedding')
    .select('*', { count: 'exact', head: true });

  console.log(`   📦 Products: ${pendingProducts ?? 0} pending`);
  console.log(`   🏷️ Offers: ${pendingOffers ?? 0} pending`);
  console.log(`   📋 Change events: ${pendingChanges ?? 0} pending`);

  console.log('\n✅ Verification complete!');
}

main().catch(console.error);
