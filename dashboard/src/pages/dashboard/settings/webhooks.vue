<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { Loader2, Plug, Plus, Trash2, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { fetchWebhooks, addWebhook, deleteWebhook } from '@/lib/worker-api'

const loading = ref(true)
const webhooks = ref<Array<{ id: string; url: string; events: string[]; created_at: string }>>([])

const showAdd = ref(false)
const newUrl = ref('')
const newEvents = ref<Set<string>>(new Set())
const adding = ref(false)

const EVENTS = ['page_generated', 'tokens_applied', 'drift_detected']

onMounted(async () => {
  try {
    const data = await fetchWebhooks()
    webhooks.value = data.webhooks
  } catch {
    toast.error('Failed to load webhooks')
  } finally {
    loading.value = false
  }
})

async function handleAdd() {
  if (!newUrl.value || !newEvents.value.size) return
  adding.value = true
  try {
    const result = await addWebhook(newUrl.value, Array.from(newEvents.value))
    webhooks.value.push(result.webhook)
    showAdd.value = false
    newUrl.value = ''
    newEvents.value = new Set()
    toast.success('Webhook added')
  } catch (err: any) {
    toast.error(err.message || 'Failed to add webhook')
  } finally {
    adding.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await deleteWebhook(id)
    webhooks.value = webhooks.value.filter(w => w.id !== id)
    toast.success('Webhook removed')
  } catch {
    toast.error('Failed to delete webhook')
  }
}

function toggleEvent(event: string) {
  if (newEvents.value.has(event)) newEvents.value.delete(event)
  else newEvents.value.add(event)
}
</script>

<template>
  <BasicPage title="Webhooks" description="Receive notifications when pages are generated, tokens change, or design drift is detected.">
    <div v-if="loading" class="flex items-center justify-center h-64">
      <Loader2 class="size-6 animate-spin text-muted-foreground" />
    </div>

    <div v-else class="space-y-6">
      <div class="flex justify-end">
        <UiButton @click="showAdd = true">
          <Plus class="size-4 mr-1" /> Add Webhook
        </UiButton>
      </div>

      <!-- Webhook list -->
      <UiCard v-if="webhooks.length" class="overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/50">
              <th class="px-4 py-2.5 text-left font-medium">URL</th>
              <th class="px-4 py-2.5 text-left font-medium">Events</th>
              <th class="px-4 py-2.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="wh in webhooks" :key="wh.id">
              <td class="px-4 py-2.5 font-mono text-xs truncate max-w-xs">{{ wh.url }}</td>
              <td class="px-4 py-2.5">
                <div class="flex gap-1 flex-wrap">
                  <span v-for="e in wh.events" :key="e" class="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {{ e }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-2.5 text-right">
                <UiButton size="sm" variant="ghost" @click="handleDelete(wh.id)">
                  <Trash2 class="size-3.5 text-destructive" />
                </UiButton>
              </td>
            </tr>
          </tbody>
        </table>
      </UiCard>

      <div v-else class="flex flex-col items-center justify-center h-48 gap-3">
        <Plug class="size-10 text-muted-foreground/30" />
        <p class="text-sm text-muted-foreground">No webhooks configured</p>
      </div>

      <!-- Add dialog -->
      <div v-if="showAdd" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showAdd = false">
        <div class="bg-background border rounded-lg shadow-lg w-full max-w-md mx-4 p-6 space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold">Add Webhook</h2>
            <button class="text-muted-foreground hover:text-foreground" @click="showAdd = false"><X class="size-5" /></button>
          </div>

          <div>
            <label class="text-xs font-medium">URL</label>
            <UiInput v-model="newUrl" placeholder="https://webhook.site/..." class="mt-1" />
          </div>

          <div>
            <label class="text-xs font-medium">Events</label>
            <div class="flex gap-2 mt-2">
              <button
                v-for="event in EVENTS"
                :key="event"
                class="text-xs px-3 py-1.5 rounded-full border"
                :class="newEvents.has(event) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'"
                @click="toggleEvent(event)"
              >
                {{ event }}
              </button>
            </div>
          </div>

          <UiButton class="w-full" :disabled="!newUrl || !newEvents.size || adding" @click="handleAdd">
            <Loader2 v-if="adding" class="size-4 mr-1 animate-spin" />
            Add Webhook
          </UiButton>
        </div>
      </div>
    </div>
  </BasicPage>
</template>
