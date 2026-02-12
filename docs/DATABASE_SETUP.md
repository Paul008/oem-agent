# Supabase Database Setup Guide

This document provides instructions for setting up the Supabase database for the Multi-OEM AI Agent.

## Project Details

- **Project Ref**: `nnihmdmsglkxpmilmjjc`
- **Project URL**: https://supabase.com/dashboard/project/nnihmdmsglkxpmilmjjc
- **API URL**: https://nnihmdmsglkxpmilmjjc.supabase.co

## Migration Files

There are 3 migration files to execute in order:

1. **`00001_initial_schema.sql`** (495 lines)
   - Creates all core tables
   - Sets up indexes and RLS policies
   - Seeds 13 OEMs

2. **`00002_ai_inference_log.sql`** (143 lines)
   - Adds AI inference logging table
   - Updates existing tables with new columns
   - Creates cost analysis view

3. **`00003_seed_source_pages.sql`** (241 lines)
   - Seeds ~100 source pages across all 13 OEMs
   - Creates indexes for query performance

## Setup Instructions

### Method 1: Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/nnihmdmsglkxpmilmjjc

2. Navigate to **SQL Editor** in the left sidebar

3. Click **New query**

4. For each migration file (in order):
   - Open the file in a text editor:
     ```
     supabase/migrations/00001_initial_schema.sql
     supabase/migrations/00002_ai_inference_log.sql
     supabase/migrations/00003_seed_source_pages.sql
     ```
   - Copy the entire content
   - Paste into the SQL Editor
   - Click **Run**
   - Wait for completion (first migration takes ~10-20 seconds)

5. Verify the setup:
   ```sql
   -- Check OEMs were created
   SELECT COUNT(*) FROM oems;
   -- Should return: 13

   -- Check source pages were seeded
   SELECT COUNT(*) FROM source_pages;
   -- Should return: ~100

   -- Check tables exist
   SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
   ```

### Method 2: Using Supabase CLI

If you have the Supabase CLI linked to the project:

```bash
# Link to project (if not already linked)
supabase link --project-ref nnihmdmsglkxpmilmjjc

# Push migrations
supabase db push
```

### Method 3: Using psql (requires DB password)

If you have the database password:

```bash
export PGPASSWORD="your-db-password"

# Run each migration
psql "postgresql://postgres:nnihmdmsglkxpmilmjjc@db.nnihmdmsglkxpmilmjjc.supabase.co:5432/postgres" -f supabase/migrations/00001_initial_schema.sql

psql "postgresql://postgres:nnihmdmsglkxpmilmjjc@db.nnihmdmsglkxpmilmjjc.supabase.co:5432/postgres" -f supabase/migrations/00002_ai_inference_log.sql

psql "postgresql://postgres:nnihmdmsglkxpmilmjjc@db.nnihmdmsglkxpmilmjjc.supabase.co:5432/postgres" -f supabase/migrations/00003_seed_source_pages.sql
```

## Database Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `oems` | OEM registry (13 Australian automotive brands) |
| `import_runs` | Crawl job tracking |
| `source_pages` | URLs to monitor for each OEM |
| `products` | Vehicle models extracted from OEM sites |
| `product_images` | Vehicle images stored in R2 |
| `product_versions` | Historical snapshots of product data |
| `offers` | Promotional offers and deals |
| `offer_assets` | Offer images and PDFs |
| `banners` | Homepage banner/carousel content |
| `change_events` | Audit log of all detected changes |
| `ai_inference_log` | LLM API call tracking for cost monitoring |
| `brand_tokens` | Design system extraction (colors, typography) |
| `page_layouts` | Page structure decomposition |
| `design_captures` | Screenshots and computed styles |

### OEMs Seeded

| ID | Name | Base URL |
|----|------|----------|
| kia-au | Kia Australia | https://www.kia.com/au/ |
| nissan-au | Nissan Australia | https://www.nissan.com.au/ |
| ford-au | Ford Australia | https://www.ford.com.au/ |
| volkswagen-au | Volkswagen Australia | https://www.volkswagen.com.au/ |
| mitsubishi-au | Mitsubishi Motors Australia | https://www.mitsubishi-motors.com.au/ |
| ldv-au | LDV Australia | https://www.ldvautomotive.com.au/ |
| isuzu-au | Isuzu UTE Australia | https://www.isuzuute.com.au/ |
| mazda-au | Mazda Australia | https://www.mazda.com.au/ |
| kgm-au | Genesis Australia | https://www.genesis.com/au/ |
| gwm-au | Great Wall Motors Australia | https://www.gwmaustralia.com.au/ |
| suzuki-au | Suzuki Australia | https://www.suzuki.com.au/ |
| hyundai-au | Hyundai Australia | https://www.hyundai.com.au/ |
| toyota-au | Toyota Australia | https://www.toyota.com.au/ |

### Indexes Created

- All foreign keys have indexes
- Query-optimized indexes on `oem_id`, `status`, `created_at`
- Unique constraints on `(oem_id, url)` for source_pages
- Full-text search ready

### Row Level Security (RLS)

All tables have RLS enabled with service_role bypass policies.

## Troubleshooting

### Migration fails with "relation already exists"

The migrations use `IF NOT EXISTS` and `ON CONFLICT DO NOTHING`, so they should be idempotent. If you get errors:

```sql
-- Check if tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

-- If needed, drop and recreate (WARNING: DESTROYS DATA)
DROP TABLE IF EXISTS source_pages, import_runs, ... CASCADE;
```

### Connection errors

- Verify your Supabase project is active
- Check that the project reference is correct: `nnihmdmsglkxpmilmjjc`
- Ensure your IP is not blocked in Database Settings > Network Restrictions

### Permission errors

The migrations use `SUPABASE_SERVICE_ROLE_KEY` which has full access. If using a different key:
- Ensure it has `service_role` not just `anon`
- Or execute as the postgres user via Dashboard SQL Editor

## Verification Script

After setup, run this SQL to verify:

```sql
-- Count all tables
SELECT COUNT(*) as table_count 
FROM pg_tables 
WHERE schemaname = 'public';
-- Expected: 17+

-- Count OEMs
SELECT COUNT(*) as oem_count FROM oems;
-- Expected: 13

-- Count source pages
SELECT COUNT(*) as page_count FROM source_pages;
-- Expected: ~100

-- Check indexes
SELECT COUNT(*) as index_count 
FROM pg_indexes 
WHERE schemaname = 'public';
-- Expected: 40+

-- List all OEMs with page counts
SELECT 
    o.id,
    o.name,
    COUNT(sp.id) as pages
FROM oems o
LEFT JOIN source_pages sp ON sp.oem_id = o.id
GROUP BY o.id, o.name
ORDER BY o.name;
```

## Next Steps

After database setup:

1. Set secrets in Cloudflare Worker:
   ```bash
   wrangler secret put SUPABASE_URL
   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
   wrangler secret put GROQ_API_KEY
   wrangler secret put TOGETHER_API_KEY
   wrangler secret put SLACK_WEBHOOK_URL
   ```

2. Deploy the worker:
   ```bash
   npm run deploy
   ```

3. Trigger a test crawl:
   ```bash
   curl -X POST https://your-worker.workers.dev/api/oem-agent/admin/crawl/kia-au \
     -H "Authorization: Bearer your-cf-access-token"
   ```
