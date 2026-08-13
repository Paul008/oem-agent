<script lang="ts" setup>
import { Eye, History, Rocket, RotateCcw, WandSparkles } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import type { PublicationHistoryEntry, PublicationValidationSummary } from '@/lib/model-page-publication'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = defineProps<{
  draftVersion: number | null
  publishedRevision: number | null
  candidateRevision: number | null
  candidateStatus: 'none' | 'building' | 'ready' | 'failed' | 'stale'
  canBuild: boolean
  canPublish: boolean
  busy: boolean
  validation: PublicationValidationSummary | null
  history: PublicationHistoryEntry[]
}>()

const emit = defineEmits<{
  buildCandidate: []
  publish: []
  rollback: [revision: number]
  previewCandidate: []
}>()

const publishDialogOpen = ref(false)
const rollbackDialogOpen = ref(false)
const rollbackRevision = ref<number | null>(null)

const candidateLabel = computed(() => {
  if (props.candidateStatus === 'none')
    return 'No candidate'
  if (props.candidateStatus === 'stale')
    return props.candidateRevision == null ? 'Candidate stale' : `Candidate ${props.candidateRevision} stale`
  if (props.candidateStatus === 'building')
    return props.candidateRevision == null ? 'Building candidate' : `Candidate ${props.candidateRevision} building`
  return props.candidateRevision == null
    ? `Candidate ${props.candidateStatus}`
    : `Candidate ${props.candidateRevision} ${props.candidateStatus}`
})

const validationLabel = computed(() => {
  if (!props.validation)
    return 'Not validated'
  return props.validation.publishable && props.validation.blocking.length === 0
    ? 'Validation passed'
    : `Validation blocked (${props.validation.blocking.length})`
})

const rollbackHistory = computed(() => props.history.filter(entry => entry.revision !== props.publishedRevision))
const buildCandidateLabel = computed(() => props.candidateStatus === 'building' ? 'Retry Build' : 'Build Candidate')

function requestBuildCandidate() {
  if (!props.busy && props.canBuild)
    emit('buildCandidate')
}

function requestPublish() {
  if (!props.busy && props.canPublish)
    publishDialogOpen.value = true
}

function confirmPublish() {
  if (props.busy)
    return
  publishDialogOpen.value = false
  emit('publish')
}

function requestRollback(revision: number) {
  if (props.busy)
    return
  rollbackRevision.value = revision
  rollbackDialogOpen.value = true
}

function confirmRollback() {
  if (props.busy)
    return
  const revision = rollbackRevision.value
  rollbackDialogOpen.value = false
  rollbackRevision.value = null
  if (revision != null)
    emit('rollback', revision)
}
</script>

