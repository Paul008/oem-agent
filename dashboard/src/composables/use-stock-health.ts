import { ref } from 'vue'

import { supabase } from '@/lib/supabase'

export interface OemStockHealth {
  oem_id: string
  oem_name: string
  // Products
  product_count: number
  product_newest_at: string | null
  product_age_days: number
  // Offers
  offer_count: number
  offer_newest_at: string | null
  offer_age_days: number
  offers_expiring_soon: number // expiring within 7 days
  offers_expired: number // already past validity_end
  // Colors
  color_count: number
  // Pricing
  pricing_count: number
  pricing_coverage_pct: number // % of products with pricing
  // Banners
  banner_count: number
  // Source pages
  active_pages: number
  errored_pages: number
  // Last successful crawl
  last_completed_run_at: string | null
  last_run_age_days: number
  consecutive_failures: number
  // Overall health score (0-100)
  health_score: number
  health_status: 'healthy' | 'warning' | 'critical' | 'stale'
}

export interface StockSummary {
  total_products: number
  total_offers: number
  total_colors: number
  total_pricing: number
  total_banners: number
  oems_healthy: number
  oems_warning: number
  oems_critical: number
  oems_stale: number
  offers_expiring_soon: number
  offers_expired: number
  avg_product_age_days: number
}

