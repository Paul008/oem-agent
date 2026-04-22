import { ref } from 'vue'
import { supabase } from '@/lib/supabase'

export interface PortalAsset {
  id: string
  oem_id: string
  portal_id: string | null
  external_id: string
  external_source: string
  name: string
  description: string | null
  asset_type: string
  tags: string[]
  categories: Record<string, string[]>
  cdn_provider: string | null
  cdn_id: string | null
  cdn_url: string
  width: number | null
  height: number | null
  original_format: string | null
  file_size_bytes: number | null
  export_sizes: { format: string; quality: string; size: number }[]
  parsed_model: string | null
  parsed_trim: string | null
  parsed_color: string | null
  parsed_angle: string | null
  is_active: boolean
  last_synced_at: string
  created_at: string
  updated_at: string
  // Enrichment (migration 20260422000000_portal_assets_enrichment)
  record_name?: string | null
  nameplate?: string | null
  model_label?: string | null
  color_label?: string | null
  media_type?: string | null
  asset_type_label?: string | null
  usage_rights?: string | null
  job_number?: string | null
  copyright_notice?: string | null
  keywords?: string[] | null
  discontinued?: boolean | null
  expiry_date?: string | null
  appearance_date?: string | null
  source_created_at?: string | null
  source_modified_at?: string | null
  modified_by?: string | null
  interface_id?: string | null
  category_id?: string | null
  category_path?: string | null
  metadata?: Record<string, unknown> | null
  metadata_hydrated_at?: string | null
}

export interface PortalAssetCampaign {
  oem_id: string
  nameplate: string
  asset_count: number
  image_count: number
  video_count: number
  model_count: number
  first_appearance_at: string | null
  last_expiry_at: string | null
  hero_cdn_url: string | null
  hero_asset_id: string | null
}

export interface PortalAssetCoverage {
  oem_id: string
  parsed_model: string | null
  total_assets: number
  image_count: number
  render_count: number
  unique_colors: number
  unique_angles: number
  angles_available: string[]
}

export interface PortalAssetPageOpts {
  oemId?: string
  assetType?: string
  model?: string
  nameplate?: string         // F_Nameplate — campaign grouping
  mediaType?: string         // F_Media_Type
  assetTypeLabel?: string    // F_AssetTypes (DAM-native type)
  usageRights?: string
  keyword?: string           // single keyword (GIN ANY match)
  excludeExpired?: boolean
  search?: string            // ILIKE on name
  page?: number
  pageSize?: number
}

export interface PortalAssetPage {
  rows: PortalAsset[]
  total: number
}

