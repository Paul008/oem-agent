<script lang="ts" setup>
import { onMounted, ref, computed, watch } from 'vue'
import { Loader2, Eye, Wand2, Save, X, Plus, Trash2, GripVertical, Monitor, Tablet, Smartphone } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { fetchStyleGuide, generateRecipeComponent, saveRecipe, type StyleGuideData, type ExtractedRecipe } from '@/lib/worker-api'

const { fetchOems } = useOemData()

const oems = ref<{ id: string; name: string }[]>([])
const selectedOem = ref('')
const loading = ref(false)
const data = ref<StyleGuideData | null>(null)

const PATTERNS = [
  { key: 'hero', label: 'Hero' },
  { key: 'card-grid', label: 'Card Grid' },
  { key: 'split-content', label: 'Split Content' },
  { key: 'media', label: 'Media' },
  { key: 'tabs', label: 'Tabs' },
  { key: 'data-display', label: 'Data Display' },
  { key: 'action-bar', label: 'Action Bar' },
  { key: 'utility', label: 'Utility' },
]

const SLOTS = ['image', 'icon', 'logo', 'stat', 'title', 'subtitle', 'body', 'badge', 'rating', 'cta']

// Selected recipe for refinement
const selectedRecipe = ref<any>(null)
const editDefaults = ref<Record<string, any>>({})
const previewHtml = ref<string | null>(null)
const regenerating = ref(false)
const saving = ref(false)
const previewViewport = ref<'desktop' | 'tablet' | 'mobile'>('desktop')
const viewportWidths = { desktop: '100%', tablet: '768px', mobile: '375px' }

onMounted(async () => {
  const o = await fetchOems()
  oems.value = o
  if (o.length) {
    const toyota = o.find(x => x.id === 'toyota-au')
    selectedOem.value = toyota?.id ?? o[0].id
  }
})

watch(selectedOem, async (oemId) => {
  if (!oemId) return
  loading.value = true
  data.value = null
  selectedRecipe.value = null
  previewHtml.value = null
  try {
    data.value = await fetchStyleGuide(oemId)
  } catch {
    toast.error('Failed to load recipes')
  } finally {
    loading.value = false
  }
}, { immediate: true })

const allRecipes = computed(() => {
  if (!data.value) return []
  const brand = (data.value.brand_recipes || []).map((r: any) => ({ ...r, source: 'brand' }))
  const defaults = (data.value.default_recipes || []).map((r: any) => ({ ...r, source: 'default' }))
  return [...brand, ...defaults]
})

const recipesByPattern = computed(() => {
  const grouped: Record<string, any[]> = {}
  for (const p of PATTERNS) grouped[p.key] = []
  for (const r of allRecipes.value) {
    if (grouped[r.pattern]) grouped[r.pattern].push(r)
  }
  return grouped
})

const tokens = computed(() => data.value?.brand_tokens ?? null)

function selectRecipe(recipe: any) {
  selectedRecipe.value = recipe
  editDefaults.value = JSON.parse(JSON.stringify(recipe.defaults_json || {}))
  previewHtml.value = null
}

