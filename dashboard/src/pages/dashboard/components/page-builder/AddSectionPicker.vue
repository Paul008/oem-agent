<script lang="ts" setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  Plus, Image, Columns3, ChevronRight, ChevronDown, Library,
  ClipboardPaste, BookmarkPlus, Layers, Grid3x3, SplitSquareHorizontal,
  Play, Database, Megaphone,
} from 'lucide-vue-next'
import {
  SECTION_TYPE_INFO,
  type PageSectionType,
} from './section-templates'
import type { Recipe } from '@/lib/worker-api'

const props = defineProps<{
  recipes?: Recipe[]
  oemId?: string
}>()

const emit = defineEmits<{
  addBlank: [type: PageSectionType]
  addFromTemplate: [templateId: string]
  addFromRecipe: [recipe: Recipe]
  openGallery: []
  pasteFromClipboard: []
}>()

const router = useRouter()
const open = ref(false)
const expandedPattern = ref<string | null>(null)

const PATTERNS = [
  { key: 'hero', label: 'Hero', icon: Image },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
]

const recipesByPattern = computed(() => {
  const grouped: Record<string, { brand: Recipe[]; defaults: Recipe[] }> = {}
  for (const p of PATTERNS) {
    grouped[p.key] = { brand: [], defaults: [] }
  }
  for (const r of (props.recipes ?? [])) {
    const group = grouped[r.pattern]
    if (!group) continue
    if (r.source === 'brand') group.brand.push(r)
    else group.defaults.push(r)
  }
  return grouped
})

const hasRecipes = computed(() => (props.recipes ?? []).length > 0)

function togglePattern(key: string) {
  expandedPattern.value = expandedPattern.value === key ? null : key
}

function selectRecipe(recipe: Recipe) {
  emit('addFromRecipe', recipe)
  open.value = false
  expandedPattern.value = null
}

function addBlankType(type: PageSectionType) {
  emit('addBlank', type)
  open.value = false
  expandedPattern.value = null
}
</script>

<template>
  <div class="relative">
    <button
      class="w-full flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
      @click="open = !open"
    >
      <Plus class="h-3.5 w-3.5" />
      Add Section
    </button>

    <div
      v-if="open"
      class="absolute left-0 right-0 z-50 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden max-h-[480px] overflow-y-auto"
    >
      <template v-if="hasRecipes">
        <div
          v-for="pattern in PATTERNS"
          :key="pattern.key"
          class="border-b border-border last:border-0"
        >
          <button
            class="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-muted transition-colors"
            @click="togglePattern(pattern.key)"
          >
            <component :is="pattern.icon" class="h-3.5 w-3.5 text-muted-foreground" />
            <span class="flex-1 text-left">{{ pattern.label }}</span>
            <span
              v-if="recipesByPattern[pattern.key]?.brand.length"
              class="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full"
            >
              {{ recipesByPattern[pattern.key].brand.length }} custom
            </span>
            <component
              :is="expandedPattern === pattern.key ? ChevronDown : ChevronRight"
              class="h-3 w-3 text-muted-foreground"
            />
          </button>

          <div v-if="expandedPattern === pattern.key" class="bg-muted/30">
            <template v-if="recipesByPattern[pattern.key].brand.length">
              <div class="px-3 pt-1.5 pb-0.5">
                <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Brand</span>
              </div>
              <button
                v-for="recipe in recipesByPattern[pattern.key].brand"
                :key="recipe.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 pl-8 text-xs hover:bg-muted transition-colors"
                @click="selectRecipe(recipe)"
              >
                <span class="flex-1 text-left">{{ recipe.label }}</span>
              </button>
            </template>

            <template v-if="recipesByPattern[pattern.key].defaults.length">
              <div class="px-3 pt-1.5 pb-0.5">
                <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Generic</span>
              </div>
              <button
                v-for="recipe in recipesByPattern[pattern.key].defaults"
                :key="recipe.id"
                class="w-full flex items-center gap-2 px-3 py-1.5 pl-8 text-xs hover:bg-muted transition-colors"
                @click="selectRecipe(recipe)"
              >
                <span class="flex-1 text-left">{{ recipe.label }}</span>
              </button>
            </template>
          </div>
        </div>
      </template>

      <template v-else>
        <button
          v-for="(info, type) in SECTION_TYPE_INFO"
          :key="type"
          class="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted transition-colors"
          @click="addBlankType(type as PageSectionType)"
        >
          <span class="flex-1 text-left">{{ info.label }}</span>
          <span class="text-[10px] text-muted-foreground">{{ info.description }}</span>
        </button>
      </template>

      <div class="border-t border-border p-1.5 flex gap-1">
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          @click="$emit('openGallery'); open = false"
        >
          <Library class="h-3 w-3" /> Browse Gallery
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          @click="$emit('pasteFromClipboard'); open = false"
        >
          <ClipboardPaste class="h-3 w-3" /> Paste
        </button>
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          @click="router.push('/dashboard/recipes'); open = false"
        >
          <BookmarkPlus class="h-3 w-3" /> Manage Recipes
        </button>
      </div>
    </div>
  </div>
</template>
