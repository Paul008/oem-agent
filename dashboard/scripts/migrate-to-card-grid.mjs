#!/usr/bin/env node
/**
 * Migrate existing card-based sections to include card_composition for CardGrid smart routing.
 *
 * Usage:
 *   node dashboard/scripts/migrate-to-card-grid.mjs --dry-run   (default, log only)
 *   node dashboard/scripts/migrate-to-card-grid.mjs --apply      (write changes to R2)
 */

const WORKER_URL = 'https://oem-agent.adme-dev.workers.dev'
const APPLY = process.argv.includes('--apply')

const OEMS = [
  'kia-au', 'nissan-au', 'ford-au', 'volkswagen-au', 'mitsubishi-au',
  'ldv-au', 'isuzu-au', 'mazda-au', 'kgm-au', 'gwm-au', 'suzuki-au',
  'hyundai-au', 'toyota-au', 'subaru-au', 'gmsv-au', 'foton-au', 'gac-au', 'chery-au',
]

// Infer card_composition from section data
function inferComposition(section) {
  switch (section.type) {
    case 'feature-cards': {
      const card = section.cards?.[0]
      if (!card) return null
      const comp = []
      if (card.image_url !== undefined) comp.push('image')
      if (card.title !== undefined) comp.push('title')
      if (card.description !== undefined) comp.push('body')
      return comp.length ? comp : ['image', 'title', 'body']
    }
    case 'stats':
      return ['stat', 'title']
    case 'logo-strip':
      return ['logo', 'title']
    case 'testimonial':
      return ['rating', 'body', 'title', 'subtitle']
    case 'pricing-table':
      return ['badge', 'title', 'stat', 'body', 'cta']
    default:
      return null
  }
}

// Default card_style per type
function defaultCardStyle(type) {
  switch (type) {
    case 'feature-cards':
      return { background: '#ffffff', border: '1px solid #e5e7eb', border_radius: 8 }
    case 'stats':
      return { background: 'transparent', border: 'none', text_align: 'center' }
    case 'logo-strip':
      return { background: '#f9fafb', border: '1px solid #e5e7eb', border_radius: 8, text_align: 'center', padding: '16px' }
    case 'testimonial':
      return { background: '#ffffff', border: '1px solid #e5e7eb', border_radius: 12 }
    case 'pricing-table':
      return { background: '#ffffff', border: '1px solid #e5e7eb', border_radius: 8 }
    default:
      return {}
  }
}

// Normalize card data fields for CardGrid compatibility
function normalizeCards(section) {
  switch (section.type) {
    case 'feature-cards':
      return section.cards?.map(c => ({
        ...c,
        body: c.body || c.description,
      }))
    case 'stats':
      return section.stats?.map(s => ({
        stat: s.value || s.stat,
        title: s.label || s.title,
        icon_url: s.icon_url,
      }))
    case 'logo-strip':
      return section.logos?.map(l => ({
        logo_url: l.image_url || l.logo_url,
        title: l.name || l.title,
        cta_url: l.link_url,
      }))
    case 'testimonial':
      return section.testimonials?.map(t => ({
        body: t.quote || t.body,
        title: t.author || t.title,
        subtitle: t.role || t.subtitle,
        rating: t.rating,
        image_url: t.avatar_url,
      }))
    case 'pricing-table':
      return section.tiers?.map(t => ({
        badge: t.badge_text || t.badge,
        title: t.name || t.title,
        stat: t.price || t.stat,
        body: Array.isArray(t.features) ? t.features.join(', ') : t.body,
        cta_text: t.cta_text,
        cta_url: t.cta_url,
      }))
    default:
      return null
  }
}

async function main() {
  console.log(APPLY ? '🔧 APPLY MODE — writing changes' : '👀 DRY RUN — logging only')
  console.log('')

  let totalPages = 0
  let totalSections = 0
  let totalMigrated = 0

  for (const oemId of OEMS) {
    // List pages for this OEM
    let slugs
    try {
      const resp = await fetch(`${WORKER_URL}/api/v1/oem-agent/pages?oemId=${oemId}`)
      if (!resp.ok) continue
      const data = await resp.json()
      slugs = data.pages || data.slugs || []
      if (!Array.isArray(slugs) || !slugs.length) continue
    } catch {
      continue
    }

    for (const slug of slugs) {
      // Fetch page
      let page
      try {
        const fullSlug = `${oemId}-${slug}`
        const resp = await fetch(`${WORKER_URL}/api/v1/oem-agent/pages/${fullSlug}`)
        if (!resp.ok) continue
        page = await resp.json()
      } catch {
        continue
      }

      const sections = page.content?.sections || page.sections || []
      if (!Array.isArray(sections)) continue
      totalPages++

      let modified = false
      for (const section of sections) {
        totalSections++
        if (section.card_composition) continue // already migrated

        const comp = inferComposition(section)
        if (!comp) continue

        section.card_composition = comp
        section.card_style = defaultCardStyle(section.type)

        // Normalize cards array for CardGrid compatibility
        const normalized = normalizeCards(section)
        if (normalized) section.cards = normalized

        modified = true
        totalMigrated++
        console.log(`  ${oemId}/${slug}: ${section.type} → [${comp.join(', ')}]`)
      }

      if (modified && APPLY) {
        try {
          const putResp = await fetch(`${WORKER_URL}/api/v1/oem-agent/admin/update-sections/${oemId}/${slug}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sections }),
          })
          if (putResp.ok) {
            console.log(`    ✓ Saved ${oemId}/${slug}`)
          } else {
            console.log(`    ✗ Save failed: ${putResp.status}`)
          }
        } catch (e) {
          console.log(`    ✗ Save error: ${e.message}`)
        }
      }
    }
  }

  console.log('')
  console.log(`Pages scanned: ${totalPages}`)
  console.log(`Sections scanned: ${totalSections}`)
  console.log(`Sections migrated: ${totalMigrated}`)
  if (!APPLY && totalMigrated > 0) {
    console.log('\nRun with --apply to write changes')
  }
}

main()
