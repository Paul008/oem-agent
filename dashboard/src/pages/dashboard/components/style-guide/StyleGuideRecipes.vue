<script lang="ts" setup>
import {
  Image as ImageIcon, Grid3x3, SplitSquareHorizontal, Play,
  Columns3, Database, Megaphone, Layers, SquareStack,
} from 'lucide-vue-next'

defineProps<{
  recipesByPattern: Record<string, Array<{ label: string; variant: string; resolves_to: string; defaults_json: any; source: 'brand' | 'default' }>>
  colors: any
  patterns: Array<{ key: string; label: string; icon: any }>
}>()

const PATTERNS = [
  { key: 'hero', label: 'Hero', icon: ImageIcon },
  { key: 'card-grid', label: 'Card Grid', icon: Grid3x3 },
  { key: 'split-content', label: 'Split Content', icon: SplitSquareHorizontal },
  { key: 'media', label: 'Media', icon: Play },
  { key: 'tabs', label: 'Tabs', icon: Columns3 },
  { key: 'data-display', label: 'Data Display', icon: Database },
  { key: 'action-bar', label: 'Action Bar', icon: Megaphone },
  { key: 'utility', label: 'Utility', icon: Layers },
] as const
</script>

<template>
  <UiCard class="overflow-hidden">
    <div class="px-6 pt-6 pb-2">
      <div class="flex items-center gap-2 mb-1">
        <SquareStack class="size-5 text-muted-foreground" />
        <h2 class="text-2xl font-bold">Recipes</h2>
      </div>
      <p class="text-sm text-muted-foreground">Section layout recipes grouped by pattern</p>
    </div>

    <div class="px-6 pb-6">
      <div class="space-y-6 mt-4">
        <template v-for="pattern in PATTERNS" :key="pattern.key">
          <div v-if="recipesByPattern[pattern.key]?.length">
            <div class="flex items-center gap-2 mb-3">
              <component :is="pattern.icon" class="size-4 text-muted-foreground" />
              <h3 class="text-sm font-semibold">{{ pattern.label }}</h3>
              <UiBadge variant="secondary" class="text-[10px]">
                {{ recipesByPattern[pattern.key].length }}
              </UiBadge>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="(recipe, idx) in recipesByPattern[pattern.key]"
                :key="idx"
                class="border rounded-lg overflow-hidden"
              >
                <!-- Mini preview -->
                <div class="h-28 bg-muted/30 relative overflow-hidden">
                  <!-- Saved thumbnail from extraction -->
                  <template v-if="recipe.defaults_json?.thumbnail_url">
                    <img
                      :src="recipe.defaults_json.thumbnail_url"
                      class="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  </template>

                  <!-- Card-grid preview -->
                  <template v-else-if="pattern.key === 'card-grid'">
                    <div
                      class="p-3 h-full flex items-center justify-center"
                      :style="{ backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb' }"
                    >
                      <div
                        class="grid gap-1.5 w-full"
                        :style="{
                          gridTemplateColumns: `repeat(${recipe.defaults_json?.columns || 3}, 1fr)`,
                        }"
                      >
                        <div
                          v-for="c in Math.min(recipe.defaults_json?.columns || 3, 4)"
                          :key="c"
                          class="flex flex-col gap-1 overflow-hidden"
                          :style="{
                            backgroundColor: recipe.defaults_json?.card_style?.background || '#fff',
                            border: recipe.defaults_json?.card_style?.border || '1px solid #e5e7eb',
                            borderRadius: (recipe.defaults_json?.card_style?.border_radius ?? 6) + 'px',
                          }"
                        >
                          <template v-for="slot in (recipe.defaults_json?.card_composition || ['image', 'title', 'body'])" :key="slot">
                            <div v-if="slot === 'image'" class="w-full h-6 bg-muted rounded-t" />
                            <div v-else-if="slot === 'title'" class="text-[7px] font-semibold px-1.5 truncate">Title</div>
                            <div v-else-if="slot === 'body'" class="text-[6px] text-muted-foreground px-1.5">Body text</div>
                            <div v-else-if="slot === 'cta'" class="text-[6px] px-1.5 pb-1" :style="{ color: colors?.primary || 'hsl(var(--primary))' }">CTA</div>
                            <div v-else-if="slot === 'badge'" class="px-1.5"><span class="text-[5px] px-1 py-0.5 rounded-full bg-primary/10 text-primary">Tag</span></div>
                          </template>
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- Hero preview -->
                  <template v-else-if="pattern.key === 'hero'">
                    <div class="h-full bg-gradient-to-br from-zinc-700 to-zinc-900 relative">
                      <div
                        class="absolute p-3"
                        :style="{
                          ...(recipe.defaults_json?.overlay_position === 'center'
                            ? { top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }
                            : recipe.defaults_json?.overlay_position === 'top-center'
                              ? { top: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }
                              : recipe.defaults_json?.overlay_position === 'bottom-center'
                                ? { bottom: '12px', left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }
                                : recipe.defaults_json?.overlay_position === 'top-left'
                                  ? { top: '12px', left: '12px', textAlign: 'left' }
                                  : { bottom: '12px', left: '12px', textAlign: 'left' }),
                        }"
                      >
                        <div
                          class="text-xs font-bold"
                          :style="{ color: recipe.defaults_json?.text_color || '#fff' }"
                        >
                          Hero Heading
                        </div>
                        <div
                          class="text-[8px] mt-0.5 opacity-70"
                          :style="{ color: recipe.defaults_json?.text_color || '#fff' }"
                        >
                          Sub heading
                        </div>
                      </div>
                    </div>
                  </template>

                  <!-- Split content preview -->
                  <template v-else-if="pattern.key === 'split-content'">
                    <div
                      class="h-full p-3 flex gap-2"
                      :style="{
                        backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb',
                        flexDirection: (recipe.defaults_json?.image_position || 'left') === 'right' ? 'row' : 'row-reverse',
                      }"
                    >
                      <div class="flex-1 flex flex-col justify-center gap-1">
                        <div class="text-[8px] font-semibold">Section Title</div>
                        <div class="text-[6px] text-muted-foreground">Content preview text here...</div>
                      </div>
                      <div class="flex-1 bg-muted rounded" />
                    </div>
                  </template>

                  <!-- Generic preview -->
                  <template v-else>
                    <div
                      class="h-full flex items-center justify-center"
                      :style="{ backgroundColor: recipe.defaults_json?.section_style?.background || '#f9fafb' }"
                    >
                      <div class="text-center">
                        <div class="text-[8px] font-medium text-muted-foreground mb-1">{{ pattern.label }}</div>
                        <div class="border rounded px-3 py-2 bg-background inline-block">
                          <div class="text-[7px] font-semibold">Content</div>
                        </div>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Recipe info -->
                <div class="px-3 py-2.5 bg-background">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-medium truncate">{{ recipe.label }}</span>
                    <UiBadge
                      :variant="recipe.source === 'brand' ? 'default' : 'secondary'"
                      class="text-[9px] shrink-0"
                    >
                      {{ recipe.source === 'brand' ? 'Brand' : 'Default' }}
                    </UiBadge>
                  </div>
                  <div class="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span class="font-mono">{{ recipe.variant }}</span>
                    <span>&rarr;</span>
                    <UiBadge variant="outline" class="text-[9px]">{{ recipe.resolves_to }}</UiBadge>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- Empty state -->
        <div
          v-if="!Object.values(recipesByPattern).some(arr => arr.length)"
          class="py-8 text-center"
        >
          <p class="text-sm text-muted-foreground">No recipes available for this OEM</p>
        </div>
      </div>
    </div>
  </UiCard>
</template>
