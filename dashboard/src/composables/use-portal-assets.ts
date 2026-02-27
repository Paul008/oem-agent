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

export function usePortalAssets() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchPortalAssets(opts?: {
    oemId?: string
    assetType?: string
    model?: string
    limit?: number
    offset?: number
  }): Promise<PortalAsset[]> {
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

  async function fetchPortalAssetCoverage(): Promise<PortalAssetCoverage[]> {
    const { data, error: err } = await supabase
      .from('portal_asset_coverage')
      .select('*')
      .order('total_assets', { ascending: false })

    if (err) throw err
    return (data ?? []) as PortalAssetCoverage[]
  }

  async function fetchPortalAssetStats() {
    const [total, images, renders, models] = await Promise.all([
      supabase.from('portal_assets').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('portal_assets').select('*', { count: 'exact', head: true }).eq('asset_type', 'IMAGE').eq('is_active', true),
      supabase.from('portal_assets').select('*', { count: 'exact', head: true }).not('parsed_angle', 'is', null).eq('is_active', true),
      supabase.from('portal_assets').select('parsed_model', { count: 'exact', head: true }).not('parsed_model', 'is', null).eq('is_active', true),
    ])

    return {
      total: total.count ?? 0,
      images: images.count ?? 0,
      renders: renders.count ?? 0,
      models: models.count ?? 0,
    }
  }

  /**
   * Build a Cloudinary thumbnail URL from a cdn_url.
   * Inserts transform params before v1/ in the URL path.
   */
  function thumbnailUrl(cdnUrl: string, width = 300, quality = 60): string {
    return cdnUrl.replace(
      '/image/upload/v1/',
      `/image/upload/f_auto/q_${quality}/w_${width}/v1/`,
    )
  }

  return {
    loading,
    error,
    fetchPortalAssets,
    fetchPortalAssetCoverage,
    fetchPortalAssetStats,
    thumbnailUrl,
  }
}
