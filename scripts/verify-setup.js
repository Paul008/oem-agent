#!/usr/bin/env node
/**
 * Verify Supabase Database Setup
 * 
 * This script checks that the database is properly configured.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function verify() {
  console.log('🔍 Verifying Supabase Database Setup');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log('');

  const checks = [];

  // Check 1: Connection
  try {
    const { data, error } = await supabase.from('oems').select('count').limit(1);
    if (error && error.message.includes('relation "oems" does not exist')) {
      checks.push({ name: 'Database connection', status: 'connected', note: 'Tables not created yet' });
    } else if (error) {
      checks.push({ name: 'Database connection', status: 'error', note: error.message });
    } else {
      checks.push({ name: 'Database connection', status: 'connected' });
    }
  } catch (err) {
    checks.push({ name: 'Database connection', status: 'error', note: err.message });
  }

  // Check 2: OEMs table
  try {
    const { count, error } = await supabase.from('oems').select('*', { count: 'exact', head: true });
    if (error) throw error;
    checks.push({ name: 'OEMs table', status: 'ok', count });
  } catch (err) {
    checks.push({ name: 'OEMs table', status: 'missing', note: err.message });
  }

  // Check 3: Source pages
  try {
    const { count, error } = await supabase.from('source_pages').select('*', { count: 'exact', head: true });
    if (error) throw error;
    checks.push({ name: 'Source pages', status: 'ok', count });
  } catch (err) {
    checks.push({ name: 'Source pages', status: 'missing', note: err.message });
  }

  // Check 4: Products table
  try {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    if (error) throw error;
    checks.push({ name: 'Products table', status: 'ok', count: count || 0 });
  } catch (err) {
    checks.push({ name: 'Products table', status: 'missing', note: err.message });
  }

  // Check 5: AI inference log
  try {
    const { count, error } = await supabase.from('ai_inference_log').select('*', { count: 'exact', head: true });
    if (error) throw error;
    checks.push({ name: 'AI inference log', status: 'ok', count: count || 0 });
  } catch (err) {
    checks.push({ name: 'AI inference log', status: 'missing', note: err.message });
  }

  // Print results
  console.log('Verification Results:');
  console.log('');
  
  let allOk = true;
  for (const check of checks) {
    const status = check.status === 'ok' || check.status === 'connected' ? '✅' : '❌';
    const count = check.count !== undefined ? `(${check.count})` : '';
    const note = check.note ? `- ${check.note}` : '';
    console.log(`  ${status} ${check.name} ${count} ${note}`);
    if (check.status !== 'ok' && check.status !== 'connected') allOk = false;
  }

  console.log('');
  
  if (allOk) {
    console.log('✅ Database is properly configured!');
    console.log('');
    console.log('You can now:');
    console.log('  1. Deploy the worker: npm run deploy');
    console.log('  2. Trigger a test crawl via the API');
  } else {
    console.log('⚠️  Some tables are missing.');
    console.log('');
    console.log('Please run the migrations:');
    console.log('  See: docs/DATABASE_SETUP.md');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
