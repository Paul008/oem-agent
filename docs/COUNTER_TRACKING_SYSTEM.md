# Counter Tracking System

> Comprehensive entity tracking infrastructure for monitoring orchestrator operations

## Overview

The Counter Tracking System provides real-time metrics for all entities processed during import runs (crawl executions). It follows a consistent 9-step pattern for adding new entity tracking.

## Tracked Entities

| Entity | Database Column | Dashboard Display | Color | Status | Location |
|--------|----------------|-------------------|-------|--------|----------|
| **Products** | `products_upserted` | Homepage + Table | 🟢 Green | Active | `products` table |
| **Offers** | `offers_upserted` | Homepage + Table | 🔵 Blue | Active | `offers` table |
| **Banners** | `banners_upserted` | Homepage + Table | 🟣 Purple | Active | `banners` table |
| **Brochures** | `brochures_upserted` | Table only | 🟠 Orange | Ready | `vehicle_models.brochure_url` |
| **Changes** | `changes_found` | Table only | ⚫ Primary | Active | `change_events` table |

## Data Flow

```
Page Crawl
    ↓
Extract entities (products, offers, banners)
    ↓
upsertEntity() for each entity
    ├─ Check if exists (by unique key)
    ├─ Detect changes (compare fields)
    ├─ Create or update record
    └─ Return { created, updated, changeDetected }
    ↓
processChanges() accumulates counters
    ├─ productsUpserted++
    ├─ offersUpserted++
    ├─ bannersUpserted++
    ├─ brochuresUpserted++ (when implemented)
    └─ changesFound++
    ↓
orchestrate() aggregates from all pages
    ↓
Update import_runs record
    ↓
Dashboard fetches and displays
```

## 9-Step Implementation Pattern

When adding a new entity type to track (accessories, specs, etc.), follow this pattern:

### Step 1: Upsert Method Returns Counters

```typescript
private async upsertEntity(
  oemId: OemId,
  sourceUrl: string,
  entityData: any
): Promise<{ created: boolean, updated: boolean, changeDetected: boolean }> {
  // Check if exists
  const existing = await this.config.supabaseClient
    .from('entities')
    .select('id, key_field')
    .eq('oem_id', oemId)
    .eq('key_field', entityData.key)
    .maybeSingle();

  if (existing) {
    // Detect changes
    const changed = existing.key_field !== entityData.key;

    if (changed) {
      await this.config.supabaseClient
        .from('entities')
        .update(entityData)
        .eq('id', existing.id);

      return { created: false, updated: true, changeDetected: true };
    }

    return { created: false, updated: true, changeDetected: false };
  } else {
    // Create new
    await this.config.supabaseClient
      .from('entities')
      .insert(entityData);

    return { created: true, updated: false, changeDetected: true };
  }
}
```

### Step 2: Track in processChanges()

```typescript
private async processChanges(
  oemId: OemId,
  page: SourcePage,
  extractionResult: PageExtractionResult
): Promise<{ entitiesUpserted: number, changesFound: number }> {
  let entitiesUpserted = 0;
  let changesFound = 0;

  // Process entities
  if (extractionResult.entities?.data) {
    for (const entity of extractionResult.entities.data) {
      const result = await this.upsertEntity(oemId, page.url, entity);

      if (result.created || result.updated) {
        entitiesUpserted++;
      }

      if (result.changeDetected) {
        changesFound++;
      }
    }
  }

  return { entitiesUpserted, changesFound };
}
```

### Step 3: Update PageCrawlResult Interface

```typescript
export interface PageCrawlResult {
  success: boolean;
  // ... other fields
  entitiesUpserted?: number;
  changesFound?: number;
}
```

### Step 4: Accumulate in orchestrate()

```typescript
let entitiesUpserted = 0;

for (const page of pages) {
  const result = await this.crawlPage(oemId, page);

  entitiesUpserted += result.entitiesUpserted || 0;
}
```

### Step 5: Store in Database

```typescript
await this.config.supabaseClient
  .from('import_runs')
  .update({
    entities_upserted: entitiesUpserted,
  })
  .eq('id', importRun.id);
```

### Step 6: Frontend TypeScript Interface

```typescript
// dashboard/src/composables/use-oem-data.ts
export interface ImportRun {
  id: string;
  entities_upserted: number;
  // ... other fields
}
```

### Step 7: Dashboard Table Column

```vue
<!-- dashboard/src/pages/dashboard/runs.vue -->
<UiTableHead class="text-right">Entities</UiTableHead>

<UiTableCell class="text-right">
  <span :class="run.entities_upserted ? 'text-teal-600 font-medium' : 'text-muted-foreground'">
    {{ run.entities_upserted ?? 0 }}
  </span>
</UiTableCell>
```

