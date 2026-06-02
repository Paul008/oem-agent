<script lang="ts" setup>
import { AlertCircle, ArrowLeft, CheckCircle2, ChevronRight, Download, FileJson, Globe, RefreshCw, Wrench } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import ConfirmDialog from '@/components/confirm-dialog.vue'
import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { importLegacyPage, previewLegacyImport } from '@/lib/worker-api'

const router = useRouter()
const { fetchOems, fetchVehicleModels } = useOemData()

// Form state
const oems = ref<{ id: string, name: string }[]>([])
const allModels = ref<Array<{ id: string, oem_id: string, slug: string, name: string }>>([])
const selectedOem = ref('')
const modelSlug = ref('')
const inputMode = ref<'url' | 'json'>('url')
const legacyUrl = ref('')
const legacyJson = ref('')
const loadingOems = ref(true)

// Action state
const previewing = ref(false)
const importing = ref(false)
const showConfirmDialog = ref(false)

// Result state
const previewResult = ref<any>(null)
const importResult = ref<any>(null)
const error = ref<string | null>(null)

// Filter models by selected OEM
const modelsForOem = computed(() => {
  if (!selectedOem.value)
    return []
  return allModels.value
    .filter(m => m.oem_id === selectedOem.value)
    .sort((a, b) => a.name.localeCompare(b.name))
})

const selectedModelName = computed(() => {
  if (!selectedOem.value || !modelSlug.value)
    return ''
  return modelsForOem.value.find(m => m.slug === modelSlug.value)?.name || ''
})

const isFormValid = computed(() => {
  if (!selectedOem.value || !modelSlug.value)
    return false
  if (inputMode.value === 'url')
    return legacyUrl.value.trim().length > 0
  return legacyJson.value.trim().length > 0
})

onMounted(async () => {
  try {
    const [oemList, models] = await Promise.all([
      fetchOems(),
      fetchVehicleModels(),
    ])
    oems.value = oemList
    allModels.value = models
  }
  catch (err: any) {
    error.value = `Failed to load OEMs: ${err?.message || 'Unknown error'}`
  }
  finally {
    loadingOems.value = false
  }
})

function reset() {
  previewResult.value = null
  importResult.value = null
  error.value = null
}

function fillModelSlug(slug: string) {
  modelSlug.value = slug
  reset()
}

async function handlePreview() {
  if (!isFormValid.value)
    return
  reset()
  previewing.value = true
  try {
    const result = await previewLegacyImport(
      inputMode.value === 'url' ? legacyUrl.value.trim() : undefined,
      inputMode.value === 'json' ? JSON.parse(legacyJson.value.trim()) : undefined,
    )
    previewResult.value = result
  }
  catch (err: any) {
    error.value = err?.message || 'Preview failed'
  }
  finally {
    previewing.value = false
  }
}

async function handleImport() {
  if (!isFormValid.value)
    return
  showConfirmDialog.value = true
}

async function doImport() {
  importing.value = true
  error.value = null
  try {
    const result = await importLegacyPage(
      selectedOem.value,
      modelSlug.value,
      inputMode.value === 'url' ? legacyUrl.value.trim() : undefined,
      inputMode.value === 'json' ? JSON.parse(legacyJson.value.trim()) : undefined,
    )
    importResult.value = result
    toast.success(`Imported ${result.sections_count} sections for ${result.modelSlug}`)
  }
  catch (err: any) {
    const msg = err?.message || 'Import failed'
    error.value = msg
    toast.error(msg)
  }
  finally {
    importing.value = false
  }
}

function handleConfirmImport() {
  showConfirmDialog.value = false
  doImport()
}

function goToPageBuilder() {
  const slug = `${selectedOem.value}-${modelSlug.value}`
  router.push(`/dashboard/page-builder/${slug}`)
}

function goToModelPages() {
  router.push('/dashboard/model-pages')
}

const sectionTypeColors: Record<string, string> = {
  'hero': 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  'image': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'heading': 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  'content-block': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  'split-content': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'feature-cards': 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'card-grid': 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
  'image-showcase': 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'video': 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
}

function sectionTypeColor(type: string): string {
  return sectionTypeColors[type] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}
</script>

