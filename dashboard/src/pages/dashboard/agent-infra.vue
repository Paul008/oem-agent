<script lang="ts" setup>
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  Globe,
  Layers,
  MonitorSmartphone,
  Server,
  Shield,
  Workflow,
} from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
import { TOOL_DESCRIPTIONS, WORKFLOW_METADATA } from '@/composables/use-agent-profile'

const tools = Object.entries(TOOL_DESCRIPTIONS).map(([name, description]) => ({ name, description }))
const workflows = Object.values(WORKFLOW_METADATA)
</script>

<template>
  <BasicPage title="Agent Infrastructure" description="How autonomous AI agents connect to OpenClaw, tools, and Cloudflare" sticky>
    <!-- Architecture Overview -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Layers class="size-4 text-blue-500" />
          Two-Layer Architecture
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <p class="text-sm text-muted-foreground mb-4">
          Agents operate through two distinct layers. OpenClaw provides the agent runtime and tool abstractions;
          Cloudflare provides the actual compute and browser rendering infrastructure.
        </p>

        <!-- Architecture Diagram -->
        <div class="rounded-lg border bg-muted/30 p-6 font-mono text-xs leading-relaxed overflow-x-auto">
          <div class="min-w-[500px]">
            <!-- Layer 1 -->
            <div class="rounded-md border border-blue-500/30 bg-blue-500/5 p-4 mb-3">
              <p class="text-blue-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">
                Layer 1 — OpenClaw Agent Runtime
              </p>
              <div class="flex flex-wrap gap-1.5">
                <UiBadge v-for="t in tools" :key="t.name" variant="outline" class="text-[10px]">
                  {{ t.name }}
                </UiBadge>
              </div>
              <p class="text-muted-foreground mt-2">
                Agent sees these tools. Defined in workflow config. Access controlled by tool profiles.
              </p>
            </div>

            <!-- Arrow -->
            <div class="flex justify-center py-1">
              <div class="flex flex-col items-center text-muted-foreground">
                <span class="text-[10px]">CDP WebSocket</span>
                <ArrowRight class="size-4 rotate-90" />
              </div>
            </div>

            <!-- Layer 2 -->
            <div class="rounded-md border border-orange-500/30 bg-orange-500/5 p-4">
              <p class="text-orange-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">
                Layer 2 — Cloudflare Infrastructure
              </p>
              <div class="grid sm:grid-cols-2 gap-2 text-muted-foreground">
                <div class="flex items-center gap-2">
                  <Server class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">src/routes/cdp.ts</code> — CDP WebSocket shim</span>
                </div>
                <div class="flex items-center gap-2">
                  <MonitorSmartphone class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">@cloudflare/puppeteer</code> — Browser Rendering API</span>
                </div>
                <div class="flex items-center gap-2">
                  <Globe class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">page-capturer.ts</code> — Direct Puppeteer usage</span>
                </div>
                <div class="flex items-center gap-2">
                  <Workflow class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">network-browser.ts</code> — Network interception</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p class="text-xs text-muted-foreground mt-3">
          When an agent uses the <code class="rounded bg-muted px-1 py-0.5">browser</code> tool, OpenClaw sends CDP commands
          over WebSocket to the Worker at <code class="rounded bg-muted px-1 py-0.5">/cdp</code>. The Worker translates these
          to <code class="rounded bg-muted px-1 py-0.5">@cloudflare/puppeteer</code> calls against the Browser Rendering binding.
          Agents never touch Puppeteer directly.
        </p>
      </UiCardContent>
    </UiCard>

    <!-- Agent Spawning Flow -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <BrainCircuit class="size-4 text-purple-500" />
          Agent Spawning Flow
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-7 gap-2 text-center text-xs">
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">
              Change Event
            </p>
            <p class="text-muted-foreground mt-1">
              Price change, new product, broken link...
            </p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">
              Workflow Router
            </p>
            <p class="text-muted-foreground mt-1">
              Match event to workflow by entity + type + severity
            </p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">
              Agent Spawner
            </p>
            <p class="text-muted-foreground mt-1">
              Select AI model, build prompt, call provider
            </p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">
              Execute / Approve
            </p>
            <p class="text-muted-foreground mt-1">
              Auto-execute if confident, else queue for review
            </p>
          </div>
        </div>

        <div class="mt-4 text-xs text-muted-foreground">
          <p><strong>Key files:</strong></p>
          <ul class="mt-1 space-y-0.5 pl-4 list-disc">
            <li><code class="rounded bg-muted px-1 py-0.5">src/workflows/router.ts</code> — Workflow definitions, trigger rules, tool grants</li>
            <li><code class="rounded bg-muted px-1 py-0.5">src/workflows/agent-spawner.ts</code> — Agent lifecycle, model selection, prompt building</li>
            <li><code class="rounded bg-muted px-1 py-0.5">skills/autonomous-agents/*/SKILL.md</code> — Per-workflow skill instructions</li>
          </ul>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- OpenClaw Tool Reference -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Bot class="size-4 text-green-500" />
          OpenClaw Tool Reference
        </UiCardTitle>
        <p class="text-xs text-muted-foreground">
          These are the actual <a href="https://docs.openclaw.ai/tools" target="_blank" rel="noopener" class="underline hover:text-foreground">OpenClaw tools</a>.
          Never use library names (playwright, puppeteer, bash, grep) in workflow definitions.
        </p>
      </UiCardHeader>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[120px]">
              Tool
            </UiTableHead>
            <UiTableHead>Description</UiTableHead>
            <UiTableHead>Used By</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="t in tools" :key="t.name">
            <UiTableCell>
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{{ t.name }}</code>
            </UiTableCell>
            <UiTableCell class="text-sm text-muted-foreground">
              {{ t.description }}
            </UiTableCell>
            <UiTableCell>
              <div class="flex flex-wrap gap-1">
                <UiBadge
                  v-for="w in workflows.filter(wf => wf.tools.includes(t.name))"
                  :key="w.id"
                  variant="outline"
                  class="text-[10px]"
                  :class="w.colorClass"
                >
                  {{ w.name.split(' ')[0] }}
                </UiBadge>
              </div>
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <!-- Workflow Summary -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Workflow class="size-4 text-cyan-500" />
          Workflow Summary
        </UiCardTitle>
      </UiCardHeader>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead>Workflow</UiTableHead>
            <UiTableHead>Agent Type</UiTableHead>
            <UiTableHead>Tools</UiTableHead>
            <UiTableHead class="text-right">
              Confidence
            </UiTableHead>
            <UiTableHead class="text-right">
              Priority
            </UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow v-for="w in workflows" :key="w.id">
            <UiTableCell>
              <RouterLink :to="`/dashboard/agents/${w.id}`" class="flex items-center gap-2 hover:underline">
                <div class="rounded p-1 border" :class="w.colorClass">
                  <component :is="w.icon" class="size-3" />
                </div>
                <span class="text-sm font-medium">{{ w.name }}</span>
              </RouterLink>
            </UiTableCell>
            <UiTableCell>
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs">{{ w.agent_type }}</code>
            </UiTableCell>
            <UiTableCell>
              <div class="flex flex-wrap gap-1">
                <UiBadge v-for="t in w.tools" :key="t" variant="outline" class="text-[10px]">
                  {{ t }}
                </UiBadge>
              </div>
            </UiTableCell>
            <UiTableCell class="text-right text-sm font-medium">
              {{ (w.defaultConfidence * 100).toFixed(0) }}%
            </UiTableCell>
            <UiTableCell class="text-right text-sm">
              {{ w.defaultPriority }}/10
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <!-- Safety & Security -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Shield class="size-4 text-red-500" />
          Safety Mechanisms
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p class="font-medium mb-1">
              Tool Profiles
            </p>
            <p class="text-xs text-muted-foreground">
              OpenClaw restricts tool access via profiles: <code class="rounded bg-muted px-1 py-0.5">minimal</code>,
              <code class="rounded bg-muted px-1 py-0.5">coding</code>,
              <code class="rounded bg-muted px-1 py-0.5">messaging</code>,
              <code class="rounded bg-muted px-1 py-0.5">full</code>.
              Deny lists override allow lists. Tool groups (<code class="rounded bg-muted px-1 py-0.5">group:fs</code>,
              <code class="rounded bg-muted px-1 py-0.5">group:runtime</code>, etc.) simplify policy management.
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">
              Confidence Gating
            </p>
            <p class="text-xs text-muted-foreground">
              Each workflow has a confidence threshold. Actions only auto-execute when the agent's confidence meets
              or exceeds the threshold. Below threshold, actions queue for human approval on the
              <RouterLink to="/dashboard/agents/" class="underline hover:text-foreground">
                Agents page
              </RouterLink>.
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">
              Rate Limiting
            </p>
            <p class="text-xs text-muted-foreground">
              Per-workflow hourly and daily limits prevent runaway agents. Circuit breaker auto-disables
              workflows when error rate exceeds 10%. Configurable in
              <code class="rounded bg-muted px-1 py-0.5">router.ts</code>.
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">
              Rollback
            </p>
            <p class="text-xs text-muted-foreground">
              Every agent action stores a snapshot of the entity before modification.
              One-click rollback via the dashboard restores the previous state.
              Rollback data is retained for 30-90 days depending on workflow.
            </p>
          </div>
        </div>
      </UiCardContent>
    </UiCard>
  </BasicPage>
</template>