export function usePortalAssets() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Server-paginated fetch. Filters are pushed into the Postgres query. */
  async function fetchPortalAssetsPage(opts: PortalAssetPageOpts = {}): Promise<PortalAssetPage> {
    const page = Math.max(1, opts.page ?? 1)
    const pageSize = Math.min(500, Math.max(10, opts.pageSize ?? 60))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let q = supabase
      .from('portal_assets')
      .select('*', { count: 'estimated' })
      .eq('is_active', true)
      .order('last_synced_at', { ascending: false })
      .range(from, to)

    if (opts.oemId) q = q.eq('oem_id', opts.oemId)
    if (opts.assetType) q = q.eq('asset_type', opts.assetType)
    if (opts.model) q = q.eq('parsed_model', opts.model)
    if (opts.nameplate) q = q.eq('nameplate', opts.nameplate)
    if (opts.mediaType) q = q.eq('media_type', opts.mediaType)
    if (opts.assetTypeLabel) q = q.eq('asset_type_label', opts.assetTypeLabel)
    if (opts.usageRights) q = q.eq('usage_rights', opts.usageRights)
    if (opts.keyword) q = q.contains('keywords', [opts.keyword])
    if (opts.excludeExpired) {
      // Keep rows that have no expiry set, or expire in the future.
      q = q.or(`expiry_date.is.null,expiry_date.gt.${new Date().toISOString()}`)
    }
    if (opts.search?.trim()) {
      // Postgres ILIKE — escape % and _ to avoid wildcards in user input.
      const s = opts.search.trim().replace(/[\\%_]/g, m => `\\${m}`)
      q = q.ilike('name', `%${s}%`)
    }

    const { data, count, error: err } = await q
    if (err) throw err
    return { rows: (data ?? []) as PortalAsset[], total: count ?? 0 }
  }

  async function fetchPortalAssetCoverage(oemId?: string): Promise<PortalAssetCoverage[]> {
    let q = supabase.from('portal_asset_coverage').select('*').order('total_assets', { ascending: false })
    if (oemId) q = q.eq('oem_id', oemId)
    const { data, error: err } = await q
    if (err) throw err
    return (data ?? []) as PortalAssetCoverage[]
  }

  /** Campaigns view — groups assets by nameplate. Requires migration 20260422. */
  async function fetchPortalAssetCampaigns(oemId?: string): Promise<PortalAssetCampaign[]> {
    let q = supabase
      .from('portal_asset_campaigns')
      .select('*')
      .order('first_appearance_at', { ascending: false, nullsFirst: false })
    if (oemId) q = q.eq('oem_id', oemId)
    const { data, error: err } = await q
    if (err) {
      // View may not exist yet if migration hasn't been applied. Soft-fail.
      if (/relation .*portal_asset_campaigns.* does not exist/i.test(err.message)) return []
      throw err
    }
    return (data ?? []) as PortalAssetCampaign[]
  }

  /** Facet values + counts for filter dropdowns (media_type, usage_rights,
   *  asset_type_label). Groups by dimension; soft-fails if the view is missing. */
  async function fetchFacets(oemId?: string): Promise<Record<string, { value: string; n: number }[]>> {
    let q = supabase.from('portal_asset_facets').select('dimension, value, n').order('n', { ascending: false })
    if (oemId) q = q.eq('oem_id', oemId)
    const { data, error: err } = await q
    if (err) {
      if (/relation .*portal_asset_facets.* does not exist/i.test(err.message)) return {}
      throw err
    }
    const out: Record<string, { value: string; n: number }[]> = {}
    for (const r of (data ?? []) as { dimension: string; value: string; n: number }[]) {
      if (!out[r.dimension]) out[r.dimension] = []
      out[r.dimension].push({ value: r.value, n: r.n })
    }
    return out
  }

  /** Siblings of an asset — same nameplate + oem. Limit for safety. */
  async function fetchRelatedAssets(asset: PortalAsset, limit = 24): Promise<PortalAsset[]> {
    if (!asset.nameplate) return []
    const { data, error: err } = await supabase
      .from('portal_assets')
      .select('*')
      .eq('is_active', true)
      .eq('oem_id', asset.oem_id)
      .eq('nameplate', asset.nameplate)
      .neq('id', asset.id)
      .order('appearance_date', { ascending: false, nullsFirst: false })
      .limit(limit)
    if (err) throw err
    return (data ?? []) as PortalAsset[]
  }

  /**
   * Cheap stats derived from the coverage view (one SELECT, already aggregated
   * in Postgres). Avoids the HEAD/count queries that 503 on large tables.
   */
  async function fetchPortalAssetStats(oemId?: string) {
    const coverage = await fetchPortalAssetCoverage(oemId)
    const total = coverage.reduce((s, c) => s + (c.total_assets ?? 0), 0)
    const images = coverage.reduce((s, c) => s + (c.image_count ?? 0), 0)
    const renders = coverage.reduce((s, c) => s + (c.render_count ?? 0), 0)
    const models = coverage.filter(c => c.parsed_model).length
    return { total, images, renders, models }
  }

  /** Distinct parsed models (from the coverage view — cheap). */
  async function fetchParsedModels(oemId?: string): Promise<string[]> {
    const coverage = await fetchPortalAssetCoverage(oemId)
    const set = new Set<string>()
    for (const c of coverage) if (c.parsed_model) set.add(c.parsed_model)
    return [...set].sort()
  }

  /**
   * Build a Cloudinary thumbnail URL from a cdn_url.
   * Inserts transform params before v1/ in the URL path. Non-Cloudinary URLs
   * (e.g. Ford's public S3 previews) are returned unchanged.
   */
  function thumbnailUrl(cdnUrl: string, width = 300, quality = 60): string {
    if (!cdnUrl.includes('/image/upload/v1/')) return cdnUrl
    return cdnUrl.replace('/image/upload/v1/', `/image/upload/f_auto/q_${quality}/w_${width}/v1/`)
  }

  /**
   * Deprecated: loads all assets into memory with a 10k cap. Retained for
   * back-compat with callers that haven't migrated to fetchPortalAssetsPage.
   * Do not use on pages that render the Ford-au catalogue (>10k rows).
   */
  async function fetchPortalAssets(opts?: { oemId?: string; assetType?: string; model?: string; limit?: number; offset?: number }): Promise<PortalAsset[]> {
    const PAGE = 1000
    const rows: PortalAsset[] = []
    let from = opts?.offset ?? 0
    const max = opts?.limit ?? 10000
    while (rows.length < max) {
      let query = supabase
        .from('portal_assets')
        .select('*')
        .eq('is_active', true)
        .order('parsed_model')
        .range(from, from + PAGE - 1)
      if (opts?.oemId) query = query.eq('oem_id', opts.oemId)
      if (opts?.assetType) query = query.eq('asset_type', opts.assetType)
      if (opts?.model) query = query.eq('parsed_model', opts.model)
      const { data, error: err } = await query
      if (err) throw err
      if (!data?.length) break
      rows.push(...(data as PortalAsset[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    return rows
  }

  return {
    loading,
    error,
    fetchPortalAssets,
    fetchPortalAssetsPage,
    fetchPortalAssetCoverage,
    fetchPortalAssetCampaigns,
    fetchRelatedAssets,
    fetchFacets,
    fetchPortalAssetStats,
    fetchParsedModels,
    thumbnailUrl,
  }
}
