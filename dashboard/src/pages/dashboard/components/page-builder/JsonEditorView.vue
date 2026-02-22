<script lang="ts" setup>
import { ref, computed, watch } from 'vue'
import {
  ChevronUp, ChevronDown, Trash2, Copy, Check, AlertCircle,
  ChevronRight, ChevronsUpDown, Pencil,
} from 'lucide-vue-next'

const props = defineProps<{
  sections: any[]
}>()

const emit = defineEmits<{
  moveSection: [from: number, to: number]
  deleteSection: [id: string]
  copySection: [id: string]
  updateSection: [id: string, updates: Record<string, any>]
  replaceSections: [sections: any[]]
}>()

// Per-section editing state
const editingId = ref<string | null>(null)
const editText = ref('')
const editError = ref<string | null>(null)
const collapsedIds = ref<Set<string>>(new Set())
const copiedId = ref<string | null>(null)

// Bulk edit mode
const bulkMode = ref(false)
const bulkText = ref('')
const bulkError = ref<string | null>(null)

watch(bulkMode, (val) => {
  if (val) {
    bulkText.value = JSON.stringify(props.sections, null, 2)
    bulkError.value = null
  }
})

function startEdit(section: any) {
  editingId.value = section.id
  editText.value = JSON.stringify(section, null, 2)
  editError.value = null
}

function cancelEdit() {
  editingId.value = null
  editText.value = ''
  editError.value = null
}

function applyEdit(sectionId: string) {
  try {
    const parsed = JSON.parse(editText.value)
    if (!parsed || typeof parsed !== 'object') {
      editError.value = 'Must be a JSON object'
      return
    }
    // Preserve id
    parsed.id = sectionId
    emit('updateSection', sectionId, parsed)
    editingId.value = null
    editError.value = null
  } catch (e: any) {
    editError.value = e.message || 'Invalid JSON'
  }
}

function applyBulk() {
  try {
    const parsed = JSON.parse(bulkText.value)
    if (!Array.isArray(parsed)) {
      bulkError.value = 'Must be a JSON array'
      return
    }
    emit('replaceSections', parsed)
    bulkError.value = null
    bulkMode.value = false
  } catch (e: any) {
    bulkError.value = e.message || 'Invalid JSON'
  }
}

function toggleCollapse(id: string) {
  const s = new Set(collapsedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  collapsedIds.value = s
}

async function handleCopy(id: string) {
  emit('copySection', id)
  copiedId.value = id
  setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 1500)
}

function collapseAll() {
  collapsedIds.value = new Set(props.sections.map((s: any) => s.id))
}

function expandAll() {
  collapsedIds.value = new Set()
}

function sectionLabel(s: any): string {
  return s.heading || s.title || s.type
}

