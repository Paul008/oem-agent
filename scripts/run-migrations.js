#!/usr/bin/env node
/**
 * Run Supabase migrations
 * 
 * Usage: node scripts/run-migrations.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function runMigration(filePath) {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);
  
  console.log(`\n📄 Running migration: ${fileName}`);
  console.log(`   Size: ${sql.length} characters`);
  
  // Split SQL into individual statements (simple approach)
  // Note: This is a basic splitter and may not handle all edge cases
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s + ';');
  
  console.log(`   Statements: ${statements.length}`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (stmt.trim().length < 5) continue; // Skip empty statements
    
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      
      if (error) {
        // If exec_sql doesn't exist, try direct query
        const { error: queryError } = await supabase.from('_migrations_dummy').select('*').limit(0);
        
        if (queryError && queryError.message.includes('relation "_migrations_dummy" does not exist')) {
          // Expected error, ignore
        }
        
        console.error(`   ❌ Statement ${i + 1} failed:`, error.message);
        errorCount++;
      } else {
        successCount++;
      }
    } catch (err) {
      console.error(`   ❌ Statement ${i + 1} error:`, err.message);
      errorCount++;
    }
  }
  
  console.log(`   ✅ Success: ${successCount}, ❌ Errors: ${errorCount}`);
  return { successCount, errorCount };
}

async function main() {
  console.log('🚀 Supabase Migration Runner');
  console.log(`   URL: ${SUPABASE_URL}`);
  
  // Check connection
  try {
    const { data, error } = await supabase.from('oems').select('count').limit(1);
    if (error && !error.message.includes('relation "oems" does not exist')) {
      console.error('Connection error:', error.message);
      process.exit(1);
    }
    console.log('✅ Connected to Supabase\n');
  } catch (err) {
    console.error('Failed to connect:', err.message);
    process.exit(1);
  }
  
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log(`Found ${files.length} migration files`);
  
  let totalSuccess = 0;
  let totalErrors = 0;
  
  for (const file of files) {
    const result = await runMigration(path.join(migrationsDir, file));
    totalSuccess += result.successCount;
    totalErrors += result.errorCount;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('Migration Summary:');
  console.log(`  Total statements executed: ${totalSuccess}`);
  console.log(`  Total errors: ${totalErrors}`);
  
  if (totalErrors === 0) {
    console.log('✅ All migrations completed successfully!');
  } else {
    console.log('⚠️  Some migrations had errors');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