function buildSrcdoc(html: string): string {
  const fontFaces = tokens.value?.typography?.font_faces?.map((f: any) => {
    const ext = f.url?.split('.').pop()?.toLowerCase()
    const fmt = ext === 'woff2' ? 'woff2' : 'woff'
    return `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; src: url('${f.url}') format('${fmt}'); font-display: swap; }`
  }).join('\n') || ''

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<script src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js" defer><\/script>
<style>
${fontFaces}
body { font-family: ${tokens.value?.typography?.font_primary || 'system-ui, sans-serif'}; margin: 0; }
</style>
</head>
<body>${html}</body>
</html>`
}

async function handleRegenerate() {
  if (!selectedRecipe.value || !selectedOem.value || regenerating.value) return
  regenerating.value = true
  previewHtml.value = null
  try {
    const recipe = { ...selectedRecipe.value, defaults_json: editDefaults.value }
    const result = await generateRecipeComponent(selectedOem.value, recipe as ExtractedRecipe)
    if (result.success && result.template_html) {
      previewHtml.value = result.template_html
    } else {
      toast.error(result.error || 'Generation failed')
    }
  } catch (err: any) {
    toast.error(err.message || 'Generation failed')
  } finally {
    regenerating.value = false
  }
}

async function handleSave() {
  if (!selectedRecipe.value || !selectedOem.value || saving.value) return
  saving.value = true
  try {
    await saveRecipe({
      oem_id: selectedOem.value,
      pattern: selectedRecipe.value.pattern,
      variant: selectedRecipe.value.variant,
      label: selectedRecipe.value.label,
      resolves_to: selectedRecipe.value.resolves_to,
      defaults_json: editDefaults.value,
    })
    // Update local data
    selectedRecipe.value.defaults_json = JSON.parse(JSON.stringify(editDefaults.value))
    toast.success('Recipe saved')
  } catch (err: any) {
    toast.error(err.message || 'Save failed')
  } finally {
    saving.value = false
  }
}

// Composition helpers
function addSlot(slot: string) {
  if (!editDefaults.value.card_composition) editDefaults.value.card_composition = []
  editDefaults.value.card_composition.push(slot)
}

function removeSlot(index: number) {
  editDefaults.value.card_composition?.splice(index, 1)
}
</script>

<template>
  <BasicPage title="Recipe Refinement Studio" description="Compare OEM originals with recipe output — adjust and perfect each recipe.">
    <!-- OEM Selector -->
    <div class="flex items-center gap-4 mb-4">
      <UiSelect v-model="selectedOem">
        <UiSelectTrigger class="w-[240px]">
          <UiSelectValue placeholder="Select OEM" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem v-for="oem in oems" :key="oem.id" :value="oem.id">
            {{ oem.name?.replace(' Australia', '') }}
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span class="text-xs text-muted-foreground">{{ allRecipes.length }} recipes</span>
    </div>

    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="data" class="flex gap-4" style="height: calc(100vh - 200px);">
      <!-- ═══ LEFT: Recipe List ═══ -->
      <div class="w-64 shrink-0 border rounded-lg overflow-y-auto">
        <template v-for="pattern in PATTERNS" :key="pattern.key">
          <div v-if="recipesByPattern[pattern.key]?.length">
            <div class="px-3 py-2 bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sticky top-0">
              {{ pattern.label }} ({{ recipesByPattern[pattern.key].length }})
            </div>
            <button
              v-for="recipe in recipesByPattern[pattern.key]"
              :key="`${recipe.pattern}::${recipe.variant}`"
              class="w-full px-3 py-2 text-left text-sm hover:bg-muted/50 border-b flex items-center gap-2"
              :class="selectedRecipe?.variant === recipe.variant && selectedRecipe?.pattern === recipe.pattern ? 'bg-primary/10 border-l-2 border-l-primary' : ''"
              @click="selectRecipe(recipe)"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-xs">{{ recipe.label }}</p>
                <p class="text-[10px] text-muted-foreground truncate">{{ recipe.variant }}</p>
              </div>
              <span
                v-if="recipe.defaults_json?.thumbnail_url"
                class="size-2 rounded-full bg-green-500 shrink-0"
                title="Has OEM reference"
              />
            </button>
          </div>
        </template>
      </div>

      <!-- ═══ MAIN: Stacked Refinement Panels ═══ -->
      <div v-if="selectedRecipe" class="flex-1 overflow-y-auto space-y-4 min-w-0">

        <!-- Header + Actions -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <h2 class="text-lg font-semibold">{{ selectedRecipe.label }}</h2>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{{ selectedRecipe.pattern }}</span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{{ selectedRecipe.variant }}</span>
          </div>
          <div class="flex gap-2">
            <UiButton size="sm" :disabled="regenerating" @click="handleRegenerate">
              <Loader2 v-if="regenerating" class="size-3.5 mr-1 animate-spin" />
              <Wand2 v-else class="size-3.5 mr-1" />
              {{ regenerating ? 'Generating...' : 'Regenerate' }}
            </UiButton>
            <UiButton size="sm" variant="outline" :disabled="saving" @click="handleSave">
              <Loader2 v-if="saving" class="size-3.5 mr-1 animate-spin" />
              <Save v-else class="size-3.5 mr-1" />
              Save
            </UiButton>
          </div>
        </div>

        <!-- Panel 1: OEM Reference (full width) -->
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-2 bg-muted/50 text-xs font-medium border-b flex items-center gap-1">
            <Eye class="size-3" /> OEM Original
          </div>
          <div v-if="selectedRecipe.defaults_json?.thumbnail_url" class="bg-muted/10">
            <img
              :src="selectedRecipe.defaults_json.thumbnail_url"
              class="w-full object-contain"
              style="max-height: 400px;"
            />
          </div>
          <div v-else class="py-8 text-center text-xs text-muted-foreground">
            <Eye class="size-6 mx-auto opacity-20 mb-2" />
            <p>No OEM reference — extract from URL on the Style Guide page to capture one</p>
          </div>
        </div>

        <!-- Panel 2: Recipe Controls (full width, horizontal layout) -->
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-2 bg-muted/50 text-xs font-medium border-b">Recipe Controls</div>
          <div class="p-4">

            <!-- Hero Controls -->
            <div v-if="selectedRecipe.pattern === 'hero'" class="grid grid-cols-3 gap-6">
              <div class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Heading Size</label>
                <select v-model="editDefaults.heading_size" class="w-full rounded border bg-background px-2 py-1.5 text-xs">
                  <option value="3xl">3xl</option>
                  <option value="4xl">4xl</option>
                  <option value="5xl">5xl</option>
                  <option value="6xl">6xl</option>
                </select>
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Overlay Position</label>
                <select v-model="editDefaults.overlay_position" class="w-full rounded border bg-background px-2 py-1.5 text-xs">
                  <option value="bottom-left">Bottom Left</option>
                  <option value="bottom-center">Bottom Center</option>
                  <option value="center">Center</option>
                  <option value="top-left">Top Left</option>
                  <option value="top-center">Top Center</option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Text Color</label>
                <input v-model="editDefaults.text_color" type="text" class="w-full rounded border bg-background px-2 py-1 text-xs" placeholder="#ffffff" />
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Text Align</label>
                <select v-model="editDefaults.text_align" class="w-full rounded border bg-background px-2 py-1.5 text-xs">
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Min Height</label>
                <input v-model="editDefaults.min_height" type="text" class="w-full rounded border bg-background px-2 py-1 text-xs" placeholder="600px" />
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Show Overlay</label>
                <input v-model="editDefaults.show_overlay" type="checkbox" />
              </div>
            </div>

            <!-- Card Grid Controls -->
            <div v-else-if="selectedRecipe.pattern === 'card-grid'" class="grid grid-cols-3 gap-6">
              <div class="space-y-3">
                <div>
                  <label class="text-[10px] font-semibold text-muted-foreground uppercase">Columns</label>
                  <select v-model.number="editDefaults.columns" class="w-full mt-1 rounded border bg-background px-2 py-1.5 text-xs">
                    <option :value="2">2 columns</option>
                    <option :value="3">3 columns</option>
                    <option :value="4">4 columns</option>
                  </select>
                </div>
                <div v-if="editDefaults.card_composition">
                  <label class="text-[10px] font-semibold text-muted-foreground uppercase">Card Composition</label>
                  <div class="space-y-1 mt-1">
                    <div v-for="(slot, idx) in editDefaults.card_composition" :key="idx" class="flex items-center gap-1 text-xs bg-muted/50 rounded px-2 py-1">
                      <GripVertical class="size-3 text-muted-foreground" />
                      <span class="flex-1 font-mono">{{ slot }}</span>
                      <button @click="removeSlot(idx)" class="text-muted-foreground hover:text-destructive"><X class="size-3" /></button>
                    </div>
                  </div>
                  <select class="w-full mt-1 rounded border bg-background px-2 py-1 text-xs" @change="(e: any) => { if (e.target.value) { addSlot(e.target.value); e.target.value = '' } }">
                    <option value="">+ Add slot...</option>
                    <option v-for="s in SLOTS.filter(s => !editDefaults.card_composition?.includes(s))" :key="s" :value="s">{{ s }}</option>
                  </select>
                </div>
              </div>
              <div v-if="editDefaults.card_style" class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Card Style</label>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Background</label><input v-model="editDefaults.card_style.background" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Border</label><input v-model="editDefaults.card_style.border" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Radius</label><input v-model.number="editDefaults.card_style.border_radius" type="number" class="w-16 rounded border bg-background px-2 py-1 text-xs" /><span class="text-[10px] text-muted-foreground">px</span></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Shadow</label><input v-model="editDefaults.card_style.shadow" type="checkbox" /></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Text Align</label><select v-model="editDefaults.card_style.text_align" class="flex-1 rounded border bg-background px-2 py-1 text-xs"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
              </div>
              <div v-if="editDefaults.section_style" class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Section Style</label>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Background</label><input v-model="editDefaults.section_style.background" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Padding</label><input v-model="editDefaults.section_style.padding" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
              </div>
            </div>

            <!-- Action Bar / Split Content / Generic Controls -->
            <div v-else class="grid grid-cols-3 gap-6">
              <div class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Background Color</label>
                <input v-model="editDefaults.background_color" type="text" class="w-full rounded border bg-background px-2 py-1 text-xs" placeholder="#000000" />
              </div>
              <div v-if="editDefaults.section_style" class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Section Style</label>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Background</label><input v-model="editDefaults.section_style.background" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
                <div class="flex items-center gap-2"><label class="text-[10px] w-20">Padding</label><input v-model="editDefaults.section_style.padding" type="text" class="flex-1 rounded border bg-background px-2 py-1 text-xs" /></div>
              </div>
              <div class="space-y-2">
                <label class="text-[10px] font-semibold text-muted-foreground uppercase">Layout</label>
                <select v-model="editDefaults.layout" class="w-full rounded border bg-background px-2 py-1.5 text-xs">
                  <option value="contained">Contained</option>
                  <option value="full-width">Full Width</option>
                  <option value="two-column">Two Column</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <!-- Panel 3: Live Preview (full width — heroes/carousels need space) -->
        <div class="border rounded-lg overflow-hidden">
          <div class="px-4 py-2 bg-muted/50 text-xs font-medium border-b flex items-center justify-between">
            <span class="flex items-center gap-1"><Wand2 class="size-3" /> Live Preview</span>
            <div class="flex items-center gap-1 bg-muted rounded-md p-0.5">
              <button
                class="p-1 rounded"
                :class="previewViewport === 'desktop' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
                @click="previewViewport = 'desktop'"
                title="Desktop (100%)"
              ><Monitor class="size-3.5" /></button>
              <button
                class="p-1 rounded"
                :class="previewViewport === 'tablet' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
                @click="previewViewport = 'tablet'"
                title="Tablet (768px)"
              ><Tablet class="size-3.5" /></button>
              <button
                class="p-1 rounded"
                :class="previewViewport === 'mobile' ? 'bg-background shadow-sm' : 'hover:bg-background/50'"
                @click="previewViewport = 'mobile'"
                title="Mobile (375px)"
              ><Smartphone class="size-3.5" /></button>
            </div>
          </div>
          <div class="bg-muted/20 flex justify-center py-4" :class="previewViewport !== 'desktop' ? 'px-4' : ''">
            <div
              class="bg-white transition-all duration-300"
              :style="{ width: viewportWidths[previewViewport], maxWidth: '100%' }"
              :class="previewViewport !== 'desktop' ? 'border rounded-lg shadow-lg overflow-hidden' : 'w-full'"
            >
              <div v-if="regenerating" class="py-20 flex items-center justify-center">
                <Loader2 class="size-6 animate-spin text-muted-foreground" />
              </div>
              <iframe
                v-else-if="previewHtml"
                :srcdoc="buildSrcdoc(previewHtml)"
                class="w-full"
                style="min-height: 500px;"
                sandbox="allow-scripts"
              />
              <div v-else class="py-20 flex items-center justify-center text-xs text-muted-foreground">
                Click Regenerate to preview
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- No recipe selected -->
      <div v-else class="flex-1 flex items-center justify-center border rounded-lg">
        <div class="text-center space-y-2">
          <Eye class="size-10 mx-auto text-muted-foreground/20" />
          <p class="text-sm text-muted-foreground">Select a recipe from the list to open the refinement studio</p>
        </div>
      </div>
    </div>
  </BasicPage>
</template>
