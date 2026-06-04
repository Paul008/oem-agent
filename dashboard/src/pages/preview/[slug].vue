<script lang="ts" setup>
import { Loader2 } from 'lucide-vue-next'
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'

import { usePageBuilder } from '@/composables/use-page-builder'
import PageBuilderCanvas from '@/pages/dashboard/components/page-builder/PageBuilderCanvas.vue'

// Standalone, chrome-free preview of a model page as the builder renders it.
// Reuses PageBuilderCanvas in read-only mode so both clone and structured
// (sections) pages render faithfully without any editor affordances.
const WORKER_BASE = import.meta.env.VITE_WORKER_URL || 'https://oem-agent.adme-dev.workers.dev'

const route = useRoute()
const {
  page,
  loading,
  error,
  sections,
  activeMode,
  isCloned,
  isStructured,
  oemId,
  modelSlug,
  loadPage,
} = usePageBuilder()

onMounted(async () => {
  const slug = (route.params as { slug?: string }).slug
  if (slug)
    await loadPage(slug)
})
</script>

<template>
  <div class="min-h-screen w-full bg-background">
    <div v-if="loading" class="flex h-screen items-center justify-center text-muted-foreground">
      <Loader2 class="size-5 animate-spin mr-2" />
      Loading preview…
    </div>

    <div v-else-if="error" class="flex h-screen items-center justify-center text-destructive">
      {{ error }}
    </div>

    <div v-else-if="page" class="h-screen">
      <PageBuilderCanvas
        :page="page"
        :sections="sections"
        :selected-section-id="null"
        :active-mode="activeMode"
        :selected-clone-region-id="null"
        :is-cloned="isCloned"
        :is-structured="isStructured"
        :worker-base="WORKER_BASE"
        :oem-id="oemId"
        :model-slug="modelSlug"
        :read-only="true"
        :fit-width="true"
        :allow-same-origin-sandbox="true"
      />
    </div>

    <div v-else class="flex h-screen items-center justify-center text-muted-foreground">
      Page not found.
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
</route>
