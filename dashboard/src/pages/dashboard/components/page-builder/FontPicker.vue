<script lang="ts" setup>
import { ChevronsUpDown } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { GoogleFont } from '@/composables/use-google-fonts'

import { useGoogleFonts } from '@/composables/use-google-fonts'

const props = defineProps<{
  modelValue?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [family: string]
}>()

const { fonts, loadFont } = useGoogleFonts()

const open = ref(false)
const search = ref('')

const filtered = computed(() => {
  const q = search.value.toLowerCase()
  if (!q)
    return fonts.value
  return fonts.value.filter(f => f.family.toLowerCase().includes(q))
})

const categories = computed(() => {
  const cats: Record<string, GoogleFont[]> = {}
  for (const f of filtered.value) {
    const cat = f.category || 'other'
    if (!cats[cat])
      cats[cat] = []
    cats[cat].push(f)
  }
  return cats
})

async function selectFont(family: string) {
  await loadFont(family)
  emit('update:modelValue', family)
  open.value = false
  search.value = ''
}

// Preload hovered font for instant preview
async function onHover(family: string) {
  await loadFont(family)
}
</script>

<template>
  <div class="relative">
    <button
      class="h-7 px-2 text-[10px] bg-transparent border rounded flex items-center gap-1 cursor-pointer min-w-[90px] max-w-[120px] truncate"
      :style="modelValue ? { fontFamily: `'${modelValue}', sans-serif` } : {}"
      :title="modelValue || 'Select font'"
      @click="open = !open"
    >
      <span class="truncate flex-1 text-left">{{ modelValue || 'Font' }}</span>
      <ChevronsUpDown class="size-3 shrink-0 opacity-50" />
    </button>

    <!-- Dropdown -->
    <div
      v-if="open"
      class="absolute top-full left-0 mt-1 w-56 max-h-64 bg-card border rounded-lg shadow-xl z-50 flex flex-col overflow-hidden"
    >
      <!-- Search -->
      <div class="p-1.5 border-b">
        <input
          v-model="search"
          type="text"
          placeholder="Search fonts..."
          class="w-full h-7 px-2 text-xs bg-muted rounded outline-none"
          @keydown.stop
        >
      </div>

      <!-- Font list -->
      <div class="flex-1 overflow-y-auto">
        <template v-for="(catFonts, cat) in categories" :key="cat">
          <div class="px-2 py-1 text-[9px] font-medium text-muted-foreground uppercase tracking-wider sticky top-0 bg-card">
            {{ cat }}
          </div>
          <button
            v-for="font in catFonts"
            :key="font.family"
            class="w-full text-left px-2 py-1.5 text-sm hover:bg-muted flex items-center gap-2 transition-colors"
            :class="modelValue === font.family ? 'bg-primary/10 text-primary' : ''"
            :style="{ fontFamily: `'${font.family}', ${font.category}` }"
            @mouseenter="onHover(font.family)"
            @click="selectFont(font.family)"
          >
            {{ font.family }}
          </button>
        </template>
        <div v-if="filtered.length === 0" class="px-2 py-4 text-xs text-center text-muted-foreground">
          No fonts match "{{ search }}"
        </div>
      </div>
    </div>

    <!-- Backdrop to close -->
    <div v-if="open" class="fixed inset-0 z-40" @click="open = false; search = ''" />
  </div>
</template>
