<script lang="ts" setup>
import { ref, computed } from 'vue'
import { Plus, Image, Type, Columns3, Palette, TableProperties, Images, LayoutGrid, Video, Megaphone, FileText, ChevronRight, Library, ClipboardPaste, Quote, Table2, BarChart3, Award, Code2, DollarSign, PanelBottom, Timer, Calculator } from 'lucide-vue-next'
import {
  SECTION_TEMPLATES,
  SECTION_TYPE_INFO,
  type PageSectionType,
} from './section-templates'

const emit = defineEmits<{
  addBlank: [type: PageSectionType]
  addFromTemplate: [templateId: string]
  openGallery: []
  pasteFromClipboard: []
}>()

const open = ref(false)
const expandedType = ref<PageSectionType | null>(null)

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
  'content-block': FileText,
  'testimonial': Quote,
  'comparison-table': Table2,
  'stats': BarChart3,
  'logo-strip': Award,
  'embed': Code2,
  'pricing-table': DollarSign,
  'sticky-bar': PanelBottom,
  'countdown': Timer,
  'finance-calculator': Calculator,
}

const sectionTypes = computed(() =>
  Object.entries(SECTION_TYPE_INFO).map(([type, info]) => ({
    type: type as PageSectionType,
    ...info,
    templates: SECTION_TEMPLATES.filter(t => t.type === type),
  })),
)

function toggleType(type: PageSectionType) {
  const entry = sectionTypes.value.find(s => s.type === type)
  if (!entry || entry.templates.length === 0) {
    emit('addBlank', type)
    open.value = false
    expandedType.value = null
    return
  }
  expandedType.value = expandedType.value === type ? null : type
}

function pickTemplate(templateId: string) {
  emit('addFromTemplate', templateId)
  open.value = false
  expandedType.value = null
}

function pickBlank(type: PageSectionType) {
  emit('addBlank', type)
  open.value = false
  expandedType.value = null
}
</script>

<template>
  <UiPopover v-model:open="open">
    <UiPopoverTrigger as-child>
      <UiButton size="sm" variant="outline" class="w-full mt-2">
        <Plus class="size-3.5 mr-1.5" />
        Add Section
      </UiButton>
    </UiPopoverTrigger>
    <UiPopoverContent class="w-72 p-0" align="start">
      <div class="max-h-80 overflow-y-auto">
        <div class="px-3 py-2 border-b">
          <p class="text-xs font-semibold text-muted-foreground">Choose section type</p>
        </div>
        <div class="py-1">
          <template v-for="entry in sectionTypes" :key="entry.type">
            <button
              class="flex items-center gap-2.5 w-full px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
              @click="toggleType(entry.type)"
            >
              <component :is="typeIcons[entry.type] || Type" class="size-4 text-muted-foreground shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-medium text-sm">{{ entry.label }}</p>
                <p class="text-[10px] text-muted-foreground">{{ entry.description }}</p>
              </div>
              <ChevronRight
                v-if="entry.templates.length > 0"
                class="size-3.5 text-muted-foreground shrink-0 transition-transform"
                :class="expandedType === entry.type && 'rotate-90'"
              />
            </button>

            <!-- Templates sub-list -->
            <div v-if="expandedType === entry.type" class="bg-muted/30 border-y">
              <button
                class="flex items-center gap-2 w-full px-3 pl-10 py-1.5 text-left text-xs hover:bg-muted/50"
                @click="pickBlank(entry.type)"
              >
                <span class="text-muted-foreground">Blank</span>
              </button>
              <button
                v-for="tmpl in entry.templates"
                :key="tmpl.id"
                class="flex items-center gap-2 w-full px-3 pl-10 py-1.5 text-left text-xs hover:bg-muted/50"
                @click="pickTemplate(tmpl.id)"
              >
                <div class="min-w-0">
                  <p class="font-medium">{{ tmpl.name }}</p>
                  <p class="text-[10px] text-muted-foreground">{{ tmpl.description }}</p>
                </div>
              </button>
            </div>
          </template>
        </div>
        <div class="border-t px-3 py-2 space-y-1">
          <UiButton
            size="sm"
            variant="ghost"
            class="w-full justify-start text-xs"
            @click="emit('openGallery'); open = false"
          >
            <Library class="size-3.5 mr-1.5" />
            Browse Template Gallery
          </UiButton>
          <UiButton
            size="sm"
            variant="ghost"
            class="w-full justify-start text-xs"
            @click="emit('pasteFromClipboard'); open = false"
          >
            <ClipboardPaste class="size-3.5 mr-1.5" />
            Paste from Clipboard
          </UiButton>
        </div>
      </div>
    </UiPopoverContent>
  </UiPopover>
</template>
