import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface Oem {
  id: string
  name: string
  base_url: string
  is_active: boolean
}

export interface ImportRun {
  id: string
  oem_id: string
  run_type: string
  status: string
  started_at: string
  finished_at: string | null
  pages_checked: number
  pages_changed: number
  pages_errored: number
  products_upserted: number
  offers_upserted: number
  banners_upserted: number
  brochures_upserted: number
  changes_found: number
  error_log: string | null
  created_at: string
}

export interface ChangeEvent {
  id: string
  oem_id: string
  entity_type: string
  entity_id: string
  event_type: string
  severity: string
  summary: string
  diff_json: Record<string, unknown> | null
  notified_at: string | null
  created_at: string
}

export interface VehicleModel {
  id: string
  oem_id: string
  slug: string
  name: string
  body_type: string
  category: string
  model_year: number | null
  is_active: boolean
  brochure_url: string | null
}

export interface OemPortal {
  id: string
  oem_id: string
  portal_name: string
  portal_url: string | null
  portal_platform: string | null
  username: string | null
  password: string | null
  marketing_contact: string | null
  guidelines_pdf_url: string | null
  notes: string | null
  monday_item_id: string | null
  created_at: string
  updated_at: string
}

export interface ProductSpecs {
  engine?: Record<string, any>
  transmission?: Record<string, any>
  dimensions?: Record<string, any>
  performance?: Record<string, any>
  towing?: Record<string, any>
  capacity?: Record<string, any>
  safety?: Record<string, any>
  wheels?: Record<string, any> | string
  brakes?: Record<string, any> | string
  tyres?: string
  exhaust?: string
  steering?: string
  infotainment?: string
  aero?: string
  [key: string]: Record<string, any> | string | undefined
}

export interface Product {
  id: string
  oem_id: string
  model_id: string | null
  title: string
  subtitle: string | null
  variant_name: string | null
  variant_code: string | null
  body_type: string | null
  fuel_type: string | null
  price_amount: number | null
  price_type: string | null
  availability: string | null
  specs_json: ProductSpecs | null
  last_seen_at: string
}

export interface Offer {
  id: string
  oem_id: string
  model_id: string | null
  title: string
  description: string | null
  offer_type: string | null
  price_amount: number | null
  abn_price_amount: number | null
  saving_amount: number | null
  validity_start: string | null
  validity_end: string | null
  validity_raw: string | null
  hero_image_r2_key: string | null
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface VariantColor {
  id: string
  product_id: string
  color_code: string
  color_name: string
  color_type: string
  is_standard: boolean
  price_delta: number | null
  swatch_url: string | null
  hero_image_url: string | null
  gallery_urls: string[]
  sort_order: number | null
  source_hero_url: string | null
  source_swatch_url: string | null
  source_gallery_urls: string[] | null
  created_at: string
}

export interface VariantPricing {
  id: string
  product_id: string
  price_type: string
  rrp: number | null
  driveaway_nsw: number | null
  driveaway_vic: number | null
  driveaway_qld: number | null
  driveaway_wa: number | null
  driveaway_sa: number | null
  driveaway_tas: number | null
  driveaway_act: number | null
  driveaway_nt: number | null
}

export interface Banner {
  id: string
  oem_id: string
  page_url: string
  position: number | null
  headline: string | null
  sub_headline: string | null
  cta_text: string | null
  cta_url: string | null
  image_url_desktop: string | null
  image_url_mobile: string | null
  image_r2_key: string | null
  image_sha256: string | null
  disclaimer_text: string | null
  video_url_desktop: string | null
  video_url_mobile: string | null
  last_seen_at: string
  created_at: string
  updated_at: string
}

export interface SourcePage {
  id: string
  oem_id: string
  url: string
  page_type: string
  status: string
  last_checked_at: string | null
  last_changed_at: string | null
  consecutive_no_change: number
  is_active: boolean
}

export interface Accessory {
  id: string
  oem_id: string
  external_key: string
  name: string
  slug: string
  part_number: string | null
  category: string | null
  price: number | null
  description_html: string | null
  image_url: string | null
  inc_fitting: string | null
  parent_id: string | null
  meta_json: Record<string, unknown> | null
  created_at: string
}

export interface AccessoryModel {
  id: string
  accessory_id: string
  model_id: string
}

export function useOemData() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOems() {
    const { data, error: err } = await supabase
      .from('oems')
      .select('*')
      .order('name')
    if (err) throw err
    return (data ?? []) as Oem[]
  }

