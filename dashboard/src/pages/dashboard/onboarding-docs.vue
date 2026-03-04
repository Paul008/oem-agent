<script lang="ts" setup>
import {
  ArrowRight,
  Code,
  Database,
  FileCode2,
  Globe,
  Layers,
  Rocket,
  Search,
  Server,
  Shield,
} from 'lucide-vue-next'

import { BasicPage } from '@/components/global-layout'
</script>

<template>
  <BasicPage title="OEM Onboarding Infrastructure" description="How the onboarding wizard discovers, registers, and configures new OEMs" sticky>
    <!-- Architecture Overview -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Layers class="size-4 text-blue-500" />
          System Architecture
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <p class="text-sm text-muted-foreground mb-4">
          The onboarding wizard is a 7-step pipeline that discovers an OEM website, registers it in the database,
          triggers a first crawl, and generates TypeScript code snippets for the code deploy.
        </p>

        <!-- Architecture Diagram -->
        <div class="rounded-lg border bg-muted/30 p-6 font-mono text-xs leading-relaxed overflow-x-auto">
          <div class="min-w-[600px]">
            <!-- Frontend Layer -->
            <div class="rounded-md border border-blue-500/30 bg-blue-500/5 p-4 mb-3">
              <p class="text-blue-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">Dashboard (Vue 3)</p>
              <div class="grid sm:grid-cols-2 gap-2 text-muted-foreground">
                <div class="flex items-center gap-2">
                  <FileCode2 class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">onboarding.vue</code> &mdash; 7-step wizard page</span>
                </div>
                <div class="flex items-center gap-2">
                  <Code class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">use-onboarding.ts</code> &mdash; State composable</span>
                </div>
                <div class="flex items-center gap-2">
                  <Globe class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">worker-api.ts</code> &mdash; API client functions</span>
                </div>
                <div class="flex items-center gap-2">
                  <Search class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">use-realtime.ts</code> &mdash; Live crawl progress</span>
                </div>
              </div>
            </div>

            <!-- Arrow -->
            <div class="flex justify-center py-1">
              <div class="flex flex-col items-center text-muted-foreground">
                <span class="text-[10px]">POST /admin/onboarding/*</span>
                <ArrowRight class="size-4 rotate-90" />
              </div>
            </div>

            <!-- Backend Layer -->
            <div class="rounded-md border border-orange-500/30 bg-orange-500/5 p-4 mb-3">
              <p class="text-orange-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">Cloudflare Worker (Hono)</p>
              <div class="grid sm:grid-cols-3 gap-2 text-muted-foreground">
                <div class="flex items-center gap-2">
                  <Server class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">POST /discover</code></span>
                </div>
                <div class="flex items-center gap-2">
                  <Database class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">POST /register</code></span>
                </div>
                <div class="flex items-center gap-2">
                  <Code class="size-3.5 shrink-0" />
                  <span><code class="text-foreground">POST /generate-snippets</code></span>
                </div>
              </div>
            </div>

            <!-- Arrow -->
            <div class="flex justify-center py-1">
              <div class="flex flex-col items-center text-muted-foreground">
                <span class="text-[10px]">Supabase JS Client</span>
                <ArrowRight class="size-4 rotate-90" />
              </div>
            </div>

            <!-- Database Layer -->
            <div class="rounded-md border border-green-500/30 bg-green-500/5 p-4">
              <p class="text-green-500 font-semibold mb-2 text-[11px] uppercase tracking-wider">Supabase (Postgres)</p>
              <div class="flex flex-wrap gap-1.5">
                <UiBadge variant="outline" class="text-[10px]">oems</UiBadge>
                <UiBadge variant="outline" class="text-[10px]">source_pages</UiBadge>
                <UiBadge variant="outline" class="text-[10px]">discovered_apis</UiBadge>
                <UiBadge variant="outline" class="text-[10px]">import_runs (realtime)</UiBadge>
              </div>
            </div>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- Wizard Steps Flow -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Rocket class="size-4 text-purple-500" />
          7-Step Wizard Flow
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-7 gap-2 text-center text-xs">
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">1. Enter URL</p>
            <p class="text-muted-foreground mt-1">Base URL, OEM name, auto-generated ID</p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">2. Review Pages</p>
            <p class="text-muted-foreground mt-1">Sitemap + homepage links, classify by type</p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">3. Configure</p>
            <p class="text-muted-foreground mt-1">Brand color, schedule, sub-brands, APIs</p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">4. Register</p>
            <p class="text-muted-foreground mt-1">Insert OEM + pages + APIs into DB</p>
          </div>
        </div>
        <div class="grid sm:grid-cols-7 gap-2 text-center text-xs mt-2">
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">5. First Crawl</p>
            <p class="text-muted-foreground mt-1">Trigger crawl, live realtime progress</p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3">
            <p class="font-semibold text-foreground">6. Code Snippets</p>
            <p class="text-muted-foreground mt-1">types.ts, registry.ts, agent.ts, migration</p>
          </div>
          <div class="flex items-center justify-center text-muted-foreground">
            <ArrowRight class="size-4" />
          </div>
          <div class="rounded-md border p-3 border-green-500/30 bg-green-500/5">
            <p class="font-semibold text-foreground">7. Report</p>
            <p class="text-muted-foreground mt-1">Summary, cron setup, deploy checklist</p>
          </div>
          <div class="sm:col-span-2" />
        </div>

        <p class="text-xs text-muted-foreground mt-4">
          Steps 1-4 happen in the browser + worker. Step 5 triggers an existing crawl endpoint and uses
          Supabase Realtime to stream <code class="rounded bg-muted px-1 py-0.5">import_runs</code> updates.
          Steps 6-7 are purely client-side (code generation + report).
        </p>
      </UiCardContent>
    </UiCard>

    <!-- Discovery Pipeline -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Search class="size-4 text-cyan-500" />
          Discovery Pipeline
        </UiCardTitle>
        <p class="text-xs text-muted-foreground">
          The <code class="rounded bg-muted px-1 py-0.5">POST /discover</code> endpoint fetches multiple sources in parallel
          to build a complete picture of the OEM's website.
        </p>
      </UiCardHeader>
      <UiCardContent>
        <div class="space-y-3 text-sm">
          <div class="grid sm:grid-cols-3 gap-3">
            <div class="rounded-md border p-3">
              <p class="font-medium text-xs mb-1">1. Parallel Fetch</p>
              <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>sitemap.xml (+ fallback: sitemap_index.xml, sitemaps.xml)</li>
                <li>Homepage HTML (15s timeout)</li>
                <li>robots.txt (Sitemap: directives)</li>
              </ul>
            </div>
            <div class="rounded-md border p-3">
              <p class="font-medium text-xs mb-1">2. Fallback Chain</p>
              <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>If no sitemap &rarr; try robots.txt sitemaps</li>
                <li>If still empty &rarr; extract links from homepage HTML</li>
                <li>Homepage always included as fallback URL</li>
              </ul>
            </div>
            <div class="rounded-md border p-3">
              <p class="font-medium text-xs mb-1">3. Analysis</p>
              <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                <li>Framework detection (Next.js, Nuxt, AEM, WP, Shopify)</li>
                <li>Brand color (meta theme-color, CSS variables)</li>
                <li>URL classification into 9 page types</li>
                <li>Sub-brand detection from URL patterns</li>
              </ul>
            </div>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- API Reference -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Server class="size-4 text-orange-500" />
          API Reference
        </UiCardTitle>
        <p class="text-xs text-muted-foreground">
          All endpoints are mounted at <code class="rounded bg-muted px-1 py-0.5">/api/v1/oem-agent/admin/onboarding/*</code>
          and require admin authentication.
        </p>
      </UiCardHeader>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[200px]">Endpoint</UiTableHead>
            <UiTableHead>Input</UiTableHead>
            <UiTableHead>Output</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow>
            <UiTableCell>
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">POST /discover</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ base_url, oem_name? }</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ oem_id, oem_name, base_url, discovery: { sitemap_urls, homepage_links_count, classified_pages, framework, brand_color, sub_brands } }</code>
            </UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell>
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">POST /register</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ oem_id, oem_name, base_url, source_pages[], config, flags, discovered_apis? }</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ success, oem_id, source_pages_created, discovered_apis_created }</code>
            </UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell>
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">POST /generate-snippets</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ oem_id, oem_name, base_url, brand_color?, config, flags, source_pages[], notes? }</code>
            </UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">
              <code>{ snippets: { types, registry, agent, migration } }</code> &mdash; each with file, description, code
            </UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <!-- Page Type Classification -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <FileCode2 class="size-4 text-indigo-500" />
          Page Type Classification
        </UiCardTitle>
        <p class="text-xs text-muted-foreground">
          URLs are classified by path pattern matching into the platform's <code class="rounded bg-muted px-1 py-0.5">PageType</code> union.
        </p>
      </UiCardHeader>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[120px]">Type</UiTableHead>
            <UiTableHead>Pattern</UiTableHead>
            <UiTableHead>Auto-included</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow>
            <UiTableCell><UiBadge variant="default" class="text-xs">homepage</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/ or /index.html</UiTableCell>
            <UiTableCell><UiBadge variant="outline" class="text-xs">Yes</UiBadge></UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="default" class="text-xs">vehicle</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/vehicles/*, /models/*, /ute/*, /truck/*, /suv/*</UiTableCell>
            <UiTableCell><UiBadge variant="outline" class="text-xs">Yes</UiBadge></UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="default" class="text-xs">category</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/vehicles/ (index), /series/*, /lineup/*</UiTableCell>
            <UiTableCell><UiBadge variant="outline" class="text-xs">Yes</UiBadge></UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="default" class="text-xs">offers</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/offers*, /deals*, /specials*, /promotions*</UiTableCell>
            <UiTableCell><UiBadge variant="outline" class="text-xs">Yes</UiBadge></UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="default" class="text-xs">news</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/news*, /blog*, /stories*, /media*, /press*</UiTableCell>
            <UiTableCell><UiBadge variant="outline" class="text-xs">Yes</UiBadge></UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="secondary" class="text-xs">build_price</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">/build*, /configure*, /customise*</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">No</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="secondary" class="text-xs">sitemap</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">*sitemap*</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">No</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="secondary" class="text-xs">price_guide</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">(manual assignment)</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">No</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><UiBadge variant="outline" class="text-xs">other</UiBadge></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">Everything else</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">No</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <!-- Database Schema -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Database class="size-4 text-green-500" />
          Database Operations
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p class="font-medium mb-2 flex items-center gap-1.5">
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs">oems</code>
            </p>
            <ul class="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>INSERT with <code>is_active = true</code></li>
              <li>Validates oem_id doesn't exist (409 if duplicate)</li>
              <li><code>config_json</code> stores schedule + flags</li>
              <li>Format: <code>{`{brand}-au`}</code></li>
            </ul>
          </div>
          <div>
            <p class="font-medium mb-2 flex items-center gap-1.5">
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs">source_pages</code>
            </p>
            <ul class="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>UPSERT with <code>ON CONFLICT (oem_id, url)</code></li>
              <li>Status set to <code>active</code></li>
              <li>At least one <code>homepage</code> required</li>
              <li>Duplicates silently ignored</li>
            </ul>
          </div>
          <div>
            <p class="font-medium mb-2 flex items-center gap-1.5">
              <code class="rounded bg-muted px-1.5 py-0.5 text-xs">discovered_apis</code>
            </p>
            <ul class="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>UPSERT with <code>ON CONFLICT (oem_id, url)</code></li>
              <li>Initial status: <code>discovered</code></li>
              <li>Reliability score starts at 0.5</li>
              <li>Optional — only if user adds APIs</li>
            </ul>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- Validation & Safety -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Shield class="size-4 text-red-500" />
          Validation &amp; Safety
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p class="font-medium mb-1">Backend Validation</p>
            <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>OEM ID format: <code class="rounded bg-muted px-1 py-0.5">/^[a-z0-9]+-au$/</code></li>
              <li>Duplicate check before INSERT (409 Conflict)</li>
              <li>At least one <code>homepage</code> type page required</li>
              <li>URL normalization (trailing slash, https upgrade)</li>
              <li>SQL escaping in migration snippets (single quotes)</li>
            </ul>
          </div>
          <div>
            <p class="font-medium mb-1">Frontend Validation</p>
            <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Button disabled until required fields present</li>
              <li>Step 2 requires at least 1 included page</li>
              <li>Auto-detection: browser rendering from framework</li>
              <li>Auto-detection: isNextJs / isAEM flags from framework</li>
              <li>Error alert shown for all API failures</li>
            </ul>
          </div>
          <div>
            <p class="font-medium mb-1">Discovery Resilience</p>
            <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>All fetches use <code>Promise.allSettled</code> (no single failure blocks)</li>
              <li>Timeout: 10s sitemap, 15s homepage, 5s robots.txt</li>
              <li>3-tier fallback: sitemap &rarr; robots.txt sitemaps &rarr; homepage links</li>
              <li>Empty state: user can add pages manually</li>
            </ul>
          </div>
          <div>
            <p class="font-medium mb-1">Realtime Integration</p>
            <ul class="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
              <li>Subscribes to <code>import_runs</code> filtered by oem_id</li>
              <li>Only starts after successful registration</li>
              <li>Auto-cleanup via <code>onUnmounted</code></li>
              <li>Graceful degradation: page works without realtime</li>
            </ul>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- Code Snippet Generation -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Code class="size-4 text-yellow-500" />
          Code Snippet Generation
        </UiCardTitle>
        <p class="text-xs text-muted-foreground">
          The wizard generates 4 copy-ready snippets for the TypeScript code deploy. These match existing OEM patterns
          in the codebase and can be applied manually or by the <code class="rounded bg-muted px-1 py-0.5">/oem-onboard</code> Claude agent.
        </p>
      </UiCardHeader>
      <UiTable>
        <UiTableHeader>
          <UiTableRow>
            <UiTableHead class="w-[180px]">Snippet</UiTableHead>
            <UiTableHead>Target File</UiTableHead>
            <UiTableHead>What It Generates</UiTableHead>
          </UiTableRow>
        </UiTableHeader>
        <UiTableBody>
          <UiTableRow>
            <UiTableCell><code class="rounded bg-muted px-1.5 py-0.5 text-xs">types</code></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">src/oem/types.ts</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">New line in OemId union type</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><code class="rounded bg-muted px-1.5 py-0.5 text-xs">registry</code></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">src/oem/registry.ts</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">Full OemDefinition export + registry entry with config, selectors, flags</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><code class="rounded bg-muted px-1.5 py-0.5 text-xs">agent</code></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">src/design/agent.ts</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">OEM_BRAND_NOTES entry with colors array and rendering notes</UiTableCell>
          </UiTableRow>
          <UiTableRow>
            <UiTableCell><code class="rounded bg-muted px-1.5 py-0.5 text-xs">migration</code></UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground font-mono">supabase/migrations/*.sql</UiTableCell>
            <UiTableCell class="text-xs text-muted-foreground">INSERT INTO oems + INSERT INTO source_pages with ON CONFLICT handling</UiTableCell>
          </UiTableRow>
        </UiTableBody>
      </UiTable>
    </UiCard>

    <!-- Integration Points -->
    <UiCard class="mb-6">
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <Layers class="size-4 text-violet-500" />
          Integration Points
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p class="font-medium mb-1">OpenClaw Agents</p>
            <p class="text-xs text-muted-foreground">
              After registration, the new OEM's <code class="rounded bg-muted px-1 py-0.5">oem_id</code> can be added
              to <code class="rounded bg-muted px-1 py-0.5">config/openclaw/cron-jobs.json</code> <code>oem_ids</code> arrays
              to include it in automated agent workflows (daily crawl, brand ambassador, etc.).
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">Claude /oem-onboard Agent</p>
            <p class="text-xs text-muted-foreground">
              The <code class="rounded bg-muted px-1 py-0.5">.claude/agents/oem-onboard.md</code> agent detects wizard usage
              and skips Steps 1, 5, 6, 8 (discovery, migration push, DB registration). It focuses on applying
              the generated TypeScript snippets and updating OEM count references across the codebase.
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">Dual Cron Systems</p>
            <p class="text-xs text-muted-foreground">
              Both cron systems need the new OEM: <code class="rounded bg-muted px-1 py-0.5">wrangler.jsonc</code> (Cloudflare Workers Cron for page crawling)
              and <code class="rounded bg-muted px-1 py-0.5">config/openclaw/cron-jobs.json</code> (OpenClaw Cron for agent workflows).
              The wizard's Step 7 report provides setup instructions for both.
            </p>
          </div>
          <div>
            <p class="font-medium mb-1">Existing Crawl Pipeline</p>
            <p class="text-xs text-muted-foreground">
              Step 5's "Trigger Crawl" calls the same <code class="rounded bg-muted px-1 py-0.5">POST /admin/crawl/:oemId</code>
              endpoint used by the Import Runs page. The crawl requires the TypeScript registry to include the OEM,
              so it only works after the code deploy. The wizard warns about this.
            </p>
          </div>
        </div>
      </UiCardContent>
    </UiCard>

    <!-- Key Files -->
    <UiCard>
      <UiCardHeader>
        <UiCardTitle class="text-sm font-medium flex items-center gap-2">
          <FileCode2 class="size-4 text-gray-500" />
          Key Files
        </UiCardTitle>
      </UiCardHeader>
      <UiCardContent>
        <div class="text-xs space-y-0.5 font-mono">
          <p><strong class="text-foreground">Backend:</strong> <span class="text-muted-foreground">src/routes/onboarding.ts</span> &mdash; 3 API endpoints + helper functions</p>
          <p><strong class="text-foreground">Composable:</strong> <span class="text-muted-foreground">dashboard/src/composables/use-onboarding.ts</span> &mdash; Wizard state, API actions, page management</p>
          <p><strong class="text-foreground">Page:</strong> <span class="text-muted-foreground">dashboard/src/pages/dashboard/onboarding.vue</span> &mdash; 7-step wizard UI (835 lines)</p>
          <p><strong class="text-foreground">API Client:</strong> <span class="text-muted-foreground">dashboard/src/lib/worker-api.ts</span> &mdash; discoverOem(), registerOem(), generateOnboardingSnippets()</p>
          <p><strong class="text-foreground">Agent:</strong> <span class="text-muted-foreground">.claude/agents/oem-onboard.md</span> &mdash; Agent with wizard-aware skip logic</p>
          <p><strong class="text-foreground">Docs:</strong> <span class="text-muted-foreground">docs/OEM_ONBOARDING.md</span> &mdash; Full manual onboarding guide</p>
        </div>
      </UiCardContent>
    </UiCard>
  </BasicPage>
</template>
