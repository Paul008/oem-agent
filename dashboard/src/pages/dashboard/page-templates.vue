<script lang="ts" setup>
import { Check, LayoutTemplate, Loader2, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { useOemData } from '@/composables/use-oem-data'
import { applyPageTemplate, fetchPageTemplates } from '@/lib/worker-api'

const router = useRouter()
const { fetchOems } = useOemData()

const loading = ref(true)
const templates = ref<any[]>([])
const oems = ref<{ id: string, name: string }[]>([])
const selectedCategory = ref('')

const showApplyDialog = ref(false)
const selectedTemplate = ref<any>(null)
const applyOemId = ref('')
const applyModelSlug = ref('')
const applying = ref(false)

onMounted(async () => {
  try {
    const [tpl, oemList] = await Promise.all([fetchPageTemplates(), fetchOems()])
    templates.value = tpl.templates
    oems.value = oemList
  }
  catch {
    toast.error('Failed to load templates')
  }
  finally {
    loading.value = false
  }
})

const categories = computed(() => {
  const cats = new Set(templates.value.map(t => t.category))
  return Array.from(cats)
})

const filtered = computed(() => {
  if (!selectedCategory.value)
    return templates.value
  return templates.value.filter(t => t.category === selectedCategory.value)
})

function openApply(template: any) {
  selectedTemplate.value = template
  applyOemId.value = ''
  applyModelSlug.value = ''
  showApplyDialog.value = true
}

async function handleApply() {
  if (!selectedTemplate.value || !applyOemId.value || !applyModelSlug.value)
    return
  applying.value = true
  try {
    const slug = applyModelSlug.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
    const result = await applyPageTemplate(selectedTemplate.value.id, applyOemId.value, slug)
    if (result.success) {
      toast.success(`Page created: ${slug} (${result.sections} sections)`)
      showApplyDialog.value = false
      router.push(`/dashboard/model-pages`)
    }
  }
  catch (err: any) {
    toast.error(err.message || 'Failed to create page')
  }
  finally {
    applying.value = false
  }
}

const sectionIcons: Record<string, string> = {
  'hero': '🖼️',
  'feature-cards': '🃏',
  'tabs': '📑',
  'specs-grid': '📊',
  'gallery': '🖼️',
  'cta-banner': '📢',
  'intro': '📝',
  'content-block': '📄',
  'countdown': '⏱️',
  'enquiry-form': '📋',
  'video': '🎬',
}
</script>

<template>
  <BasicPage title="Page Templates" description="Pre-built page layouts — one-click to create a new page from a proven template.">
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <!-- Category filter -->
      <div class="flex gap-2">
        <button
          class="px-3 py-1.5 text-xs font-medium rounded-full border"
          :class="!selectedCategory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          @click="selectedCategory = ''"
        >
          All
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          class="px-3 py-1.5 text-xs font-medium rounded-full border capitalize"
          :class="selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
          @click="selectedCategory = cat"
        >
          {{ cat }}
        </button>
      </div>

      <!-- Template cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <UiCard
          v-for="tpl in filtered"
          :key="tpl.id"
          class="overflow-hidden hover:shadow-md transition-shadow"
        >
          <div class="p-5 space-y-3">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold">
                  {{ tpl.name }}
                </h3>
                <p class="text-xs text-muted-foreground mt-0.5">
                  {{ tpl.description }}
                </p>
              </div>
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-muted font-medium capitalize">{{ tpl.category }}</span>
            </div>

            <!-- Section outline -->
            <div class="space-y-1">
              <p class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                {{ tpl.sections.length }} sections
              </p>
              <div class="flex flex-col gap-0.5">
                <div
                  v-for="(sec, i) in tpl.sections"
                  :key="i"
                  class="flex items-center gap-2 text-xs px-2 py-1 rounded bg-muted/50"
                >
                  <span>{{ sectionIcons[sec.type] || '📦' }}</span>
                  <span class="font-mono text-muted-foreground">{{ sec.type }}</span>
                </div>
              </div>
            </div>

            <UiButton size="sm" class="w-full" @click="openApply(tpl)">
              <LayoutTemplate class="size-3.5 mr-1" />
              Use Template
            </UiButton>
          </div>
        </UiCard>
      </div>
    </div>

    <!-- Apply dialog -->
    <div
      v-if="showApplyDialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="showApplyDialog = false"
    >
      <div class="bg-background border rounded-lg shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold">
            Create Page from Template
          </h2>
          <button class="text-muted-foreground hover:text-foreground" @click="showApplyDialog = false">
            <X class="size-5" />
          </button>
        </div>

        <p class="text-sm text-muted-foreground">
          Template: <span class="font-medium text-foreground">{{ selectedTemplate?.name }}</span>
          ({{ selectedTemplate?.sections.length }} sections)
        </p>

        <div class="space-y-3">
          <div>
            <label class="text-xs font-medium">OEM</label>
            <select v-model="applyOemId" class="w-full mt-1 rounded-md border bg-background px-3 py-2 text-sm">
              <option value="">
                Select OEM...
              </option>
              <option v-for="oem in oems" :key="oem.id" :value="oem.id">
                {{ oem.name?.replace(' Australia', '') }}
              </option>
            </select>
          </div>
          <div>
            <label class="text-xs font-medium">Model Slug</label>
            <UiInput v-model="applyModelSlug" placeholder="e.g., rav4, sportage, haval-h6" class="mt-1" />
          </div>
        </div>

        <UiButton
          class="w-full"
          :disabled="!applyOemId || !applyModelSlug || applying"
          @click="handleApply"
        >
          <Loader2 v-if="applying" class="size-4 mr-1 animate-spin" />
          <Check v-else class="size-4 mr-1" />
          {{ applying ? 'Creating...' : 'Create Page' }}
        </UiButton>
      </div>
    </div>
  </BasicPage>
</template>