  async function fetchImportRuns(limit = 50) {
    const { data, error: err } = await supabase
      .from('import_runs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (err) throw err
    return (data ?? []) as ImportRun[]
  }

  async function fetchChangeEvents(limit = 100) {
    const { data, error: err } = await supabase
      .from('change_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (err) throw err
    return (data ?? []) as ChangeEvent[]
  }

  async function fetchVehicleModels() {
    const { data, error: err } = await supabase
      .from('vehicle_models')
      .select('*')
      .order('oem_id, name')
    if (err) throw err
    return (data ?? []) as VehicleModel[]
  }

  async function fetchProducts() {
    const { data, error: err } = await supabase
      .from('products')
      .select('id, oem_id, model_id, title, subtitle, variant_name, variant_code, body_type, fuel_type, price_amount, price_type, availability, specs_json, last_seen_at')
      .order('oem_id, title')
    if (err) throw err
    return (data ?? []) as Product[]
  }

  async function fetchOffers() {
    const { data, error: err } = await supabase
      .from('offers')
      .select('*')
      .order('updated_at', { ascending: false })
    if (err) throw err
    return (data ?? []) as Offer[]
  }

  async function fetchVariantColors(productIds?: string[]) {
    let query = supabase.from('variant_colors').select('*')
    if (productIds?.length) {
      query = query.in('product_id', productIds)
    }
    const { data, error: err } = await query
    if (err) throw err
    return (data ?? []) as VariantColor[]
  }

  async function fetchVariantColorsWithProducts() {
    const PAGE = 1000
    const rows: (VariantColor & { products: { oem_id: string; title: string; price_amount: number | null } })[] = []
    let from = 0
    while (true) {
      const { data, error: err } = await supabase
        .from('variant_colors')
        .select('*, products!inner(oem_id, title, price_amount)')
        .order('product_id')
        .range(from, from + PAGE - 1)
      if (err) throw err
      if (!data || data.length === 0) break
      rows.push(...(data as typeof rows))
      if (data.length < PAGE) break
      from += PAGE
    }
    return rows
  }

  async function fetchVariantPricing(productIds?: string[]) {
    let query = supabase.from('variant_pricing').select('*')
    if (productIds?.length) {
      query = query.in('product_id', productIds)
    }
    const { data, error: err } = await query
    if (err) throw err
    return (data ?? []) as VariantPricing[]
  }

  async function fetchSourcePages() {
    const { data, error: err } = await supabase
      .from('source_pages')
      .select('*')
      .order('oem_id, page_type')
    if (err) throw err
    return (data ?? []) as SourcePage[]
  }

  async function fetchAllRows<T>(table: string, select = '*', order?: string, filter?: { column: string, value: string }): Promise<T[]> {
    const PAGE = 1000
    const MAX_ROWS = 50_000
    const rows: T[] = []
    let from = 0
    while (true) {
      let query = supabase.from(table).select(select).range(from, from + PAGE - 1)
      if (order) query = query.order(order)
      if (filter) query = query.eq(filter.column, filter.value)
      const { data, error: err } = await query
      if (err) throw err
      if (!data || data.length === 0) break
      rows.push(...(data as T[]))
      if (data.length < PAGE) break
      from += PAGE
      if (rows.length >= MAX_ROWS) {
        console.warn(`[use-oem-data] fetchAllRows('${table}') hit ${MAX_ROWS} row limit`)
        break
      }
    }
    return rows
  }

  async function fetchPortals() {
    const { data, error: err } = await supabase
      .from('oem_portals')
      .select('*')
      .order('oem_id, portal_name')
    if (err) throw err
    return (data ?? []) as OemPortal[]
  }

  async function fetchBanners() {
    const { data, error: err } = await supabase
      .from('banners')
      .select('*')
      .order('oem_id, position')
    if (err) throw err
    return (data ?? []) as Banner[]
  }

  async function fetchAccessories(oemId?: string) {
    return fetchAllRows<Accessory>(
      'accessories', '*', 'oem_id, category, name',
      oemId ? { column: 'oem_id', value: oemId } : undefined,
    )
  }

  async function fetchAccessoryModels() {
    return fetchAllRows<AccessoryModel>('accessory_models')
  }

  async function fetchCounts() {
    const [oems, models, products, offers, colors, pricing, pages, runs, accessories, accessoryModels, discoveredApis, banners, portals, specsProducts, brochureModels, portalAssets] = await Promise.all([
      supabase.from('oems').select('*', { count: 'exact', head: true }),
      supabase.from('vehicle_models').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }),
      supabase.from('offers').select('*', { count: 'exact', head: true }),
      supabase.from('variant_colors').select('*', { count: 'exact', head: true }),
      supabase.from('variant_pricing').select('*', { count: 'exact', head: true }),
      supabase.from('source_pages').select('*', { count: 'exact', head: true }),
      supabase.from('import_runs').select('*', { count: 'exact', head: true }),
      supabase.from('accessories').select('*', { count: 'exact', head: true }),
      supabase.from('accessory_models').select('*', { count: 'exact', head: true }),
      supabase.from('discovered_apis').select('*', { count: 'exact', head: true }),
      supabase.from('banners').select('*', { count: 'exact', head: true }),
      supabase.from('oem_portals').select('*', { count: 'exact', head: true }),
      supabase.from('products').select('*', { count: 'exact', head: true }).not('specs_json', 'is', null),
      supabase.from('vehicle_models').select('*', { count: 'exact', head: true }).not('brochure_url', 'is', null),
      supabase.from('portal_assets').select('*', { count: 'exact', head: true }),
    ])
    return {
      oems: oems.count ?? 0,
      models: models.count ?? 0,
      products: products.count ?? 0,
      offers: offers.count ?? 0,
      colors: colors.count ?? 0,
      pricing: pricing.count ?? 0,
      pages: pages.count ?? 0,
      runs: runs.count ?? 0,
      accessories: accessories.count ?? 0,
      accessoryModels: accessoryModels.count ?? 0,
      discoveredApis: discoveredApis.count ?? 0,
      banners: banners.count ?? 0,
      portals: portals.count ?? 0,
      specsProducts: specsProducts.count ?? 0,
      brochureModels: brochureModels.count ?? 0,
      portalAssets: portalAssets.count ?? 0,
    }
  }

