<script lang="ts" setup>
import { Bot, CheckCircle, KeyRound, Link, List, Plug, Shield, Terminal } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { BasicPage } from '@/components/global-layout'

const baseUrl = computed(() => {
  // In production this should come from an env var; fallback to current host.
  if (typeof window === 'undefined')
    return 'https://oem-agent.adme-dev.workers.dev'
  return window.location.origin
})

const mcpEndpoint = computed(() => `${baseUrl.value}/mcp/sse`)

const tools = [
  { name: 'list_oems', description: 'List all available OEMs in the registry.' },
  { name: 'search_oem_models', description: 'Search vehicle models by OEM and optional name query.' },
  { name: 'get_oem_model', description: 'Get full model details, variants, colors, pricing, and offers.' },
  { name: 'list_oem_recipes', description: 'Browse reusable design recipes for an OEM.' },
  { name: 'generate_model_page', description: 'Generate an AI-powered model page for a specific vehicle.' },
  { name: 'create_model_subpage', description: 'Create a subpage under an existing model page.' },
  { name: 'get_page_status', description: 'Check whether a generated page exists and get its metadata.' },
  { name: 'trigger_oem_sync', description: 'Trigger a data sync/crawl job for one OEM or all OEMs.' },
]

const authMethods = [
  {
    title: 'MCP_AUTH_TOKEN',
    icon: KeyRound,
    text: 'Set a dedicated bearer token via `wrangler secret put MCP_AUTH_TOKEN`. Clients send `Authorization: Bearer <token>`.',
  },
  {
    title: 'Supabase session',
    icon: Shield,
    text: 'Use a valid Supabase user JWT as the bearer token. The worker validates it against Supabase.',
  },
  {
    title: 'Cloudflare Access',
    icon: Shield,
    text: 'When the worker is behind Cloudflare Access, send the `CF-Access-JWT-Assertion` header.',
  },
]

const copied = ref(false)
function copyEndpoint() {
  navigator.clipboard.writeText(mcpEndpoint.value)
  copied.value = true
  setTimeout(() => copied.value = false, 2_000)
}
</script>

<template>
  <BasicPage
    title="MCP Server"
    description="Connect AI assistants to the OEM Agent via the Model Context Protocol"
    sticky
  >
    <div class="grid gap-6 lg:grid-cols-3">
      <div class="lg:col-span-2 space-y-6">
        <!-- Overview -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Plug class="size-5 text-primary" />
              Remote MCP Endpoint
            </UiCardTitle>
            <UiCardDescription>
              The MCP server is mounted at <code>/mcp</code> on the worker. It uses Server-Sent Events (SSE) for streaming and JSON-RPC for requests.
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-4">
            <div class="flex items-center gap-2 rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              <span class="truncate">{{ mcpEndpoint }}</span>
              <UiButton variant="ghost" size="icon" class="ml-auto shrink-0" @click="copyEndpoint">
                <CheckCircle v-if="copied" class="size-4 text-green-500" />
                <Link v-else class="size-4" />
              </UiButton>
            </div>

            <div class="text-sm text-muted-foreground">
              <p class="mb-2">
                Supported clients include ChatGPT (developer mode), Claude, and Cursor. Add the endpoint URL and an auth header in your MCP client settings.
              </p>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Authentication -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Shield class="size-5 text-primary" />
              Authentication
            </UiCardTitle>
            <UiCardDescription>
              Choose one of the following methods to authenticate MCP requests.
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent class="space-y-3">
            <div
              v-for="method in authMethods"
              :key="method.title"
              class="flex items-start gap-3 rounded-lg border p-3"
            >
              <component :is="method.icon" class="mt-0.5 size-5 text-muted-foreground" />
              <div>
                <div class="font-medium">
                  {{ method.title }}
                </div>
                <div class="text-sm text-muted-foreground" v-html="method.text" />
              </div>
            </div>
          </UiCardContent>
        </UiCard>

        <!-- Curl example -->
        <UiCard>
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <Terminal class="size-5 text-primary" />
              Quick Test
            </UiCardTitle>
          </UiCardHeader>
          <UiCardContent>
            <pre class="overflow-x-auto rounded-md bg-muted p-3 text-xs font-mono"><code>curl -N -H "Authorization: Bearer $MCP_AUTH_TOKEN" \
  {{ mcpEndpoint }}</code></pre>
            <p class="mt-3 text-sm text-muted-foreground">
              The stream will return an <code>endpoint</code> event with the session-specific message URL. POST JSON-RPC messages to that URL.
            </p>
          </UiCardContent>
        </UiCard>
      </div>

      <!-- Tools list -->
      <div>
        <UiCard class="h-full">
          <UiCardHeader>
            <UiCardTitle class="flex items-center gap-2">
              <List class="size-5 text-primary" />
              Available Tools
            </UiCardTitle>
            <UiCardDescription>
              {{ tools.length }} tools exposed by the OEM Agent MCP server
            </UiCardDescription>
          </UiCardHeader>
          <UiCardContent>
            <ul class="space-y-3">
              <li
                v-for="tool in tools"
                :key="tool.name"
                class="rounded-lg border p-3"
              >
                <div class="flex items-center gap-2 font-mono text-sm font-medium">
                  <Bot class="size-4 text-primary" />
                  {{ tool.name }}
                </div>
                <p class="mt-1 text-sm text-muted-foreground">
                  {{ tool.description }}
                </p>
              </li>
            </ul>
          </UiCardContent>
        </UiCard>
      </div>
    </div>
  </BasicPage>
</template>
