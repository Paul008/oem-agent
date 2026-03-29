<script lang="ts" setup>
import { ref } from 'vue'
import { Upload, Link, Image as ImageIcon } from 'lucide-vue-next'
import MediaUploadButton from './MediaUploadButton.vue'

const props = defineProps<{
  currentUrl?: string
  oemId?: string
  modelSlug?: string
}>()

const emit = defineEmits<{
  replace: [url: string]
}>()

const showUrlInput = ref(false)
const urlValue = ref('')

function onUrlSubmit() {
  if (urlValue.value.trim()) {
    emit('replace', urlValue.value.trim())
    showUrlInput.value = false
    urlValue.value = ''
  }
}
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40 z-[5]">
    <div class="flex items-center gap-2" @click.stop>
      <!-- Upload button -->
      <MediaUploadButton
        v-if="oemId"
        :oem-id="oemId"
        :model-slug="modelSlug || ''"
        class="!h-8 !px-3 !text-xs bg-white text-black rounded-md shadow-lg hover:bg-white/90"
        @uploaded="emit('replace', $event)"
      />
      <!-- URL input toggle -->
      <button
        class="h-8 px-3 text-xs bg-white text-black rounded-md shadow-lg hover:bg-white/90 flex items-center gap-1.5"
        @click="showUrlInput = !showUrlInput"
      >
        <Link class="size-3.5" />
        URL
      </button>
    </div>
    <!-- URL input popover -->
    <div
      v-if="showUrlInput"
      class="absolute top-1/2 left-1/2 -translate-x-1/2 translate-y-6 bg-card border rounded-lg shadow-xl p-2 flex gap-1.5 min-w-[300px]"
      @click.stop
    >
      <input
        v-model="urlValue"
        type="url"
        placeholder="Paste image URL..."
        class="flex-1 h-8 px-2 text-xs bg-muted rounded border-0 outline-none"
        @keydown.enter="onUrlSubmit"
      />
      <button
        class="h-8 px-3 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
        @click="onUrlSubmit"
      >
        Apply
      </button>
    </div>
  </div>
</template>
