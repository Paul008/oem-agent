#!/usr/bin/env node
/**
 * OEM Data Sync Runner
 *
 * Wraps dashboard/scripts/seed-*.mjs and enrich-*.mjs with import_runs tracking.
 *
 * Usage:
 *   node skills/oem-data-sync/scripts/sync-runner.mjs --oem kgm-au --op accessories
 *   node skills/oem-data-sync/scripts/sync-runner.mjs --schedule weekly --dry-run
 *   node skills/oem-data-sync/scripts/sync-runner.mjs --all
 */

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ── Resolve paths ──
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..', '..', '..')
const manifestPath = join(__dirname, '..', 'sync-manifest.json')
const scriptsDir = join(projectRoot, 'dashboard', 'scripts')

// ── Supabase client (same creds as seed scripts) ──
const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

// ── Parse CLI args ──
const args = process.argv.slice(2)
function getArg(name) {
  const idx = args.indexOf(`--${name}`)
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null
}
const flagOem = getArg('oem')
const flagOp = getArg('op')
const flagSchedule = getArg('schedule')
const flagTimeout = parseInt(getArg('timeout') || '120000', 10)
const flagAll = args.includes('--all')
const flagDryRun = args.includes('--dry-run')

if (!flagOem && !flagOp && !flagSchedule && !flagAll) {
  console.error('Usage: sync-runner.mjs --oem <id> | --op <type> | --schedule <weekly|monthly> | --all [--dry-run] [--timeout <ms>]')
  process.exit(1)
}

// ── Load manifest ──
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
let ops = manifest.operations

// ── Filter operations ──
if (flagOem) ops = ops.filter(o => o.oem_id === flagOem)
if (flagOp) ops = ops.filter(o => o.operation === flagOp)
if (flagSchedule) ops = ops.filter(o => o.schedule === flagSchedule)

if (ops.length === 0) {
  console.error('No matching operations found.')
  process.exit(1)
}

console.log(`\n${'='.repeat(60)}`)
console.log(`OEM Data Sync Runner`)
console.log(`Operations: ${ops.length} | Dry run: ${flagDryRun} | Timeout: ${flagTimeout}ms`)
console.log(`${'='.repeat(60)}\n`)

if (flagDryRun) {
  console.log('Operations that would run:\n')
  console.log('  ID                              Script                              Schedule')
  console.log('  ' + '-'.repeat(80))
  for (const op of ops) {
    console.log(`  ${op.id.padEnd(34)}${op.script.padEnd(38)}${op.schedule}`)
  }
  console.log(`\nTotal: ${ops.length} operations`)
  process.exit(0)
}

// ── Run type mapping ──
const runTypeMap = {
  products: 'sync_products',
  accessories: 'sync_accessories',
  colors: 'sync_colors',
  enrich: 'sync_enrich',
  apis: 'sync_apis',
  rewrite: 'sync_rewrite',
}

// ── Parse counts from stdout ──
function parseCounts(stdout) {
  let pagesChecked = 0
  let changesFound = 0

  // Common patterns in seed script output
  const fetchedMatch = stdout.match(/[Ff]etched\s+(\d+)/g)
  if (fetchedMatch) {
    for (const m of fetchedMatch) {
      const n = parseInt(m.match(/(\d+)/)[1], 10)
      pagesChecked = Math.max(pagesChecked, n)
    }
  }

  const upsertPatterns = [
    /[Uu]pserted\s+(\d+)/g,
    /[Ii]nserted\s+(\d+)/g,
    /[Cc]reated\s+(\d+)/g,
    /[Ss]eeded\s+(\d+)/g,
    /[Uu]pdated\s+(\d+)/g,
  ]
  for (const pattern of upsertPatterns) {
    const matches = stdout.matchAll(pattern)
    for (const m of matches) {
      changesFound += parseInt(m[1], 10)
    }
  }

  return { pagesChecked, changesFound }
}

// ── Execute a single script ──
function runScript(scriptPath, timeout) {
  return new Promise((resolve) => {
    const child = execFile('node', [scriptPath], {
      cwd: scriptsDir,
      timeout,
      env: {
        ...process.env,
        NODE_PATH: join(scriptsDir, '..', 'node_modules'),
      },
    }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (error.code || 1) : 0,
        signal: error?.signal || null,
        stdout: stdout || '',
        stderr: stderr || '',
        killed: error?.killed || false,
      })
    })
  })
}

// ── Create import_run record ──
async function createImportRun(op) {
  // Skip tracking for cross-OEM scripts
  if (op.oem_id === 'all') return null

  const { data, error } = await supabase
    .from('import_runs')
    .insert({
      oem_id: op.oem_id,
      run_type: runTypeMap[op.operation] || `sync_${op.operation}`,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (error) {
    console.warn(`  Warning: Failed to create import_run: ${error.message}`)
    return null
  }
  return data.id
}

// ── Update import_run record ──
async function updateImportRun(runId, result, counts) {
  if (!runId) return

  const update = {
    status: result.exitCode === 0 ? 'completed' : 'failed',
    finished_at: new Date().toISOString(),
    pages_checked: counts.pagesChecked,
    changes_found: counts.changesFound,
  }

  if (result.exitCode !== 0) {
    update.error_log = result.stderr.slice(0, 10000) || result.stdout.slice(-2000)
    update.error_json = {
      script: result.script,
      exit_code: result.exitCode,
      signal: result.signal,
      killed: result.killed,
    }
  }

  const { error } = await supabase
    .from('import_runs')
    .update(update)
    .eq('id', runId)

  if (error) {
    console.warn(`  Warning: Failed to update import_run: ${error.message}`)
  }
}

// ── Main execution loop ──
const results = []
const startTime = Date.now()

for (const op of ops) {
  const scriptPath = join(scriptsDir, op.script)
  console.log(`\n[${'▶'.repeat(1)}] ${op.id}`)
  console.log(`   Script: ${op.script}`)

  const runId = await createImportRun(op)

  const opStart = Date.now()
  const result = await runScript(scriptPath, flagTimeout)
  const duration = ((Date.now() - opStart) / 1000).toFixed(1)

  const counts = parseCounts(result.stdout)
  result.script = op.script

  await updateImportRun(runId, result, counts)

  const status = result.exitCode === 0 ? 'OK' : 'FAIL'
  console.log(`   ${status} (${duration}s) | processed: ${counts.pagesChecked} | changes: ${counts.changesFound}`)

  if (result.exitCode !== 0) {
    const errorPreview = (result.stderr || result.stdout).split('\n').slice(-3).join('\n   ')
    console.log(`   Error: ${errorPreview}`)
  }

  results.push({
    id: op.id,
    status,
    duration: parseFloat(duration),
    pagesChecked: counts.pagesChecked,
    changesFound: counts.changesFound,
    exitCode: result.exitCode,
    runId,
  })
}

// ── Summary ──
const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1)
const passed = results.filter(r => r.status === 'OK').length
const failed = results.filter(r => r.status === 'FAIL').length

console.log(`\n${'='.repeat(60)}`)
console.log(`Summary: ${passed} passed, ${failed} failed, ${results.length} total (${totalDuration}s)`)
console.log(`${'='.repeat(60)}`)

if (failed > 0) {
  console.log('\nFailed operations:')
  for (const r of results.filter(r => r.status === 'FAIL')) {
    console.log(`  - ${r.id} (exit: ${r.exitCode})`)
  }
}

console.log()
process.exit(failed > 0 ? 1 : 0)