function daysBetween(dateStr: string | null): number {
  if (!dateStr)
    return 999
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function computeHealthScore(h: Omit<OemStockHealth, 'health_score' | 'health_status'>): { score: number, status: OemStockHealth['health_status'] } {
  let score = 100

  // Product freshness (max -30 points)
  if (h.product_age_days > 30)
    score -= 30
  else if (h.product_age_days > 14)
    score -= 20
  else if (h.product_age_days > 7)
    score -= 10

  // Offer freshness (max -20 points)
  if (h.offer_count > 0) {
    if (h.offer_age_days > 30)
      score -= 20
    else if (h.offer_age_days > 14)
      score -= 10
  }

  // Pricing coverage (max -20 points)
  if (h.pricing_coverage_pct < 50)
    score -= 20
  else if (h.pricing_coverage_pct < 80)
    score -= 10

  // Crawl health (max -20 points)
  if (h.last_run_age_days > 3)
    score -= 20
  else if (h.last_run_age_days > 1)
    score -= 10

  // Source page errors (max -10 points)
  if (h.errored_pages > 0)
    score -= Math.min(10, h.errored_pages * 2)

  score = Math.max(0, score)
  const status: OemStockHealth['health_status']
    = score >= 80
      ? 'healthy'
      : score >= 60
        ? 'warning'
        : score >= 30 ? 'critical' : 'stale'

  return { score, status }
}

export function useStockHealth() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const health = ref<OemStockHealth[]>([])
  const summary = ref<StockSummary | null>(null)

  async function fetchStockHealth() {
    loading.value = true
    error.value = null

    try {
      // Fetch all data in parallel
      const [oemsRes, productsRes, offersRes, colorsRes, pricingRes, bannersRes, pagesRes, runsRes] = await Promise.all([
        supabase.from('oems').select('id, name').eq('is_active', true),
        supabase.from('products').select('oem_id, updated_at').order('updated_at', { ascending: false }),
        supabase.from('offers').select('oem_id, updated_at, validity_end').order('updated_at', { ascending: false }),
        supabase.from('variant_colors').select('id, product_id').limit(10000),
        supabase.from('variant_pricing').select('id, product_id').limit(10000),
        supabase.from('banners').select('oem_id').limit(5000),
        supabase.from('source_pages').select('oem_id, status').or('status.eq.active,status.eq.error'),
        supabase.from('import_runs').select('oem_id, status, finished_at').order('finished_at', { ascending: false, nullsFirst: false }).limit(500),
      ])

      const oems = oemsRes.data ?? []
      const products = productsRes.data ?? []
      const offers = offersRes.data ?? []
      const colors = colorsRes.data ?? []
      const pricing = pricingRes.data ?? []
      const banners = bannersRes.data ?? []
      const pages = pagesRes.data ?? []
      const runs = runsRes.data ?? []

      // Also need to map product_id → oem_id for colors/pricing
      const prodRes = await supabase.from('products').select('id, oem_id').limit(2000)
      const prodMap = new Map<string, string>()
      for (const p of prodRes.data ?? []) {
        prodMap.set(p.id, p.oem_id)
      }

      const now = new Date()
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

      const results: OemStockHealth[] = []

      for (const oem of oems) {
        const oemProducts = products.filter(p => p.oem_id === oem.id)
        const oemOffers = offers.filter(o => o.oem_id === oem.id)
        const oemBanners = banners.filter(b => b.oem_id === oem.id)
        const oemPages = pages.filter(p => p.oem_id === oem.id)
        const oemRuns = runs.filter(r => r.oem_id === oem.id)

        // Colors/pricing: count by matching product_id → oem_id via prodMap
        const oemColorCount = colors.filter(c => prodMap.get(c.product_id) === oem.id).length
        const oemPricingCount = pricing.filter(p => prodMap.get(p.product_id) === oem.id).length

        // Offers expiring
        const expiringOffers = oemOffers.filter((o) => {
          if (!o.validity_end)
            return false
          const end = new Date(o.validity_end)
          return end > now && end <= sevenDaysFromNow
        })
        const expiredOffers = oemOffers.filter((o) => {
          if (!o.validity_end)
            return false
          return new Date(o.validity_end) < now
        })

        // Last completed run
        const lastCompleted = oemRuns.find(r => r.status === 'completed')
        const consecutiveFailures = oemRuns.findIndex(r => r.status === 'completed')

        const base: Omit<OemStockHealth, 'health_score' | 'health_status'> = {
          oem_id: oem.id,
          oem_name: (oem.name ?? '').replace(' Australia', ''),
          product_count: oemProducts.length,
          product_newest_at: oemProducts[0]?.updated_at ?? null,
          product_age_days: daysBetween(oemProducts[0]?.updated_at ?? null),
          offer_count: oemOffers.length,
          offer_newest_at: oemOffers[0]?.updated_at ?? null,
          offer_age_days: daysBetween(oemOffers[0]?.updated_at ?? null),
          offers_expiring_soon: expiringOffers.length,
          offers_expired: expiredOffers.length,
          color_count: oemColorCount,
          pricing_count: oemPricingCount,
          pricing_coverage_pct: oemProducts.length > 0
            ? Math.round((oemPricingCount / oemProducts.length) * 100)
            : 0,
          banner_count: oemBanners.length,
          active_pages: oemPages.filter(p => p.status === 'active').length,
          errored_pages: oemPages.filter(p => p.status === 'error').length,
          last_completed_run_at: lastCompleted?.finished_at ?? null,
          last_run_age_days: daysBetween(lastCompleted?.finished_at ?? null),
          consecutive_failures: consecutiveFailures === -1 ? oemRuns.length : consecutiveFailures,
        }

        const { score, status } = computeHealthScore(base)
        results.push({ ...base, health_score: score, health_status: status })
      }

      // Sort by health score ascending (worst first)
      results.sort((a, b) => a.health_score - b.health_score)
      health.value = results

      // Compute summary
      summary.value = {
        total_products: products.length,
        total_offers: offers.length,
        total_colors: colors.length,
        total_pricing: pricing.length,
        total_banners: banners.length,
        oems_healthy: results.filter(r => r.health_status === 'healthy').length,
        oems_warning: results.filter(r => r.health_status === 'warning').length,
        oems_critical: results.filter(r => r.health_status === 'critical').length,
        oems_stale: results.filter(r => r.health_status === 'stale').length,
        offers_expiring_soon: results.reduce((s, r) => s + r.offers_expiring_soon, 0),
        offers_expired: results.reduce((s, r) => s + r.offers_expired, 0),
        avg_product_age_days: results.length > 0
          ? Math.round(results.reduce((s, r) => s + r.product_age_days, 0) / results.length)
          : 0,
      }
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
    finally {
      loading.value = false
    }
  }

  return { loading, error, health, summary, fetchStockHealth }
}
