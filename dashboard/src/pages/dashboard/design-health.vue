<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import { Loader2, HeartPulse, AlertTriangle, Check, ChevronDown, ScanSearch } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { fetchDesignHealth, checkDrift } from '@/lib/worker-api'

const loading = ref(true)
const oems = ref<Array<{ oem_id: string; last_crawled: string | null; token_count: number; has_fonts: boolean }>>([])

// Drift state per OEM
const driftResults = ref<Map<string, { severity: string; changes: any[]; change_count: number; crawled_at: string }>>(new Map())
const checkingOem = ref<string | null>(null)
const expandedOem = ref<Set<string>>(new Set())
const checkingAll = ref(false)
const checkAllProgress = ref('')

onMounted(async () => {
  try {
    const data = await fetchDesignHealth()
    oems.value = data.oems.sort((a, b) => a.oem_id.localeCompare(b.oem_id))
  } catch {
    toast.error('Failed to load design health')
  } finally {
    loading.value = false
  }
})

const summary = computed(() => {
  const checked = driftResults.value.size
  const withDrift = Array.from(driftResults.value.values()).filter(r => r.severity !== 'none').length
  const totalChanges = Array.from(driftResults.value.values()).reduce((sum, r) => sum + r.change_count, 0)
  return { checked, withDrift, totalChanges }
})

async function handleCheckDrift(oemId: string) {
  if (checkingOem.value) return
  checkingOem.value = oemId
  try {
    const result = await checkDrift(oemId)
    driftResults.value.set(oemId, result)
    if (result.severity !== 'none') expandedOem.value.add(oemId)
  } catch (err: any) {
    toast.error(`${oemId}: ${err.message}`)
  } finally {
    checkingOem.value = null
  }
}

async function handleCheckAll() {
  if (checkingAll.value) return
  checkingAll.value = true
  for (let i = 0; i < oems.value.length; i++) {
    const oem = oems.value[i]
    checkAllProgress.value = `Checking ${i + 1} of ${oems.value.length}: ${oem.oem_id}`
    checkingOem.value = oem.oem_id
    try {
      const result = await checkDrift(oem.oem_id)
      driftResults.value.set(oem.oem_id, result)
      if (result.severity !== 'none') expandedOem.value.add(oem.oem_id)
    } catch {}
  }
  checkingOem.value = null
  checkingAll.value = false
  checkAllProgress.value = ''
  toast.success('Drift check complete')
}

function oemLabel(id: string) { return id.replace('-au', '').replace(/^\w/, c => c.toUpperCase()) }

const severityColors: Record<string, string> = {
  none: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  low: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}
</script>

<template>
  <BasicPage title="Design Health" description="Monitor brand token drift across all OEMs — detect when OEM websites change their design.">
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <!-- Summary -->
      <div class="grid grid-cols-3 gap-4">
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">OEMs Checked</p>
          <p class="text-2xl font-bold">{{ summary.checked }} / {{ oems.length }}</p>
        </UiCard>
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">With Drift</p>
          <p class="text-2xl font-bold" :class="summary.withDrift ? 'text-amber-600' : 'text-green-600'">
            {{ summary.withDrift }}
          </p>
        </UiCard>
        <UiCard class="p-4">
          <p class="text-xs text-muted-foreground">Total Changes</p>
          <p class="text-2xl font-bold">{{ summary.totalChanges }}</p>
        </UiCard>
      </div>

      <!-- Check All -->
      <div class="flex items-center gap-3">
        <UiButton :disabled="checkingAll || !!checkingOem" @click="handleCheckAll">
          <Loader2 v-if="checkingAll" class="size-4 mr-1 animate-spin" />
          <ScanSearch v-else class="size-4 mr-1" />
          {{ checkingAll ? 'Checking...' : 'Check All OEMs' }}
        </UiButton>
        <span v-if="checkAllProgress" class="text-xs text-muted-foreground">{{ checkAllProgress }}</span>
      </div>

      <!-- OEM Table -->
      <UiCard class="overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/50">
              <th class="px-4 py-2.5 text-left font-medium">OEM</th>
              <th class="px-4 py-2.5 text-center font-medium">Tokens</th>
              <th class="px-4 py-2.5 text-center font-medium">Fonts</th>
              <th class="px-4 py-2.5 text-center font-medium">Drift</th>
              <th class="px-4 py-2.5 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <template v-for="oem in oems" :key="oem.oem_id">
              <tr>
                <td class="px-4 py-2.5 font-medium">{{ oemLabel(oem.oem_id) }}</td>
                <td class="px-4 py-2.5 text-center text-muted-foreground">{{ oem.token_count }}</td>
                <td class="px-4 py-2.5 text-center">
                  <Check v-if="oem.has_fonts" class="size-4 text-green-600 mx-auto" />
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td class="px-4 py-2.5 text-center">
                  <span
                    v-if="driftResults.has(oem.oem_id)"
                    class="text-[10px] px-2 py-0.5 rounded-full font-medium"
                    :class="severityColors[driftResults.get(oem.oem_id)!.severity]"
                  >
                    {{ driftResults.get(oem.oem_id)!.severity }}
                    <template v-if="driftResults.get(oem.oem_id)!.change_count > 0">
                      ({{ driftResults.get(oem.oem_id)!.change_count }})
                    </template>
                  </span>
                  <span v-else class="text-xs text-muted-foreground">—</span>
                </td>
                <td class="px-4 py-2.5 text-right">
                  <div class="flex items-center justify-end gap-1">
                    <UiButton
                      size="sm" variant="ghost"
                      :disabled="!!checkingOem"
                      @click="handleCheckDrift(oem.oem_id)"
                    >
                      <Loader2 v-if="checkingOem === oem.oem_id" class="size-3.5 animate-spin" />
                      <ScanSearch v-else class="size-3.5" />
                    </UiButton>
                    <button
                      v-if="driftResults.has(oem.oem_id) && driftResults.get(oem.oem_id)!.change_count > 0"
                      class="p-1 hover:bg-muted rounded"
                      @click="expandedOem.has(oem.oem_id) ? expandedOem.delete(oem.oem_id) : expandedOem.add(oem.oem_id)"
                    >
                      <ChevronDown class="size-3.5" :class="{ 'rotate-180': !expandedOem.has(oem.oem_id) }" />
                    </button>
                  </div>
                </td>
              </tr>
              <!-- Expanded drift details -->
              <tr v-if="expandedOem.has(oem.oem_id) && driftResults.has(oem.oem_id)">
                <td colspan="5" class="px-4 py-3 bg-muted/30">
                  <div class="space-y-1">
                    <div
                      v-for="change in driftResults.get(oem.oem_id)!.changes.filter((c: any) => c.changed)"
                      :key="change.field"
                      class="flex items-center gap-3 text-xs"
                    >
                      <span class="font-mono text-muted-foreground w-40">{{ change.field }}</span>
                      <div class="flex items-center gap-1">
                        <div v-if="change.current.startsWith('#')" class="size-3 rounded border" :style="{ backgroundColor: change.current }" />
                        <span>{{ change.current }}</span>
                      </div>
                      <span class="text-muted-foreground">→</span>
                      <div class="flex items-center gap-1">
                        <div v-if="change.crawled.startsWith('#')" class="size-3 rounded border" :style="{ backgroundColor: change.crawled }" />
                        <span class="font-semibold text-amber-700 dark:text-amber-400">{{ change.crawled }}</span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </UiCard>
    </div>
  </BasicPage>
</template>
