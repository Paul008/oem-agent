#!/usr/bin/env node
/**
 * Cleanup orphan products — products with model_id=null AND external_key=null.
 * These are bare model-level entries created by the orchestrator when crawling
 * model listing pages (e.g. /models, /range) via LLM extraction.
 *
 * Usage: node scripts/cleanup-orphan-products.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config();

const DRY_RUN = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_KEY;
if (!SUPABASE_URL || !SB_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SB_KEY);

async function main() {
  // Find orphans
  const { data: orphans, error } = await supabase
    .from('products')
    .select('id, oem_id, title, external_key, model_id, created_at')
    .is('model_id', null)
    .is('external_key', null);

  if (error) {
    console.error('Query error:', error);
    process.exit(1);
  }

  console.log(`Found ${orphans.length} orphan products (model_id=null, external_key=null)\n`);

  // Group by OEM
  const byOem = {};
  for (const o of orphans) {
    if (!byOem[o.oem_id]) byOem[o.oem_id] = [];
    byOem[o.oem_id].push(o.title);
  }
  for (const [oem, titles] of Object.entries(byOem).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${oem}: ${titles.length} — ${titles.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] Would delete', orphans.length, 'orphan products. Use without --dry-run to delete.');
    return;
  }

  // Delete
  const ids = orphans.map(o => o.id);
  console.log(`\nDeleting ${ids.length} orphan products...`);

  // Supabase .in() has a limit, batch in groups of 50
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error: delError } = await supabase
      .from('products')
      .delete()
      .in('id', batch);

    if (delError) {
      console.error(`Delete error (batch ${i}):`, delError);
    } else {
      deleted += batch.length;
    }
  }

  console.log(`Deleted ${deleted}/${ids.length} orphan products`);

  // Verify
  const { data: remaining } = await supabase
    .from('products')
    .select('id')
    .is('model_id', null)
    .is('external_key', null);
  console.log(`Remaining orphans: ${remaining?.length || 0}`);
}

main();