const textareaRows = computed(() => (text: string) => {
  const lines = text.split('\n').length
  return Math.min(Math.max(lines, 4), 30)
})
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header bar -->
    <div class="flex items-center gap-2 px-4 py-2 border-b bg-card shrink-0">
      <span class="text-sm font-semibold">JSON Editor</span>
      <span class="text-xs text-muted-foreground">({{ sections.length }} sections)</span>
      <div class="flex-1" />
      <UiButton size="sm" variant="ghost" class="text-xs" @click="collapseAll">
        Collapse All
      </UiButton>
      <UiButton size="sm" variant="ghost" class="text-xs" @click="expandAll">
        Expand All
      </UiButton>
      <UiSeparator orientation="vertical" class="h-4" />
      <UiButton
        size="sm"
        :variant="bulkMode ? 'default' : 'outline'"
        class="text-xs"
        @click="bulkMode = !bulkMode"
      >
        <Pencil class="size-3 mr-1" />
        Bulk Edit
      </UiButton>
    </div>

    <div class="flex-1 overflow-y-auto p-4 space-y-3">
      <!-- Bulk edit mode -->
      <template v-if="bulkMode">
        <div class="space-y-2">
          <p class="text-xs text-muted-foreground">
            Edit the entire sections array as JSON. Changes apply to all sections at once.
          </p>
          <textarea
            v-model="bulkText"
            class="w-full font-mono text-xs bg-muted/30 border rounded-lg p-3 resize-y min-h-[300px]"
            spellcheck="false"
          />
          <div v-if="bulkError" class="flex items-center gap-1.5 text-destructive text-xs">
            <AlertCircle class="size-3.5 shrink-0" />
            {{ bulkError }}
          </div>
          <div class="flex items-center gap-2">
            <UiButton size="sm" @click="applyBulk">
              Apply All
            </UiButton>
            <UiButton size="sm" variant="outline" @click="bulkMode = false">
              Cancel
            </UiButton>
          </div>
        </div>
      </template>

      <!-- Per-section view -->
      <template v-else>
        <div
          v-for="(section, index) in sections"
          :key="section.id"
          class="border rounded-lg overflow-hidden"
        >
          <!-- Section header -->
          <div
            class="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer"
            @click="toggleCollapse(section.id)"
          >
            <ChevronRight
              class="size-3.5 text-muted-foreground shrink-0 transition-transform"
              :class="!collapsedIds.has(section.id) && 'rotate-90'"
            />
            <UiBadge variant="secondary" class="text-[9px] px-1.5 py-0 font-normal shrink-0">
              {{ section.type }}
            </UiBadge>
            <span class="text-sm font-medium truncate">{{ sectionLabel(section) }}</span>
            <span class="text-[10px] text-muted-foreground ml-auto shrink-0">
              #{{ index }}
            </span>

            <!-- Action buttons -->
            <div class="flex items-center gap-0.5 shrink-0" @click.stop>
              <button
                v-if="index > 0"
                class="p-1 rounded-md hover:bg-muted"
                title="Move up"
                @click="emit('moveSection', index, index - 1)"
              >
                <ChevronUp class="size-3.5" />
              </button>
              <button
                v-if="index < sections.length - 1"
                class="p-1 rounded-md hover:bg-muted"
                title="Move down"
                @click="emit('moveSection', index, index + 1)"
              >
                <ChevronDown class="size-3.5" />
              </button>
              <button
                class="p-1 rounded-md hover:bg-muted"
                title="Copy JSON"
                @click="handleCopy(section.id)"
              >
                <Check v-if="copiedId === section.id" class="size-3.5 text-emerald-500" />
                <Copy v-else class="size-3.5" />
              </button>
              <button
                class="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                title="Delete section"
                @click="emit('deleteSection', section.id)"
              >
                <Trash2 class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Section body (collapsible) -->
          <div v-if="!collapsedIds.has(section.id)" class="border-t">
            <!-- Editing mode -->
            <template v-if="editingId === section.id">
              <textarea
                v-model="editText"
                class="w-full font-mono text-xs p-3 bg-background resize-y min-h-[100px]"
                :rows="textareaRows(editText)"
                spellcheck="false"
              />
              <div v-if="editError" class="flex items-center gap-1.5 px-3 py-1.5 text-destructive text-xs bg-destructive/5">
                <AlertCircle class="size-3.5 shrink-0" />
                {{ editError }}
              </div>
              <div class="flex items-center gap-2 px-3 py-2 bg-muted/20 border-t">
                <UiButton size="sm" class="text-xs" @click="applyEdit(section.id)">
                  Apply
                </UiButton>
                <UiButton size="sm" variant="outline" class="text-xs" @click="cancelEdit">
                  Discard
                </UiButton>
              </div>
            </template>

            <!-- Read-only JSON -->
            <template v-else>
              <pre
                class="text-xs font-mono text-muted-foreground p-3 whitespace-pre-wrap break-words cursor-pointer hover:bg-muted/20 transition-colors"
                @click="startEdit(section)"
              >{{ JSON.stringify(section, null, 2) }}</pre>
            </template>
          </div>
        </div>

        <div v-if="sections.length === 0" class="text-center py-8 text-sm text-muted-foreground">
          No sections to display
        </div>
      </template>
    </div>
  </div>
</template>
