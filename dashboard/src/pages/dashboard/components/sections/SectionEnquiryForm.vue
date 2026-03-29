<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

defineProps<{
  section: {
    type: 'enquiry-form'
    heading: string
    sub_heading?: string
    form_type: 'contact' | 'test-drive' | 'service'
    vehicle_context: boolean
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const headingEdit = useInlineEdit((v) => emit('update-text', 'heading', v))
const subEdit = useInlineEdit((v) => emit('update-text', 'sub_heading', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}

const formTypeLabels: Record<string, string> = {
  'contact': 'Contact',
  'test-drive': 'Test Drive',
  'service': 'Service',
}
</script>

<template>
  <div class="px-8 py-10">
    <h3
      class="text-xl font-bold mb-2 cursor-text outline-none"
      @dblclick="startEditing('heading', headingEdit, $event)"
      @blur="headingEdit.stopEdit()"
      @keydown="headingEdit.onKeydown"
      @paste="headingEdit.onPaste"
    >{{ section.heading || 'Double-click to edit heading' }}</h3>
    <p
      class="text-sm text-muted-foreground mb-6 cursor-text outline-none"
      :style="{ opacity: section.sub_heading ? 1 : 0.4 }"
      @dblclick="startEditing('sub_heading', subEdit, $event)"
      @blur="subEdit.stopEdit()"
      @keydown="subEdit.onKeydown"
      @paste="subEdit.onPaste"
    >{{ section.sub_heading || 'Double-click to add subtitle' }}</p>
    <div class="border-2 border-dashed border-muted-foreground/30 rounded-lg p-8 text-center bg-muted/20">
      <div class="mb-3">
        <span class="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary">
          {{ formTypeLabels[section.form_type] || section.form_type }}
        </span>
        <span v-if="section.vehicle_context" class="inline-block px-2.5 py-1 text-xs font-semibold rounded-full bg-muted text-muted-foreground ml-1.5">
          Vehicle Context
        </span>
      </div>
      <p class="text-sm text-muted-foreground">Enquiry form will render here</p>
      <p class="text-xs text-muted-foreground/60 mt-1">The consuming platform renders its native form with CAPTCHA, CRM integration, and tracking.</p>
    </div>
  </div>
</template>
