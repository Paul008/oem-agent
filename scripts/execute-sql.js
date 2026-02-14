#!/usr/bin/env node
/**
 * Execute SQL migrations via Supabase REST API
 * 
 * This script attempts to execute SQL directly via Supabase's REST API.
 * Note: This requires the exec_sql function to exist or uses the REST RPC endpoint.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.SUPABASE_URL || 'https://nnihmdmsglkxpmilmjjc.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'YOUR_SUPABASE_SERVICE_ROLE_KEY';

async function execSql(sql) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ sql })
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function createExecSqlFunction() {
  const createFunctionSql = `
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;
  `.trim();

  console.log('Creating exec_sql function...');
  
  // Try to create the function by directly calling the REST endpoint
  // This won't work if the function doesn't exist, so we need another approach
  
  // Alternative: Use the SQL endpoint directly
  const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify({
      query: createFunctionSql
    })
  });
  
  console.log('Response status:', response.status);
  const text = await response.text();
  console.log('Response:', text);
}

async function runMigrations() {
  console.log('🔧 Supabase SQL Executor');
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log('');
  
  // First, try to create the exec_sql function
  // await createExecSqlFunction();
  
  // Since we can't easily create functions via REST, let's provide the SQL for manual execution
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  console.log('📄 Migration files ready for execution:');
  console.log('');
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    console.log('='.repeat(60));
    console.log(`File: ${file}`);
    console.log('='.repeat(60));
    console.log('');
    console.log(content.substring(0, 500));
    console.log('...');
    console.log(content.substring(content.length - 200));
    console.log('');
    console.log(`Full file location: ${filePath}`);
    console.log('');
    console.log('👉 Copy the above SQL and execute in Supabase SQL Editor');
    console.log('');
  }
}

runMigrations().catch(console.error);
