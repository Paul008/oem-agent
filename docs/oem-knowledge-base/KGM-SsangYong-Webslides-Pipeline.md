# KGM (SsangYong) Webslides / Banners Pipeline

## Overview

KGM Australia (formerly SsangYong) uses a Next.js website powered by **Payload CMS**, hosted at `kgm.com.au`. The homepage features a hero carousel with promotional offer banners for each vehicle model.

**OEM ID:** `kgm-au`

## Website Structure

### Homepage (`kgm.com.au/`)

- Flickity carousel with auto-play (25 dots including clones)
- Each slide has layered images:
  - **Background**: Desktop/mobile background image (landscape hero shot of vehicle)
  - **Text overlay**: Transparent PNG/WebP with pricing, offer headline
  - **Disclaimer**: Small legal text at bottom of slide
- Slides link to `/models/{model-slug}`

### Offers Page (`kgm.com.au/offers`)

- No hero banner — heading + offer cards layout
- Individual model offer cards with product images

## Image Hosting

### Payload CMS (intermittently broken)
```
https://payloadb.therefinerydesign.com/api/media/file/
```
**Note**: Payload CMS file serving is unreliable (all files returned 404 as of March 2026). The CMS API database records still exist but the file storage is broken.

### AWS S3 (working)
```
https://kgm-rebuild-nextjs-postgres-assets-s3.s3.ap-southeast-2.amazonaws.com/
```

### Our Supabase Storage (screenshots)
```
https://nnihmdmsglkxpmilmjjc.supabase.co/storage/v1/object/public/banners/kgm/
```

## Extraction Method

Because the Payload CMS file serving is unreliable, we use **Puppeteer screenshots**:

1. Launch headless Chrome at 1920×1080 (desktop) and 390×844 (mobile)
2. Navigate to `kgm.com.au/`
3. Wait for Flickity carousel to initialize
4. Stop autoplay by clearing all interval timers
5. For each slide: click the Flickity dot, wait for transition, screenshot the carousel element
6. Upload JPEG screenshots to Supabase Storage (`banners/kgm/`)
7. Insert banner records with public Storage URLs

This produces **flat composited images** with background + text overlay + disclaimer baked in — exactly as the end user sees them.

## Seed Script

```bash
cd dashboard && node scripts/seed-kgm-banners.mjs
```

The script:
- Requires `puppeteer` (installed in project)
- Creates a `banners` Supabase Storage bucket if needed
- Deletes existing `kgm-au` banners before inserting
- Does NOT affect other OEM banners

## Current Models in Carousel (March 2026)

| # | Model | Headline | Link |
|---|-------|----------|------|
| 0 | Musso MY26 | KGM Musso | `/models/musso` |
| 1 | Musso EV | Musso EV - Free Charger* | `/models/musso-ev` |
| 2 | Rexton MY26 | New Rexton Factory Bonus - Save $2000* | `/models/rexton` |
| 3 | Actyon | New Actyon Factory Bonus - Save $2000* | `/models/actyon` |
| 4 | Torres Petrol | New Torres Factory Bonus - Save up to $5010* | `/models/torres` |
| 5 | Torres Hybrid | Torres Hybrid Factory Bonus - Save $2000* | `/models/torres` |
| 6 | Torres EVX | KGM Torres Evx | `/models/torres` |
| 7 | Korando | Korando Factory Bonus - Save $5010* | `/models/korando` |

## Re-scraping

KGM updates their offers monthly. Re-run the seed script when offers change:

```bash
cd dashboard && node scripts/seed-kgm-banners.mjs
```

After seeding, fix per-slide metadata (correct CTA links and disclaimers):

```bash
cd dashboard && node scripts/_fix-kgm-metadata.mjs
```

## Dashboard

View banners at: `http://localhost:5173/dashboard/banners` — filter by "KGM" OEM.

## Payload CMS API

The Payload CMS API is still accessible even when file serving is broken:

```
GET https://payloadb.therefinerydesign.com/api/media?limit=50&sort=-createdAt
GET https://payloadb.therefinerydesign.com/api/media?where[filename][contains]=Mar26
```

This can be used to discover new upload filenames and alt text for headlines.
