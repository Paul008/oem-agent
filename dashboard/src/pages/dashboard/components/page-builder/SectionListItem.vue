<script lang="ts" setup>
import {
  ArrowRightLeft,
  Award,
  BarChart3,
  BookmarkPlus,
  Calculator,
  ChevronDown,
  ChevronUp,
  Clipboard,
  Code2,
  Columns3,
  Copy,
  DollarSign,
  GripVertical,
  Image,
  Images,
  LayoutGrid,
  Maximize,
  Megaphone,
  Palette,
  PanelBottom,
  Quote,
  Settings,
  Split,
  Table2,
  TableProperties,
  Timer,
  Trash2,
  Type,
  Video,
} from 'lucide-vue-next'
import { computed } from 'vue'

import type { PageSectionType } from './section-templates'

import { getConvertibleTypes } from './section-converter'
import { SECTION_TYPE_INFO } from './section-templates'

const props = defineProps<{
  section: any
  index: number
  total: number
  selected: boolean
}>()

const emit = defineEmits<{
  select: []
  openEditor: []
  moveUp: []
  moveDown: []
  duplicate: []
  delete: []
  copyJson: []
  saveAsRecipe: []
  convert: [targetType: string]
  split: []
  dragstart: [e: DragEvent]
  dragover: [e: DragEvent]
  dragleave: []
  drop: [e: DragEvent]
  dragend: []
}>()

const typeIcons: Record<string, any> = {
  'hero': Image,
  'intro': Type,
  'tabs': Columns3,
  'color-picker': Palette,
  'specs-grid': TableProperties,
  'gallery': Images,
  'feature-cards': LayoutGrid,
  'image': Image,
  'video': Video,
  'cta-banner': Megaphone,
  'testimonial': Quote,
  'comparison-table': Table2,
  'stats': BarChart3,
  'logo-strip': Award,
  'embed': Code2,
  'pricing-table': DollarSign,
  'sticky-bar': PanelBottom,
  'countdown': Timer,
  'finance-calculator': Calculator,
  'image-showcase': Maximize,
}

const convertibleTypes = computed(() => {
  return getConvertibleTypes(props.section.type as PageSectionType)
})

const SPLITTABLE_FIELDS: Record<string, string> = {
  'gallery': 'images',
  'image-showcase': 'images',
  'feature-cards': 'cards',
  'tabs': 'tabs',
  'accordion': 'items',
  'testimonial': 'testimonials',
  'logo-strip': 'logos',
  'stats': 'stats',
  'pricing-table': 'tiers',
  'comparison-table': 'rows',
}

const canSplit = computed(() => {
  const field = SPLITTABLE_FIELDS[props.section.type]
  if (!field)
    return false
  const arr = props.section[field]
  return Array.isArray(arr) && arr.length >= 2
})

function sectionLabel(s: any): string {
  return s.heading || s.title || s.type
}
</script>

<template>
  <div
    class="group rounded-lg border bg-card shadow-sm cursor-pointer transition-all"
    :class="[
      selected
        ? 'border-primary ring-1 ring-primary/20 shadow-md'
        : 'border-border hover:border-muted-foreground/30 hover:shadow',
    ]"
    :draggable="false"
    @click="emit('select')"
    @dragover="emit('dragover', $event)"
    @dragleave="emit('dragleave')"
    @drop="emit('drop', $event)"
  >
    <div class="flex items-center gap-2 px-3 py-2.5">
      <!-- Drag handle -->
      <div
        draggable="true"
        class="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
        title="Drag to reorder"
        @dragstart="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <GripVertical class="size-4" />
      </div>
      <div
        class="flex items-center justify-center size-7 rounded-md shrink-0"
        :class="selected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'"
      >
        <component :is="typeIcons[section.type] || Type" class="size-3.5" />
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium truncate leading-tight">
          {{ sectionLabel(section) }}
        </p>
        <UiBadge variant="secondary" class="text-[9px] px-1.5 py-0 mt-0.5 font-normal">
          {{ section.type }}
        </UiBadge>
      </div>
      <div class="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary"
          title="Edit section"
          @click.stop="emit('openEditor')"
        >
          <Settings class="size-3.5" />
        </button>
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
          class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-green-600"
          title="Save as Recipe"
          @click.stop="emit('saveAsRecipe')"
        >
          <BookmarkPlus class="size-3.5" />
        </button>
        <button
          class="p-1 rounded-md hover:bg-muted"
          title="Duplicate section"
          @click.stop="emit('duplicate')"
        >
          <Copy class="size-3.5" />
        </button>

        <!-- Split into individual sections -->
        <button
          v-if="canSplit"
          class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-orange-500"
          title="Split into individual sections"
          @click.stop="emit('split')"
        >
          <Split class="size-3.5" />
        </button>

        <!-- Convert To dropdown -->
        <UiDropdownMenu v-if="convertibleTypes.length > 0">
          <UiDropdownMenuTrigger as-child>
            <button
              class="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary"
              title="Convert to..."
              @click.stop
            >
              <ArrowRightLeft class="size-3.5" />
            </button>
          </UiDropdownMenuTrigger>
          <UiDropdownMenuContent align="end" class="w-48">
            <UiDropdownMenuLabel class="text-[10px] text-muted-foreground">
              Convert to...
            </UiDropdownMenuLabel>
            <UiDropdownMenuSeparator />
            <UiDropdownMenuItem
              v-for="targetType in convertibleTypes"
              :key="targetType"
              @select="emit('convert', targetType)"
            >
              <component :is="typeIcons[targetType] || Type" class="size-3.5 mr-2" />
              {{ SECTION_TYPE_INFO[targetType]?.label || targetType }}
            </UiDropdownMenuItem>
          </UiDropdownMenuContent>
        </UiDropdownMenu>

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
