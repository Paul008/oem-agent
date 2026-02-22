import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://nnihmdmsglkxpmilmjjc.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5uaWhtZG1zZ2xreHBtaWxtampjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDc4Njk0NiwiZXhwIjoyMDg2MzYyOTQ2fQ.ps3qYJhRJ6Bn8D4sREf7W8_-Yh64l1npF3Tn9VFYOoc'
)

async function fetchAllProducts() {
  const PAGE_SIZE = 1000
  let allProducts = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await s
      .from('products')
      .select('id, oem_id, title, external_key')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
      .order('oem_id')

    if (error) throw error

    if (data.length > 0) {
      allProducts = allProducts.concat(data)
      page++
      hasMore = data.length === PAGE_SIZE
    } else {
      hasMore = false
    }
  }

  return allProducts
}

async function fetchAllVariantColors() {
  const PAGE_SIZE = 1000
  let allColors = []
  let page = 0
  let hasMore = true

  while (hasMore) {
    const { data, error } = await s
      .from('variant_colors')
      .select('id, product_id, color_name, color_code')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (error) throw error

    if (data.length > 0) {
      allColors = allColors.concat(data)
      page++
      hasMore = data.length === PAGE_SIZE
    } else {
      hasMore = false
    }
  }

  return allColors
}

async function main() {
  console.log('🔍 Fetching all products...')
  const products = await fetchAllProducts()
  console.log(`✅ Found ${products.length} total products\n`)

  console.log('🎨 Fetching all variant_colors...')
  const colors = await fetchAllVariantColors()
  console.log(`✅ Found ${colors.length} total variant_colors\n`)

  // Group colors by product_id
  const colorsByProduct = new Map()
  colors.forEach(color => {
    if (!colorsByProduct.has(color.product_id)) {
      colorsByProduct.set(color.product_id, [])
    }
    colorsByProduct.get(color.product_id).push(color)
  })

  // Group products by OEM
  const productsByOem = new Map()
  products.forEach(product => {
    if (!productsByOem.has(product.oem_id)) {
      productsByOem.set(product.oem_id, [])
    }
    productsByOem.get(product.oem_id).push(product)
  })

  // Analyze each OEM
  console.log('=' .repeat(80))
  console.log('OEM VARIANT COLOR COVERAGE ANALYSIS')
  console.log('=' .repeat(80))
  console.log()

  const oemStats = []

  for (const [oemId, oemProducts] of productsByOem.entries()) {
    const productsWithColors = oemProducts.filter(p => colorsByProduct.has(p.id))
    const productsWithoutColors = oemProducts.filter(p => !colorsByProduct.has(p.id))

    const totalProducts = oemProducts.length
    const withColors = productsWithColors.length
    const withoutColors = productsWithoutColors.length
    const coverage = totalProducts > 0 ? ((withColors / totalProducts) * 100).toFixed(1) : '0.0'

    oemStats.push({
      oemId,
      totalProducts,
      withColors,
      withoutColors,
      coverage: parseFloat(coverage),
      productsWithoutColors
    })
  }

  // Sort by coverage (ascending) to show OEMs with least coverage first
  oemStats.sort((a, b) => a.coverage - b.coverage)

  // Display summary table
  console.log('OEM'.padEnd(20) + 'Total'.padEnd(10) + 'With Colors'.padEnd(15) + 'Missing'.padEnd(10) + 'Coverage')
  console.log('-'.repeat(80))

  oemStats.forEach(stat => {
    const status = stat.coverage === 0 ? '❌' : stat.coverage < 50 ? '⚠️ ' : '✅'
    console.log(
      `${status} ${stat.oemId.padEnd(17)}${String(stat.totalProducts).padEnd(10)}${String(stat.withColors).padEnd(15)}${String(stat.withoutColors).padEnd(10)}${stat.coverage}%`
    )
  })

  console.log()
  console.log('=' .repeat(80))
  console.log('OEMs WITH NO VARIANT COLOR DATA')
  console.log('=' .repeat(80))
  console.log()

  const oemsWithNoColors = oemStats.filter(stat => stat.coverage === 0)

  if (oemsWithNoColors.length === 0) {
    console.log('✅ All OEMs have at least some variant color data!')
  } else {
    oemsWithNoColors.forEach(stat => {
      console.log(`\n📦 ${stat.oemId.toUpperCase()} (${stat.totalProducts} products, 0 colors)`)
      console.log('-'.repeat(80))

      stat.productsWithoutColors.slice(0, 10).forEach((product, idx) => {
        console.log(`${idx + 1}. ${product.title}`)
        console.log(`   ID: ${product.id}, Key: ${product.external_key}`)
      })

      if (stat.productsWithoutColors.length > 10) {
        console.log(`   ... and ${stat.productsWithoutColors.length - 10} more products`)
      }
    })
  }

  console.log()
  console.log('=' .repeat(80))
  console.log('SUMMARY')
  console.log('=' .repeat(80))
  console.log(`Total OEMs: ${oemStats.length}`)
  console.log(`OEMs with 100% coverage: ${oemStats.filter(s => s.coverage === 100).length}`)
  console.log(`OEMs with partial coverage: ${oemStats.filter(s => s.coverage > 0 && s.coverage < 100).length}`)
  console.log(`OEMs with no color data: ${oemsWithNoColors.length}`)
  console.log()
}

main().catch(console.error)
