# Dashboard Integration Guide

## Current State

The dashboard currently displays:
- **Import Runs**: Basic stats (pages_checked, pages_changed, pages_errored)
- **Accessories**: List of accessories with images
- **Models**: Vehicle model listings
- **Products**: Pricing and variant data

**Location**: https://oem-dashboard.pages.dev/dashboard
**Local Dev**: http://localhost:5173

## Brand Ambassador Integration Opportunities

### 1. Generated Pages Dashboard

**Suggested Route**: `/dashboard/pages` or `/dashboard/brand-ambassador`

**Features**:
```vue
<template>
  <div class="pages-dashboard">
    <!-- Stats Overview -->
    <div class="stats-grid">
      <StatCard title="Total Pages" :value="totalPages" />
      <StatCard title="Generated This Week" :value="weeklyPages" />
      <StatCard title="Pending Regeneration" :value="pendingPages" />
      <StatCard title="Avg Cost per Page" :value="avgCost" />
    </div>

    <!-- Pages Table -->
    <DataTable>
      <Column field="oem_id" header="OEM" />
      <Column field="model_slug" header="Model" />
      <Column field="generated_at" header="Generated">
        <template #body="{ data }">
          {{ formatRelative(data.generated_at) }}
        </template>
      </Column>
      <Column field="page_age" header="Age (days)" />
      <Column field="status" header="Status">
        <template #body="{ data }">
          <Badge :variant="getStatusVariant(data)" />
        </template>
      </Column>
      <Column field="actions" header="Actions">
        <template #body="{ data }">
          <Button @click="viewPage(data)" size="sm">View</Button>
          <Button @click="regenerate(data)" size="sm" variant="outline">Regenerate</Button>
        </template>
      </Column>
    </DataTable>
  </div>
</template>
```

**API Endpoints Needed**:
```typescript
// List all generated pages
GET /api/pages?oem_id={oem_id}&limit={limit}

// Get specific page
GET /api/pages/{oem_id}/{model_slug}

// Check regeneration status
GET /api/pages/{oem_id}/{model_slug}/should-regenerate

// Force regenerate
POST /api/pages/{oem_id}/{model_slug}/regenerate

// Get regeneration history
GET /api/pages/{oem_id}/{model_slug}/history
```

### 2. Cron Job Dashboard

**Suggested Route**: `/dashboard/cron`

**Features**:
```vue
<template>
  <div class="cron-dashboard">
    <!-- Job Status Cards -->
    <div class="jobs-grid">
      <JobCard v-for="job in jobs" :key="job.id">
        <h3>{{ job.name }}</h3>
        <p>{{ job.description }}</p>
        <div class="schedule">
          <Clock />
          {{ job.schedule }} ({{ job.nextRun }})
        </div>
        <div class="last-run">
          <Badge :variant="job.lastRun.status">
            {{ job.lastRun.status }}
          </Badge>
          <span>{{ formatRelative(job.lastRun.completedAt) }}</span>
        </div>
        <Button @click="triggerJob(job.id)">Run Now</Button>
      </JobCard>
    </div>

    <!-- Run History -->
    <div class="run-history">
      <h2>Recent Runs</h2>
      <Timeline>
        <TimelineItem v-for="run in runHistory" :key="run.id">
          <Badge :variant="run.status" />
          <strong>{{ run.jobName }}</strong>
          <p>{{ run.startedAt }} • {{ run.duration }}ms</p>
          <details v-if="run.result">
            <summary>View Results</summary>
            <pre>{{ JSON.stringify(run.result, null, 2) }}</pre>
          </details>
        </TimelineItem>
      </Timeline>
    </div>
  </div>
</template>
```

**API Endpoints** (Already exist):
```typescript
// List all jobs with status
GET /cron

// Get specific job details
GET /cron/jobs/{jobId}

// Trigger job manually
POST /cron/run/{jobId}

// Get run history
GET /cron/runs/{jobId}?limit={limit}
```

### 3. Import Runs Enhancement

**Current Location**: `/dashboard` → Recent Import Runs section

