<script lang="ts" setup>
import { BookOpen, ChevronRight, Factory, Loader2 } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { BasicPage } from '@/components/global-layout'
import { renderMarkdown } from '@/lib/markdown'
import { supabase } from '@/lib/supabase'

interface OemDoc {
  id: string
  name: string
  api_docs: string | null
}

const oems = ref<OemDoc[]>([])
const loading = ref(true)
const selectedOem = ref<string | null>(null)

onMounted(async () => {
  try {
    const { data } = await supabase
      .from('oems')
      .select('id, name, config_json')
      .order('name')
    oems.value = (data ?? []).map((o: any) => ({
      id: o.id,
      name: o.name,
      api_docs: o.config_json?.api_docs ?? null,
    }))
    // Auto-select first OEM with docs
    const first = oems.value.find(o => o.api_docs)
    if (first)
      selectedOem.value = first.id
  }
  finally {
    loading.value = false
  }
})

const oemsWithDocs = computed(() => oems.value.filter(o => o.api_docs))
const oemsWithoutDocs = computed(() => oems.value.filter(o => !o.api_docs))

const currentDoc = computed(() => {
  const oem = oems.value.find(o => o.id === selectedOem.value)
  if (!oem?.api_docs)
    return null
  return {
    name: oem.name,
    html: renderMarkdown(oem.api_docs),
  }
})

function shortName(name: string) {
  return name?.replace(' Australia', '').replace(' Motors', '') ?? ''
}
</script>

<template>
  <BasicPage title="API Documentation" description="Architecture and integration guides per OEM" sticky>
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <template v-else>
      <div class="flex gap-4">
        <!-- Sidebar: OEM list -->
        <div class="w-56 shrink-0 space-y-1">
          <p class="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2 px-2">
            Documented ({{ oemsWithDocs.length }})
          </p>
          <button
            v-for="oem in oemsWithDocs"
            :key="oem.id"
            class="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors"
            :class="selectedOem === oem.id
              ? 'bg-primary text-primary-foreground'
              : 'hover:bg-muted text-foreground'"
            @click="selectedOem = oem.id"
          >
            <BookOpen class="size-3.5 shrink-0" />
            <span class="truncate">{{ shortName(oem.name) }}</span>
            <ChevronRight v-if="selectedOem === oem.id" class="size-3 ml-auto shrink-0" />
          </button>

          <template v-if="oemsWithoutDocs.length > 0">
            <p class="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-4 mb-2 px-2">
              No docs yet ({{ oemsWithoutDocs.length }})
            </p>
            <div
              v-for="oem in oemsWithoutDocs"
              :key="oem.id"
              class="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
            >
              <Factory class="size-3.5 shrink-0 opacity-40" />
              <span class="truncate">{{ shortName(oem.name) }}</span>
            </div>
          </template>
        </div>

        <!-- Main content: rendered docs -->
        <UiCard class="flex-1 min-w-0">
          <UiCardContent class="p-6">
            <div v-if="!currentDoc" class="text-center py-12 text-muted-foreground">
              <BookOpen class="size-12 mx-auto mb-3 opacity-30" />
              <p>Select an OEM to view API documentation</p>
            </div>
            <div v-else v-html="currentDoc.html" />
          </UiCardContent>
        </UiCard>
      </div>
    </template>
  </BasicPage>
</template>
