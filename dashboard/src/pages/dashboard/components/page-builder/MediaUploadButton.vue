<script lang="ts" setup>
import { ref } from 'vue'
import { Upload, Loader2, Check } from 'lucide-vue-next'
import { uploadMedia } from '@/lib/worker-api'

const props = defineProps<{
  oemId: string
  modelSlug: string
  accept?: string
}>()

const emit = defineEmits<{
  uploaded: [url: string]
}>()

const uploading = ref(false)
const done = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function openPicker() {
  fileInput.value?.click()
}

async function handleFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  uploading.value = true
  done.value = false
  try {
    const result = await uploadMedia(props.oemId, props.modelSlug, file)
    emit('uploaded', result.url)
    done.value = true
    setTimeout(() => { done.value = false }, 2000)
  } catch (err: any) {
    console.error('Upload failed:', err)
  } finally {
    uploading.value = false
    input.value = ''
  }
}
</script>

<template>
  <input
    ref="fileInput"
    type="file"
    :accept="accept || 'image/jpeg,image/png,image/webp,image/gif'"
    class="hidden"
    @change="handleFile"
  />
  <UiButton
    type="button"
    size="icon"
    variant="ghost"
    class="size-7 shrink-0"
    :disabled="uploading"
    title="Upload file"
    @click="openPicker"
  >
    <Loader2 v-if="uploading" class="size-3.5 animate-spin" />
    <Check v-else-if="done" class="size-3.5 text-emerald-500" />
    <Upload v-else class="size-3.5" />
  </UiButton>
</template>
