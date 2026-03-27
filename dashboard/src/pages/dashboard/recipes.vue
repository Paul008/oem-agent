<script lang="ts" setup>
import { onMounted, ref, computed } from 'vue'
import {
  Loader2, Plus, Pencil, Trash2, Copy, BookmarkPlus,
  ChevronDown, ChevronRight, AlertTriangle,
  Image, Grid3x3, SplitSquareHorizontal, Play,
  Columns3, Database, Megaphone, Layers,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { fetchAllRecipes, saveRecipe, deleteRecipe as apiDeleteRecipe } from '@/lib/worker-api'

interface BrandRecipe {
  id: string
  oem_id: string
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any> | null
  is_active: boolean
  created_at: string
}

interface DefaultRecipe {
  id: string
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any> | null
  created_at: string
}

interface MergedRecipe {
  id: string
  oem_id: string | null
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any> | null
  source: 'brand' | 'default'
  is_active?: boolean
}

const PATTERNS = [
  { key: 'hero', label: 'Hero', icon: Image },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
] as const

const SECTION_TYPES = [
  'hero', 'heading', 'intro', 'tabs', 'color-picker', 'specs-grid', 'gallery',
  'feature-cards', 'video', 'cta-banner', 'content-block', 'accordion',
  'enquiry-form', 'map', 'alert', 'divider', 'testimonial', 'comparison-table',
  'stats', 'logo-strip', 'embed', 'pricing-table', 'sticky-bar', 'countdown',
  'finance-calculator', 'image', 'image-showcase',
]

const { fetchOems } = useOemData()

const brandRecipes = ref<BrandRecipe[]>([])
const defaultRecipes = ref<DefaultRecipe[]>([])
const oems = ref<{ id: string; name: string }[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)
const filterOem = ref('all')
const expandedPattern = ref<string | null>(null)
const editingRecipe = ref<Partial<MergedRecipe> | null>(null)
const saving = ref(false)
const defaultsJsonText = ref('{}')

async function loadData() {
  loading.value = true
  loadError.value = null
  try {
    const [o, allRecipes] = await Promise.all([
      fetchOems(),
      fetchAllRecipes(),
    ])
    oems.value = o
    brandRecipes.value = (allRecipes.brand_recipes ?? []) as BrandRecipe[]
    defaultRecipes.value = (allRecipes.default_recipes ?? []) as DefaultRecipe[]
  } catch (err: any) {
    loadError.value = err.message || 'Failed to load recipes'
    toast.error(loadError.value!)
  } finally {
    loading.value = false
  }
}

onMounted(loadData)

const filteredRecipes = computed<MergedRecipe[]>(() => {
  const merged: MergedRecipe[] = []
  const brandKeys = new Set<string>()

  const filteredBrand = filterOem.value === 'all'
    ? brandRecipes.value
    : brandRecipes.value.filter(r => r.oem_id === filterOem.value)

  for (const r of filteredBrand) {
    brandKeys.add(`${r.pattern}::${r.variant}`)
    merged.push({
      id: r.id,
      oem_id: r.oem_id,
      pattern: r.pattern,
      variant: r.variant,
      label: r.label,
      resolves_to: r.resolves_to,
      defaults_json: r.defaults_json,
      source: 'brand',
      is_active: r.is_active,
    })
  }

  for (const r of defaultRecipes.value) {
    if (!brandKeys.has(`${r.pattern}::${r.variant}`)) {
      merged.push({
        id: r.id,
        oem_id: null,
        pattern: r.pattern,
        variant: r.variant,
        label: r.label,
        resolves_to: r.resolves_to,
        defaults_json: r.defaults_json,
        source: 'default',
      })
    }
  }

  return merged
})

const recipesByPattern = computed(() => {
  const grouped: Record<string, MergedRecipe[]> = {}
  for (const p of PATTERNS) grouped[p.key] = []
  for (const r of filteredRecipes.value) {
    if (grouped[r.pattern]) grouped[r.pattern].push(r)
  }
  return grouped
})

const totalCount = computed(() => filteredRecipes.value.length)

function togglePattern(pattern: string) {
  expandedPattern.value = expandedPattern.value === pattern ? null : pattern
}

function oemName(id: string) {
  return oems.value.find(o => o.id === id)?.name?.replace(' Australia', '') ?? id
}

function openNew() {
  editingRecipe.value = {
    oem_id: filterOem.value !== 'all' ? filterOem.value : undefined,
    pattern: 'hero',
    variant: '',
    label: '',
    resolves_to: 'hero',
    defaults_json: {},
    source: 'brand',
  }
  defaultsJsonText.value = '{}'
}

function openEdit(recipe: MergedRecipe) {
  editingRecipe.value = { ...recipe }
  defaultsJsonText.value = JSON.stringify(recipe.defaults_json ?? {}, null, 2)
}

function openDuplicate(recipe: MergedRecipe) {
  editingRecipe.value = {
    oem_id: undefined,
    pattern: recipe.pattern,
    variant: recipe.variant,
    label: `${recipe.label} (copy)`,
    resolves_to: recipe.resolves_to,
    defaults_json: recipe.defaults_json ? { ...recipe.defaults_json } : {},
    source: 'brand',
  }
  defaultsJsonText.value = JSON.stringify(recipe.defaults_json ?? {}, null, 2)
}

async function saveRecipe() {
  if (!editingRecipe.value) return
  const r = editingRecipe.value
  if (!r.oem_id || !r.pattern || !r.variant || !r.label || !r.resolves_to) {
    toast.error('All fields are required')
    return
  }

  let parsedJson: Record<string, any> = {}
  try {
    parsedJson = JSON.parse(defaultsJsonText.value)
  } catch {
    toast.error('Invalid JSON in defaults')
    return
  }

  saving.value = true
  try {
    const payload = {
      oem_id: r.oem_id,
      pattern: r.pattern,
      variant: r.variant,
      label: r.label,
      resolves_to: r.resolves_to,
      defaults_json: parsedJson,
      is_active: true,
    }

    await saveRecipe(payload as any)
    toast.success(r.id && r.source === 'brand' ? 'Recipe updated' : 'Recipe created')

    editingRecipe.value = null
    await loadData()
  } catch (err: any) {
    toast.error(err.message || 'Failed to save recipe')
  } finally {
    saving.value = false
  }
}

async function deleteRecipe(id: string) {
  try {
    await apiDeleteRecipe(id)
    toast.success('Recipe deleted')
    await loadData()
  } catch (err: any) {
    toast.error(err.message || 'Failed to delete recipe')
  }
}
</script>

<template>
  <BasicPage title="Recipes" description="Manage section recipes for each OEM. Brand recipes override defaults." sticky>
    <!-- Filters -->
    <div class="flex items-center gap-4 mb-4 flex-wrap">
      <UiSelect v-model="filterOem">
        <UiSelectTrigger class="w-[200px]">
          <UiSelectValue placeholder="Filter by OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value="all">All OEMs</UiSelectItem>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-sm text-muted-foreground">{{ totalCount }} recipes</span>
      <div class="flex-1" />
      <UiButton size="sm" @click="openNew">
        <Plus class="size-4 mr-1" /> Add Recipe
      </UiButton>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin" />
    </div>

    <div v-else-if="loadError" class="flex flex-col items-center justify-center h-64 gap-2">
      <AlertTriangle class="size-8 text-destructive" />
      <p class="text-sm text-muted-foreground">{{ loadError }}</p>
    </div>

    <div v-else class="space-y-2">
      <UiCard v-for="pattern in PATTERNS" :key="pattern.key">
        <button
          class="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
          @click="togglePattern(pattern.key)"
        >
          <component :is="pattern.icon" class="size-4 text-muted-foreground" />
          <span class="font-medium text-sm">{{ pattern.label }}</span>
          <UiBadge variant="secondary" class="text-xs ml-1">
            {{ recipesByPattern[pattern.key]?.length ?? 0 }}
          </UiBadge>
          <div class="flex-1" />
          <component
            :is="expandedPattern === pattern.key ? ChevronDown : ChevronRight"
            class="size-4 text-muted-foreground"
          />
        </button>

        <div v-if="expandedPattern === pattern.key && recipesByPattern[pattern.key]?.length" class="border-t">
          <div class="overflow-x-auto">
            <UiTable>
              <UiTableHeader>
                <UiTableRow>
                  <UiTableHead>Label</UiTableHead>
                  <UiTableHead>Variant</UiTableHead>
                  <UiTableHead>Resolves To</UiTableHead>
                  <UiTableHead>Source</UiTableHead>
                  <UiTableHead class="text-right">Actions</UiTableHead>
                </UiTableRow>
              </UiTableHeader>
              <UiTableBody>
                <UiTableRow
                  v-for="recipe in recipesByPattern[pattern.key]"
                  :key="recipe.id"
                  :class="recipe.source === 'brand' ? 'border-l-2 border-l-primary' : ''"
                >
                  <UiTableCell class="font-medium text-sm">
                    {{ recipe.label }}
                    <span v-if="recipe.oem_id" class="text-xs text-muted-foreground ml-1">
                      ({{ oemName(recipe.oem_id) }})
                    </span>
                  </UiTableCell>
                  <UiTableCell class="text-sm font-mono text-muted-foreground">
                    {{ recipe.variant }}
                  </UiTableCell>
                  <UiTableCell>
                    <UiBadge variant="outline" class="text-xs">{{ recipe.resolves_to }}</UiBadge>
                  </UiTableCell>
                  <UiTableCell>
                    <UiBadge
                      :variant="recipe.source === 'brand' ? 'default' : 'secondary'"
                      class="text-[10px]"
                    >
                      {{ recipe.source }}
                    </UiBadge>
                  </UiTableCell>
                  <UiTableCell class="text-right">
                    <div class="flex items-center justify-end gap-1">
                      <UiButton
                        v-if="recipe.source === 'brand'"
                        variant="ghost"
                        size="icon"
                        class="size-7"
                        @click.stop="openEdit(recipe)"
                      >
                        <Pencil class="size-3.5" />
                      </UiButton>
                      <UiButton
                        variant="ghost"
                        size="icon"
                        class="size-7"
                        @click.stop="openDuplicate(recipe)"
                      >
                        <Copy class="size-3.5" />
                      </UiButton>
                      <UiButton
                        v-if="recipe.source === 'brand'"
                        variant="ghost"
                        size="icon"
                        class="size-7 text-destructive hover:text-destructive"
                        @click.stop="deleteRecipe(recipe.id)"
                      >
                        <Trash2 class="size-3.5" />
                      </UiButton>
                    </div>
                  </UiTableCell>
                </UiTableRow>
              </UiTableBody>
            </UiTable>
          </div>
        </div>

        <div
          v-else-if="expandedPattern === pattern.key"
          class="border-t px-4 py-6 text-center"
        >
          <p class="text-sm text-muted-foreground">No recipes for this pattern</p>
        </div>
      </UiCard>
    </div>

    <div v-if="filteredRecipes.length === 0 && !loading && !loadError" class="text-center py-16">
      <BookmarkPlus class="size-10 text-muted-foreground/30 mx-auto mb-3" />
      <p class="text-sm text-muted-foreground">No recipes found matching your filters</p>
    </div>

    <!-- Edit/Create Dialog -->
    <div
      v-if="editingRecipe"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="editingRecipe = null"
    >
      <div class="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4 p-6 space-y-4">
        <h2 class="text-lg font-semibold">
          {{ editingRecipe.id && editingRecipe.source === 'brand' ? 'Edit Recipe' : 'New Recipe' }}
        </h2>

        <div class="space-y-3">
          <div>
            <label class="text-sm font-medium mb-1 block">OEM</label>
            <UiSelect v-model="editingRecipe.oem_id">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="Select OEM" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
                  {{ oem.name?.replace(' Australia', '') }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Pattern</label>
            <UiSelect v-model="editingRecipe.pattern">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="Select pattern" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="p in PATTERNS" :key="p.key" :value="p.key">
                  {{ p.label }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Variant</label>
            <UiInput v-model="editingRecipe.variant" placeholder="e.g. default, compact, wide" />
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Label</label>
            <UiInput v-model="editingRecipe.label" placeholder="Human-readable label" />
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Resolves To</label>
            <UiSelect v-model="editingRecipe.resolves_to">
              <UiSelectTrigger class="w-full">
                <UiSelectValue placeholder="Select section type" />
              </UiSelectTrigger>
              <UiSelectContent>
                <UiSelectItem v-for="st in SECTION_TYPES" :key="st" :value="st">
                  {{ st }}
                </UiSelectItem>
              </UiSelectContent>
            </UiSelect>
          </div>

          <div>
            <label class="text-sm font-medium mb-1 block">Defaults JSON</label>
            <UiTextarea
              v-model="defaultsJsonText"
              rows="5"
              class="font-mono text-xs"
              placeholder='{"key": "value"}'
            />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UiButton variant="outline" @click="editingRecipe = null">Cancel</UiButton>
          <UiButton :disabled="saving" @click="saveRecipe">
            <Loader2 v-if="saving" class="size-4 mr-1 animate-spin" />
            Save
          </UiButton>
        </div>
      </div>
    </div>
  </BasicPage>
</template>
