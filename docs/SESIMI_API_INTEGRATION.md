# Sesimi Marketing Asset Integration

## Overview

[Sesimi](https://sesimi.com) is a Digital Asset Management (DAM) platform used by OEM marketing teams to manage and distribute brand-approved marketing materials. We integrate with Sesimi to sync marketing assets — social content, templates, banners, videos, brand imagery, and high-res 3D renders — into our `portal_assets` table for use across dealer pages and the dashboard.

> **Vehicle data** (pricing, colors, specs, features) is covered in [`OEM_DATA_PIPELINES.md`](./OEM_DATA_PIPELINES.md). This document covers **marketing materials** only.

### Currently Integrated

| OEM | Portal | Assets | Asset Types | Status |
|-----|--------|--------|-------------|--------|
| Kia AU | [kia-au.sesimi.com](https://kia-au.sesimi.com) | 2,637 | 3D renders, templates, videos, documents | Active |

### Asset Breakdown (Kia AU)

| Type | Count | Description |
|------|-------|-------------|
| IMAGE | ~2,500 | 3D renders (multi-angle), social banners, campaign graphics |
| VIDEO | ~80 | TVC spots, social video, launch footage |
| TEMPLATE | ~40 | Editable templates (social posts, print ads, POS) |
| DOCUMENT | ~20 | Brand guidelines, spec sheets, media kits |

---

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌────────────────┐
│   Cognito    │────>│   GraphQL    │────>│   Algolia   │────>│  Cloudinary    │
│ (Auth)       │     │ (GetUserData)│     │ (Search)    │     │ (CDN/Images)   │
│              │     │              │     │             │     │                │
│ OAuth2 flow  │     │ Returns      │     │ prod_NEBULA │     │ mabx-eu-prod   │
│ + credentials│     │ searchKey    │     │ index       │     │ Public access  │
└─────────────┘     └──────────────┘     └─────────────┘     └────────────────┘
       │                    │                    │                     │
       │              24h expiry            2,637 hits           No auth needed
       │              Scoped key            Paginated            CORS: *
```

### Key Integration Points

- **Asset discovery**: Algolia search API (scoped key, 24h expiry)
- **Asset delivery**: Cloudinary CDN (public, no auth, on-the-fly transforms)
- **Storage**: `portal_assets` table (generic schema, supports any OEM/portal)
- **Linking**: `variant_colors.portal_asset_id` FK links hero images to source assets

---

## Authentication

### Cognito

Sesimi uses AWS Cognito for authentication:

- **Region**: `eu-central-1`
- **Cognito Domain**: `kia-au.auth.eu-central-1.amazoncognito.com`
- **Client ID**: `5gv0nok0kn84fc23quu1hi7mj2`

Credentials are stored in `oem_portals` for Kia AU.

### Algolia Key (24h Expiry)

After Cognito auth, the Sesimi SPA calls a GraphQL endpoint to get a scoped Algolia search key valid for ~24 hours. Direct programmatic access to this endpoint has not been successful — the API Gateway requires browser session context beyond just a Cognito token.

### How to Refresh the Key

1. Log into [kia-au.sesimi.com](https://kia-au.sesimi.com) using credentials from `oem_portals`
2. Open Chrome DevTools > Network tab
3. Filter by `algolia`
4. Trigger any search (type in search box)
5. Copy the `x-algolia-api-key` from the request URL params (v5 client) or headers (v4 client)
6. Set as environment variable:
   ```bash
   export SESIMI_ALGOLIA_KEY="<paste-key-here>"
   ```

**Alternative**: Use Claude Code's browser automation (`mcp__claude-in-chrome__*`) to intercept the key from a logged-in session automatically.

---

## Algolia API

### Configuration

| Setting | Value |
|---------|-------|
| App ID | `TNQJZPDMIK` |
| Index | `prod_NEBULA` |
| Host | `TNQJZPDMIK-dsn.algolia.net` |

### Query All Assets

```bash
curl -X POST "https://TNQJZPDMIK-dsn.algolia.net/1/indexes/*/queries" \
  -H "x-algolia-application-id: TNQJZPDMIK" \
  -H "x-algolia-api-key: $SESIMI_ALGOLIA_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [{
      "indexName": "prod_NEBULA",
      "query": "",
      "hitsPerPage": 1000,
      "page": 0
    }]
  }'
```

### Filter by Type or Tag

```json
{
  "requests": [{
    "indexName": "prod_NEBULA",
    "query": "",
    "hitsPerPage": 100,
    "facetFilters": [["tags:social"]]
  }]
}
```

### Pagination Limitation

Scoped API keys limit total retrievable results to ~2,000. To get all assets, partition queries by model tag and deduplicate by `objectID`:

```javascript
const partitions = [
  { label: 'all', filters: null },              // first 2000
  { label: 'sorento', filters: 'tags:SORENTO' }, // catch stragglers
  { label: 'ev6', filters: 'tags:EV6' },
  // ... etc.
]
```

### Response Structure

```json
{
  "results": [{
    "hits": [{
      "objectID": "abc123",
      "name": "Kia Stonic Sport Profile Sporty Blue",
      "type": "image",
      "tags": ["3d render", "stonic", "sport", "profile"],
      "categories": {
        "lvl0": ["Kia"],
        "lvl1": ["Kia > Stonic"]
      },
      "versions": [{
        "cloudinaryId": "kia-au/Kia-stonic-sport-profile-sporty-blue_bbfzmw",
        "originalFormat": "png",
        "bytes": 9102457,
        "width": 3840,
        "height": 2160,
        "exportSizes": [
          { "format": "png", "quality": "auto:best", "size": 665132 },
          { "format": "jpg", "quality": "auto:best", "size": 617327 }
        ]
      }],
      "stats": { "views": 7, "downloads": 9 }
    }],
    "nbHits": 2642,
    "page": 0,
    "nbPages": 3
  }]
}
```

---

## Cloudinary CDN

All Sesimi assets are served via Cloudinary with public access (no auth, CORS `*`).

### URL Format

```
https://res.cloudinary.com/mabx-eu-prod/image/upload/{transforms}/v1/{cloudinaryId}
```

### Transforms

| Use Case | URL Segment | Output |
|----------|-------------|--------|
| Dashboard thumbnail | `/f_auto/q_60/w_300/` | ~15KB WebP |
| Dealer page hero | `/f_auto/q_auto/w_1200/` | ~80KB WebP |
| Social media | `/f_auto/q_auto:best/w_1080/` | ~120KB |
| Original quality | _(none)_ | 3840x2160 PNG, ~9MB |

---

## Category & Tag Structure

### Categories (Hierarchical)

```
lvl0: Kia
  lvl1: Kia > Stonic
  lvl1: Kia > Sorento
  lvl1: Kia > Sportage
  lvl1: Kia > K4
  lvl1: Kia > Tasman
  lvl1: Kia > EV3 / EV5 / EV6 / EV9
  lvl1: Kia > Carnival / Cerato / Picanto / Niro / Seltos
