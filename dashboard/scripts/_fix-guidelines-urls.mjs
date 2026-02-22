/**
 * Fix brand guidelines PDF URLs with fresh S3 pre-signed URLs from Monday.com assets API.
 * Also stores structured JSON (name, size, url) instead of comma-separated URLs.
 *
 * Run: cd dashboard/scripts && node _fix-guidelines-urls.mjs
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

const MONDAY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjExMTU2MTI1NSwiYWFpIjoxMSwidWlkIjo1NzQxNzUsImlhZCI6IjIwMjEtMDUtMjdUMTI6MjI6MDAuMDAwWiIsInBlciI6Im1lOndyaXRlIiwiYWN0aWQiOjIyOTIyNCwicmduIjoidXNlMSJ9.ezQH-YElr0wqgirNHIRcRYApXZb0FOg_mqt0l_cO8lc'
const BOARD_ID = '15373501'

const OEM_NAME_MAP = {
  'ford': 'ford-au', 'gwm': 'gwm-au', 'great wall': 'gwm-au', 'haval': 'gwm-au',
  'hyundai': 'hyundai-au', 'isuzu': 'isuzu-au', 'kia': 'kia-au', 'ldv': 'ldv-au',
  'mazda': 'mazda-au', 'mitsubishi': 'mitsubishi-au', 'nissan': 'nissan-au',
  'subaru': 'subaru-au', 'suzuki': 'suzuki-au', 'toyota': 'toyota-au',
  'volkswagen': 'volkswagen-au', 'vw': 'volkswagen-au', 'kgm': 'kgm-au', 'ssangyong': 'kgm-au',
}

function matchOemId(name) {
  const lower = name.toLowerCase().trim()
  for (const [key, oemId] of Object.entries(OEM_NAME_MAP)) {
    if (lower.includes(key)) return oemId
  }
  return null
}

async function main() {
  console.log('=== Fix Brand Guidelines URLs ===\n')

  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': MONDAY_API_TOKEN,
      'API-Version': '2024-10',
    },
    body: JSON.stringify({
      query: `query { boards(ids: [${BOARD_ID}]) { items_page(limit: 100) { items { id name assets { id name public_url file_extension file_size } } } } }`,
    }),
  })

  const d = await res.json()
  if (d.errors) { console.error('ERRORS:', d.errors); return }

  const items = d.data.boards[0].items_page.items
  let updated = 0

  for (const item of items) {
    const oemId = matchOemId(item.name)
    if (!oemId) continue

    // Filter to PDF/ZIP assets (file_extension includes leading dot)
    const docs = (item.assets || []).filter(a =>
      a.file_extension?.includes('pdf') || a.file_extension?.includes('zip')
    )
    if (docs.length === 0) continue

    // Build JSON array
    const files = docs.map(a => ({
      name: a.name,
      size_mb: Math.round(a.file_size / 1024 / 1024 * 10) / 10,
      public_url: a.public_url,
    }))

    const jsonStr = JSON.stringify(files)

    // Update by monday_item_id
    const { data, error } = await supabase
      .from('oem_portals')
      .update({ guidelines_pdf_url: jsonStr, updated_at: new Date().toISOString() })
      .eq('monday_item_id', item.id)
      .select('id')

    if (error) {
      console.error(`  Failed ${oemId} (item ${item.id}): ${error.message}`)
    } else if (data && data.length > 0) {
      console.log(`${oemId}: ${docs.length} docs (item ${item.id})`)
      for (const f of files) {
        console.log(`  ${f.name} (${f.size_mb}MB)`)
      }
      updated++
    } else {
      console.log(`${oemId}: no DB match for monday_item_id=${item.id}`)
    }
  }

  console.log(`\nUpdated ${updated} portals with structured PDF data`)
}

main().catch(console.error)
