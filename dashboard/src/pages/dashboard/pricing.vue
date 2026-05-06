<script lang="ts" setup>
import { AlertTriangle, Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'

import type { Product, VariantPricing, VehicleModel } from '@/composables/use-oem-data'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'

const { fetchProducts, fetchVehicleModels, fetchVariantPricing, fetchOems } = useOemData()

const products = ref<Product[]>([])
const models = ref<VehicleModel[]>([])
const pricing = ref<VariantPricing[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const filterOem = ref('all')

onMounted(async () => {
  try {
    const [p, m, pr, o] = await Promise.all([
      fetchProducts(),
      fetchVehicleModels(),
      fetchVariantPricing(),
      fetchOems(),
    ])
    products.value = p
    models.value = m
    pricing.value = pr
    oems.value = o
  }
  catch (err: any) {
    loadError.value = err.message || 'Failed to load pricing data'
    toast.error(loadError.value!)
  }
  finally {
    loading.value = false
  }
})

const rows = computed(() => {
  return pricing.value
    .map((p) => {
      const product = products.value.find(pr => pr.id === p.product_id)
      if (!product)
        return null
      if (filterOem.value !== 'all' && product.oem_id !== filterOem.value)
        return null
      const model = models.value.find(m => m.id === product.model_id)
      return {
        id: p.id,
        oem: product.oem_id,
        model: model?.name ?? '-',
        variant: product.variant_name || product.subtitle || product.title,
        type: p.price_type,
        rrp: p.rrp,
        nsw: p.driveaway_nsw,
        vic: p.driveaway_vic,
        qld: p.driveaway_qld,
        wa: p.driveaway_wa,
        sa: p.driveaway_sa,
        tas: p.driveaway_tas,
        act: p.driveaway_act,
        nt: p.driveaway_nt,
      }
    })
    .filter(Boolean)
})

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function formatPrice(amount: number | null) {
  if (!amount)
    return '-'
  return `$${Math.round(amount).toLocaleString()}`
}
</script>

<template>
  <BasicPage title="State Pricing" description="Driveaway pricing comparison by state" sticky>
    <div class="flex items-center gap-4 mb-4">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">
            All OEMs
          </UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground">{{ rows.length }} pricing entries</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">
        {{ loadError }}
      </p>
    </div>

    <UiCard v-else>
      <div class="overflow-x-auto">
        <UiTable>
          <UiTableHeader>
            <UiTableRow>
              <UiTableHead>OEM</UiTableHead>
              <UiTableHead>Model</UiTableHead>
              <UiTableHead>Variant</UiTableHead>
              <UiTableHead class="text-right">
                RRP
              </UiTableHead>
              <UiTableHead class="text-right">
                NSW
              </UiTableHead>
              <UiTableHead class="text-right">
                VIC
              </UiTableHead>
              <UiTableHead class="text-right">
                QLD
              </UiTableHead>
              <UiTableHead class="text-right">
                WA
              </UiTableHead>
              <UiTableHead class="text-right">
                SA
              </UiTableHead>
              <UiTableHead class="text-right">
                TAS
              </UiTableHead>
              <UiTableHead class="text-right">
                ACT
              </UiTableHead>
              <UiTableHead class="text-right">
                NT
              </UiTableHead>
            </UiTableRow>
          </UiTableHeader>
          <UiTableBody>
            <UiTableRow v-if="rows.length === 0">
              <UiTableCell :colspan="12" class="text-center text-muted-foreground py-8">
                No pricing data found
              </UiTableCell>
            </UiTableRow>
            <UiTableRow v-for="row in rows" :key="row!.id">
              <UiTableCell class="text-sm">
                {{ oemName(row!.oem) }}
              </UiTableCell>
              <UiTableCell class="font-medium text-sm">
                {{ row!.model }}
              </UiTableCell>
              <UiTableCell class="text-sm max-w-[200px] truncate">
                {{ row!.variant }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm font-medium">
                {{ formatPrice(row!.rrp) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.nsw) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.vic) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.qld) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.wa) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.sa) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.tas) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.act) }}
              </UiTableCell>
              <UiTableCell class="text-right text-sm">
                {{ formatPrice(row!.nt) }}
              </UiTableCell>
            </UiTableRow>
          </UiTableBody>
        </UiTable>
      </div>
    </UiCard>
  </BasicPage>
</template>