**Enhancements**:
```vue
<template>
  <div class="import-runs-enhanced">
    <!-- Add counter columns -->
    <DataTable>
      <Column field="oem_id" header="OEM" />
      <Column field="status" header="Status" />
      <Column field="started_at" header="Started" />
      <Column field="pages_checked" header="Pages" />

      <!-- NEW COLUMNS -->
      <Column field="products_upserted" header="Products Updated">
        <template #body="{ data }">
          <span :class="data.products_upserted > 0 ? 'text-green' : ''">
            {{ data.products_upserted }}
          </span>
        </template>
      </Column>
      <Column field="offers_upserted" header="Offers Updated">
        <template #body="{ data }">
          <span :class="data.offers_upserted > 0 ? 'text-green' : ''">
            {{ data.offers_upserted }}
          </span>
        </template>
      </Column>
      <Column field="changes_found" header="Changes">
        <template #body="{ data }">
          <Badge variant="info">{{ data.changes_found }}</Badge>
        </template>
      </Column>
    </DataTable>

    <!-- Charts -->
    <div class="charts-grid">
      <Chart
        type="line"
        title="Products Updated Over Time"
        :data="productsOverTime"
      />
      <Chart
        type="bar"
        title="Changes by OEM"
        :data="changesByOem"
      />
    </div>
  </div>
</template>
```

**Data Source**: These fields now exist in `import_runs` table (orchestrator fix)

### 4. Configuration Editor

**Suggested Route**: `/dashboard/settings/regeneration`

**Features**:
```vue
<template>
  <div class="config-editor">
    <h2>Brand Ambassador Configuration</h2>

    <form @submit.prevent="saveConfig">
      <div class="form-grid">
        <FormField label="Max Age (days)" hint="Force regenerate after this many days">
          <input v-model.number="config.max_age_days" type="number" min="1" max="90" />
        </FormField>

        <FormField label="Min Age (days)" hint="Skip regeneration if page is newer than this">
          <input v-model.number="config.min_age_days" type="number" min="1" max="30" />
        </FormField>

        <FormField label="Check Timestamps">
          <Switch v-model="config.check_source_timestamps" />
          <span class="hint">Compare source data timestamps (Tier 2)</span>
        </FormField>

        <FormField label="Check Content Hash">
          <Switch v-model="config.check_content_hash" />
          <span class="hint">Compare content hashes (Tier 3)</span>
        </FormField>

        <FormField label="Priority Threshold">
          <Select v-model="config.priority_threshold">
            <option value="low">Low - Regenerate for all changes</option>
            <option value="medium">Medium - Balanced (recommended)</option>
            <option value="high">High - Only major changes</option>
            <option value="critical">Critical - Emergency only</option>
          </Select>
        </FormField>
      </div>

      <div class="actions">
        <Button type="submit" variant="primary">Save Configuration</Button>
        <Button type="button" @click="resetDefaults" variant="outline">Reset to Defaults</Button>
      </div>
    </form>

    <!-- Preview Impact -->
    <div class="impact-preview">
      <h3>Estimated Impact</h3>
      <p>With these settings, approximately <strong>{{ estimatedSkipRate }}%</strong> of pages would be skipped, saving <strong>${{ estimatedCostSavings }}/month</strong>.</p>
    </div>
  </div>
</template>
```

**API Endpoints Needed**:
```typescript
// Get current configuration
GET /api/config/regeneration

// Update configuration (requires admin auth)
PUT /api/config/regeneration

// Estimate impact of config changes
POST /api/config/regeneration/estimate
```

## Implementation Steps

### Phase 1: Read-Only Dashboards (Low effort)
1. Create `/dashboard/pages` route
2. Fetch data from R2 (existing `getGeneratedPage()` method)
3. Display table with page age, status, actions
4. Add "View" button to open page in new tab

**Effort**: 2-3 hours
**Value**: High - immediate visibility

### Phase 2: Cron Dashboard (Medium effort)
1. Create `/dashboard/cron` route
2. Fetch data from `/cron` API (already exists)
3. Display job cards with status
4. Add "Run Now" button (calls existing API)

