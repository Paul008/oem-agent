<script lang="ts" setup>
import type { CloneEditableField, CloneRegion } from '../../page-builder/page-modes'

const props = defineProps<{
  region: CloneRegion | null
}>()

const emit = defineEmits<{
  patchField: [payload: {
    regionId: string
    fieldId: string
    selector: string
    kind: Exclude<CloneEditableField['kind'], 'background'>
    value: string | boolean
    html?: string
    text?: string
  }]
}>()

const FIELD_KINDS: CloneEditableField['kind'][] = ['text', 'html', 'image', 'link', 'button', 'background', 'visibility']

function patchField(field: CloneEditableField, value: string | boolean) {
  const region = props.region
  if (!region)
    return

  const payload: {
    regionId: string
    fieldId: string
    selector: string
    kind: Exclude<CloneEditableField['kind'], 'background'>
    value: string | boolean
    html?: string
    text?: string
  } = {
    regionId: region.id,
    fieldId: field.id,
    selector: field.selector,
    kind: field.kind as Exclude<CloneEditableField['kind'], 'background'>,
    value,
  }

  if (field.kind === 'background') {
    return
  }

  if (field.kind === 'html')
    payload.html = String(value)

  if (field.kind === 'button')
    payload.text = String(value)

  emit('patchField', payload)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function visibilityValue(value: unknown): string {
  return value === false || value === 'false' || value === 'hidden' ? 'hidden' : 'visible'
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <div class="shrink-0 border-b px-4 py-3">
      <h3 class="text-sm font-semibold">
        Clone Inspector
      </h3>
      <p v-if="region" class="mt-1 truncate text-xs text-muted-foreground">
        {{ region.label }} · {{ region.tag }}
      </p>
    </div>

    <div v-if="region" class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
      <div v-if="!region.editable_fields?.length" class="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        No editable fields were detected for this clone region.
      </div>

      <div
        v-for="field in region.editable_fields"
        :key="field.id"
        class="space-y-1.5"
      >
        <label class="text-xs font-medium">
          {{ field.label }}
          <span class="text-muted-foreground">({{ field.kind }})</span>
        </label>

        <UiTextarea
          v-if="field.kind === 'text' || field.kind === 'html'"
          :model-value="stringValue(field.value)"
          class="min-h-20 text-xs"
          :class="field.kind === 'html' ? 'font-mono' : ''"
          @update:model-value="patchField(field, String($event))"
        />

        <UiInput
          v-else-if="field.kind === 'image' || field.kind === 'link' || field.kind === 'button'"
          :model-value="stringValue(field.value)"
          class="h-8 text-xs"
          @update:model-value="patchField(field, String($event))"
        />

        <div v-else-if="field.kind === 'background'" class="space-y-1">
          <UiInput
            :model-value="stringValue(field.value)"
            class="h-8 text-xs"
            disabled
            placeholder="Background editing requires bridge support"
          />
          <p class="text-[11px] text-muted-foreground">
            Background edits are read-only until the iframe bridge supports style patching.
          </p>
        </div>

        <UiSelect
          v-else-if="field.kind === 'visibility'"
          :model-value="visibilityValue(field.value)"
          @update:model-value="patchField(field, $event === 'visible')"
        >
          <UiSelectTrigger class="h-8 text-xs">
            <UiSelectValue />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="visible">
              Visible
            </UiSelectItem>
            <UiSelectItem value="hidden">
              Hidden
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>

        <UiInput
          v-else-if="FIELD_KINDS.includes(field.kind)"
          :model-value="stringValue(field.value)"
          class="h-8 text-xs"
          @update:model-value="patchField(field, String($event))"
        />
      </div>
    </div>

    <div v-else class="px-4 py-8 text-center text-sm text-muted-foreground">
      Select a clone region to edit its fields.
    </div>
  </div>
</template>
