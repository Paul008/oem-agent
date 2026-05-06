<script lang="ts" setup>
import { Info, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { useInlineEdit } from '@/composables/use-inline-edit'

const props = defineProps<{
  section: {
    type: 'tabs'
    title?: string
    category?: string
    variant?: 'default' | 'kia-feature-bullets'
    theme?: 'light' | 'dark'
    image_position?: 'left' | 'right'
    tabs: Array<{
      label: string
      content_html: string
      image_url?: string
      image_disclaimer?: string
      disclaimer?: string
    }>
    default_tab: number
  }
}>()

const emit = defineEmits<{ 'inline-edit': [field: string, value: string, el: HTMLElement], 'update-text': [field: string, value: string] }>()
const titleEdit = useInlineEdit(v => emit('update-text', 'title', v))
function startEditing(field: string, edit: ReturnType<typeof useInlineEdit>, e: MouseEvent) { const el = e.target as HTMLElement; edit.startEdit(el); emit('inline-edit', field, el.textContent || '', el) }

const activeIndex = ref(props.section.default_tab ?? 0)
const disclaimerOpen = ref(false)

const activeTab = computed(() => props.section.tabs?.[activeIndex.value])
const isDark = computed(() => props.section.theme === 'dark')
const imageLeft = computed(() => props.section.image_position === 'left')
const isFeatureBullets = computed(() => props.section.variant === 'kia-feature-bullets')

function select(index: number) {
  activeIndex.value = index
  disclaimerOpen.value = false
}
</script>

<template>
  <div v-if="section.tabs?.length">
    <!-- ========== VARIANT: kia-feature-bullets ========== -->
    <template v-if="isFeatureBullets">
      <div
        class="px-8 md:px-12 lg:px-16 py-12 md:py-16"
        :class="isDark ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'"
      >
        <div class="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-start">
          <!-- Text column -->
          <div class="flex flex-col" :class="imageLeft ? 'md:order-2' : ''">
            <p
              v-if="section.category"
              class="text-sm font-medium tracking-wide mb-3"
              :class="isDark ? 'text-neutral-300' : 'text-neutral-800'"
            >
              {{ section.category }}
            </p>

            <h2 class="text-3xl md:text-4xl lg:text-[2.75rem] font-bold leading-tight mb-6 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">
              {{ section.title || 'Double-click to add title' }}
            </h2>

            <div
              class="w-full h-px mb-6"
              :class="isDark ? 'bg-neutral-600' : 'bg-neutral-300'"
            />

            <ul class="space-y-3">
              <li
                v-for="(tab, index) in section.tabs"
                :key="tab.label"
                class="flex items-start gap-3 cursor-pointer group"
                @click="select(index)"
              >
                <span
                  class="mt-[7px] size-2 rounded-full shrink-0 transition-colors"
                  :class="index === activeIndex ? 'bg-red-600' : 'bg-red-500'"
                />
                <span
                  class="text-base md:text-lg transition-all"
                  :class="[
                    index === activeIndex
                      ? 'font-semibold underline underline-offset-4 decoration-1'
                      : 'group-hover:opacity-100',
                    isDark
                      ? (index === activeIndex ? 'text-white' : 'text-neutral-300')
                      : (index === activeIndex ? 'text-neutral-900' : 'text-neutral-600'),
                  ]"
                >
                  {{ tab.label }}
                </span>
              </li>
            </ul>
          </div>

          <!-- Image column -->
          <div class="flex flex-col" :class="imageLeft ? 'md:order-1' : ''">
            <div
              v-if="activeTab?.image_url"
              class="relative overflow-hidden"
              :class="isDark ? 'bg-neutral-800' : 'bg-neutral-100'"
            >
              <img
                :src="activeTab.image_url"
                :alt="activeTab.label"
                class="w-full aspect-[4/3] object-cover transition-opacity duration-300"
              >
              <span
                v-if="activeTab.image_disclaimer"
                class="absolute bottom-0 right-0 bg-black/50 text-white/80 text-[11px] px-2.5 py-1"
              >
                {{ activeTab.image_disclaimer }}
              </span>
            </div>

            <div v-if="activeTab?.content_html" class="mt-4">
              <div
                class="text-sm leading-relaxed"
                :class="isDark ? 'text-neutral-400' : 'text-neutral-500'"
                v-html="activeTab.content_html"
              />
            </div>

            <!-- Disclaimer link + popup -->
            <div v-if="activeTab?.disclaimer" class="mt-4 relative">
              <button
                class="inline-flex items-center gap-1.5 text-sm transition-colors"
                :class="isDark ? 'text-neutral-200 hover:text-white' : 'text-neutral-800 hover:text-neutral-600'"
                @click.stop="disclaimerOpen = !disclaimerOpen"
              >
                <Info class="size-4" />
                <span class="underline underline-offset-2">Disclaimers</span>
              </button>

              <div
                v-if="disclaimerOpen"
                class="absolute bottom-full left-0 mb-2 w-full max-w-md border rounded-lg shadow-lg p-4 z-20"
                :class="isDark ? 'bg-neutral-800 border-neutral-700' : 'bg-white border-neutral-200'"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="font-semibold text-sm mb-1">
                      Disclaimers
                    </p>
                    <p class="text-sm" :class="isDark ? 'text-neutral-400' : 'text-neutral-500'">
                      {{ activeTab.disclaimer }}
                    </p>
                  </div>
                  <button
                    class="shrink-0 p-0.5 rounded transition-colors"
                    :class="isDark ? 'hover:bg-neutral-700' : 'hover:bg-neutral-100'"
                    @click.stop="disclaimerOpen = false"
                  >
                    <X class="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ========== VARIANT: default (horizontal tab bar) ========== -->
    <template v-else>
      <div
        class="px-8 py-10"
        :class="isDark ? 'bg-neutral-900 text-white' : ''"
      >
        <h3 class="text-xl font-bold mb-4 cursor-text outline-none" :style="{ opacity: section.title ? 1 : 0.4 }" @dblclick="startEditing('title', titleEdit, $event)" @blur="titleEdit.stopEdit()" @keydown="titleEdit.onKeydown" @paste="titleEdit.onPaste">
          {{ section.title || 'Double-click to add title' }}
        </h3>

        <!-- Tab bar -->
        <div
          class="flex gap-1 border-b mb-6"
          :class="isDark ? 'border-neutral-700' : 'border-neutral-200'"
        >
          <button
            v-for="(tab, index) in section.tabs"
            :key="tab.label"
            class="px-4 py-2.5 text-sm font-medium transition-colors relative -mb-px"
            :class="index === activeIndex
              ? (isDark
                ? 'text-white border-b-2 border-white'
                : 'text-neutral-900 border-b-2 border-neutral-900')
              : (isDark
                ? 'text-neutral-400 hover:text-neutral-200'
                : 'text-neutral-500 hover:text-neutral-700')"
            @click="select(index)"
          >
            {{ tab.label }}
          </button>
        </div>

        <!-- Tab content -->
        <div v-if="activeTab" class="flex flex-col md:flex-row gap-6 items-start">
          <div
            class="prose prose-sm max-w-none flex-1"
            :class="isDark ? 'prose-invert' : ''"
            v-html="activeTab.content_html"
          />
          <img
            v-if="activeTab.image_url"
            :src="activeTab.image_url"
            :alt="activeTab.label"
            class="rounded-lg max-w-md w-full object-cover"
          >
        </div>
      </div>
    </template>
  </div>
</template>
