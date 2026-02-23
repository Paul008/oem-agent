<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Activity, AlertTriangle, BellOff, Car, ClipboardList, Clock, DollarSign, Factory, FileText, Globe, Image, Palette, Shield, Tag, Wrench, Sparkles } from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { useGeneratedPages } from '@/composables/use-generated-pages'
import { useRealtimeSubscription } from '@/composables/use-realtime'
import { supabase } from '@/lib/supabase'
import type { ImportRun, ChangeEvent, SourcePage } from '@/composables/use-oem-data'
import type { PageStats } from '@/composables/use-generated-pages'

const { fetchCounts, fetchImportRuns, fetchChangeEvents, fetchSourcePages, fetchOems } = useOemData()
const { fetchPageStats } = useGeneratedPages()

const oems = ref<{ id: string, name: string }[]>([])

const counts = ref({ oems: 0, models: 0, products: 0, offers: 0, colors: 0, pricing: 0, pages: 0, runs: 0, accessories: 0, accessoryModels: 0, discoveredApis: 0, banners: 0, portals: 0, specsProducts: 0, brochureModels: 0 })
const recentRuns = ref<ImportRun[]>([])
const recentChanges = ref<ChangeEvent[]>([])
const sourcePages = ref<SourcePage[]>([])
const apiCount = ref(0)
const unnotifiedCount = ref(0)
const loading = ref(true)
const pageStats = ref<PageStats | null>(null)

const feedHealth = computed(() => {
  const active = sourcePages.value.filter(p => p.status === 'active').length
  const errored = sourcePages.value.filter(p => p.status === 'error').length
  const total = sourcePages.value.length
  return { active, errored, total, pct: total ? Math.round((active / total) * 100) : 0 }
})

onMounted(async () => {
  try {
    const [c, runs, changes, sp, o, unnotified, stats] = await Promise.all([
      fetchCounts(),
      fetchImportRuns(10),
      fetchChangeEvents(15),
      fetchSourcePages(),
      fetchOems(),
      supabase.from('change_events').select('*', { count: 'exact', head: true }).is('notified_at', null),
      fetchPageStats(),
    ])
    counts.value = c
    recentRuns.value = runs
    recentChanges.value = changes
    oems.value = o
    sourcePages.value = sp
    apiCount.value = c.discoveredApis
    unnotifiedCount.value = unnotified.count ?? 0
    pageStats.value = stats
  }
  catch (err) {
    console.error('Failed to load dashboard data:', err)
  }
  finally {
    loading.value = false
  }
})

// Live import runs feed
useRealtimeSubscription<ImportRun>({
  channelName: 'home-runs-live',
  table: 'import_runs',
  event: '*',
  dataRef: recentRuns,
  maxItems: 10,
  onEvent: (_payload, eventType) => {
    if (eventType === 'INSERT') counts.value.runs++
  },
})

// Live change events feed
useRealtimeSubscription<ChangeEvent>({
  channelName: 'home-changes-live',
  table: 'change_events',
  event: 'INSERT',
  dataRef: recentChanges,
  maxItems: 15,
  onEvent: (payload) => {
    if (!(payload.new as any)?.notified_at) unnotifiedCount.value++
  },
})

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function statusColor(status: string) {
  if (status === 'success' || status === 'completed') return 'text-green-500'
  if (status === 'failed') return 'text-red-500'
  if (status === 'running') return 'text-blue-500'
  return 'text-muted-foreground'
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'bg-red-500/10 text-red-500 border-red-500/20'
  if (severity === 'high') return 'bg-orange-500/10 text-orange-500 border-orange-500/20'
  if (severity === 'medium') return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
  return 'bg-muted text-muted-foreground border-border'
}
</script>