### Step 8: Homepage Stats Badge (Optional)

```vue
<!-- dashboard/src/pages/dashboard/index.vue -->
<UiCard @click="$router.push('/dashboard/entities')">
  <UiCardHeader>
    <UiCardTitle>Entities</UiCardTitle>
    <EntityIcon class="size-4 text-teal-500" />
  </UiCardHeader>
  <UiCardContent>
    <div class="text-2xl font-bold">{{ counts.entities }}</div>
    <p class="text-xs text-muted-foreground">Total entity records</p>
  </UiCardContent>
</UiCard>
```

### Step 9: Logging for Debugging

```typescript
console.log(`[Orchestrator] Upserted entity: ${entity.name} (created: ${result.created}, updated: ${result.updated}, changed: ${result.changeDetected})`);
```

## Color Coding Guidelines

Choose colors that are distinct and accessible:

| Color | RGB | Use Case | Example |
|-------|-----|----------|---------|
| 🟢 Green | `text-green-600` | Primary entities | Products, Models |
| 🔵 Blue | `text-blue-600` | Marketing content | Offers, Promotions |
| 🟣 Purple | `text-purple-600` | Visual assets | Banners, Images |
| 🟠 Orange | `text-orange-600` | Documents | Brochures, PDFs |
| 🔴 Red | `text-red-600` | Errors, Alerts | Failures |
| 🟡 Yellow | `text-yellow-600` | Warnings | Deprecated |
| ⚫ Primary | `text-primary` | System metrics | Changes, Events |

## Database Schema

### Migration Template

```sql
-- Add new counter to import_runs
ALTER TABLE import_runs
  ADD COLUMN IF NOT EXISTS entities_upserted INTEGER DEFAULT 0;

COMMENT ON COLUMN import_runs.entities_upserted
  IS 'Number of entities created or updated during this import run';
```

### Required Columns

Every entity table should have:
- `id UUID PRIMARY KEY` - Unique identifier
- `oem_id TEXT` - OEM reference
- `created_at TIMESTAMPTZ` - Creation timestamp
- `updated_at TIMESTAMPTZ` - Last update timestamp
- `last_seen_at TIMESTAMPTZ` - Last crawl observation

## Best Practices

### 1. Unique Key Selection

Choose stable identifiers:
- ✅ **Good**: `oem_id + external_id`, `oem_id + slug`, `oem_id + url + position`
- ❌ **Bad**: `title` (can change), `id` (database generated), `url` only (may not be unique)

### 2. Change Detection

Compare meaningful fields:
```typescript
const changed =
  existing.price !== entity.price ||
  existing.title !== entity.title ||
  existing.availability !== entity.availability;
```

### 3. Logging Strategy

```typescript
console.log(`[UpsertEntity] Processing: ${entity.name}`);
console.log(`[UpsertEntity] ${existing ? 'Existing' : 'NEW'} entity found`);
console.log(`[UpsertEntity] Changes detected: ${changeDetected}`);
```

### 4. Error Handling

```typescript
try {
  const result = await this.upsertEntity(oemId, page.url, entity);
  // ... increment counters
} catch (error) {
  console.error(`[Orchestrator] Failed to upsert entity ${entity.name}:`, error);
  // Don't increment counters on failure
}
```

## Testing Checklist

- [ ] TypeScript compilation passes (worker)
- [ ] TypeScript compilation passes (dashboard)
- [ ] Database migration applied
- [ ] Counter increments correctly
- [ ] Dashboard displays values
- [ ] Color coding is distinct
- [ ] Logging provides debugging info
- [ ] Error handling works
- [ ] Documentation updated

## Example: Banner Tracking

Complete implementation reference in `src/orchestrator.ts`:

**upsertBanner()** (lines 3100-3189):
- Matches by `oem_id + page_url + position`
- Detects headline/image changes
- Returns `{ created, updated, changeDetected }`

**processChanges()** (lines 2923-2978):
- Tracks `bannersUpserted` counter
- Returns in result object

**orchestrate()** (lines 201-245):
- Accumulates `bannersUpserted`
- Saves to `import_runs.banners_upserted`

## References

- **Orchestrator**: `src/orchestrator.ts`
- **Dashboard Types**: `dashboard/src/composables/use-oem-data.ts`
- **Import Runs Table**: `dashboard/src/pages/dashboard/runs.vue`
- **Homepage Cards**: `dashboard/src/pages/dashboard/index.vue`
- **Migrations**: `supabase/migrations/00002_ai_inference_log.sql`
- **Architecture**: `docs/OEM_AGENT_ARCHITECTURE.md`
- **Memory**: `.claude/projects/.../memory/MEMORY.md`