<template>
  <div class="flex max-w-full items-center gap-1.5" :aria-busy="busy">
    <div class="hidden items-center gap-1.5 text-[11px] text-muted-foreground xl:flex">
      <span class="rounded border bg-muted/40 px-2 py-1">Draft {{ draftVersion ?? '—' }} saved</span>
      <span class="rounded border bg-muted/40 px-2 py-1">Production {{ publishedRevision ?? 'none' }}</span>
      <span class="rounded border bg-muted/40 px-2 py-1">{{ candidateLabel }}</span>
    </div>

    <div data-publication-desktop-actions="true" class="hidden items-center gap-1.5 sm:flex">
      <Button
        size="sm"
        variant="outline"
        :disabled="busy || !canBuild"
        :title="candidateStatus === 'building' ? 'Retry a candidate build that did not finish' : 'Build and validate a candidate from the saved draft'"
        @click="requestBuildCandidate"
      >
        <WandSparkles class="size-3.5 sm:mr-1" />
        <span class="hidden sm:inline">{{ buildCandidateLabel }}</span>
      </Button>

      <Button
        size="sm"
        variant="outline"
        :disabled="candidateRevision == null || candidateStatus === 'building' || candidateStatus === 'stale'"
        title="Preview candidate"
        @click="emit('previewCandidate')"
      >
        <Eye class="size-3.5 sm:mr-1" />
        <span class="hidden sm:inline">Candidate</span>
      </Button>

      <Button
        size="sm"
        :disabled="busy || !canPublish"
        title="Publish validated candidate"
        @click="requestPublish"
      >
        <Rocket class="size-3.5 sm:mr-1" />
        <span class="hidden sm:inline">Publish</span>
      </Button>

      <Popover>
        <PopoverTrigger as-child>
          <button type="button" class="flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted">
            <History class="size-3.5" />
            <span class="hidden 2xl:inline">Publication</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="bottom" :side-offset="8" class="z-[80] w-80 max-w-[calc(100vw-1rem)] space-y-3 p-3">
          <div class="grid grid-cols-2 gap-2 text-xs xl:hidden">
            <div class="rounded border bg-muted/30 p-2">
              Draft {{ draftVersion ?? '—' }} saved
            </div>
            <div class="rounded border bg-muted/30 p-2">
              Production {{ publishedRevision ?? 'none' }}
            </div>
            <div class="col-span-2 rounded border bg-muted/30 p-2">
              {{ candidateLabel }}
            </div>
          </div>

          <div class="space-y-1 text-xs">
            <p class="font-medium">
              {{ validationLabel }}
            </p>
            <p v-for="finding in validation?.blocking ?? []" :key="`desktop-blocking-${finding.code}-${finding.message}`" class="text-destructive">
              {{ finding.message }}
            </p>
            <p v-for="finding in validation?.warnings ?? []" :key="`desktop-warning-${finding.code}-${finding.message}`" class="text-amber-600 dark:text-amber-400">
              {{ finding.message }}
            </p>
          </div>

          <div class="space-y-1 border-t pt-2">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </p>
            <p v-if="history.length === 0" class="text-xs text-muted-foreground">
              No published revisions yet.
            </p>
            <div v-for="entry in history" :key="entry.revision" class="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
              <span>
                Revision {{ entry.revision }}
                <span v-if="entry.revision === publishedRevision" class="text-muted-foreground">(production)</span>
              </span>
              <Button
                v-if="rollbackHistory.some(item => item.revision === entry.revision)"
                size="sm"
                variant="ghost"
                class="h-7 px-2"
                :data-publication-rollback="String(entry.revision)"
                :disabled="busy"
                @click="requestRollback(entry.revision)"
              >
                <RotateCcw class="mr-1 size-3" /> Roll back
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <div data-publication-mobile-menu="true" class="relative sm:hidden">
      <Popover>
        <PopoverTrigger as-child>
          <button type="button" class="flex h-8 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs font-medium hover:bg-muted">
            <History class="size-3.5" />
            <span>Publication</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          data-publication-mobile-menu-content="true"
          align="end"
          side="bottom"
          :side-offset="8"
          class="z-[80] w-72 max-w-[calc(100vw-1rem)] space-y-3 p-3"
        >
          <div class="grid grid-cols-2 gap-2 text-xs">
            <div class="rounded border bg-muted/30 p-2">
              Draft {{ draftVersion ?? '—' }} saved
            </div>
            <div class="rounded border bg-muted/30 p-2">
              Production {{ publishedRevision ?? 'none' }}
            </div>
            <div class="col-span-2 rounded border bg-muted/30 p-2">
              {{ candidateLabel }}
            </div>
          </div>

          <div class="grid gap-2">
            <Button
              size="sm"
              variant="outline"
              class="w-full justify-start"
              :disabled="busy || !canBuild"
              :title="candidateStatus === 'building' ? 'Retry a candidate build that did not finish' : 'Build and validate a candidate from the saved draft'"
              @click="requestBuildCandidate"
            >
              <WandSparkles class="mr-1 size-3.5" /> {{ buildCandidateLabel }}
            </Button>
            <Button
              size="sm"
              variant="outline"
              class="w-full justify-start"
              :disabled="candidateRevision == null || candidateStatus === 'building' || candidateStatus === 'stale'"
              title="Preview candidate"
              @click="emit('previewCandidate')"
            >
              <Eye class="mr-1 size-3.5" /> Candidate
            </Button>
            <Button
              size="sm"
              class="w-full justify-start"
              :disabled="busy || !canPublish"
              title="Publish validated candidate"
              @click="requestPublish"
            >
              <Rocket class="mr-1 size-3.5" /> Publish
            </Button>
          </div>

          <div class="space-y-1 text-xs">
            <p class="font-medium">
              {{ validationLabel }}
            </p>
            <p v-for="finding in validation?.blocking ?? []" :key="`mobile-blocking-${finding.code}-${finding.message}`" class="text-destructive">
              {{ finding.message }}
            </p>
            <p v-for="finding in validation?.warnings ?? []" :key="`mobile-warning-${finding.code}-${finding.message}`" class="text-amber-600 dark:text-amber-400">
              {{ finding.message }}
            </p>
          </div>

          <div class="space-y-1 border-t pt-2">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              History
            </p>
            <p v-if="history.length === 0" class="text-xs text-muted-foreground">
              No published revisions yet.
            </p>
            <div v-for="entry in history" :key="entry.revision" class="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-xs">
              <span>
                Revision {{ entry.revision }}
                <span v-if="entry.revision === publishedRevision" class="text-muted-foreground">(production)</span>
              </span>
              <Button
                v-if="rollbackHistory.some(item => item.revision === entry.revision)"
                size="sm"
                variant="ghost"
                class="h-7 px-2"
                :data-publication-rollback="String(entry.revision)"
                :disabled="busy"
                @click="requestRollback(entry.revision)"
              >
                <RotateCcw class="mr-1 size-3" /> Roll back
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>

    <AlertDialog v-model:open="publishDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Publish candidate?</AlertDialogTitle>
          <AlertDialogDescription>
            Publish candidate {{ candidateRevision }} over production {{ publishedRevision ?? 'none' }}?
            The saved draft remains separate and unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction :disabled="busy" @click="confirmPublish">
            Publish candidate
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <AlertDialog v-model:open="rollbackDialogOpen">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Roll back production?</AlertDialogTitle>
          <AlertDialogDescription>
            Roll back production from {{ publishedRevision ?? 'none' }} to revision {{ rollbackRevision }}?
            This switches the manifest directly and does not rebuild the page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction :disabled="busy" @click="confirmRollback">
            Roll back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
