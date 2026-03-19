<script lang="ts" setup>
import { ref, watch, onUnmounted } from 'vue'
import {
  ArrowLeft, ArrowRight, Check, ClipboardCopy,
  Loader2, Plus, Play, Rocket, Search, Trash2, X,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOnboarding } from '@/composables/use-onboarding'
import { useRealtimeSubscription } from '@/composables/use-realtime'

const {
  currentStep, loading, error,
  baseUrl, oemName, oemId,
  pages, sitemapUrlCount, includedPages,
  brandColor, framework, requiresBrowserRendering, subBrands, schedule, discoveredApis,
  config, flags, registration,
  crawlTriggered, crawlJobId, importRuns,
  snippets,
  generateOemId, runDiscovery, doRegister, triggerFirstCrawl, doGenerateSnippets,
  resetState,
  togglePage, updatePageType, addPage, removePage,
  addApi, removeApi,
} = useOnboarding()

// Subscribe to import_runs for live crawl progress once OEM is registered.
// IMPORTANT: onUnmounted must be registered synchronously during setup,
// so we capture the unsubscribe fn and clean up from a top-level hook.
const realtimeStarted = ref(false)
let realtimeUnsubscribe: (() => void) | null = null

onUnmounted(() => {
  realtimeUnsubscribe?.()
})

watch(() => registration.value, (reg) => {
  if (reg && !realtimeStarted.value) {
    realtimeStarted.value = true
    const { unsubscribe } = useRealtimeSubscription({
      channelName: `onboarding-crawl-${reg.oem_id}`,
      table: 'import_runs',
      event: '*',
      dataRef: importRuns,
      filter: `oem_id=eq.${reg.oem_id}`,
      maxItems: 10,
    })
    realtimeUnsubscribe = unsubscribe
  }
})

// Auto-generate oem_id from name
watch(oemName, (name) => {
  if (name) oemId.value = generateOemId(name)
})

// Clear error on step navigation
watch(currentStep, () => {
  error.value = null
})

const PAGE_TYPES = ['homepage', 'vehicle', 'category', 'offers', 'news', 'build_price', 'sitemap', 'price_guide', 'other']

const steps = [
  { num: 1, title: 'Enter URL' },
  { num: 2, title: 'Review Pages' },
  { num: 3, title: 'Configure' },
  { num: 4, title: 'Register' },
  { num: 5, title: 'First Crawl' },
  { num: 6, title: 'Code Snippets' },
  { num: 7, title: 'Report' },
]

// New page input
const newPageUrl = ref('')
const newPageType = ref('vehicle')

function handleAddPage() {
  if (!newPageUrl.value) return
  addPage(newPageUrl.value, newPageType.value)
  newPageUrl.value = ''
  newPageType.value = 'vehicle'
}

// New API input
const newApiUrl = ref('')
const newApiMethod = ref('GET')
const newApiDataType = ref('other')

function handleAddApi() {
  if (!newApiUrl.value) return
  addApi({ url: newApiUrl.value, method: newApiMethod.value, data_type: newApiDataType.value })
  newApiUrl.value = ''
  newApiMethod.value = 'GET'
  newApiDataType.value = 'other'
}

// Sub-brand input
const newSubBrand = ref('')
function handleAddSubBrand() {
  if (!newSubBrand.value) return
  subBrands.value.push(newSubBrand.value.toLowerCase())
  newSubBrand.value = ''
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }
  catch {
    toast.error('Failed to copy')
  }
}
</script>

