<script lang="ts" setup>
import { ChevronUp, ChevronDown, Trash2, Copy, Clipboard, Image, Type, Columns3, Palette, TableProperties, Images, LayoutGrid, Video, Megaphone } from 'lucide-vue-next'

const props = defineProps<{
  section: any
  index: number
  total: number
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  moveUp: []
  moveDown: []
  duplicate: []
  delete: []
  copyJson: []
}>()

const typeIcons: Record<string, any> = {
  'hero': Image,
  'intro': Type,
  'tabs': Columns3,
  'color-picker': Palette,
  'specs-grid': TableProperties,
  'gallery': Images,
  'feature-cards': LayoutGrid,
  'video': Video,
  'cta-banner': Megaphone,
}

function sectionLabel(s: any): string {
  return s.heading || s.title || s.type
}
</script>

<template>
  <div
    class="group rounded-lg border bg-card shadow-sm cursor-pointer transition-all"
    :class="selected
      ? 'border-primary ring-1 ring-primary/20 shadow-md'
      : 'border-border hover:border-muted-foreground/30 hover:shadow'"
    @click="emit('select')"
  >
    <div class="flex items-center gap-2.5 px-3 py-2.5">
      <div
        class="flex items-center justify-center size-7 rounded-md shrink-0"
        :class="selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
      >
        <component :is="typeIcons[section.type] || Type" class="size-3.5" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate leading-tight">{{ sectionLabel(section) }}</p>
        <UiBadge variant="secondary" class="text-[9px] px-1.5 py-0 mt-0.5 font-normal">
          {{ section.type }}
        </UiBadge>
      </div>
      <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          v-if="index > 0"
          class="p-1 rounded-md hover:bg-muted"
          title="Move up"
          @click.stop="emit('moveUp')"
        >
          <ChevronUp class="size-3.5" />
        </button>
        <button
          v-if="index < total - 1"
          class="p-1 rounded-md hover:bg-muted"
          title="Move down"
          @click.stop="emit('moveDown')"
        >
          <ChevronDown class="size-3.5" />
        </button>
        <button
          class="p-1 rounded-md hover:bg-muted"
          title="Copy JSON"
          @click.stop="emit('copyJson')"
        >
          <Clipboard class="size-3.5" />
        </button>
        <button
          class="p-1 rounded-md hover:bg-muted"
          title="Duplicate section"
          @click.stop="emit('duplicate')"
        >
          <Copy class="size-3.5" />
        </button>
        <button
          class="p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
          title="Delete section"
          @click.stop="emit('delete')"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>
