import { ref, computed } from 'vue'
import { discoverOem, registerOem, generateOnboardingSnippets, triggerCrawl } from '@/lib/worker-api'

// ============================================================================
// Types
// ============================================================================

export interface DiscoveredPage {
  url: string
  page_type: string
  label: string
  included: boolean
}

export interface DiscoveredApi {
  url: string
  method: string
  data_type: string
  content_type?: string
  notes?: string
}

export interface CodeSnippet {
  file: string
  description: string
  code: string
}

export interface RegistrationResult {
  success: boolean
  oem_id: string
  source_pages_created: number
  discovered_apis_created: number
}

// ============================================================================
// Composable
// ============================================================================

export function useOnboarding() {
  // Step tracking
  const currentStep = ref(1)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Step 1 — URL entry
  const baseUrl = ref('')
  const oemName = ref('')
  const oemId = ref('')

  // Step 2 — Discovered pages
  const pages = ref<DiscoveredPage[]>([])
  const sitemapUrlCount = ref(0)

  // Step 3 — Configuration
  const brandColor = ref('#000000')
  const framework = ref<string | null>(null)
  const requiresBrowserRendering = ref(false)
  const subBrands = ref<string[]>([])
  const schedule = ref({
    homepage_minutes: 120,
    offers_minutes: 240,
    vehicles_minutes: 720,
    news_minutes: 1440,
  })
  const discoveredApis = ref<DiscoveredApi[]>([])

  // Step 4 — Registration
  const registration = ref<RegistrationResult | null>(null)

  // Step 5 — First crawl
  const crawlTriggered = ref(false)
  const crawlJobId = ref<string | null>(null)
  const importRuns = ref<any[]>([])

  // Step 6 — Snippets
  const snippets = ref<Record<string, CodeSnippet> | null>(null)

  // ============================================================================
  // Computed
  // ============================================================================

  const includedPages = computed(() => pages.value.filter(p => p.included))

  const config = computed(() => {
    const homepagePage = includedPages.value.find(p => p.page_type === 'homepage')
    const offersPage = includedPages.value.find(p => p.page_type === 'offers')
    const vehiclesPage = includedPages.value.find(p => p.page_type === 'category')
    const newsPage = includedPages.value.find(p => p.page_type === 'news')

    function pathOnly(url: string): string {
      try { return new URL(url).pathname }
      catch { return url }
    }

    return {
      homepage: homepagePage ? pathOnly(homepagePage.url) : '/',
      vehicles_index: vehiclesPage ? pathOnly(vehiclesPage.url) : undefined,
      offers: offersPage ? pathOnly(offersPage.url) : undefined,
      news: newsPage ? pathOnly(newsPage.url) : undefined,
      sub_brands: subBrands.value.length ? subBrands.value : undefined,
      schedule: { ...schedule.value },
    }
  })

  const flags = computed(() => ({
    requiresBrowserRendering: requiresBrowserRendering.value,
    hasSubBrands: subBrands.value.length > 0 || undefined,
    isNextJs: framework.value === 'nextjs' || undefined,
    isAEM: framework.value === 'aem' || undefined,
  }))

  // ============================================================================
  // Actions
  // ============================================================================

  function generateOemId(name: string): string {
    return name
      .toLowerCase()
      .replace(/\s+australia$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-au'
  }

  async function runDiscovery() {
    if (!baseUrl.value) {
      error.value = 'Please enter a URL'
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await discoverOem(baseUrl.value, oemName.value || undefined)

      // Populate state from discovery result
      oemId.value = result.oem_id
      if (!oemName.value) oemName.value = result.oem_name
      baseUrl.value = result.base_url

      sitemapUrlCount.value = result.discovery.sitemap_urls?.length || 0
      framework.value = result.discovery.framework
      if (result.discovery.brand_color) brandColor.value = result.discovery.brand_color
      subBrands.value = result.discovery.sub_brands || []

      // Auto-detect rendering requirement
      if (framework.value && ['nextjs', 'nuxt', 'storyblok'].includes(framework.value)) {
        requiresBrowserRendering.value = true
      }

      // Map classified pages with include toggle
      pages.value = (result.discovery.classified_pages || []).map((p: { url: string; page_type: string; label: string }) => ({
        ...p,
        included: ['homepage', 'vehicle', 'category', 'offers', 'news'].includes(p.page_type),
      }))

      currentStep.value = 2
    }
    catch (err: any) {
      error.value = err.message || 'Discovery failed'
    }
    finally {
      loading.value = false
    }
  }

  async function doRegister() {
    loading.value = true
    error.value = null

    try {
      const sourcePages = includedPages.value.map(p => ({
        url: p.url,
        page_type: p.page_type,
      }))

      const result = await registerOem({
        oem_id: oemId.value,
        oem_name: oemName.value,
        base_url: baseUrl.value,
        brand_color: brandColor.value,
        source_pages: sourcePages,
        config: config.value,
        flags: flags.value,
        discovered_apis: discoveredApis.value.length ? discoveredApis.value : undefined,
      })

      registration.value = result as RegistrationResult
      currentStep.value = 5
    }
    catch (err: any) {
      error.value = err.message || 'Registration failed'
    }
    finally {
      loading.value = false
    }
  }

  async function triggerFirstCrawl() {
    loading.value = true
    error.value = null

    try {
      const result = await triggerCrawl(oemId.value) as { jobId?: string }
      crawlTriggered.value = true
      crawlJobId.value = result.jobId || null
    }
    catch (err: any) {
      error.value = err.message || 'Crawl trigger failed'
    }
    finally {
      loading.value = false
    }
  }

  async function doGenerateSnippets() {
    loading.value = true
    error.value = null

    try {
      const sourcePages = includedPages.value.map(p => ({
        url: p.url,
        page_type: p.page_type,
      }))

      const result = await generateOnboardingSnippets({
        oem_id: oemId.value,
        oem_name: oemName.value,
        base_url: baseUrl.value,
        brand_color: brandColor.value,
        config: config.value,
        flags: flags.value,
        source_pages: sourcePages,
      })

      snippets.value = (result as { snippets: Record<string, CodeSnippet> }).snippets
      currentStep.value = 6
    }
    catch (err: any) {
      error.value = err.message || 'Snippet generation failed'
    }
    finally {
      loading.value = false
    }
  }

  function resetState() {
    currentStep.value = 1
    loading.value = false
    error.value = null
    baseUrl.value = ''
    oemName.value = ''
    oemId.value = ''
    pages.value = []
    sitemapUrlCount.value = 0
    brandColor.value = '#000000'
    framework.value = null
    requiresBrowserRendering.value = false
    subBrands.value = []
    schedule.value = {
      homepage_minutes: 120,
      offers_minutes: 240,
      vehicles_minutes: 720,
      news_minutes: 1440,
    }
    discoveredApis.value = []
    registration.value = null
    crawlTriggered.value = false
    crawlJobId.value = null
    importRuns.value = []
    snippets.value = null
  }

  // Page management
  function togglePage(index: number) {
    if (pages.value[index]) {
      pages.value[index].included = !pages.value[index].included
    }
  }

  function updatePageType(index: number, type: string) {
    if (pages.value[index]) {
      pages.value[index].page_type = type
    }
  }

  function addPage(url: string, pageType: string) {
    pages.value.push({
      url,
      page_type: pageType,
      label: url.split('/').filter(Boolean).pop() || url,
      included: true,
    })
  }

  function removePage(index: number) {
    pages.value.splice(index, 1)
  }

  // API management
  function addApi(api: DiscoveredApi) {
    discoveredApis.value.push(api)
  }

  function removeApi(index: number) {
    discoveredApis.value.splice(index, 1)
  }

  return {
    // Step tracking
    currentStep,
    loading,
    error,

    // Step 1
    baseUrl,
    oemName,
    oemId,

    // Step 2
    pages,
    sitemapUrlCount,
    includedPages,

    // Step 3
    brandColor,
    framework,
    requiresBrowserRendering,
    subBrands,
    schedule,
    discoveredApis,

    // Step 4
    config,
    flags,
    registration,

    // Step 5
    crawlTriggered,
    crawlJobId,
    importRuns,

    // Step 6
    snippets,

    // Actions
    generateOemId,
    runDiscovery,
    doRegister,
    triggerFirstCrawl,
    doGenerateSnippets,
    resetState,
    togglePage,
    updatePageType,
    addPage,
    removePage,
    addApi,
    removeApi,
  }
}
