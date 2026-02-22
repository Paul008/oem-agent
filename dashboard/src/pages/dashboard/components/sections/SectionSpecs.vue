<script lang="ts" setup>
defineProps<{
  section: {
    type: 'specs-grid'
    title?: string
    categories: Array<{
      name: string
      specs: Array<{ label: string; value: string; unit?: string }>
    }>
  }
}>()
</script>

<template>
  <div v-if="section.categories?.length" class="px-8 py-10">
    <h3 v-if="section.title" class="text-xl font-bold mb-4">{{ section.title }}</h3>
    <UiAccordion type="multiple" class="w-full">
      <UiAccordionItem
        v-for="category in section.categories"
        :key="category.name"
        :value="category.name"
      >
        <UiAccordionTrigger class="text-sm font-semibold">
          {{ category.name }}
        </UiAccordionTrigger>
        <UiAccordionContent>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 py-2">
            <div
              v-for="spec in category.specs"
              :key="spec.label"
              class="flex justify-between py-1.5 border-b border-border/50 text-sm"
            >
              <span class="text-muted-foreground">{{ spec.label }}</span>
              <span class="font-medium text-right">
                {{ spec.value }}
                <span v-if="spec.unit" class="text-muted-foreground text-xs ml-0.5">{{ spec.unit }}</span>
              </span>
            </div>
          </div>
        </UiAccordionContent>
      </UiAccordionItem>
    </UiAccordion>
  </div>
</template>