  /**
   * Fetch deduplicated variant_colors for a specific OEM model.
   * Joins through vehicle_models → products → variant_colors.
   * Uses `like` on slug to capture sub-variants (e.g. sportage, sportage-hybrid).
   */
  async function fetchColorsForModel(oemId: string, modelSlug: string): Promise<VariantColor[]> {
    // 1. Get all matching model IDs (sportage, sportage-hybrid, etc.)
    const { data: models, error: mErr } = await supabase
      .from('vehicle_models')
      .select('id')
      .eq('oem_id', oemId)
      .like('slug', `${modelSlug}%`)
    if (mErr) throw mErr
    if (!models?.length) return []

    // 2. Get product IDs for those models
    const { data: products, error: pErr } = await supabase
      .from('products')
      .select('id')
      .in('model_id', models.map(m => m.id))
    if (pErr) throw pErr
    if (!products?.length) return []

    // 3. Get all colors for those products
    const { data: colors, error: cErr } = await supabase
      .from('variant_colors')
      .select('*')
      .in('product_id', products.map(p => p.id))
      .order('sort_order')
    if (cErr) throw cErr
    if (!colors?.length) return []

    // 4. Deduplicate by color_code — keep entry with best imagery
    const byCode = new Map<string, VariantColor>()
    for (const c of colors as VariantColor[]) {
      const existing = byCode.get(c.color_code)
      if (!existing) {
        byCode.set(c.color_code, c)
      } else {
        const score = (x: VariantColor) =>
          (x.hero_image_url ? 2 : 0) + (x.swatch_url ? 1 : 0) + (x.gallery_urls?.length ?? 0)
        if (score(c) > score(existing)) {
          byCode.set(c.color_code, c)
        }
      }
    }

    return Array.from(byCode.values())
  }

  return {
    loading,
    error,
    fetchOems,
    fetchImportRuns,
    fetchChangeEvents,
    fetchVehicleModels,
    fetchProducts,
    fetchOffers,
    fetchBanners,
    fetchPortals,
    fetchVariantColors,
    fetchVariantPricing,
    fetchSourcePages,
    fetchAccessories,
    fetchAccessoryModels,
    fetchVariantColorsWithProducts,
    fetchColorsForModel,
    fetchCounts,
  }
}
