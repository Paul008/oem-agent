# KGM (SsangYong) Webslides / Banners Pipeline

## Overview

KGM Australia (formerly SsangYong) uses a Next.js website powered by **Payload CMS**, hosted at `kgm.com.au`. The homepage features a hero carousel with promotional offer banners for each vehicle model.

**OEM ID:** `kgm-au`

## Website Structure

### Homepage (`kgm.com.au/`)

- Hero carousel with auto-play (4500ms interval)
- Each slide has desktop + mobile background images and a text overlay image
- Slides link to `/models/{model-slug}`

### Offers Page (`kgm.com.au/offers`)

- No hero banner — heading + offer cards layout
- Individual model offer cards with product images

## Image Hosting

Images are served from **Payload CMS** at:

```
https://payloadb.therefinerydesign.com/api/media/file/
```

### Naming Convention

```
KGM-{Month}{Year}Offers-background-desktop-{model}.webp   # Desktop hero background
KGM-{Month}{Year}Offers-background-mobile-{model}.webp    # Mobile hero background
KGM-{Month}{Year}Offers-text-{model}.webp                 # Text overlay with pricing
```

Example:
```
KGM-Jan26Offers-background-desktop-musso-my26.webp
KGM-Jan26Offers-background-mobile-musso-my26.webp
KGM-Jan26Offers-text-musso-my26.2.webp
```

## Extraction Method

The carousel uses `background-image: url(...)` inline styles on divs inside a `[class*="carousel-banner"]` container. The seed script:

1. Fetches the homepage HTML
2. Finds all `[style*="background-image"]` divs with `-desktop` in the URL
3. Derives mobile URLs by replacing `-desktop` with `-mobile`
4. Extracts headline text from nearby text overlay `<img>` alt attributes
5. Maps model slug from filename to `/models/{model}` CTA link

## Seed Script

```bash
cd dashboard && node scripts/seed-kgm-banners.mjs
```

The script deletes existing `kgm-au` banners and inserts freshly scraped ones. It does **not** affect other OEM banners.

## Current Models in Carousel

| Model | Type | Slug |
|-------|------|------|
| Musso MY26 | Diesel Ute | `musso` |
| Musso EV | Electric Ute | `musso-ev` |
| Rexton MY26 | 7-seat SUV | `rexton` |
| Actyon | Petrol/Hybrid SUV | `actyon` |
| Torres | Petrol SUV | `torres` |
| Torres Hybrid | Hybrid SUV | `torres` |
| Torres EVX | Electric SUV | `torres` |
| Korando | Petrol SUV | `korando` |

## Re-scraping

KGM updates their offers monthly (naming pattern includes month+year). Re-run the seed script when offers change:

```bash
cd dashboard && node scripts/seed-kgm-banners.mjs
```

## Dashboard

View banners at: `http://localhost:5173/dashboard/banners` — filter by "KGM" OEM.