**Effort**: 3-4 hours
**Value**: High - manual control

### Phase 3: Import Runs Enhancement (Low effort)
1. Update `use-oem-data.ts` to fetch new columns
2. Add columns to import runs table
3. Add simple line chart for trends

**Effort**: 1-2 hours
**Value**: Medium - better visibility

### Phase 4: Configuration Editor (High effort)
1. Create settings route with auth
2. Build form with validation
3. Implement PUT endpoint for config updates
4. Add config reload logic to cron system

**Effort**: 6-8 hours
**Value**: Medium - power users only

## Quick Win: Add to Existing Dashboard

**Minimal integration** - Add to existing dashboard home:

```vue
<!-- Add to dashboard/src/pages/dashboard/index.vue -->
<div class="brand-ambassador-section">
  <h2>Brand Ambassador Status</h2>
  <div class="stats-row">
    <StatCard
      title="Generated Pages"
      :value="generatedPagesCount"
      icon="FileText"
    />
    <StatCard
      title="Pending Regeneration"
      :value="pendingRegenerationCount"
      icon="RefreshCw"
    />
    <StatCard
      title="Last Run"
      :value="formatRelative(lastBrandAmbassadorRun)"
      icon="Clock"
    />
  </div>
  <Button @click="$router.push('/dashboard/pages')" variant="outline">
    View All Pages →
  </Button>
</div>
```

## Data Fetching Composables

```typescript
// dashboard/src/composables/use-generated-pages.ts
export function useGeneratedPages(oemId?: string) {
  const pages = ref<VehicleModelPage[]>([])
  const loading = ref(false)

  async function fetchPages() {
    loading.value = true
    try {
      // Option 1: Direct R2 access (if bucket is public)
      const response = await fetch(`https://r2.example.com/pages/definitions/${oemId}/`)

      // Option 2: Via API endpoint (better - add auth, caching)
      const response = await fetch(`/api/pages?oem_id=${oemId}`)

      pages.value = await response.json()
    } finally {
      loading.value = false
    }
  }

  async function shouldRegenerate(oemId: string, modelSlug: string) {
    const response = await fetch(`/api/pages/${oemId}/${modelSlug}/should-regenerate`)
    return await response.json()
  }

  async function regenerate(oemId: string, modelSlug: string) {
    const response = await fetch(`/api/pages/${oemId}/${modelSlug}/regenerate`, {
      method: 'POST'
    })
    return await response.json()
  }

  return {
    pages,
    loading,
    fetchPages,
    shouldRegenerate,
    regenerate,
  }
}
```

## Summary

**Priority Order**:
1. ✅ **Documentation** (Done - this file, BRAND_AMBASSADOR.md, CRON_SYSTEM.md)
2. ✅ **Quick Win**: Add Brand Ambassador stats to existing dashboard home (COMPLETED Feb 23, 2026)
3. ✅ **Phase 1**: API endpoints and composables (COMPLETED Feb 23, 2026)
4. 📊 **Phase 1 (Optional)**: Enhanced `/dashboard/pages` view with regeneration status
5. ⏰ **Phase 2**: Create `/dashboard/cron` with manual triggers
6. 📈 **Phase 3**: Enhance import runs table with new counters
7. ⚙️ **Phase 4**: Build configuration editor (nice-to-have)

**Completed Actions** ✅:
1. ✅ Created API endpoints in `src/routes/oem-agent.ts`:
   - `GET /api/v1/oem-agent/pages/:oemId/:modelSlug/should-regenerate`
   - `GET /api/v1/oem-agent/pages/stats`
2. ✅ Built composable `dashboard/src/composables/use-generated-pages.ts`
3. ✅ Added Brand Ambassador stats card to dashboard homepage
4. ✅ Integrated with existing `model-pages.vue` view
5. ✅ Updated agent memory (MEMORY.md)

**Next Actions** (Optional):
1. Add regeneration status column to model-pages table
2. Implement Phase 2: Cron dashboard
3. Implement Phase 3: Enhanced import runs
4. Document API endpoints in OpenAPI spec
