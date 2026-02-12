#!/usr/bin/env node
/**
 * Supabase Database Setup
 * 
 * This script sets up the Supabase database by executing SQL migrations.
 * It uses the Supabase Management API or direct SQL execution.
 * 
 * Usage: node scripts/setup-database.js
 */

const fs = require('fs');
const path = require('path');

// Configuration from environment
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc';
const PROJECT_REF = 'nnihmdmsglkxpmilmjjc';

async function setupDatabase() {
  console.log('🚀 Supabase Database Setup');
  console.log(`   Project: ${PROJECT_REF}`);
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log('');

  // Get list of migration files
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`📄 Found ${files.length} migration files:`);
  files.forEach(f => {
    const size = fs.statSync(path.join(migrationsDir, f)).size;
    console.log(`   - ${f} (${size} bytes)`);
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('');
  
  console.log('To set up the database, please execute the following SQL files');
  console.log('in your Supabase Dashboard SQL Editor:');
  console.log('');
  console.log('1. Go to: https://supabase.com/dashboard/project/' + PROJECT_REF);
  console.log('2. Navigate to: SQL Editor (left sidebar)');
  console.log('3. Create a "New query"');
  console.log('4. Copy and paste the content of each migration file:');
  console.log('');
  
  files.forEach((file, index) => {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const statements = content.split(';').filter(s => s.trim().length > 0).length;
    
    console.log(`   ${index + 1}. ${file}`);
    console.log(`      (${statements} SQL statements)`);
    console.log(`      File: ${filePath}`);
    console.log('');
  });

  console.log('');
  console.log('Alternative methods:');
  console.log('');
  console.log('Method 1: Using psql (if you have DB password):');
  console.log('  psql "postgresql://postgres:[PASSWORD]@db.' + PROJECT_REF + '.supabase.co:5432/postgres" -f supabase/migrations/00001_initial_schema.sql');
  console.log('');
  console.log('Method 2: Using Supabase CLI (if linked):');
  console.log('  supabase db push');
  console.log('');
  console.log('Method 3: Copy-paste in SQL Editor (recommended)');
  console.log('');
  
  // Display first migration summary
  console.log('='.repeat(60));
  console.log('');
  console.log('📋 First Migration Summary (00001_initial_schema.sql):');
  console.log('');
  
  const firstMigration = fs.readFileSync(path.join(migrationsDir, '00001_initial_schema.sql'), 'utf-8');
  const tables = firstMigration.match(/CREATE TABLE \w+\s*\(/g) || [];
  console.log('   Tables created:');
  tables.forEach(t => {
    const tableName = t.replace('CREATE TABLE ', '').replace(' (', '');
    console.log(`     - ${tableName}`);
  });
  
  console.log('');
  console.log('   OEMs seeded:');
  const oemMatches = firstMigration.match(/INSERT INTO oms \(id, name[^)]+\) VALUES\s+((?:[^;]+|\([^)]+\))*)/s);
  const oemCount = (firstMigration.match(/'[a-z-]+-au'/g) || []).length / 2; // Approximate
  console.log(`     - ${oemCount} Australian OEMs`);

  console.log('');
  console.log('='.repeat(60));
  console.log('');
  console.log('✅ Setup instructions generated!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Open Supabase Dashboard');
  console.log('  2. Run the SQL migrations in order');
  console.log('  3. Verify tables are created');
  console.log('  4. Start the worker with: npm run dev');
}

setupDatabase().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
