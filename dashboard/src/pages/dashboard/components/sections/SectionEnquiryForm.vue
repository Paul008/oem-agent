<script lang="ts" setup>
defineProps<{
  section: {
    type: 'enquiry-form'
    heading: string
    sub_heading?: string
    form_type: 'contact' | 'test-drive' | 'service'
    vehicle_context: boolean
  }
}>()

const formTypeLabels: Record<string, string> = {
  'contact': 'Contact',
  'test-drive': 'Test Drive',
  'service': 'Service',
}
</script>

<template>
  <div class="px-8 py-10">
    <h3 v-if="section.heading" class="text-xl font-bold mb-2">{{ section.heading }}</h3>
    <p v-if="section.sub_heading" class="text-sm text-muted-foreground mb-6">{{ section.sub_heading }}</p>
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
