<script lang="ts" setup>
import { Check, Copy, Download, Type } from 'lucide-vue-next'

import { useClipboard } from '@/composables/use-clipboard'

defineProps<{
  typography: any
}>()

const { copy, isCopied } = useClipboard()

const TYPO_SCALES = [
  'display',
  'h1',
  'h2',
  'h3',
  'h4',
  'body_large',
  'body',
  'body_small',
  'caption',
  'price',
  'disclaimer',
  'cta',
  'nav',
] as const

function capFontSize(size: string | number | undefined, max = 48): string {
  if (!size)
    return '16px'
  const n = typeof size === 'number' ? size : Number.parseInt(String(size), 10)
  if (Number.isNaN(n))
    return String(size)
  return `${Math.min(n, max)}px`
}

function fontFamilyLabel(value: string | undefined): string {
  return value?.split(',')[0]?.trim() || 'System'
}

function typographyTokenSummary(token: any): string {
  return [
    token?.fontSize,
    token?.fontWeight,
    token?.letterSpacing,
    token?.lineHeight,
  ].filter(Boolean).join(' / ')
}

function typographyTokenCss(token: any): string {
  return [
    token?.fontSize ? `font-size: ${token.fontSize}` : '',
    token?.fontWeight ? `font-weight: ${token.fontWeight}` : '',
    token?.letterSpacing ? `letter-spacing: ${token.letterSpacing}` : '',
    token?.lineHeight ? `line-height: ${token.lineHeight}` : '',
  ].filter(Boolean).join('; ')
}

async function copyTypographyScale(scale: string, token: any): Promise<void> {
  await copy(typographyTokenCss(token) || typographyTokenSummary(token), `type-${scale}`)
}

async function copyFontName(key: string, value: string | undefined): Promise<void> {
  await copy(fontFamilyLabel(value), `font-${key}`)
}

async function copyFontFace(face: any): Promise<void> {
  await copy([face?.family, face?.weight].filter(Boolean).join(' '), `font-${face.family}-${face.weight}`)
}
</script>

<template>
  <UiCard v-if="typography" class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <Type class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">
          Typography
        </h2>
      </div>
      <p class="text-sm text-muted-foreground">
        Primary font:
        <button
          type="button"
          class="group inline-flex items-center gap-1 rounded px-1 font-semibold transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          :title="`Copy ${fontFamilyLabel(typography.font_primary)}`"
          @click="copyFontName('primary', typography.font_primary)"
        >
          {{ fontFamilyLabel(typography.font_primary) }}
          <span
            class="inline-flex opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
            :class="{ '!opacity-100': isCopied('font-primary') }"
            data-export-ignore
          >
            <Check v-if="isCopied('font-primary')" class="size-3" />
            <Copy v-else class="size-3" />
          </span>
        </button>
        <template v-if="typography.font_secondary">
          &middot; Secondary:
          <button
            type="button"
            class="group inline-flex items-center gap-1 rounded px-1 font-semibold transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :title="`Copy ${fontFamilyLabel(typography.font_secondary)}`"
            @click="copyFontName('secondary', typography.font_secondary)"
          >
            {{ fontFamilyLabel(typography.font_secondary) }}
            <span
              class="inline-flex opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
              :class="{ '!opacity-100': isCopied('font-secondary') }"
              data-export-ignore
            >
              <Check v-if="isCopied('font-secondary')" class="size-3" />
              <Copy v-else class="size-3" />
            </span>
          </button>
        </template>
      </p>
    </div>

    <div class="px-6 pb-6">
      <div class="space-y-0 divide-y">
        <template v-for="scale in TYPO_SCALES" :key="scale">
          <div
            v-if="typography.scale?.[scale]"
            class="py-4 flex items-baseline gap-6"
          >
            <div class="w-24 shrink-0">
              <p class="text-xs font-medium text-muted-foreground">
                {{ scale.replace(/_/g, ' ') }}
              </p>
            </div>
            <div class="flex-1 min-w-0">
              <p
                class="truncate"
                :style="{
                  fontSize: capFontSize(typography.scale[scale].fontSize, 48),
                  fontWeight: typography.scale[scale].fontWeight || 'normal',
                  letterSpacing: typography.scale[scale].letterSpacing || 'normal',
                  lineHeight: typography.scale[scale].lineHeight || 'normal',
                  fontFamily: typography.font_primary?.split(',')[0] || 'inherit',
                }"
              >
                The quick brown fox jumps
              </p>
            </div>
            <div class="w-56 shrink-0 text-right">
              <button
                type="button"
                class="group inline-flex max-w-full items-center justify-end gap-1 rounded px-1.5 py-1 text-right transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                :title="`Copy ${typographyTokenCss(typography.scale[scale])}`"
                @click="copyTypographyScale(scale, typography.scale[scale])"
              >
                <span class="truncate text-[10px] text-muted-foreground font-mono">
                  {{ typographyTokenSummary(typography.scale[scale]) }}
                </span>
                <span
                  class="inline-flex shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100"
                  :class="{ '!opacity-100': isCopied(`type-${scale}`) }"
                  data-export-ignore
                >
                  <Check v-if="isCopied(`type-${scale}`)" class="size-3" />
                  <Copy v-else class="size-3" />
                </span>
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- Fallback when no scale entries exist -->
      <div
        v-if="!typography.scale || !Object.keys(typography.scale).length"
        class="py-8 text-center"
      >
        <p class="text-sm text-muted-foreground">
          No type scale defined. Font family is available but no scale entries.
        </p>
      </div>

      <!-- Font files -->
      <div v-if="typography.font_faces?.length" class="mt-4 pt-4 border-t">
        <p class="text-xs font-medium text-muted-foreground mb-3">
          Font Files
        </p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="face in typography.font_faces"
            :key="face.url"
            class="inline-flex items-center gap-1 rounded-md border px-2 py-1.5"
          >
            <a
              :href="face.url"
              download
              class="inline-flex items-center gap-1.5 text-xs font-medium hover:text-primary"
            >
              <Download class="size-3" />
              {{ face.family }} {{ face.weight }}
            </a>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :title="`Copy ${face.family} ${face.weight}`"
              data-export-ignore
              @click="copyFontFace(face)"
            >
              <Check v-if="isCopied(`font-${face.family}-${face.weight}`)" class="size-3" />
              <Copy v-else class="size-3" />
              {{ isCopied(`font-${face.family}-${face.weight}`) ? 'Copied' : 'Copy' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </UiCard>
</template>