<template>
  <BasicPage title="Legacy Import" description="Import UIkit-based vehicle pages into the page builder" sticky>
    <div class="max-w-3xl">
      <!-- Back link -->
      <button
        class="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        @click="goToModelPages"
      >
        <ArrowLeft class="size-4" />
        Back to Model Pages
      </button>

      <!-- Form Card -->
      <UiCard>
        <UiCardHeader>
          <UiCardTitle class="flex items-center gap-2">
            <Download class="size-5 text-primary" />
            Import Legacy Page
          </UiCardTitle>
          <UiCardDescription>
            Convert a WordPress + UIkit vehicle JSON into structured page builder sections.
          </UiCardDescription>
        </UiCardHeader>
        <UiCardContent class="space-y-5">
          <!-- OEM + Model -->
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-2">
              <UiLabel>OEM</UiLabel>
              <UiSelect v-model="selectedOem" @update:model-value="modelSlug = ''; reset()">
                <UiSelectTrigger :disabled="loadingOems">
                  <UiSelectValue placeholder="Select OEM" />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem
                    v-for="oem in oems"
                    :key="oem.id"
                    :value="oem.id"
                  >
                    {{ oem.name }}
                  </UiSelectItem>
                </UiSelectContent>
              </UiSelect>
            </div>
            <div class="space-y-2">
              <UiLabel>Model</UiLabel>
              <UiSelect v-model="modelSlug" :disabled="!selectedOem" @update:model-value="(v) => fillModelSlug(String(v))">
                <UiSelectTrigger>
                  <UiSelectValue placeholder="Select model" />
                </UiSelectTrigger>
                <UiSelectContent>
                  <UiSelectItem
                    v-for="model in modelsForOem"
                    :key="model.id"
                    :value="model.slug"
                  >
                    {{ model.name }}
                  </UiSelectItem>
                </UiSelectContent>
              </UiSelect>
            </div>
          </div>

          <!-- Manual slug override -->
          <div class="space-y-2">
            <UiLabel>Model Slug</UiLabel>
            <UiInput
              v-model="modelSlug"
              placeholder="e.g. ranger-raptor"
              @input="reset"
            />
            <p class="text-xs text-muted-foreground">
              The slug the imported page will be saved under. Select from dropdown or type manually.
            </p>
          </div>

          <!-- Input mode toggle -->
          <div class="space-y-2">
            <UiLabel>Source</UiLabel>
            <div class="inline-flex rounded-md border overflow-hidden">
              <button
                class="flex items-center gap-1.5 px-3 py-2 text-sm transition-colors"
                :class="inputMode === 'url' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
                @click="inputMode = 'url'; reset()"
              >
                <Globe class="size-4" />
                URL
              </button>
              <button
                class="flex items-center gap-1.5 px-3 py-2 text-sm border-l transition-colors"
                :class="inputMode === 'json' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
                @click="inputMode = 'json'; reset()"
              >
                <FileJson class="size-4" />
                JSON
              </button>
            </div>
          </div>

          <!-- URL input -->
          <div v-if="inputMode === 'url'" class="space-y-2">
            <UiLabel>Legacy JSON URL</UiLabel>
            <UiInput
              v-model="legacyUrl"
              placeholder="https://example.com/wp-json/vehicle/v1/model/..."
              @input="reset"
            />
            <p class="text-xs text-muted-foreground">
              Direct URL to the legacy vehicle JSON endpoint.
            </p>
          </div>

          <!-- JSON input -->
          <div v-else class="space-y-2">
            <UiLabel>Legacy JSON</UiLabel>
            <UiTextarea
              v-model="legacyJson"
              placeholder="Paste the legacy vehicle JSON here..."
              rows="10"
              class="font-mono text-sm"
              @input="reset"
            />
            <p class="text-xs text-muted-foreground">
              Paste the full JSON object from the legacy CMS.
            </p>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-3 pt-2">
            <UiButton
              variant="outline"
              :disabled="!isFormValid || previewing || importing"
              @click="handlePreview"
            >
              <RefreshCw class="size-4 mr-1.5" :class="previewing ? 'animate-spin' : ''" />
              Preview
            </UiButton>
            <UiButton
              :disabled="!isFormValid || previewing || importing"
              @click="handleImport"
            >
              <Download class="size-4 mr-1.5" />
              {{ importing ? 'Importing...' : 'Import' }}
            </UiButton>
          </div>
        </UiCardContent>
      </UiCard>

      <!-- Error -->
      <UiAlert v-if="error" variant="destructive" class="mt-6">
        <AlertCircle class="size-4" />
        <UiAlertTitle>Import failed</UiAlertTitle>
        <UiAlertDescription>{{ error }}</UiAlertDescription>
      </UiAlert>

      <!-- Preview Results -->
      <template v-if="previewResult && !importResult">
        <UiCard class="mt-6">
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Wrench class="size-5 text-primary" />
              Preview: {{ previewResult.name || 'Untitled' }}
              <!-- eslint-disable-next-line vue/valid-v-for -->
            </UiCardTitle>
            <UiCardDescription>
              {{ previewResult.sections_count }} section(s) would be created.
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-4">
            <!-- Section list -->
            <div class="space-y-2">
              <div
                v-for="(section, idx) in previewResult.sections"
                :key="idx"
                class="flex items-center gap-3 p-3 rounded-lg border"
              >
                <span class="text-xs font-mono text-muted-foreground w-6">{{ Number(idx) + 1 }}</span>
                <span
                  class="text-xs font-medium px-2 py-0.5 rounded-full capitalize"
                  :class="sectionTypeColor(section.type)"
                >
                  {{ section.type }}
                </span>
                <span class="text-sm truncate">
                  {{ section.heading || section.title || section.id }}
                </span>
                <ChevronRight class="size-4 text-muted-foreground ml-auto shrink-0" />
              </div>
            </div>

            <!-- Warnings -->
            <UiAlert v-if="previewResult.warnings?.length" variant="default">
              <AlertCircle class="size-4" />
              <UiAlertTitle>{{ previewResult.warnings.length }} warning(s)</UiAlertTitle>
              <UiAlertDescription>
                <ul class="list-disc list-inside mt-1 space-y-0.5">
                  <li v-for="(w, i) in previewResult.warnings" :key="i" class="text-sm">
                    {{ w }}
                  </li>
                </ul>
              </UiAlertDescription>
            </UiAlert>
          </UiCardContent>
        </UiCard>
      </template>

      <!-- Import Success -->
      <template v-if="importResult">
        <UiCard class="mt-6 border-emerald-200 dark:border-emerald-800">
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 class="size-5" />
              Import Successful
            </UiCardTitle>
            <UiCardDescription>
              {{ importResult.sections_count }} section(s) imported for
              <span class="font-medium">{{ importResult.modelSlug }}</span>
              (version {{ importResult.version }})
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-4">
            <!-- Section types -->
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(type, idx) in importResult.section_types"
                :key="idx"
                class="text-xs font-medium px-2.5 py-1 rounded-full capitalize"
                :class="sectionTypeColor(type)"
              >
                {{ type }}
              </span>
            </div>

            <!-- Warnings -->
            <UiAlert v-if="importResult.warnings?.length" variant="default">
              <AlertCircle class="size-4" />
              <UiAlertTitle>{{ importResult.warnings.length }} warning(s)</UiAlertTitle>
              <UiAlertDescription>
                <ul class="list-disc list-inside mt-1 space-y-0.5">
                  <li v-for="(w, i) in importResult.warnings" :key="i" class="text-sm">
                    {{ w }}
                  </li>
                </ul>
              </UiAlertDescription>
            </UiAlert>

            <!-- Actions -->
            <div class="flex items-center gap-3 pt-2">
              <UiButton @click="goToPageBuilder">
                Open in Page Builder
                <ChevronRight class="size-4 ml-1" />
              </UiButton>
              <UiButton variant="outline" @click="reset">
                Import Another
              </UiButton>
            </div>
          </UiCardContent>
        </UiCard>
      </template>
    </div>

    <!-- Confirm Import Dialog -->
    <ConfirmDialog
      v-model:open="showConfirmDialog"
      title="Import Legacy Page"
      confirm-label="Import"
      @confirm="handleConfirmImport"
    >
      <template #description>
        <p>
          Import legacy page for <strong>{{ selectedModelName || modelSlug }}</strong>?
          This will overwrite any existing page for this model.
        </p>
      </template>
    </ConfirmDialog>
  </BasicPage>
</template>
