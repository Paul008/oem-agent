<script lang="ts" setup>
import { useIntervalFn } from '@vueuse/core'
import {
  AlertTriangle,
  HeartPulse,
  Package,
  Palette,
  RefreshCw,
  Tag,
  Timer,
  TrendingUp,
  XCircle,
} from 'lucide-vue-next'
import { computed, onMounted } from 'vue'

import type { OemStockHealth } from '@/composables/use-stock-health'

import { BasicPage } from '@/components/global-layout'
import { useStockHealth } from '@/composables/use-stock-health'

const { loading, error, health, summary, fetchStockHealth } = useStockHealth()

onMounted(() => fetchStockHealth())

// Auto-refresh every 2 minutes
useIntervalFn(() => fetchStockHealth(), 120_000)

function statusColor(status: OemStockHealth['health_status']) {
  return {
    healthy: 'bg-green-500',
    warning: 'bg-yellow-500',
    critical: 'bg-red-500',
    stale: 'bg-gray-400',
  }[status]
}

function statusText(status: OemStockHealth['health_status']) {
  return { healthy: 'Healthy', warning: 'Warning', critical: 'Critical', stale: 'Stale' }[status]
}

function ageColor(days: number) {
  if (days <= 3)
    return 'text-green-600 dark:text-green-400'
  if (days <= 7)
    return 'text-yellow-600 dark:text-yellow-400'
  if (days <= 14)
    return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

function ageBadgeVariant(days: number): string {
  if (days <= 3)
    return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
  if (days <= 7)
    return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
  if (days <= 14)
    return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
}

function pricingColor(pct: number) {
  if (pct >= 90)
    return 'text-green-600 dark:text-green-400'
  if (pct >= 70)
    return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function formatAge(days: number) {
  if (days === 0)
    return 'today'
  if (days === 1)
    return '1d ago'
  if (days >= 999)
    return 'never'
  return `${days}d ago`
}

const sortedHealth = computed(() => {
  return [...health.value].sort((a, b) => a.health_score - b.health_score)
})
</script>

<template>
  <BasicPage title="Stock Health" description="Data freshness and completeness across all OEMs" sticky>
    <!-- Loading -->
    <div v-if="loading && !summary" class="flex items-center justify-center h-64">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
    </div>

    <!-- Error -->
    <div v-else-if="error" class="p-4 rounded-lg bg-red-50 dark:bg-red-950 text-red-600">
      <AlertTriangle class="inline size-4 mr-2" />
      {{ error }}
    </div>

    <template v-else-if="summary">
      <!-- Summary Cards -->
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6">
        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              OEM Status
            </UiCardTitle>
            <HeartPulse class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="flex items-center gap-2">
              <span class="text-2xl font-bold text-green-600">{{ summary.oems_healthy }}</span>
              <span class="text-muted-foreground">/</span>
              <span v-if="summary.oems_warning" class="text-lg font-semibold text-yellow-600">{{ summary.oems_warning }}</span>
              <span v-if="summary.oems_critical" class="text-lg font-semibold text-red-600">{{ summary.oems_critical }}</span>
              <span v-if="summary.oems_stale" class="text-lg font-semibold text-gray-400">{{ summary.oems_stale }}</span>
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              {{ summary.oems_healthy }} healthy, {{ summary.oems_warning + summary.oems_critical + summary.oems_stale }} need attention
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Products
            </UiCardTitle>
            <Package class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ summary.total_products }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Avg age: <span :class="ageColor(summary.avg_product_age_days)">{{ summary.avg_product_age_days }}d</span>
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Offers
            </UiCardTitle>
            <Tag class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ summary.total_offers }}
            </div>
            <p v-if="summary.offers_expiring_soon > 0" class="text-xs text-orange-600 mt-1">
              <Timer class="inline size-3 mr-1" />{{ summary.offers_expiring_soon }} expiring within 7 days
            </p>
            <p v-if="summary.offers_expired > 0" class="text-xs text-red-600 mt-1">
              <XCircle class="inline size-3 mr-1" />{{ summary.offers_expired }} expired
            </p>
            <p v-if="!summary.offers_expiring_soon && !summary.offers_expired" class="text-xs text-muted-foreground mt-1">
              All offers current
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Colors
            </UiCardTitle>
            <Palette class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ summary.total_colors.toLocaleString() }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Across all products
            </p>
          </UiCardContent>
        </UiCard>

        <UiCard>
          <UiCardHeader class="flex flex-row items-center justify-between pb-2 space-y-0">
            <UiCardTitle class="text-sm font-medium">
              Pricing
            </UiCardTitle>
            <TrendingUp class="size-4 text-muted-foreground" />
          </UiCardHeader>
          <UiCardContent>
            <div class="text-2xl font-bold">
              {{ summary.total_pricing.toLocaleString() }}
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              Variant pricing rows
            </p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- OEM Health Table -->
      <UiCard>
        <UiCardHeader class="flex flex-row items-center justify-between">
          <div>
            <UiCardTitle>Per-OEM Stock Health</UiCardTitle>
            <UiCardDescription>Sorted by health score (worst first)</UiCardDescription>
          </div>
          <UiButton variant="outline" size="sm" :disabled="loading" @click="fetchStockHealth()">
            <RefreshCw class="size-4 mr-2" :class="{ 'animate-spin': loading }" />
            Refresh
          </UiButton>
        </UiCardHeader>
        <UiCardContent>
          <div class="overflow-x-auto">
            <UiTable>
              <UiTableHeader>
                <UiTableRow>
                  <UiTableHead class="w-[140px]">
                    OEM
                  </UiTableHead>
                  <UiTableHead class="text-center w-[80px]">
                    Score
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Products
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Product Age
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Offers
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Offer Age
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Colors
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Pricing %
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Last Crawl
                  </UiTableHead>
                  <UiTableHead class="text-center">
                    Pages
                  </UiTableHead>
                </UiTableRow>
              </UiTableHeader>
              <UiTableBody>
                <UiTableRow v-for="oem in sortedHealth" :key="oem.oem_id">
                  <!-- OEM Name + Status -->
                  <UiTableCell class="font-medium">
                    <div class="flex items-center gap-2">
                      <span class="inline-block size-2.5 rounded-full" :class="statusColor(oem.health_status)" :title="statusText(oem.health_status)" />
                      {{ oem.oem_name }}
                    </div>
                  </UiTableCell>

                  <!-- Health Score -->
                  <UiTableCell class="text-center">
                    <span
                      class="inline-flex items-center justify-center text-xs font-bold rounded-full size-8"
                      :class="{
                        'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200': oem.health_score >= 80,
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200': oem.health_score >= 60 && oem.health_score < 80,
                        'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200': oem.health_score < 60,
                      }"
                    >
                      {{ oem.health_score }}
                    </span>
                  </UiTableCell>

                  <!-- Product Count -->
                  <UiTableCell class="text-center tabular-nums">
                    {{ oem.product_count }}
                  </UiTableCell>

                  <!-- Product Age -->
                  <UiTableCell class="text-center">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium" :class="ageBadgeVariant(oem.product_age_days)">
                      {{ formatAge(oem.product_age_days) }}
                    </span>
                  </UiTableCell>

                  <!-- Offer Count -->
                  <UiTableCell class="text-center">
                    <span class="tabular-nums">{{ oem.offer_count }}</span>
                    <span v-if="oem.offers_expiring_soon > 0" class="ml-1 text-orange-600" :title="`${oem.offers_expiring_soon} expiring within 7 days`">
                      <Timer class="inline size-3" />
                    </span>
                    <span v-if="oem.offers_expired > 0" class="ml-1 text-red-600" :title="`${oem.offers_expired} expired`">
                      <XCircle class="inline size-3" />
                    </span>
                  </UiTableCell>

                  <!-- Offer Age -->
                  <UiTableCell class="text-center">
                    <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium" :class="ageBadgeVariant(oem.offer_age_days)">
                      {{ formatAge(oem.offer_age_days) }}
                    </span>
                  </UiTableCell>

                  <!-- Colors -->
                  <UiTableCell class="text-center tabular-nums">
                    {{ oem.color_count }}
                  </UiTableCell>

                  <!-- Pricing Coverage -->
                  <UiTableCell class="text-center">
                    <span class="font-medium tabular-nums" :class="pricingColor(oem.pricing_coverage_pct)">
                      {{ oem.pricing_coverage_pct }}%
                    </span>
                  </UiTableCell>

                  <!-- Last Crawl -->
                  <UiTableCell class="text-center">
                    <span :class="ageColor(oem.last_run_age_days)">
                      {{ formatAge(oem.last_run_age_days) }}
                    </span>
                    <span v-if="oem.consecutive_failures > 2" class="ml-1 text-red-600" :title="`${oem.consecutive_failures} consecutive failures`">
                      <AlertTriangle class="inline size-3" />
                    </span>
                  </UiTableCell>

                  <!-- Source Pages -->
                  <UiTableCell class="text-center">
                    <span class="tabular-nums text-green-600">{{ oem.active_pages }}</span>
                    <span v-if="oem.errored_pages > 0" class="text-red-600"> / {{ oem.errored_pages }}
                      <XCircle class="inline size-3" />
                    </span>
                  </UiTableCell>
                </UiTableRow>
              </UiTableBody>
            </UiTable>
          </div>
        </UiCardContent>
      </UiCard>
    </template>
  </BasicPage>
</template>