<template>
  <BasicPage
    title="OEM Intelligence Dashboard"
    description="Feed aggregation across all Australian OEMs"
    sticky
  >
    <div v-if="loading" class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>

    <template v-else>
      <!-- Stats Grid -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">OEMs</UiCardTitle>
            <Factory class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.oems }}</div>
            <p class="text-xs text-muted-foreground">Active manufacturers</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Models</UiCardTitle>
            <Car class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.models }}</div>
            <p class="text-xs text-muted-foreground">Vehicle models</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Variants</UiCardTitle>
            <Car class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.products }}</div>
            <p class="text-xs text-muted-foreground">Product listings</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Offers</UiCardTitle>
            <Tag class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.offers }}</div>
            <p class="text-xs text-muted-foreground">Active promotions</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Accessories</UiCardTitle>
            <Wrench class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.accessories }}</div>
            <p class="text-xs text-muted-foreground">Across {{ counts.accessoryModels }} model links</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Colors</UiCardTitle>
            <Palette class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.colors.toLocaleString() }}</div>
            <p class="text-xs text-muted-foreground">Variant colors with images</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Pricing</UiCardTitle>
            <DollarSign class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.pricing }}</div>
            <p class="text-xs text-muted-foreground">State driveaway rows</p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Import Runs</UiCardTitle>
            <Clock class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.runs }}</div>
            <p class="text-xs text-muted-foreground">Total crawl executions</p>
          </UiCardContent>
        </UiCard>

        <UiCard class="cursor-pointer hover:bg-accent/50 transition-colors" @click="$router.push('/dashboard/model-pages')">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">AI Pages</UiCardTitle>
            <Sparkles class="size-4 text-purple-500" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ pageStats?.generated_pages ?? '—' }}</div>
            <p class="text-xs text-muted-foreground">
              {{ pageStats?.pending_generation ?? 0 }} pending generation
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard class="cursor-pointer hover:bg-accent/50 transition-colors" @click="$router.push('/dashboard/banners')">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Banners</UiCardTitle>
            <Image class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ counts.banners }}</div>
            <p class="text-xs text-muted-foreground">Hero slides & carousels</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Health Indicators -->
      <div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 mt-4">
        <UiCard :class="feedHealth.errored > 0 ? 'border-red-500/30' : ''">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Feed Health</UiCardTitle>
            <Shield class="size-4" :class="feedHealth.errored > 0 ? 'text-red-500' : 'text-green-500'" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="feedHealth.errored > 0 ? 'text-yellow-500' : 'text-green-500'">
              {{ feedHealth.pct }}%
            </div>
            <p class="text-xs text-muted-foreground">
              {{ feedHealth.active }} active / {{ feedHealth.errored }} errored of {{ feedHealth.total }} pages
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Specs Coverage</UiCardTitle>
            <ClipboardList class="size-4" :class="counts.products > 0 && counts.specsProducts / counts.products >= 0.9 ? 'text-green-500' : 'text-yellow-500'" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="counts.products > 0 && counts.specsProducts / counts.products >= 0.9 ? 'text-green-500' : 'text-yellow-500'">
              {{ counts.products > 0 ? Math.round((counts.specsProducts / counts.products) * 100) : 0 }}%
            </div>
            <p class="text-xs text-muted-foreground">
              {{ counts.specsProducts }}/{{ counts.products }} variants with specs
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Brochures</UiCardTitle>
            <FileText class="size-4" :class="counts.models > 0 && counts.brochureModels / counts.models >= 0.7 ? 'text-green-500' : 'text-yellow-500'" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="counts.models > 0 && counts.brochureModels / counts.models >= 0.7 ? 'text-green-500' : 'text-yellow-500'">
              {{ counts.brochureModels }}/{{ counts.models }}
            </div>
            <p class="text-xs text-muted-foreground">
              Models with brochure PDFs ({{ counts.models > 0 ? Math.round((counts.brochureModels / counts.models) * 100) : 0 }}%)
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Discovered APIs</UiCardTitle>
            <Globe class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">{{ apiCount }}</div>
            <p class="text-xs text-muted-foreground">Via network capture</p>
          </UiCardContent>
        </UiCard>

        <UiCard :class="unnotifiedCount > 0 ? 'border-yellow-500/30' : ''">
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">Unnotified Changes</UiCardTitle>
            <BellOff v-if="unnotifiedCount > 0" class="size-4 text-yellow-500" />
            <AlertTriangle v-else class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold" :class="unnotifiedCount > 0 ? 'text-yellow-500' : ''">
              {{ unnotifiedCount }}
            </div>
            <p class="text-xs text-muted-foreground">Pending notification</p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Two columns: Recent Runs + Change Feed -->
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-4">
        <!-- Recent Import Runs -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Clock class="size-4" />
              Recent Import Runs
            </UiCardTitle>
            <UiCardDescription>Last 10 crawl executions</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div v-if="recentRuns.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              No import runs found
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="run in recentRuns"
                :key="run.id"
                class="flex items-center justify-between border-b border-border pb-2 last:border-0"
              >
                <div class="flex flex-col gap-0.5">
                  <span class="text-sm font-medium">{{ oemName(run.oem_id) }}</span>
                  <span class="text-xs text-muted-foreground">{{ run.run_type }}</span>
                </div>
                <div class="flex items-center gap-3 text-right">
                  <div class="flex flex-col gap-0.5">
                    <span class="text-xs" :class="statusColor(run.status)">{{ run.status }}</span>
                    <span class="text-xs text-muted-foreground">{{ timeAgo(run.created_at) }}</span>
                  </div>
                  <div class="text-xs text-muted-foreground">
                    <span v-if="run.changes_found">{{ run.changes_found }} items</span>
                    <span v-else-if="run.pages_changed">{{ run.pages_changed }} changed</span>
                    <span v-if="run.products_upserted"> / {{ run.products_upserted }} products</span>
                  </div>
                </div>
              </div>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Change Events Feed -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Activity class="size-4" />
              Change Feed
            </UiCardTitle>
            <UiCardDescription>Recent data changes across OEMs</UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <div v-if="recentChanges.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              No change events found
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="change in recentChanges"
                :key="change.id"
                class="flex items-start gap-3 border-b border-border pb-2 last:border-0"
              >
                <UiBadge variant="outline" :class="severityColor(change.severity)" class="mt-0.5 text-[10px] shrink-0">
                  {{ change.severity }}
                </UiBadge>
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="text-sm truncate">{{ change.summary || change.event_type }}</span>
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{{ oemName(change.oem_id) }}</span>
                    <span>{{ change.entity_type }}</span>
                    <span>{{ timeAgo(change.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </UiCardContent>
        </UiCard>
      </div>
    </template>
  </BasicPage>
</template>