```

### Top Tags

| Tag | Count | Description |
|-----|-------|-------------|
| 3d render | 1,124 | Studio-quality multi-angle renders |
| my25 | 570 | Model year 2025 assets |
| png | 536 | Transparent background renders |
| GT / sport / GT-Line | 273+ | Trim-specific renders |
| profile / front / rear | 200+ | Camera angle tags |

---

## Scripts

### `seed-kia-sesimi-assets.mjs` — Sync All Marketing Assets

Populates `portal_assets` with all Sesimi assets from Algolia.

```bash
export SESIMI_ALGOLIA_KEY="<key>"
node dashboard/scripts/seed-kia-sesimi-assets.mjs
```

- Paginates Algolia with tag-partitioned queries for full coverage
- Parses asset names for model, trim, angle, color metadata
- Upserts into `portal_assets` (on conflict: `oem_id + external_source + external_id`)
- Expected: ~2,637 rows

### `seed-kia-sesimi-colors.mjs` — Link Renders to Vehicle Colors

Updates `variant_colors` hero/gallery images using 3D renders from `portal_assets`. **No Algolia key needed** — reads from already-synced `portal_assets`.

```bash
node dashboard/scripts/seed-kia-sesimi-colors.mjs --dry-run  # preview
node dashboard/scripts/seed-kia-sesimi-colors.mjs             # apply
```

- Matches DB color names to Sesimi parsed colors (fuzzy: exact > normalized > partial > word overlap)
- Maps DB model slugs (e.g. `carnival-hybrid`) to Sesimi models (e.g. `carnival`)
- Sets `hero_image_url`, `gallery_urls`, `portal_asset_id`
- Skips colors already using Cloudinary heroes
- Expected: ~593 updates across 14 models

---

## `portal_assets` Table

Generic schema supporting any OEM marketing portal — not Sesimi-specific.

```sql
portal_assets (
  id UUID PK,
  oem_id TEXT FK -> oems,
  portal_id UUID FK -> oem_portals,
  external_id TEXT,              -- Algolia objectID, DAM asset ID, etc.
  external_source TEXT,          -- 'sesimi_algolia', 'adobe_dam', etc.
  name TEXT,
  asset_type TEXT,               -- IMAGE, VIDEO, TEMPLATE, DOCUMENT, OTHER
  tags JSONB,                    -- ['3d render', 'social', 'my25']
  categories JSONB,              -- {'lvl0': ['Kia'], 'lvl1': ['Kia > Stonic']}
  cdn_provider TEXT,             -- 'cloudinary', 's3', etc.
  cdn_id TEXT,                   -- Provider-specific asset ID
  cdn_url TEXT,                  -- Public delivery URL
  width INT, height INT,
  original_format TEXT,
  file_size_bytes BIGINT,
  export_sizes JSONB,            -- Pre-computed exports from DAM
  parsed_model TEXT,             -- Extracted from asset name
  parsed_trim TEXT,
  parsed_color TEXT,
  parsed_angle TEXT,             -- profile, front, rear, side
  is_active BOOLEAN,
  UNIQUE(oem_id, external_source, external_id)
)
```

**Coverage view**: `portal_asset_coverage` aggregates per-model stats (total assets, renders, unique colors/angles).

**FK**: `variant_colors.portal_asset_id` -> `portal_assets.id` links hero images to their source marketing asset.

---

## Extending to Other OEMs

The `portal_assets` table and dashboard page are OEM-agnostic. To add another OEM's marketing portal:

1. Create a seed script that queries the portal's API (Sesimi, Adobe DAM, Bynder, etc.)
2. Map assets to the `portal_assets` schema
3. Set `external_source` to identify the platform (e.g. `'adobe_dam'`, `'bynder'`)
4. Register the API endpoint in `seed-discovered-apis.mjs`
5. Run the seed script — assets appear in the Portal Assets dashboard immediately

---

## Known Limitations

1. **24h API key expiry** — Algolia scoped keys expire after ~24 hours. No automated refresh; requires browser interception.
2. **Pagination cap at 2,000** — Scoped keys limit retrievable results. Workaround: partitioned queries by tag.
3. **No programmatic auth** — GraphQL `GetUserData` endpoint requires browser session context beyond Cognito tokens.
4. **Asset name parsing** — Metadata extraction depends on naming conventions. Non-standard names may parse incompletely.
5. **Color name matching** — Fuzzy matching works for most cases but may miss unusual color names or abbreviations.
