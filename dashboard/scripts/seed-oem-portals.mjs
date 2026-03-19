/**
 * Seed OEM portal credentials from Monday.com board 15373501.
 *
 * Fetches board items via Monday.com GraphQL API, maps to our 18 OEM IDs,
 * and upserts into oem_portals table.
 *
 * Run: cd dashboard/scripts && node seed-oem-portals.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const MONDAY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjExMTU2MTI1NSwiYWFpIjoxMSwidWlkIjo1NzQxNzUsImlhZCI6IjIwMjEtMDUtMjdUMTI6MjI6MDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjIyOTIyNCwicmduIjoidXNlMSJ9.ezQH-YElr0wqgirNHIRcRYApXZb0FOg_mqt0l_cO8lc'
const BOARD_ID = '15373501'

// Map Monday.com item names to our OEM IDs (fuzzy matching)
const OEM_NAME_MAP = {
  'ford': 'ford-au',
  'gwm': 'gwm-au',
  'great wall': 'gwm-au',
  'haval': 'gwm-au',
  'hyundai': 'hyundai-au',
  'isuzu': 'isuzu-au',
  'kia': 'kia-au',
  'ldv': 'ldv-au',
  'mazda': 'mazda-au',
  'mitsubishi': 'mitsubishi-au',
  'nissan': 'nissan-au',
  'subaru': 'subaru-au',
  'suzuki': 'suzuki-au',
  'toyota': 'toyota-au',
  'volkswagen': 'volkswagen-au',
  'vw': 'volkswagen-au',
  'kgm': 'kgm-au',
  'ssangyong': 'kgm-au',
}

function matchOemId(itemName) {
  const lower = itemName.toLowerCase().trim()
  // Direct match
  for (const [key, oemId] of Object.entries(OEM_NAME_MAP)) {
    if (lower.includes(key)) return oemId
  }
  return null
}

function extractColumnValue(item, columnId) {
  const col = item.column_values.find(c => c.id === columnId)
  if (!col || !col.text) return null
  return col.text.trim() || null
}

function extractColumnJson(item, columnId) {
  const col = item.column_values.find(c => c.id === columnId)
  if (!col || !col.value) return null
  try {
    return JSON.parse(col.value)
  } catch {
    return null
  }
}

async function fetchBoardItems() {
  // First, get board structure to understand columns
  const structureQuery = `query {
    boards(ids: [${BOARD_ID}]) {
      name
      columns {
        id
        title
        type
      }
    }
  }`

  console.log('Fetching board structure...')
  const structRes = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_API_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: structureQuery }),
  })

  const structData = await structRes.json()
  if (structData.errors) {
    console.error('Monday.com API errors:', structData.errors)
    throw new Error(structData.errors[0].message)
  }

  const board = structData.data.boards[0]
  console.log(`Board: ${board.name}`)
  console.log('Columns:')
  for (const col of board.columns) {
    console.log(`  ${col.id}: ${col.title} (${col.type})`)
  }

  // Now fetch all items with their column values
  const itemsQuery = `query {
    boards(ids: [${BOARD_ID}]) {
      items_page(limit: 100) {
        items {
          id
          name
          group {
            title
          }
          column_values {
            id
            text
            value
            type
          }
        }
      }
    }
  }`

  console.log('\nFetching items...')
  const itemsRes = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_API_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({ query: itemsQuery }),
  })

  const itemsData = await itemsRes.json()
  if (itemsData.errors) {
    console.error('Monday.com API errors:', itemsData.errors)
    throw new Error(itemsData.errors[0].message)
  }

  return {
    columns: board.columns,
    items: itemsData.data.boards[0].items_page.items,
  }
}

async function main() {
  console.log('=== Seed OEM Portals from Monday.com ===\n')

  const { columns, items } = await fetchBoardItems()
  console.log(`\nFound ${items.length} items on board\n`)

  // Detect column IDs by title patterns
  const colMap = {}
  for (const col of columns) {
    const t = col.title.toLowerCase()
    if (t.includes('url') || t.includes('link') || t.includes('website')) colMap.url = col.id
    if (t.includes('username') || t.includes('user') || t.includes('email') || t.includes('login')) colMap.username = col.id
    if (t.includes('password') || t.includes('pass')) colMap.password = col.id
    if (t.includes('contact') || t.includes('person') || t.includes('name')) colMap.contact = col.id
    if (t.includes('platform') || t.includes('type') || t.includes('system')) colMap.platform = col.id
    if (t.includes('guideline') || t.includes('pdf') || t.includes('brand')) colMap.guidelines = col.id
    if (t.includes('note') || t.includes('comment')) colMap.notes = col.id
  }
  console.log('Column mapping:', colMap)

  const portals = []
  const unmapped = []

  for (const item of items) {
    const oemId = matchOemId(item.name)
    if (!oemId) {
      unmapped.push(item.name)
      // Still process - might be an OEM we recognize differently
    }

    // Log all column values for debugging
    console.log(`\n--- ${item.name} (group: ${item.group?.title || 'none'}) ---`)
    for (const cv of item.column_values) {
      if (cv.text) {
        console.log(`  ${cv.id}: ${cv.text}`)
      }
    }

    if (!oemId) continue

    // Extract portal data using detected columns
    const portal = {
      oem_id: oemId,
      portal_name: item.name,
      portal_url: colMap.url ? extractColumnValue(item, colMap.url) : null,
      portal_platform: colMap.platform ? extractColumnValue(item, colMap.platform) : null,
      username: colMap.username ? extractColumnValue(item, colMap.username) : null,
      password: colMap.password ? extractColumnValue(item, colMap.password) : null,
      marketing_contact: colMap.contact ? extractColumnValue(item, colMap.contact) : null,
      guidelines_pdf_url: colMap.guidelines ? extractColumnValue(item, colMap.guidelines) : null,
      notes: colMap.notes ? extractColumnValue(item, colMap.notes) : null,
      monday_item_id: item.id,
    }

    // If no columns auto-detected, try all text columns for URL-like values
    if (!portal.portal_url) {
      for (const cv of item.column_values) {
        if (cv.text && (cv.text.startsWith('http') || cv.text.includes('.com'))) {
          portal.portal_url = cv.text
          break
        }
      }
    }

    // Check for file columns (guidelines PDFs)
    if (!portal.guidelines_pdf_url) {
      for (const cv of item.column_values) {
        if (cv.type === 'file' && cv.value) {
          const parsed = extractColumnJson(item, cv.id)
          if (parsed?.files?.[0]?.url) {
            portal.guidelines_pdf_url = parsed.files[0].url
          }
        }
      }
    }

    // Check for link columns
    for (const cv of item.column_values) {
      if (cv.type === 'link' && cv.value) {
        const parsed = extractColumnJson(item, cv.id)
        if (parsed?.url && !portal.portal_url) {
          portal.portal_url = parsed.url
        }
      }
    }

    portals.push(portal)
  }

  if (unmapped.length > 0) {
    console.log(`\nUnmapped items (${unmapped.length}):`, unmapped)
  }

  console.log(`\nMapped ${portals.length} portals:`)
  for (const p of portals) {
    console.log(`  ${p.oem_id}: ${p.portal_name} → ${p.portal_url || '(no URL)'}`)
  }

  if (portals.length === 0) {
    console.log('\nNo portals to upsert. Check column mapping above.')
    return
  }

  // Upsert into Supabase
  console.log('\nUpserting portals...')
  const { data, error } = await supabase
    .from('oem_portals')
    .upsert(portals, { onConflict: 'oem_id,portal_url' })
    .select('id, oem_id, portal_name')

  if (error) {
    console.error('Supabase error:', error)
    // Try inserting one by one to find the problematic row
    let ok = 0, fail = 0
    for (const p of portals) {
      const { error: e2 } = await supabase.from('oem_portals').upsert(p, { onConflict: 'oem_id,portal_url' })
      if (e2) {
        console.error(`  Failed: ${p.oem_id} / ${p.portal_name}: ${e2.message}`)
        fail++
      } else {
        ok++
      }
    }
    console.log(`Individual inserts: ${ok} ok, ${fail} failed`)
  } else {
    console.log(`Upserted ${data?.length ?? portals.length} portals`)
  }

  // Summary by OEM
  const byOem = {}
  for (const p of portals) {
    byOem[p.oem_id] = (byOem[p.oem_id] || 0) + 1
  }
  console.log('\n=== Summary ===')
  for (const [oemId, count] of Object.entries(byOem).sort()) {
    console.log(`  ${oemId}: ${count} portals`)
  }
  console.log(`Total: ${portals.length} portals across ${Object.keys(byOem).length} OEMs`)
}

main().catch(console.error)
