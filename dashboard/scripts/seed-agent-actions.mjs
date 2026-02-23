#!/usr/bin/env node
/**
 * Seed realistic agent_actions + change_events data for battle testing.
 *
 * Creates ~40 change events and ~35 agent actions across multiple
 * OEMs, workflows, and statuses to validate the dashboard.
 *
 * Run: node dashboard/scripts/seed-agent-actions.mjs
 * Cleanup: node dashboard/scripts/seed-agent-actions.mjs --cleanup
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const SEED_TAG = 'seed-battle-test'

// ── Cleanup mode ──
if (process.argv.includes('--cleanup')) {
  console.log('\n🧹 Cleaning up seeded agent data...\n')
  const { count: actionsDeleted } = await supabase
    .from('agent_actions')
    .delete({ count: 'exact' })
    .eq('agent_id', SEED_TAG)
  console.log(`  Deleted ${actionsDeleted ?? 0} agent_actions`)

  const { count: eventsDeleted } = await supabase
    .from('change_events')
    .delete({ count: 'exact' })
    .like('summary', '%[seed]%')
  console.log(`  Deleted ${eventsDeleted ?? 0} change_events`)
  console.log('\n✅ Cleanup complete\n')
  process.exit(0)
}

// ── Helpers ──
const rand = (min, max) => Math.random() * (max - min) + min
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
const uuid = () => crypto.randomUUID()
const daysAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()

const OEM_IDS = ['toyota-au', 'nissan-au', 'mitsubishi-au', 'kia-au', 'mazda-au', 'hyundai-au', 'ford-au', 'gwm-au']

const WORKFLOWS = [
  'price-validation',
  'product-enrichment',
  'link-repair',
  'offer-expiry',
  'image-quality',
  'new-model-page',
  'disclaimer-compliance',
  'variant-sync',
]

const EVENT_TEMPLATES = [
  { type: 'price_changed', severity: 'high', entity: 'product', summaryFn: (oem) => `[seed] Price changed on ${oem} Corolla from $32,990 to $33,490` },
  { type: 'price_changed', severity: 'critical', entity: 'product', summaryFn: (oem) => `[seed] Driveaway price dropped 15% on ${oem} model — possible error` },
  { type: 'product_updated', severity: 'medium', entity: 'product', summaryFn: (oem) => `[seed] New variant added to ${oem} catalog — needs enrichment` },
  { type: 'product_updated', severity: 'low', entity: 'product', summaryFn: (oem) => `[seed] Specs updated for ${oem} SUV range — minor field changes` },
  { type: 'offer_expired', severity: 'high', entity: 'offer', summaryFn: (oem) => `[seed] ${oem} bonus offer expired — still displayed on dealer pages` },
  { type: 'offer_expired', severity: 'medium', entity: 'offer', summaryFn: (oem) => `[seed] ${oem} fleet discount promotion reached end date` },
  { type: 'link_broken', severity: 'high', entity: 'source_page', summaryFn: (oem) => `[seed] ${oem} brochure PDF link returns 404` },
  { type: 'link_broken', severity: 'medium', entity: 'source_page', summaryFn: (oem) => `[seed] ${oem} configurator URL redirects to homepage` },
  { type: 'image_missing', severity: 'medium', entity: 'product', summaryFn: (oem) => `[seed] Hero image missing for new ${oem} model page` },
  { type: 'image_missing', severity: 'low', entity: 'product', summaryFn: (oem) => `[seed] ${oem} colour swatch images return placeholder` },
  { type: 'disclaimer_missing', severity: 'critical', entity: 'offer', summaryFn: (oem) => `[seed] ${oem} offer missing mandatory driveaway disclaimer` },
  { type: 'disclaimer_missing', severity: 'high', entity: 'product', summaryFn: (oem) => `[seed] ${oem} pricing page missing "excludes on-road costs" text` },
  { type: 'model_launched', severity: 'high', entity: 'vehicle_model', summaryFn: (oem) => `[seed] New ${oem} model detected — no dealer page exists yet` },
  { type: 'variant_mismatch', severity: 'medium', entity: 'product', summaryFn: (oem) => `[seed] ${oem} variant count mismatch: OEM site shows 6, we have 4` },
  { type: 'variant_mismatch', severity: 'high', entity: 'product', summaryFn: (oem) => `[seed] ${oem} discontinued variant still listed as active` },
]

const REASONING_TEMPLATES = [
  'Detected price change exceeding 5% threshold. Cross-referenced with OEM price list API. Change appears intentional — new MY26 pricing rollout. Updating product record with new RRP and driveaway values.',
  'Scanned offer expiry dates against current date. Found 3 expired promotions still visible. Marked as expired and queued for removal from active dealer pages. No bonus cash changes detected.',
  'Broken link detected during scheduled crawl. Attempted resolution: (1) checked for URL pattern change, (2) searched OEM sitemap for new location, (3) found updated PDF at new CDN path. Replacing link.',
  'Missing disclaimer identified on pricing page. Australian Consumer Law requires driveaway pricing disclosure. Added standard disclaimer template matching OEM brand guidelines.',
  'New model variant detected on OEM website not present in our catalog. Extracted specifications from configurator API. Confidence high — data matches press release from 2 weeks ago.',
  'Image quality check flagged hero image as below minimum resolution (800x450 vs required 1200x800). Found high-res version in OEM media library. Replacing with 2400x1350 asset.',
  'Variant sync detected count mismatch. OEM site lists new Sport+ variant not in our database. Extracted full specs, pricing, and colour options. Ready for catalog insertion.',
  'Compliance scan found offer page missing required legal terms. Cross-referenced with compliance ruleset. Inserted approved disclaimer block at page footer. Matches existing OEM disclaimer style.',
]

const ACTIONS_TEMPLATES = [
  ['Queried OEM pricing API', 'Compared current vs new prices', 'Updated product.rrp_cents', 'Updated product.driveaway_cents', 'Logged price change event'],
  ['Scanned active offers', 'Identified expired promotions', 'Updated offer status to expired', 'Removed from active feed'],
  ['Checked URL availability', 'Searched OEM sitemap', 'Found replacement URL', 'Updated source_page record', 'Verified new link returns 200'],
  ['Ran compliance keyword scan', 'Identified missing disclaimer', 'Generated disclaimer from template', 'Inserted into page content', 'Verified compliance rules pass'],
  ['Detected new model in OEM feed', 'Extracted specifications', 'Created product record', 'Generated initial page content', 'Queued for human review'],
  ['Downloaded image assets', 'Checked resolution and quality', 'Found high-res replacement', 'Updated image URLs', 'Cleared CDN cache'],
  ['Compared variant lists', 'Identified new variant', 'Extracted spec data', 'Created variant record', 'Updated model page'],
  ['Validated pricing display', 'Checked disclaimer presence', 'Compared with compliance rules', 'No action required — all checks passed'],
]

// ── Generate change events ──
console.log('\n🌱 Seeding agent battle test data...\n')

const changeEvents = []
for (let i = 0; i < 40; i++) {
  const oem = pick(OEM_IDS)
  const template = pick(EVENT_TEMPLATES)
  changeEvents.push({
    id: uuid(),
    oem_id: oem,
    entity_type: template.entity,
    entity_id: uuid(),
    event_type: template.type,
    severity: template.severity,
    summary: template.summaryFn(oem.replace('-au', '').toUpperCase()),
    diff_json: { field: 'price', old: '$32,990', new: '$33,490' },
    created_at: daysAgo(rand(0, 14)),
  })
}

const { error: eventsError, count: eventsCount } = await supabase
  .from('change_events')
  .insert(changeEvents, { count: 'exact' })

if (eventsError) {
  console.error('❌ Failed to insert change_events:', eventsError.message)
  process.exit(1)
}
console.log(`  ✅ Inserted ${eventsCount} change_events`)

// ── Generate agent actions ──
const STATUS_DISTRIBUTION = [
  ...Array(15).fill('completed'),
  ...Array(5).fill('failed'),
  ...Array(6).fill('requires_approval'),
  ...Array(3).fill('running'),
  ...Array(3).fill('pending'),
]

const agentActions = []
for (let i = 0; i < 35; i++) {
  const event = changeEvents[i % changeEvents.length]
  const status = pick(STATUS_DISTRIBUTION)
  const workflow = pick(WORKFLOWS)
  const confidence = parseFloat(rand(0.55, 0.99).toFixed(2))
  const executionMs = status === 'completed' || status === 'failed'
    ? Math.round(rand(800, 45000))
    : null
  const costUsd = status === 'completed' || status === 'failed'
    ? parseFloat(rand(0.001, 0.15).toFixed(6))
    : null
  const createdAt = new Date(new Date(event.created_at).getTime() + rand(60000, 3600000))

  agentActions.push({
    id: uuid(),
    workflow_id: workflow,
    change_event_id: event.id,
    oem_id: event.oem_id,
    agent_id: SEED_TAG,
    status,
    confidence_score: confidence,
    actions_taken: status === 'completed' ? pick(ACTIONS_TEMPLATES) : [],
    reasoning: status === 'completed' || status === 'requires_approval' ? pick(REASONING_TEMPLATES) : null,
    execution_time_ms: executionMs,
    cost_usd: costUsd,
    error_message: status === 'failed' ? pick([
      'Timeout: OEM API did not respond within 30s',
      'Rate limited by OEM CDN — retry scheduled',
      'Validation failed: extracted price outside expected range',
      'Image download failed: SSL certificate expired on OEM media server',
      'Compliance check inconclusive — flagged for manual review',
    ]) : null,
    rollback_data: status === 'completed' ? { previous_value: '$32,990', entity: 'product', field: 'rrp' } : null,
    created_at: createdAt.toISOString(),
    updated_at: createdAt.toISOString(),
    completed_at: status === 'completed' ? new Date(createdAt.getTime() + (executionMs || 5000)).toISOString() : null,
  })
}

const { error: actionsError, count: actionsCount } = await supabase
  .from('agent_actions')
  .insert(agentActions, { count: 'exact' })

if (actionsError) {
  console.error('❌ Failed to insert agent_actions:', actionsError.message)
  // Cleanup change events on failure
  await supabase.from('change_events').delete().like('summary', '%[seed]%')
  process.exit(1)
}
console.log(`  ✅ Inserted ${actionsCount} agent_actions`)

// ── Summary ──
const byStatus = {}
const byWorkflow = {}
const byOem = {}
for (const a of agentActions) {
  byStatus[a.status] = (byStatus[a.status] || 0) + 1
  byWorkflow[a.workflow_id] = (byWorkflow[a.workflow_id] || 0) + 1
  byOem[a.oem_id] = (byOem[a.oem_id] || 0) + 1
}

console.log('\n📊 Distribution:')
console.log('  Status:', JSON.stringify(byStatus))
console.log('  Workflows:', JSON.stringify(byWorkflow))
console.log('  OEMs:', JSON.stringify(byOem))

const totalCost = agentActions.reduce((s, a) => s + (a.cost_usd || 0), 0)
const avgTime = agentActions.filter(a => a.execution_time_ms).reduce((s, a) => s + a.execution_time_ms, 0) / agentActions.filter(a => a.execution_time_ms).length

console.log(`\n  Total cost: $${totalCost.toFixed(4)}`)
console.log(`  Avg execution: ${Math.round(avgTime)}ms`)
console.log('\n✅ Seed complete — open http://localhost:5173/dashboard/agents to battle test\n')
console.log('🧹 To cleanup: node dashboard/scripts/seed-agent-actions.mjs --cleanup\n')