<template>
  <BasicPage title="Onboard New OEM" description="Add a new Australian automotive OEM to the platform" sticky>
    <!-- Step Indicator -->
    <div class="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
      <template v-for="step in steps" :key="step.num">
        <div
          class="flex items-center gap-2 shrink-0"
          :class="step.num === currentStep ? 'opacity-100' : step.num < currentStep ? 'opacity-70' : 'opacity-40'"
        >
          <div
            class="size-8 rounded-full flex items-center justify-center text-sm font-medium border"
            :class="step.num < currentStep
              ? 'bg-primary text-primary-foreground border-primary'
              : step.num === currentStep
                ? 'border-primary text-primary'
                : 'border-muted-foreground text-muted-foreground'"
          >
            <Check v-if="step.num < currentStep" class="size-4" />
            <span v-else>{{ step.num }}</span>
          </div>
          <span class="text-sm whitespace-nowrap hidden sm:inline">{{ step.title }}</span>
        </div>
        <div v-if="step.num < steps.length" class="w-8 h-px bg-border shrink-0" />
      </template>
    </div>

    <!-- Error display -->
    <UiAlert v-if="error" variant="destructive" class="mb-4">
      <UiAlertTitle>Error</UiAlertTitle>
      <UiAlertDescription>{{ error }}</UiAlertDescription>
    </UiAlert>

    <!-- ================================================================ -->
    <!-- Step 1: Enter URL -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 1">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>OEM Website URL</UiCardTitle>
          <UiCardDescription>
            Enter the OEM's Australian website URL. We'll discover their site structure, pages, and framework.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="space-y-4">
          <div>
            <label class="text-sm font-medium block mb-1.5">Website URL</label>
            <div class="flex gap-2">
              <UiInput
                v-model="baseUrl"
                placeholder="https://www.example.com.au"
                class="flex-1"
                @keyup.enter="runDiscovery"
              />
            </div>
          </div>
          <div class="grid sm:grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium block mb-1.5">OEM Name</label>
              <UiInput v-model="oemName" placeholder="e.g. Foton Australia" />
            </div>
            <div>
              <label class="text-sm font-medium block mb-1.5">OEM ID</label>
              <UiInput v-model="oemId" placeholder="e.g. foton-au" class="font-mono" />
              <p class="text-xs text-muted-foreground mt-1">Format: brand-au (auto-generated from name)</p>
            </div>
          </div>
          <UiButton :disabled="loading || !baseUrl" @click="runDiscovery">
            <Loader2 v-if="loading" class="size-4 mr-2 animate-spin" />
            <Search v-else class="size-4 mr-2" />
            Discover Site
          </UiButton>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- ================================================================ -->
    <!-- Step 2: Review Pages -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 2">
      <UiCard>
        <UiCardHeader>
          <div class="flex items-center justify-between">
            <div>
              <UiCardTitle>Discovered Pages</UiCardTitle>
              <UiCardDescription>
                {{ sitemapUrlCount }} URLs found in sitemap. {{ pages.length }} classified.
                Toggle which pages to monitor.
              </UiCardDescription>
            </div>
            <UiBadge v-if="framework" variant="outline">{{ framework }}</UiBadge>
          </div>
        </UiCardHeader>
        <UiCardContent>
          <!-- Empty state -->
          <UiAlert v-if="pages.length === 0" class="mb-4">
            <UiAlertTitle>No pages discovered</UiAlertTitle>
            <UiAlertDescription>
              The site may not have a sitemap, or discovery couldn't reach it. Add pages manually below using the URL input.
            </UiAlertDescription>
          </UiAlert>

          <!-- Page table -->
          <div class="border rounded-md overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-muted/50">
                <tr>
                  <th class="px-3 py-2 text-left w-10">Include</th>
                  <th class="px-3 py-2 text-left">URL</th>
                  <th class="px-3 py-2 text-left w-32">Type</th>
                  <th class="px-3 py-2 text-left w-10" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(page, i) in pages"
                  :key="i"
                  class="border-t"
                  :class="{ 'opacity-50': !page.included }"
                >
                  <td class="px-3 py-2">
                    <UiCheckbox :checked="page.included" @update:checked="togglePage(i)" />
                  </td>
                  <td class="px-3 py-2 font-mono text-xs truncate max-w-[400px]" :title="page.url">
                    {{ page.url }}
                  </td>
                  <td class="px-3 py-2">
                    <UiSelect :model-value="page.page_type" @update:model-value="updatePageType(i, $event as string)">
                      <UiSelectTrigger class="h-8 text-xs">
                        <UiSelectValue />
                      </UiSelectTrigger>
                      <UiSelectContent>
                        <UiSelectItem v-for="pt in PAGE_TYPES" :key="pt" :value="pt">{{ pt }}</UiSelectItem>
                      </UiSelectContent>
                    </UiSelect>
                  </td>
                  <td class="px-3 py-2">
                    <UiButton variant="ghost" size="sm" class="size-7 p-0" @click="removePage(i)">
                      <X class="size-3" />
                    </UiButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Add page -->
          <div class="flex gap-2 mt-3">
            <UiInput
              v-model="newPageUrl"
              placeholder="Add a URL manually..."
              class="flex-1 text-sm"
              @keyup.enter="handleAddPage"
            />
            <UiSelect v-model="newPageType">
              <UiSelectTrigger class="w-32">
                <UiSelectValue />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="pt in PAGE_TYPES" :key="pt" :value="pt">{{ pt }}</UiSelectItem>
              </UiSelectContent>
            </UiSelect>
            <UiButton variant="outline" size="sm" @click="handleAddPage">
              <Plus class="size-4" />
            </UiButton>
          </div>

          <p class="text-sm text-muted-foreground mt-3">
            {{ includedPages.length }} pages selected for monitoring
          </p>

          <div class="flex justify-between mt-6">
            <UiButton variant="outline" @click="currentStep = 1">
              <ArrowLeft class="size-4 mr-2" />
              Back
            </UiButton>
            <UiButton :disabled="includedPages.length === 0" @click="currentStep = 3">
              Continue
              <ArrowRight class="size-4 ml-2" />
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- ================================================================ -->
    <!-- Step 3: Configure -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 3">
      <div class="space-y-4">
        <!-- Brand & Rendering -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Brand &amp; Rendering</UiCardTitle>
          </UiCardHeader>
          <UiCardContent class="space-y-4">
            <div class="grid sm:grid-cols-2 gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Brand Color</label>
                <div class="flex items-center gap-2">
                  <input
                    v-model="brandColor"
                    type="color"
                    class="h-9 w-14 rounded border cursor-pointer"
                  />
                  <UiInput v-model="brandColor" class="font-mono w-28" />
                </div>
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">Detected Framework</label>
                <UiInput :model-value="framework || 'None detected'" disabled />
              </div>
            </div>
            <div class="flex items-center gap-3">
              <UiSwitch v-model:checked="requiresBrowserRendering" />
              <label class="text-sm">Requires browser rendering (SPA/Next.js)</label>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Schedule -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Crawl Schedule</UiCardTitle>
            <UiCardDescription>How often each page type is re-crawled (in minutes)</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label class="text-sm font-medium block mb-1.5">Homepage</label>
                <UiInput v-model.number="schedule.homepage_minutes" type="number" min="1" />
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">Offers</label>
                <UiInput v-model.number="schedule.offers_minutes" type="number" min="1" />
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">Vehicles</label>
                <UiInput v-model.number="schedule.vehicles_minutes" type="number" min="1" />
              </div>
              <div>
                <label class="text-sm font-medium block mb-1.5">News</label>
                <UiInput v-model.number="schedule.news_minutes" type="number" min="1" />
              </div>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Sub-brands -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Sub-Brands</UiCardTitle>
            <UiCardDescription>e.g. GWM has Haval, Tank, Cannon, Ora, Wey</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div class="flex flex-wrap gap-2 mb-3">
              <UiBadge v-for="(brand, i) in subBrands" :key="brand" variant="secondary" class="gap-1">
                {{ brand }}
                <button class="ml-1 hover:text-destructive" @click="subBrands.splice(i, 1)">
                  <X class="size-3" />
                </button>
              </UiBadge>
              <span v-if="!subBrands.length" class="text-sm text-muted-foreground">None</span>
            </div>
            <div class="flex gap-2">
              <UiInput
                v-model="newSubBrand"
                placeholder="Add sub-brand..."
                class="w-48"
                @keyup.enter="handleAddSubBrand"
              />
              <UiButton variant="outline" size="sm" @click="handleAddSubBrand">
                <Plus class="size-4" />
              </UiButton>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Discovered APIs -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Discovered APIs</UiCardTitle>
            <UiCardDescription>Data APIs found via network inspection (pricing, inventory, etc.)</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div v-if="discoveredApis.length" class="space-y-2 mb-3">
              <div
                v-for="(api, i) in discoveredApis"
                :key="i"
                class="flex items-center gap-2 text-sm font-mono bg-muted/50 rounded px-3 py-2"
              >
                <UiBadge variant="outline" class="text-xs shrink-0">{{ api.method }}</UiBadge>
                <span class="truncate">{{ api.url }}</span>
                <UiBadge variant="secondary" class="text-xs shrink-0">{{ api.data_type }}</UiBadge>
                <UiButton variant="ghost" size="sm" class="size-6 p-0 shrink-0 ml-auto" @click="removeApi(i)">
                  <Trash2 class="size-3" />
                </UiButton>
              </div>
            </div>
            <div class="flex gap-2">
              <UiInput v-model="newApiUrl" placeholder="API URL..." class="flex-1" />
              <UiSelect v-model="newApiMethod">
                <UiSelectTrigger class="w-24">
                  <UiSelectValue />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem value="GET">GET</UiSelectItem>
                  <UiSelectItem value="POST">POST</UiSelectItem>
                  <UiSelectItem value="PUT">PUT</UiSelectItem>
                </UiSelectContent>
              </UiSelect>
              <UiSelect v-model="newApiDataType">
                <UiSelectTrigger class="w-28">
                  <UiSelectValue />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem value="products">products</UiSelectItem>
                  <UiSelectItem value="colors">colors</UiSelectItem>
                  <UiSelectItem value="offers">offers</UiSelectItem>
                  <UiSelectItem value="pricing">pricing</UiSelectItem>
                  <UiSelectItem value="inventory">inventory</UiSelectItem>
                  <UiSelectItem value="accessories">accessories</UiSelectItem>
                  <UiSelectItem value="brochures">brochures</UiSelectItem>
                  <UiSelectItem value="config">config</UiSelectItem>
                  <UiSelectItem value="other">other</UiSelectItem>
                </UiSelectContent>
              </UiSelect>
              <UiButton variant="outline" size="sm" @click="handleAddApi">
                <Plus class="size-4" />
              </UiButton>
            </div>
          </UiCardContent>
        </UiCard>

        <div class="flex justify-between">
          <UiButton variant="outline" @click="currentStep = 2">
            <ArrowLeft class="size-4 mr-2" />
            Back
          </UiButton>
          <UiButton @click="currentStep = 4">
            Continue
            <ArrowRight class="size-4 ml-2" />
          </UiButton>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- Step 4: Register -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 4">
      <UiCard>
        <UiCardHeader>
          <UiCardTitle>Register OEM</UiCardTitle>
          <UiCardDescription>
            Review the configuration below and register <strong>{{ oemName }}</strong> (<code>{{ oemId }}</code>) in the database.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent>
          <!-- Summary -->
          <div class="grid sm:grid-cols-2 gap-4 mb-6">
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">OEM ID</span>
                <code>{{ oemId }}</code>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Name</span>
                <span>{{ oemName }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Base URL</span>
                <span class="font-mono text-xs">{{ baseUrl }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Brand color</span>
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded border" :style="{ backgroundColor: brandColor }" />
                  <code class="text-xs">{{ brandColor }}</code>
                </div>
              </div>
            </div>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-muted-foreground">Source pages</span>
                <span>{{ includedPages.length }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Browser rendering</span>
                <span>{{ requiresBrowserRendering ? 'Yes' : 'No' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Sub-brands</span>
                <span>{{ subBrands.length ? subBrands.join(', ') : 'None' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-muted-foreground">Discovered APIs</span>
                <span>{{ discoveredApis.length }}</span>
              </div>
            </div>
          </div>

          <div class="flex justify-between">
            <UiButton variant="outline" @click="currentStep = 3">
              <ArrowLeft class="size-4 mr-2" />
              Back
            </UiButton>
            <UiButton :disabled="loading" @click="doRegister">
              <Loader2 v-if="loading" class="size-4 mr-2 animate-spin" />
              <Rocket v-else class="size-4 mr-2" />
              Register OEM
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>
    </div>

    <!-- ================================================================ -->
    <!-- Step 5: First Crawl -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 5">
      <div class="space-y-4">
        <!-- Registration success -->
        <UiAlert v-if="registration" variant="default">
          <UiAlertTitle>OEM Registered</UiAlertTitle>
          <UiAlertDescription>
            <strong>{{ oemId }}</strong> created with {{ registration.source_pages_created }} source pages
            <template v-if="registration.discovered_apis_created > 0">
              and {{ registration.discovered_apis_created }} discovered APIs
            </template>.
          </UiAlertDescription>
        </UiAlert>

        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Trigger First Crawl</UiCardTitle>
            <UiCardDescription>
              <template v-if="!crawlTriggered">
                The crawl will only succeed if the TypeScript code changes have been deployed.
                If you haven't deployed yet, skip this step and trigger from the Import Runs page later.
              </template>
              <template v-else>
                Crawl triggered. Live status updates appear below.
              </template>
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-4">
            <div class="flex gap-3">
              <UiButton :disabled="loading || crawlTriggered" @click="triggerFirstCrawl">
                <Loader2 v-if="loading" class="size-4 mr-2 animate-spin" />
                <Play v-else class="size-4 mr-2" />
                {{ crawlTriggered ? 'Crawl Triggered' : 'Trigger Crawl' }}
              </UiButton>
              <UiButton variant="outline" @click="doGenerateSnippets">
                <Loader2 v-if="loading" class="size-4 mr-2 animate-spin" />
                <ArrowRight v-else class="size-4 mr-2" />
                {{ crawlTriggered ? 'Continue to Snippets' : 'Skip to Snippets' }}
              </UiButton>
            </div>
            <p v-if="crawlJobId" class="text-xs text-muted-foreground">
              Job ID: <code>{{ crawlJobId }}</code>
            </p>

            <!-- Live crawl progress from realtime subscription -->
            <div v-if="importRuns.length" class="border rounded-md overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-muted/50">
                  <tr>
                    <th class="px-3 py-2 text-left">Status</th>
                    <th class="px-3 py-2 text-left">Products</th>
                    <th class="px-3 py-2 text-left">Offers</th>
                    <th class="px-3 py-2 text-left">Changes</th>
                    <th class="px-3 py-2 text-left">Started</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="run in importRuns" :key="run.id" class="border-t">
                    <td class="px-3 py-2">
                      <UiBadge
                        :variant="run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'"
                      >
                        <Loader2 v-if="run.status === 'running'" class="size-3 mr-1 animate-spin" />
                        {{ run.status }}
                      </UiBadge>
                    </td>
                    <td class="px-3 py-2">{{ run.products_upserted || 0 }}</td>
                    <td class="px-3 py-2">{{ run.offers_upserted || 0 }}</td>
                    <td class="px-3 py-2">{{ run.changes_found || 0 }}</td>
                    <td class="px-3 py-2 text-xs text-muted-foreground">
                      {{ run.started_at ? new Date(run.started_at).toLocaleTimeString() : '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </UiCardContent>
        </UiCard>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- Step 6: Code Snippets -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 6">
      <div class="space-y-4">
        <!-- No snippets yet — error or still loading -->
        <template v-if="!snippets">
          <UiCard>
            <UiCardHeader>
              <UiCardTitle>Generate Code Snippets</UiCardTitle>
              <UiCardDescription>
                Snippet generation failed or hasn't run yet. Click below to generate the code snippets for deployment.
              </UiCardDescription>
            </UiCardHeader>
            <UiCardContent class="space-y-3">
              <UiButton :disabled="loading" @click="doGenerateSnippets">
                <Loader2 v-if="loading" class="size-4 mr-2 animate-spin" />
                Retry Snippet Generation
              </UiButton>
              <div class="flex justify-between pt-4">
                <UiButton variant="outline" @click="currentStep = 5">
                  <ArrowLeft class="size-4 mr-2" />
                  Back
                </UiButton>
                <UiButton variant="outline" @click="currentStep = 7">
                  Skip to Report
                  <ArrowRight class="size-4 ml-2" />
                </UiButton>
              </div>
            </UiCardContent>
          </UiCard>
        </template>

        <!-- Snippets generated -->
        <template v-else>
        <UiAlert>
          <UiAlertTitle>Code Changes Required</UiAlertTitle>
          <UiAlertDescription>
            The OEM is registered in the database, but the TypeScript registry requires a code deploy.
            Copy these snippets and apply them, or run the <code>/oem-onboard</code> Claude agent which can apply them automatically.
          </UiAlertDescription>
        </UiAlert>

        <UiCard v-for="(snippet, key) in snippets" :key="key">
          <UiCardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <div>
                <UiCardTitle class="text-sm">{{ snippet.description }}</UiCardTitle>
                <UiCardDescription class="font-mono text-xs">{{ snippet.file }}</UiCardDescription>
              </div>
              <UiButton variant="outline" size="sm" @click="copyToClipboard(snippet.code)">
                <ClipboardCopy class="size-3 mr-1" />
                Copy
              </UiButton>
            </div>
          </UiCardHeader>
          <UiCardContent>
            <pre class="bg-muted rounded-md p-4 overflow-x-auto text-xs leading-relaxed"><code>{{ snippet.code }}</code></pre>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="text-sm">Next Steps</UiCardTitle>
          </UiCardHeader>
          <UiCardContent class="text-sm space-y-2">
            <ol class="list-decimal list-inside space-y-1">
              <li>Apply the code snippets above to the respective files</li>
              <li>Update OEM count references (run <code>grep -rn "18 OEM" --include="*.md" --include="*.ts"</code>)</li>
              <li>Deploy: <code>npm run deploy</code></li>
              <li>Trigger first crawl from the Import Runs page</li>
            </ol>
            <p class="text-muted-foreground pt-2">
              Or use the <code>/oem-onboard</code> Claude agent — if the wizard was used, it will skip discovery and DB steps, and focus on applying these snippets + updating counts.
            </p>
          </UiCardContent>
        </UiCard>

        <div class="flex justify-between">
          <UiButton variant="outline" @click="currentStep = 5">
            <ArrowLeft class="size-4 mr-2" />
            Back
          </UiButton>
          <UiButton @click="currentStep = 7">
            Continue to Report
            <ArrowRight class="size-4 ml-2" />
          </UiButton>
        </div>
        </template>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- Step 7: Report & Cron Setup -->
    <!-- ================================================================ -->
    <div v-if="currentStep === 7">
      <div class="space-y-4">
        <UiAlert variant="default">
          <UiAlertTitle>Onboarding Complete</UiAlertTitle>
          <UiAlertDescription>
            <strong>{{ oemName }}</strong> (<code>{{ oemId }}</code>) has been registered.
            Review the summary below and set up cron scheduling.
          </UiAlertDescription>
        </UiAlert>

        <!-- Summary Report -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>Onboarding Report</UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <div class="grid sm:grid-cols-2 gap-6">
              <!-- Discovery -->
              <div class="space-y-3">
                <h4 class="text-sm font-semibold">Discovery</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Sitemap URLs found</span>
                    <span>{{ sitemapUrlCount }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Pages classified</span>
                    <span>{{ pages.length }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Pages selected</span>
                    <span>{{ includedPages.length }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Framework</span>
                    <span>{{ framework || 'None detected' }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Sub-brands</span>
                    <span>{{ subBrands.length ? subBrands.join(', ') : 'None' }}</span>
                  </div>
                </div>
              </div>

              <!-- Registration -->
              <div class="space-y-3">
                <h4 class="text-sm font-semibold">Registration</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">OEM ID</span>
                    <code>{{ oemId }}</code>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Source pages created</span>
                    <span>{{ registration?.source_pages_created || 0 }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">APIs registered</span>
                    <span>{{ registration?.discovered_apis_created || 0 }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Browser rendering</span>
                    <UiBadge :variant="requiresBrowserRendering ? 'secondary' : 'outline'" class="text-xs">
                      {{ requiresBrowserRendering ? 'Required' : 'No' }}
                    </UiBadge>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-muted-foreground">Brand color</span>
                    <div class="flex items-center gap-1.5">
                      <div class="size-4 rounded border" :style="{ backgroundColor: brandColor }" />
                      <code class="text-xs">{{ brandColor }}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Crawl status -->
            <div class="mt-6 pt-4 border-t space-y-1">
              <h4 class="text-sm font-semibold">First Crawl</h4>
              <div class="text-sm">
                <template v-if="importRuns.length">
                  <div v-for="run in importRuns" :key="run.id" class="flex items-center gap-3 py-1">
                    <UiBadge
                      :variant="run.status === 'completed' ? 'default' : run.status === 'failed' ? 'destructive' : 'secondary'"
                      class="text-xs"
                    >
                      {{ run.status }}
                    </UiBadge>
                    <span class="text-muted-foreground">
                      {{ run.products_upserted || 0 }} products, {{ run.offers_upserted || 0 }} offers, {{ run.changes_found || 0 }} changes
                    </span>
                  </div>
                </template>
                <template v-else-if="crawlTriggered">
                  <div class="flex items-center gap-2 text-muted-foreground">
                    <Loader2 class="size-3 animate-spin" />
                    Waiting for crawl results...
                  </div>
                </template>
                <template v-else>
                  <span class="text-muted-foreground">Crawl not triggered — trigger from Import Runs after deploying code changes.</span>
                </template>
              </div>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Automated Features -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle>What Happens Automatically</UiCardTitle>
            <UiCardDescription>
              Once deployed, <code>{{ oemId }}</code> is included in all automated pipelines.
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div class="space-y-3 text-sm">
              <div class="flex items-start gap-3">
                <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="size-3 text-primary" />
                </div>
                <div>
                  <p class="font-medium">Daily Color + Pricing Sync (3am AEST)</p>
                  <p class="text-muted-foreground text-xs">variant_colors and variant_pricing auto-populated from OEM APIs. Driveaway pricing across all 8 AU states where available.</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="size-3 text-primary" />
                </div>
                <div>
                  <p class="font-medium">Daily Homepage + Offers Crawl (4-5am AEST)</p>
                  <p class="text-muted-foreground text-xs">Monitors OEM homepage and offers pages for changes. Products auto-sync specs_json and variant_colors on every upsert.</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="size-3 text-primary" />
                </div>
                <div>
                  <p class="font-medium">Vehicle Crawl (every 12h)</p>
                  <p class="text-muted-foreground text-xs">Crawls vehicle model pages. syncVariantColors() and buildSpecsJson() run automatically on every product upsert.</p>
                </div>
              </div>
              <div class="flex items-start gap-3">
                <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Check class="size-3 text-primary" />
                </div>
                <div>
                  <p class="font-medium">Brand Ambassador (weekly, Tuesdays 4am)</p>
                  <p class="text-muted-foreground text-xs">AI-generated dealer model pages. Pages edited in the Page Builder are protected from overwrite.</p>
                </div>
              </div>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Code snippets status -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="text-sm">Code Deploy Checklist</UiCardTitle>
          </UiCardHeader>
          <UiCardContent class="text-sm">
            <ol class="list-decimal list-inside space-y-1.5">
              <li :class="snippets ? 'text-foreground' : 'text-muted-foreground'">
                <span>Apply code snippets (types.ts, registry.ts, agent.ts, migration)</span>
                <UiBadge v-if="snippets" variant="outline" class="ml-2 text-xs">Generated</UiBadge>
              </li>
              <li class="text-muted-foreground">Update OEM count references across docs</li>
              <li class="text-muted-foreground">Deploy: <code>npx wrangler deploy</code></li>
              <li v-if="!crawlTriggered" class="text-muted-foreground">Trigger first crawl from Import Runs page</li>
              <li class="text-muted-foreground">Run color/pricing seed scripts if OEM has dedicated APIs</li>
            </ol>
            <p class="text-xs text-muted-foreground mt-3">
              No cron configuration needed — all OEMs are crawled automatically by the Cloudflare cron triggers.
            </p>
          </UiCardContent>
        </UiCard>

        <!-- Actions -->
        <div class="flex justify-between">
          <UiButton variant="outline" @click="currentStep = 6">
            <ArrowLeft class="size-4 mr-2" />
            Back to Snippets
          </UiButton>
          <div class="flex gap-2">
            <UiButton variant="outline" @click="resetState">
              Start Over
            </UiButton>
            <UiButton as="a" href="/dashboard/oems">
              <Check class="size-4 mr-2" />
              Done — View OEMs
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </BasicPage>
</template>
