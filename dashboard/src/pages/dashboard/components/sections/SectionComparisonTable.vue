<script lang="ts" setup>
import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'comparison-table'
    title?: string
    columns: Array<{ label: string; highlighted?: boolean }>
    rows: Array<{ feature: string; values: string[] }>
  }
}>()

const emit = defineEmits<{
  'inline-edit': [field: string, value: string, el: HTMLElement]
  'update-text': [field: string, value: string]
}>()

const titleEdit = useInlineEdit((v) => emit('update-text', 'title', v))

function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) {
  const el = e.target as HTMLElement
  edit.startEdit(el)
  emit('inline-edit', field, el.textContent || '', el)
}
</script>

<template>
  <div class="px-8 py-8">
    <h2
      class="text-lg font-bold text-center mb-6 cursor-text outline-none"
      :style="{ opacity: section.title ? 1 : 0.4 }"
      @dblclick="startEditing('title', titleEdit, $event)"
      @blur="titleEdit.stopEdit()"
      @keydown="titleEdit.onKeydown"
      @paste="titleEdit.onPaste"
    >{{ section.title || 'Double-click to add title' }}</h2>
    <div class="overflow-x-auto">
      <table class="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th
              v-for="(col, i) in section.columns"
              :key="i"
              class="px-4 py-3 text-left font-semibold border-b-2"
              :class="col.highlighted
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-muted/50 border-border'"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, ri) in section.rows"
            :key="ri"
            class="border-b border-border hover:bg-muted/30"
          >
            <td class="px-4 py-2.5 font-medium">{{ row.feature || '—' }}</td>
            <td
              v-for="(val, vi) in row.values"
              :key="vi"
              class="px-4 py-2.5"
              :class="section.columns[vi + 1]?.highlighted ? 'bg-primary/5 font-medium' : ''"
            >
              {{ val || '—' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
