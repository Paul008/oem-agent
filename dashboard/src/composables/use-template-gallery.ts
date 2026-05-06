import { computed, ref } from 'vue'

import type { OemSectionTemplate } from '@/pages/dashboard/components/page-builder/oem-templates'

import { fetchGeneratedPage, fetchGeneratedPages } from '@/lib/worker-api'
import { OEM_CURATED_TEMPLATES } from '@/pages/dashboard/components/page-builder/oem-templates'

const OEM_IDS = [
  'ford-au',
  'gac-au',
  'gwm-au',
  'hyundai-au',
  'isuzu-au',
  'kia-au',
  'ldv-au',
  'mazda-au',
  'mitsubishi-au',
  'nissan-au',
  'subaru-au',
  'suzuki-au',
  'toyota-au',
  'volkswagen-au',
  'kgm-au',
]

export interface SlugEntry {
  oem_id: string
  slug: string
}

export interface CachedSection {
  section: any
  sourceOemId: string
  sourcePageSlug: string
  sourcePageName: string
}

// Shared state (singleton across components)
const allSlugs = ref<SlugEntry[]>([])
const sectionCache = new Map<string, any[]>()
const pageCache = new Map<string, { name: string, source_url?: string, oem_id: string }>()
const indexLoaded = ref(false)
const indexLoading = ref(false)

export function useTemplateGallery() {
  const filterOem = ref<string>('all')
  const filterSectionType = ref<string>('all')
  const searchQuery = ref('')
  const loadingSections = ref(false)

  async function loadIndex() {
    if (indexLoaded.value || indexLoading.value)
      return
    indexLoading.value = true
    try {
      const results = await Promise.allSettled(
        OEM_IDS.map(async (oemId) => {
          const res = await fetchGeneratedPages(oemId)
          return { oemId, pages: res.pages as string[] }
        }),
      )
      const slugs: SlugEntry[] = []
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.pages?.length) {
          for (const s of r.value.pages) {
            slugs.push({ oem_id: r.value.oemId, slug: s })
          }
        }
      }
      allSlugs.value = slugs
      indexLoaded.value = true
    }
    finally {
      indexLoading.value = false
    }
  }

  async function loadPageSections(oemId: string, slug: string): Promise<any[]> {
    const fullSlug = `${oemId}-${slug}`
    if (sectionCache.has(fullSlug))
      return sectionCache.get(fullSlug)!

    loadingSections.value = true
    try {
      const data = await fetchGeneratedPage(fullSlug)
      const sections = data?.content?.sections ?? []
      sectionCache.set(fullSlug, sections)
      pageCache.set(fullSlug, {
        name: data?.name ?? slug,
        source_url: data?.source_url,
        oem_id: oemId,
      })
      return sections
    }
    catch {
      return []
    }
    finally {
      loadingSections.value = false
    }
  }

  function getPageMeta(oemId: string, slug: string) {
    return pageCache.get(`${oemId}-${slug}`)
  }

  function getCachedSections(oemId: string, slug: string): any[] | null {
    return sectionCache.get(`${oemId}-${slug}`) ?? null
  }

  const oemGroups = computed(() => {
    const counts: Record<string, number> = {}
    for (const s of allSlugs.value) {
      counts[s.oem_id] = (counts[s.oem_id] || 0) + 1
    }
    return OEM_IDS
      .filter(id => counts[id])
      .map(id => ({ oem_id: id, count: counts[id] }))
  })

  const filteredSlugs = computed(() => {
    let list = allSlugs.value
    if (filterOem.value !== 'all') {
      list = list.filter(s => s.oem_id === filterOem.value)
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter((s) => {
        const meta = pageCache.get(`${s.oem_id}-${s.slug}`)
        return s.slug.toLowerCase().includes(q)
          || s.oem_id.toLowerCase().includes(q)
          || meta?.name?.toLowerCase().includes(q)
      })
    }
    return list
  })

  const filteredCuratedTemplates = computed(() => {
    let list: OemSectionTemplate[] = OEM_CURATED_TEMPLATES
    if (filterOem.value !== 'all') {
      list = list.filter(t => t.oem_id === filterOem.value || t.oem_id === '*')
    }
    if (filterSectionType.value !== 'all') {
      list = list.filter(t => t.type === filterSectionType.value)
    }
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      list = list.filter(t =>
        t.name.toLowerCase().includes(q)
        || t.description.toLowerCase().includes(q)
        || t.tags.some(tag => tag.toLowerCase().includes(q)),
      )
    }
    return list
  })

  function getSectionPreview(section: any) {
    const imageCount = countImages(section)
    const hasVideo = !!(section.video_url)
    const hasCta = !!(section.cta_text || section.cta_url)
    const label = section.heading || section.title || section.type
    const subtitle = section.sub_heading || section.body || ''
    return { label, subtitle, imageCount, hasVideo, hasCta }
  }

  return {
    // State
    allSlugs,
    indexLoaded,
    indexLoading,
    filterOem,
    filterSectionType,
    searchQuery,
    loadingSections,
    // Computed
    oemGroups,
    filteredSlugs,
    filteredCuratedTemplates,
    // Methods
    loadIndex,
    loadPageSections,
    getPageMeta,
    getCachedSections,
    getSectionPreview,
  }
}

function countImages(section: any): number {
  let count = 0
  if (section.desktop_image_url)
    count++
  if (section.mobile_image_url)
    count++
  if (section.image_url)
    count++
  if (section.background_image_url)
    count++
  if (Array.isArray(section.images))
    count += section.images.length
  if (Array.isArray(section.tabs))
    count += section.tabs.filter((t: any) => t.image_url).length
  if (Array.isArray(section.cards))
    count += section.cards.filter((c: any) => c.image_url).length
  if (Array.isArray(section.colors))
    count += section.colors.length
  return count
}
