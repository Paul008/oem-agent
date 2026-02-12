# Multi-OEM AI Agent — Crawl Configuration & Extraction Specification

**Version:** v1.1
**Date:** 2026-02-11
**Owner:** Paul Giurin / ADME

---

## 1. OEM Registry & Site Architecture Map

This section documents the site structure, URL patterns, vehicle lineup, and offer locations for each OEM. These configs feed directly into `oems.config_json` in the Supabase `oems` table.

---

### 1.1 Kia Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `kia-au` |
| **Base URL** | `https://www.kia.com/au/` |
| **Homepage** | `/au/main.html` |
| **CMS Platform** | Adobe Experience Manager (KWCMS) |
| **JS-Heavy** | Yes — hero carousel, lazy-loaded images via KWCMS |
| **Browser Rendering Required** | Yes (homepage banners, vehicle configurator pages) |

#### Seed URLs
```json
{
  "homepage": "/au/main.html",
  "vehicles_index": "/au/cars.html",
  "offers": "/au/offers.html",
  "news": "/au/discover/news.html"
}
```

#### Vehicle URL Pattern
`/au/cars/{model-slug}.html`

#### Known Models (as of 2026-02-11)
Picanto, K4 (coming soon), Stonic (coming soon), Seltos, Sportage, Sportage Hybrid, Sorento, Sorento Hybrid, Carnival, Niro Hybrid, Niro EV, EV3, EV4 (coming soon), EV5, EV6, New EV6 (coming soon), EV9, Tasman Pick-up, Tasman Cab Chassis, PV5 Cargo EV (coming soon)

#### Image CDN Pattern
`/content/dam/kwcms/au/en/images/...`

Images served as `.webp` from the KWCMS DAM. Hero banners and vehicle thumbnails use the same CDN path structure.

#### Homepage Banner Structure
Kia uses a hero carousel rendered client-side. Each slide typically contains:
- Background image (desktop + mobile variants)
- Headline text overlay
- CTA button (text + URL)
- Disclaimer text (occasionally)

**Extraction approach:** Browser Rendering required. Target the main carousel container and extract each slide's image src, headline, CTA text, and CTA link.

#### Offers Structure
Kia AU offers are typically at `/au/offers.html` with individual offer tiles linking to model-specific or finance-specific landing pages.

---

### 1.2 Nissan Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `nissan-au` |
| **Base URL** | `https://www.nissan.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Nissan Global PACE platform (custom CMS) |
| **JS-Heavy** | Yes — hero slideshow, price display requires location |
| **Browser Rendering Required** | Yes (homepage hero, price-dependent content) |

#### Seed URLs
```json
{
  "homepage": "/",
  "vehicles_index": "/vehicles/browse-range.html",
  "offers": "/offers.html",
  "news": "/about-nissan/news-and-events.html"
}
```

#### Vehicle URL Pattern
`/vehicles/browse-range/{model-slug}.html`

#### Known Models (as of 2026-02-11)
JUKE, QASHQAI, X-TRAIL, New X-TRAIL, Pathfinder, Patrol, Navara, All-New Navara, Z, ARIYA

#### Image CDN Pattern
`//www-asia.nissan-cdn.net/content/dam/Nissan/AU/...`

Note: Nissan uses protocol-relative URLs (`//`) and their Asia CDN. Images are `.jpg` with `.ximg.full.hero.jpg` suffixes for responsive variants.

#### Homepage Banner Structure
Full-width hero slideshow with multiple slides. Each slide has:
- Desktop background image (`.ximg.full.hero.jpg`)
- Headline text
- Sub-headline text
- CTA button(s) — often "VIEW OFFER" or "Learn More"

**Extraction approach:** Browser Rendering required due to JS slideshow. Extract all slide panels.

#### Offers Structure
Offers live at `/offers.html` and are filterable by model. Each offer tile typically includes a model-specific promo with disclaimer.

#### Special Notes
- Nissan displays prices based on user location (postcode prompt on first visit). The agent should set a default location (e.g., Sydney 2000) via cookie or URL param when rendering.
- Nissan has a "Warrior by PREMCAR" sub-brand at `nissanwarrior.com.au` — consider monitoring separately.

---

### 1.3 Ford Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `ford-au` |
| **Base URL** | `https://www.ford.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Adobe Experience Manager |
| **JS-Heavy** | Yes — hero carousel, dynamic vehicle cards |
| **Browser Rendering Required** | Yes (homepage banners, offer cards) |

#### Seed URLs
```json
{
  "homepage": "/",
  "offers": "/latest-offers.html",
  "news": "/news.html",
  "showroom_ranger": "/showroom/trucks-and-vans/ranger.html",
  "showroom_everest": "/showroom/suv/everest.html",
  "showroom_mustang": "/showroom/performance/mustang.html",
  "showroom_f150": "/showroom/trucks-and-vans/f-150.html",
  "showroom_puma": "/showroom/suv/puma.html",
  "showroom_transit": "/showroom/trucks-and-vans/transit/custom.html",
  "showroom_mache": "/showroom/electric/mach-e.html"
}
```

#### Vehicle URL Pattern
`/showroom/{category}/{model-slug}.html`

Categories: `trucks-and-vans`, `suv`, `performance`, `electric`

#### Known Models (as of 2026-02-11)
Ranger (incl. Super Duty, Raptor), Everest (incl. Sport Bi Turbo), F-150, Mustang, Mustang Mach-E, Puma, Transit Custom, Transit, Escape

#### Image CDN Pattern
`/content/dam/Ford/au/home/billboards/{slug}-desktop.webp`
`/content/dam/Ford/au/home/containers/{slug}-desktop.webp`

Ford uses `.webp` with separate desktop/mobile variants in the DAM.

#### Homepage Banner Structure
Ford's homepage has a multi-slide hero carousel ("billboards") plus a tabbed vehicle showcase section ("containers"). Each billboard slide has:
- Desktop + mobile background images
- H1 headline
- Sub-headline
- CTA button(s)
- Disclaimer link (`*Important Info`)

**Extraction approach:** Browser Rendering required. Parse both the billboard carousel and the vehicle container tabs.

#### Offers Structure
`/latest-offers.html` — Ford's offers page features model-specific cards (e.g., "$3K off select Rangers*") with disclaimers. Offer cards in the homepage "Latest offers" section also link here.

#### Special Notes
- Ford uses `Build & Price` configurator extensively — vehicle page data may reference `/build-and-price/` or `/price/{ModelName}` paths.
- The news section at `/news.html` and `/news/{topic}/` contains model launch announcements — worth monitoring for "new model" alerts.

---

### 1.4 Volkswagen Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `volkswagen-au` |
| **Base URL** | `https://www.volkswagen.com.au/` |
| **Homepage** | `/en.html` |
| **CMS Platform** | VW Group global CMS (OneHub / custom) |
| **JS-Heavy** | Yes — heavy lazy loading, SVG placeholders until render |
| **Browser Rendering Required** | Yes (homepage banners load as SVG placeholders, actual images only after JS) |

#### Seed URLs
```json
{
  "homepage": "/en.html",
  "vehicles_index": "/en/models.html",
  "offers": "/app/locals/offers-pricing",
  "news": "/en/brand-experience/volkswagen-newsroom/latest-news.html",
  "stock_search": "/app/locals/stock-search"
}
```

#### Vehicle URL Pattern
`/en/models/{model-slug}.html`

#### Known Models (as of 2026-02-11)
T-Cross, T-Roc, Tiguan, Tayron, Touareg, ID.4, ID.5, Golf, Golf R, Polo, Polo GTI, Amarok, Amarok Walkinshaw, Multivan, California, Crafter, Caddy, Transporter

#### Image CDN Pattern
VW uses a combination of inline SVG placeholders and lazy-loaded actual images. The real image URLs are only available after JS execution. DAM paths vary.

#### Homepage Banner Structure
VW uses a full-width hero slideshow with heavy lazy loading. Initial HTML contains `<svg>` placeholders — actual banner images only render after JavaScript execution.

**Extraction approach:** Browser Rendering is mandatory. Cannot detect banner changes with HTML-only fetch.

#### Offers Structure
VW uses a dynamic app at `/app/locals/offers-pricing` which is a client-side application. Browser Rendering required to extract current offers.

#### Special Notes
- VW's `/app/locals/` routes are all SPA-rendered — stock search, offers, dealer locator, finance calculator, trade-in are all JS apps.
- The Amarok Walkinshaw is a special variant with its own page at `/en/models/amarok-walkinshaw.html`.
- VW has range landing pages: `/en/range/suvs.html`, `/en/range/ev.html`, etc. — useful for monitoring category-level changes.

---

### 1.5 Mitsubishi Motors Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `mitsubishi-au` |
| **Base URL** | `https://www.mitsubishi-motors.com.au/` |
| **Homepage** | `/?group=private` |
| **CMS Platform** | Adobe Experience Manager |
| **JS-Heavy** | Moderate — requires JS for image loading and carousel |
| **Browser Rendering Required** | Yes (homepage hero images use lazy-load, vehicle range carousel is JS) |

#### Seed URLs
```json
{
  "homepage": "/?group=private",
  "vehicles_triton": "/vehicles/triton.html",
  "vehicles_outlander": "/vehicles/outlander.html",
  "vehicles_outlander_phev": "/vehicles/outlander-plug-in-hybrid-ev.html",
  "vehicles_pajero_sport": "/vehicles/pajero-sport.html",
  "vehicles_eclipse_cross_phev": "/vehicles/eclipse-cross-plug-in-hybrid-ev.html",
  "vehicles_asx": "/vehicles/asx.html",
  "offers": "/offers.html",
  "news": "/company/news.html",
  "blog": "/blog.html"
}
```

#### Vehicle URL Pattern
`/vehicles/{model-slug}.html`

#### Known Models (as of 2026-02-11)
Triton, Pajero Sport, Outlander, Outlander Plug-in Hybrid EV, Eclipse Cross Plug-in Hybrid EV, ASX

#### Image CDN Pattern
`/home/_jcr_content/article/par/...` (AEM JCR content paths)

#### Homepage Banner Structure
Full-width hero with headline + CTA. Vehicle range displayed as a horizontal scrollable carousel with cards.

#### Offers Structure
`/offers.html` — also has Operating Lease Offers at a separate path. Offers page includes model-specific promotional tiles.

#### Special Notes
- Mitsubishi distinguishes between "private" and "business" audiences via `?group=private` / `?group=business` query params. Monitor the private view by default.
- Diamond Advantage program pages (warranty, capped-price servicing) may change and are worth low-frequency monitoring.
- The All-New ASX launched recently — watch for post-launch offer changes.

---

### 1.6 LDV Automotive Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `ldv-au` |
| **Base URL** | `https://www.ldvautomotive.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | i-Motor (Australian dealer/OEM CMS platform) |
| **JS-Heavy** | Moderate |
| **Browser Rendering Required** | Recommended (homepage carousel) |

#### Seed URLs
```json
{
  "homepage": "/",
  "vehicles_index": "/vehicles/",
  "offers": "/special-offers/",
  "news": "/ldv-stories/",
  "price_guide": "/price/"
}
```

#### Vehicle URL Pattern
`/vehicles/ldv-{model-slug}/`

#### Known Models (as of 2026-02-11)
T60 MAX Ute, Terron 9 Ute, eT60 Ute (electric), MY25 D90 SUV, MIFA 9 (electric people mover), Deliver 7, G10+ Van, eDeliver 7 (electric), Deliver 9 Large Van, Deliver 9 Cab Chassis, eDeliver 9 (electric), Deliver 9 Bus, Deliver 9 Campervan

#### Image CDN Pattern
`https://cdn.cms-uploads.i-motor.me/...`

LDV uses the i-Motor CDN for all media assets.

#### Homepage Banner Structure
Standard hero carousel with promo slides. Each slide links to a model or offers page.

#### Offers Structure
`/special-offers/` — offer tiles with model-specific promotions.

#### Special Notes
- LDV has a large commercial vehicle range (vans, buses, campervans) alongside passenger vehicles. The agent should categorise these separately.
- Price guide at `/price/` provides a useful structured price reference — worth periodic scraping.
- LDV has electric variants across multiple models — track these as separate products (eT60, eDeliver 7, eDeliver 9, MIFA 9).

---

### 1.7 Isuzu UTE Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `isuzu-au` |
| **Base URL** | `https://www.isuzuute.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Custom (Dataweavers-hosted Sitecore-like) |
| **JS-Heavy** | Yes — hero area, range display |
| **Browser Rendering Required** | Yes (homepage hero, vehicle range section) |

#### Seed URLs
```json
{
  "homepage": "/",
  "dmax_overview": "/d-max/overview",
  "dmax_range": "/d-max/range",
  "mux_overview": "/mu-x/overview",
  "mux_range": "/mu-x/range",
  "offers": "/offers/current-offers",
  "news": "/discover/news"
}
```

#### Vehicle URL Pattern
Isuzu has only two models, each with dedicated sub-sections:
- D-MAX: `/d-max/{section}` (overview, performance, design, tech, safety, towing, range, accessories)
- MU-X: `/mu-x/{section}` (same structure)

#### Known Models (as of 2026-02-11)
D-MAX (multiple variants: SX, LS-M, LS-U, LS-U+, X-Terrain), MU-X (multiple variants: LS-M, LS-U, LS-T, X-Terrain)

#### Image CDN Pattern
`https://cdn-iua.dataweavers.io/-/media/...`

#### Homepage Banner Structure
Full-width hero with model showcase. Limited model range means the hero focus rotates between D-MAX and MU-X variants.

#### Offers Structure
`/offers/current-offers` — model-specific promotional offers.

#### Special Notes
- Isuzu is a simple OEM to monitor — only 2 models (D-MAX and MU-X) with variant tiers.
- Spec sheets are available as direct PDF downloads from the CDN — worth downloading and hashing for change detection.
- The "I-Venture Club" events section changes regularly but is low business priority.

---

### 1.8 Mazda Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `mazda-au` |
| **Base URL** | `https://www.mazda.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Episerver / Optimizely (custom) |
| **JS-Heavy** | Moderate — some lazy loading |
| **Browser Rendering Required** | Recommended (homepage hero, offer tiles) |

#### Seed URLs
```json
{
  "homepage": "/",
  "vehicles_bt50": "/cars/bt-50/",
  "vehicles_cx3": "/cars/cx-3/",
  "vehicles_cx30": "/cars/cx-30/",
  "vehicles_cx5": "/cars/cx-5/",
  "vehicles_cx6e": "/cars/cx-6e/",
  "vehicles_cx60": "/cars/cx-60/",
  "vehicles_cx70": "/cars/cx-70/",
  "vehicles_cx80": "/cars/cx-80/",
  "vehicles_cx90": "/cars/cx-90/",
  "vehicles_mazda2": "/cars/mazda2/",
  "vehicles_mazda3": "/cars/mazda3/",
  "vehicles_mazda6e": "/cars/mazda-6e/",
  "vehicles_mx5": "/cars/mx-5/",
  "offers": "/offers/",
  "offers_driveaway": "/offers/driveaway/",
  "news": "/mazda-news/",
  "brochures": "/brochures/"
}
```

#### Vehicle URL Pattern
`/cars/{model-slug}/`

#### Known Models (as of 2026-02-11)
BT-50, CX-3, CX-30, CX-5, CX-6e (coming 2026), CX-60, CX-70, CX-80, CX-90, Mazda2, Mazda3, Mazda 6e, MX-5

#### Image CDN Pattern
`/globalassets/vehicle-landing-pages/{model}/...`

Mazda uses internal global assets with query-string-based image processing (`?blur=10&quality=0.1` for placeholders).

#### Homepage Banner Structure
Large hero banner with model showcase. Currently features BT-50 prominently. Below the hero: model category tabs (SUVs, Electric & Hybrids, Utes, Sports, Cars) and 50/50 content blocks.

#### Offers Structure
`/offers/` — main offers hub. `/offers/driveaway/` — specific driveaway deals page. Currently running "2025 Plate Clearance" across select models.

#### Special Notes
- Mazda has a large model range (13 models) including new EVs (CX-6e, Mazda 6e) coming in 2026. These "coming soon" pages should be watched closely for launch timing.
- Build & Price at `/build/{model-slug}/` is a client-side tool.
- Mazda's footer contains a full sitemap of all model links — useful for URL discovery.

---

### 1.9 KGM (SsangYong) Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `kgm-au` |
| **Base URL** | `https://kgm.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Next.js + Payload CMS (custom, S3-backed) |
| **JS-Heavy** | Yes — fully React/Next.js SSR + client hydration |
| **Browser Rendering Required** | Recommended (homepage carousel is client-rendered) |

#### Seed URLs
```json
{
  "homepage": "/",
  "models_index": "/models",
  "offers": "/offers",
  "discover": "/discover-kgm",
  "models_musso": "/models/musso",
  "models_musso_ev": "/models/musso-ev",
  "models_rexton": "/models/rexton",
  "models_actyon": "/models/actyon",
  "models_torres_evx": "/models/torres-evx"
}
```

#### Vehicle URL Pattern
`/models/{model-slug}`

#### Known Models (as of 2026-02-11)
Musso (MY26), Musso EV, Rexton (MY26), Actyon (MY26), Torres EVX

#### Image CDN Pattern
`https://payloadb.therefinerydesign.com/api/media/file/...`
`https://kgm-rebuild-nextjs-postgres-assets-s3.s3.ap-southeast-2.amazonaws.com/...`

KGM uses two CDN sources — Payload CMS media API and direct S3 for static assets.

#### Homepage Banner Structure
Hero carousel with promotional slides. Currently showing factory bonus offers with disclaimer text directly in the carousel. Each slide is an image with overlay text + disclaimer.

#### Offers Structure
`/offers` — plus homepage carousel doubles as an offers showcase. Current offers include "$2000 Factory Bonus" on Musso, Rexton, Actyon, and "Free Charger" on Musso EV and Torres EVX.

#### Special Notes
- KGM is a rebranded SsangYong. The site is built on Next.js which means most content is available via SSR (server-side rendered HTML), but the carousel may require client-side JS.
- Small model range (5 models) — easy to monitor comprehensively.
- Disclaimer text is extensive and embedded directly in the banner HTML — important to capture for compliance.
- 7-year warranty is a key brand differentiator that may appear across pages.

---

### 1.10 GWM Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `gwm-au` |
| **Base URL** | `https://www.gwmanz.com/au/` |
| **Homepage** | `/au/` |
| **CMS Platform** | Storyblok (headless CMS) + likely Next.js frontend |
| **JS-Heavy** | Yes — React/Next.js with client-side hydration |
| **Browser Rendering Required** | Yes (homepage carousel, model pages may use client rendering) |

#### Seed URLs
```json
{
  "homepage": "/au/",
  "models_index": "/au/models/",
  "models_suv": "/au/models/suv/",
  "models_ute": "/au/models/ute/",
  "models_hatchback": "/au/models/hatchback/",
  "offers": "/au/offers/",
  "news": "/au/news/"
}
```

#### Vehicle URL Pattern
`/au/models/{category}/{model-slug}/`

Categories: `suv`, `ute`, `hatchback`

#### Known Models (as of 2026-02-11)
**Haval sub-brand:** Haval Jolion, Haval Jolion Pro (coming soon — BEV/PHEV), Haval H6, Haval H6 GT, Haval H7
**Tank sub-brand:** Tank 300, Tank 300 PHEV (arriving March 2026), Tank 500, Tank 500 PHEV
**Cannon sub-brand:** Cannon, Cannon Alpha, Cannon Alpha PHEV
**Ora sub-brand:** Ora (electric hatch), Ora 5 (coming 2026 — electric SUV)
**Wey sub-brand:** Wey G9 (coming 2026 — luxury PHEV minivan), Wey Blue Mountain (coming 2026 — large PHEV SUV)

#### Image CDN Pattern
`https://assets.gwmanz.com/f/{id}/...` (Storyblok CDN)
`https://a.storyblok.com/f/{space_id}/...` (Storyblok direct)

GWM uses Storyblok's asset CDN for all media including brochure PDFs.

#### Homepage Banner Structure
Hero carousel with promotional slides. Each slide typically contains an image with overlay text, CTA button, and disclaimer text. Factory bonus offers are often displayed directly in the carousel.

**Extraction approach:** Browser Rendering recommended. React/Next.js site — SSR HTML may contain initial data, but carousel interactions require JS. Check for `__NEXT_DATA__` JSON payload which may contain structured page data.

#### Offers Structure
`/au/offers/` — offer tiles with model-specific promotions. Homepage carousel also doubles as an offers showcase. Current offers include factory bonuses across Haval, Tank, and Cannon models.

#### Special Notes
- GWM operates 5 sub-brands (Haval, Tank, Cannon, Ora, Wey) — agent should categorise models by sub-brand.
- As a Next.js site, check for `/_next/data/` routes and `__NEXT_DATA__` script tag for structured JSON data — may avoid need for full browser render on some pages.
- 7-year unlimited km warranty is a key brand differentiator.
- Large product offensive planned for 2026 with "at least" 7 new models — monitor news page closely.
- Brochure PDFs available at `assets.gwmanz.com` — worth downloading and hashing for change detection.

---

### 1.11 Suzuki Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `suzuki-au` |
| **Base URL** | `https://www.suzuki.com.au/` |
| **Homepage** | `/home/` |
| **CMS Platform** | Custom (nginx-based, uses Webpack + jQuery + Tailwind CSS) |
| **JS-Heavy** | Moderate — some lazy loading and carousel JS |
| **Browser Rendering Required** | Recommended (homepage hero, vehicle cards) |

#### Seed URLs
```json
{
  "homepage": "/home/",
  "vehicles_index": "/vehicles/",
  "vehicles_suv": "/vehicles/suv/",
  "vehicles_small_suv": "/vehicles/small-suv/",
  "vehicles_small_car": "/vehicles/small-car/",
  "vehicles_4x4": "/vehicles/4x4/",
  "vehicles_hybrid": "/vehicles/hybrid/",
  "vehicles_electric": "/vehicles/electric/",
  "vehicles_future": "/vehicles/future/",
  "offers": "/offers/",
  "build_price": "/vehicles/build-and-price/"
}
```

#### Vehicle URL Pattern
`/vehicles/{category}/{model-slug}/`

Categories: `suv`, `small-suv`, `small-car`, `4x4`, `hybrid`, `electric`

#### Known Models (as of 2026-02-11)
Swift Hybrid, Swift Sport, Ignis (expiring early 2026), Fronx Hybrid, Vitara, Vitara Hybrid (launching Q1 2026), e Vitara (electric, launching Q1 2026), S-Cross, Jimny (3-door), Jimny XL (5-door)

#### Image CDN Pattern
Images served from the same domain — `/assets/` or `/media/` paths. Standard `.jpg`/`.webp` formats.

#### Homepage Banner Structure
Full-width hero banner with model showcase. Below hero: model category cards linking to range pages.

**Extraction approach:** Browser Rendering recommended. jQuery-based site with moderate JS dependency.

#### Offers Structure
`/offers/` — standard offer tile layout. Suzuki also features offers in the homepage hero area.

#### Special Notes
- Small model range (8-10 models) — easy to monitor comprehensively.
- Suzuki has a `/vehicles/future/` page showcasing upcoming models (e Vitara, Vitara Hybrid) — high value for early change detection.
- Build & Price tool at `/vehicles/build-and-price/` is interactive but low priority for monitoring.
- Ignis is expiring early 2026 — watch for removal/discontinuation signals.
- The e Vitara represents Suzuki's first mass-production BEV — expect frequent page updates around launch.

---

### 1.12 Hyundai Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `hyundai-au` |
| **Base URL** | `https://www.hyundai.com/au/en` |
| **Homepage** | `/au/en` |
| **CMS Platform** | Adobe Experience Manager (AEM) — confirmed via stage2-author-aem.hyundai.com |
| **JS-Heavy** | Yes — hero carousel, dynamic vehicle cards, price calculator |
| **Browser Rendering Required** | Yes (homepage hero, vehicle range, offer tiles) |

#### Seed URLs
```json
{
  "homepage": "/au/en",
  "vehicles_index": "/au/en/cars",
  "vehicles_suvs": "/au/en/cars/suvs",
  "vehicles_eco": "/au/en/cars/eco",
  "vehicles_small_cars": "/au/en/cars/small-cars",
  "vehicles_sports": "/au/en/cars/sports-cars",
  "vehicles_people_movers": "/au/en/cars/people-movers",
  "offers": "/au/en/offers",
  "news": "/au/en/news",
  "news_vehicles": "/au/en/news/vehicles",
  "calculator": "/au/en/shop/calculator"
}
```

#### Vehicle URL Pattern
`/au/en/cars/{category}/{model-slug}`

Categories: `suvs`, `eco`, `small-cars`, `sports-cars`, `people-movers`

#### Known Models (as of 2026-02-11)
**SUVs:** Venue, Kona, Kona Electric, Tucson, Tucson Hybrid, Santa Fe, Santa Fe Hybrid, Palisade, Palisade Hybrid, INSTER, ELEXIO
**Electric/Eco:** IONIQ 5, IONIQ 5 N, IONIQ 5 N Line, IONIQ 6, IONIQ 6 N, IONIQ 9, Kona Electric, INSTER, ELEXIO
**Hatch & Sedan:** i30, i30 N, i30 N Line, i30 Sedan, i30 Sedan N, i30 Sedan N Line, i30 Sedan Hybrid, Sonata N Line, i20 N
**People Movers/Commercial:** Staria, Staria Load

#### Image CDN Pattern
`/content/dam/hyundai/au/...` (AEM DAM)

Hyundai uses AEM's content DAM with responsive image variants.

#### Homepage Banner Structure
Full-width hero carousel with multiple slides. Each slide features desktop/mobile background images, headline, sub-headline, and CTA buttons. Vehicle range displayed below as category-filtered cards.

**Extraction approach:** Browser Rendering required. AEM-based site with JS-rendered hero and vehicle cards.

#### Offers Structure
`/au/en/offers` — model-specific promotional offers with driveaway pricing. Price calculator at `/au/en/shop/calculator` provides real-time pricing.

#### Special Notes
- Very large model range (25+ models) — the biggest roster in this config alongside Toyota. Monitor at category level first, drill into individual models.
- Hyundai has a strong N performance sub-brand (i20 N, i30 N, IONIQ 5 N, IONIQ 6 N) — these often have separate promotional pages.
- IONIQ sub-brand for EVs (5, 5 N, 6, 6 N, 9) plus INSTER and ELEXIO as standalone EV models.
- 7-year warranty (when servicing with Hyundai) is a key differentiator — may appear across pages.
- Price calculator at `/au/en/shop/calculator` is a client-side tool — low priority but useful for price validation.
- i20 N may be discontinued ("zombie car" — production stopped but stock remaining).

---

### 1.13 Toyota Australia

| Field | Value |
|-------|-------|
| **OEM ID** | `toyota-au` |
| **Base URL** | `https://www.toyota.com.au/` |
| **Homepage** | `/` |
| **CMS Platform** | Sitecore XM (headless) + Next.js frontend + Sitecore OrderCloud commerce |
| **JS-Heavy** | Yes — Next.js with SSR + client hydration, dynamic vehicle cards |
| **Browser Rendering Required** | Yes (homepage hero, vehicle range, offers — though SSR provides good initial HTML) |

#### Seed URLs
```json
{
  "homepage": "/",
  "all_vehicles": "/all-vehicles",
  "hilux": "/hilux",
  "corolla": "/corolla",
  "corolla_cross": "/corolla-cross",
  "camry": "/camry",
  "rav4": "/rav4",
  "kluger": "/kluger",
  "prado": "/prado",
  "landcruiser_300": "/landcruiser-300",
  "landcruiser_70": "/landcruiser-70",
  "yaris": "/yaris",
  "yaris_cross": "/yaris-cross",
  "c_hr": "/c-hr",
  "bz4x": "/bz4x",
  "gr86": "/gr86",
  "gr_supra": "/gr-supra",
  "gr_yaris": "/gr-yaris",
  "gr_corolla": "/gr-corolla",
  "hiace": "/hiace",
  "fortuner": "/fortuner",
  "granvia": "/granvia",
  "offers": "/offers",
  "news": "/news"
}
```

#### Vehicle URL Pattern
`/{model-slug}` (top-level, no category prefix)

#### Known Models (as of 2026-02-11)
**Cars:** Yaris (hybrid), Corolla (hybrid), Corolla Sedan, Camry (hybrid)
**SUVs:** Yaris Cross, Corolla Cross, C-HR, RAV4 (all-new 2026 — HEV + PHEV), Kluger, Fortuner
**4WDs:** Prado, LandCruiser 300 (+ hybrid arriving March 2026), LandCruiser 70 Series
**Utes:** HiLux (refreshed 2026, 21 variants), HiLux Electric (coming 2026)
**Vans/Commercial:** HiAce, Coaster
**People Movers:** Granvia
**Electric:** bZ4X (price reduced by up to $10K)
**GR Performance:** GR Yaris, GR Corolla, GR 86, GR Supra

#### Image CDN Pattern
Toyota uses internal asset paths. Exact CDN structure varies — may use `/assets/` or Sitecore media library paths. Next.js `/_next/image/` optimization routes also used.

#### Homepage Banner Structure
Large hero carousel with model showcase and promotional offers. Below hero: vehicle category sections (SUVs, Cars, Utes, etc.) with model cards. "Latest offers" section with promotional tiles.

**Extraction approach:** Browser Rendering recommended but SSR via Next.js means initial HTML is often complete. Check for `__NEXT_DATA__` JSON payload for structured data. Sitecore Layout Service API may also be accessible.

#### Offers Structure
`/offers` — main offers hub with model-specific promotional deals. Driveaway pricing featured prominently.

#### Special Notes
- Largest model range in Australia (20+ models across 7 categories) — most pages to monitor.
- Toyota is Australia's #1 selling brand — changes here have the highest market impact.
- Most passenger models are now hybrid-only (Yaris, Corolla, Camry, C-HR, RAV4, Kluger, Yaris Cross, Corolla Cross).
- Major 2026 launches: All-new RAV4 (Q1), RAV4 PHEV (Q3), LandCruiser 300 Hybrid (March), HiLux Electric.
- As a Next.js + Sitecore site, check for `__NEXT_DATA__` script tags and Sitecore Layout Service API endpoints — may provide structured JSON data without full browser render.
- Toyota pressroom at `pressroom.toyota.com.au` is a separate domain worth monitoring for news/announcements.
- URL structure is flat (top-level `/{model}`) — no category prefix in URLs.

---

## 2. Canonical JSON Schemas

### 2.1 Product Schema (`product.v1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OEM Product (Vehicle Model)",
  "type": "object",
  "required": ["oem_id", "source_url", "title", "last_seen_at"],
  "properties": {
    "oem_id": {
      "type": "string",
      "description": "Tenant identifier (e.g., 'kia-au', 'ford-au')"
    },
    "external_key": {
      "type": "string",
      "description": "OEM-derived slug or model code (e.g., 'sportage', 'ranger')"
    },
    "source_url": {
      "type": "string",
      "format": "uri",
      "description": "Full URL of the vehicle page on the OEM site"
    },
    "title": {
      "type": "string",
      "description": "Primary model name (e.g., 'Sportage', 'Ranger Super Duty')"
    },
    "subtitle": {
      "type": ["string", "null"],
      "description": "Category or tagline (e.g., 'Medium SUV', 'Performance SUV')"
    },
    "body_type": {
      "type": ["string", "null"],
      "enum": [null, "suv", "sedan", "hatch", "ute", "van", "bus", "people_mover", "sports", "cab_chassis", "campervan"],
      "description": "Normalised body type"
    },
    "fuel_type": {
      "type": ["string", "null"],
      "enum": [null, "petrol", "diesel", "hybrid", "phev", "electric"],
      "description": "Primary fuel/drivetrain type"
    },
    "availability": {
      "type": "string",
      "enum": ["available", "coming_soon", "limited_stock", "run_out", "discontinued"],
      "default": "available"
    },
    "price": {
      "type": ["object", "null"],
      "properties": {
        "amount": { "type": "number", "description": "Numeric price value" },
        "currency": { "type": "string", "default": "AUD" },
        "type": {
          "type": "string",
          "enum": ["driveaway", "from", "rrp", "weekly", "monthly", "per_week", "per_month", "mrlp"],
          "description": "How the price is expressed"
        },
        "raw_string": { "type": "string", "description": "Original price string as displayed" },
        "qualifier": { "type": ["string", "null"], "description": "e.g., 'starting from', 'before on-road costs'" }
      }
    },
    "variants": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "price_amount": { "type": ["number", "null"] },
          "price_type": { "type": ["string", "null"] },
          "drivetrain": { "type": ["string", "null"] },
          "engine": { "type": ["string", "null"] }
        }
      },
      "description": "Model variants/grades if available on the page"
    },
    "disclaimer_text": {
      "type": ["string", "null"],
      "description": "Legal disclaimer text (plain text, stripped of HTML)"
    },
    "primary_image_r2_key": {
      "type": ["string", "null"],
      "description": "R2 object key for the primary product image"
    },
    "gallery_image_count": {
      "type": "integer",
      "default": 0
    },
    "key_features": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Top-level feature highlights if extracted (e.g., '7-year warranty', 'Apple CarPlay')"
    },
    "cta_links": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "text": { "type": "string" },
          "url": { "type": "string" }
        }
      },
      "description": "Call-to-action buttons on the page"
    },
    "meta": {
      "type": "object",
      "properties": {
        "page_title": { "type": "string" },
        "meta_description": { "type": "string" },
        "og_image": { "type": "string" },
        "json_ld": { "type": ["object", "null"], "description": "Structured data from JSON-LD if present" }
      }
    },
    "last_seen_at": {
      "type": "string",
      "format": "date-time"
    },
    "content_hash": {
      "type": "string",
      "description": "SHA256 of the normalised product JSON (used for versioning)"
    }
  }
}
```

### 2.2 Offer Schema (`offer.v1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OEM Offer",
  "type": "object",
  "required": ["oem_id", "source_url", "title", "last_seen_at"],
  "properties": {
    "oem_id": {
      "type": "string"
    },
    "external_key": {
      "type": ["string", "null"],
      "description": "Slug or OEM-defined offer ID if available"
    },
    "source_url": {
      "type": "string",
      "format": "uri"
    },
    "title": {
      "type": "string",
      "description": "Offer headline (e.g., '$3K off select Rangers*')"
    },
    "description": {
      "type": ["string", "null"],
      "description": "Offer body text / summary"
    },
    "offer_type": {
      "type": "string",
      "enum": ["price_discount", "driveaway_deal", "finance_rate", "bonus_accessory", "cashback", "free_servicing", "plate_clearance", "factory_bonus", "free_charger", "other"],
      "description": "Normalised offer category"
    },
    "applicable_models": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Model names this offer applies to"
    },
    "price": {
      "type": ["object", "null"],
      "properties": {
        "amount": { "type": "number" },
        "currency": { "type": "string", "default": "AUD" },
        "type": { "type": "string" },
        "raw_string": { "type": "string" },
        "saving_amount": { "type": ["number", "null"], "description": "Dollar saving if stated" }
      }
    },
    "validity": {
      "type": ["object", "null"],
      "properties": {
        "start_date": { "type": ["string", "null"], "format": "date" },
        "end_date": { "type": ["string", "null"], "format": "date" },
        "raw_string": { "type": ["string", "null"], "description": "e.g., 'while stocks last', 'ends 31 March 2026'" }
      }
    },
    "cta_text": { "type": ["string", "null"] },
    "cta_url": { "type": ["string", "null"] },
    "hero_image_r2_key": { "type": ["string", "null"] },
    "disclaimer_text": {
      "type": ["string", "null"],
      "description": "Full legal disclaimer text"
    },
    "disclaimer_html": {
      "type": ["string", "null"],
      "description": "Original HTML of disclaimer if complex formatting"
    },
    "eligibility": {
      "type": ["string", "null"],
      "description": "e.g., 'private buyers only', 'ABN holders', 'fleet customers'"
    },
    "last_seen_at": {
      "type": "string",
      "format": "date-time"
    },
    "content_hash": {
      "type": "string"
    }
  }
}
```

### 2.3 Banner Schema (`banner.v1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Homepage Banner Slide",
  "type": "object",
  "required": ["oem_id", "position", "image_r2_key"],
  "properties": {
    "oem_id": { "type": "string" },
    "position": { "type": "integer", "description": "Slide order (0-indexed)" },
    "headline": { "type": ["string", "null"] },
    "sub_headline": { "type": ["string", "null"] },
    "cta_text": { "type": ["string", "null"] },
    "cta_url": { "type": ["string", "null"] },
    "image_url_desktop": { "type": "string" },
    "image_url_mobile": { "type": ["string", "null"] },
    "image_r2_key": { "type": "string" },
    "image_sha256": { "type": "string" },
    "disclaimer_text": { "type": ["string", "null"] },
    "last_seen_at": { "type": "string", "format": "date-time" }
  }
}
```

---

## 3. Crawl Schedule (Cost-Controlled)

The schedule balances freshness against Browser Rendering costs. "Cheap check" = HTML fetch + hash comparison (no Browser Rendering). "Full render" = Browser Rendering + extraction.

### 3.1 Per-Page-Type Schedule

| Page Type | Cheap Check Frequency | Full Render Trigger | Rationale |
|-----------|----------------------|-------------------|-----------|
| **Homepage** | Every 2 hours | If HTML hash changed | Banners rotate frequently, especially during campaigns |
| **Offers page** | Every 4 hours | If HTML hash changed | Offers update less frequently, but price changes are high-value alerts |
| **Vehicle pages** (each model) | Every 12 hours | If HTML hash changed | Model pages change rarely except during launches or MY updates |
| **News/blog** | Every 24 hours | Always (pages are mostly static HTML) | Low frequency, but new posts indicate launches/announcements |
| **Price guide** (where available) | Every 24 hours | If HTML hash changed | Price guides update quarterly or on MY change |
| **Sitemap.xml** | Every 24 hours | N/A (XML, no render needed) | New URLs indicate new pages added |

### 3.2 Per-OEM Estimated Monthly Renders

Assuming the above schedule and that ~20% of cheap checks trigger a full render:

| OEM | Pages Monitored | Cheap Checks/Month | Est. Full Renders/Month |
|-----|----------------|--------------------|-----------------------|
| Kia | ~25 (19 models + home + offers + news + sitemap) | ~2,700 | ~540 |
| Nissan | ~17 (10 models + home + offers + news + sitemap + browse-range) | ~1,800 | ~360 |
| Ford | ~14 (7 models + home + offers + news + sitemap + 2 news articles) | ~1,500 | ~300 |
| Volkswagen | ~22 (15+ models + home + offers + news + ranges) | ~2,400 | ~480 |
| Mitsubishi | ~12 (6 models + home + offers + news + blog) | ~1,300 | ~260 |
| LDV | ~19 (13 models + home + offers + news + price guide) | ~2,000 | ~400 |
| Isuzu | ~10 (2 models × 2 key pages + home + offers + news + specs) | ~1,100 | ~220 |
| Mazda | ~20 (13 models + home + offers + driveaway + news + brochures) | ~2,200 | ~440 |
| KGM | ~11 (5 models + home + offers + discover) | ~1,200 | ~240 |
| GWM | ~22 (10+ models × sub-brands + home + offers + news) | ~2,400 | ~480 |
| Suzuki | ~16 (10 models + home + offers + future + categories) | ~1,700 | ~340 |
| Hyundai | ~35 (25+ models + home + offers + news + calculator) | ~3,800 | ~760 |
| Toyota | ~32 (20+ models + home + offers + news + all-vehicles) | ~3,500 | ~700 |
| **TOTAL** | **~255** | **~27,600** | **~5,520** |

### 3.3 Cost Control Rules

1. **Skip render if cheap check shows no change** — this is the primary cost saver.
2. **Max 1 full render per page per 2 hours** — prevents runaway costs if hashing is flaky.
3. **Monthly render cap per OEM: 1,000** — alert the team if approaching limit.
4. **Global monthly render cap: 10,000** — hard stop with admin override.
5. **Backoff on repeated no-change** — if a page hasn't changed in 7 days, reduce check frequency by 50%.
6. **Burst on campaign periods** — allow manual override to increase homepage/offers check frequency to every 30 min during known campaign launches.

---

## 4. Change Detection & Alert Rules

### 4.1 Fields That Trigger Alerts (Meaningful Changes)

| Entity | Field | Alert Severity | Alert Channel |
|--------|-------|---------------|---------------|
| **Product** | `title` changed | HIGH | Slack immediate |
| **Product** | `price.amount` changed | HIGH | Slack immediate |
| **Product** | `price.type` changed | MEDIUM | Slack immediate |
| **Product** | `availability` changed | HIGH | Slack immediate |
| **Product** | `disclaimer_text` changed | MEDIUM | Slack immediate |
| **Product** | `primary_image_r2_key` changed (image hash) | MEDIUM | Slack batch (hourly) |
| **Product** | `variants` added/removed | HIGH | Slack immediate |
| **Product** | `variants[].price_amount` changed | HIGH | Slack immediate |
| **Product** | New product discovered | CRITICAL | Slack immediate + email |
| **Product** | Product no longer found (removed) | CRITICAL | Slack immediate + email |
| **Offer** | New offer discovered | HIGH | Slack immediate |
| **Offer** | Offer no longer found (expired/removed) | HIGH | Slack immediate |
| **Offer** | `price` fields changed | HIGH | Slack immediate |
| **Offer** | `disclaimer_text` changed | MEDIUM | Slack immediate |
| **Offer** | `validity.end_date` changed | MEDIUM | Slack immediate |
| **Offer** | `applicable_models` changed | MEDIUM | Slack immediate |
| **Banner** | New banner slide added | MEDIUM | Slack batch (hourly) |
| **Banner** | Banner slide removed | LOW | Slack batch (daily digest) |
| **Banner** | `image_sha256` changed (visual change) | MEDIUM | Slack batch (hourly) |
| **Banner** | `headline` or `cta_text` changed | MEDIUM | Slack batch (hourly) |
| **Sitemap** | New URL discovered | MEDIUM | Slack immediate |
| **Sitemap** | URL removed | LOW | Slack batch (daily digest) |

### 4.2 Fields to IGNORE (Noise Suppression)

These changes should NOT trigger alerts:

- Tracking parameters in URLs (`utm_*`, `gclid`, `fbclid`, session tokens)
- Dynamic timestamps in HTML (copyright year, "last updated" footers)
- A/B testing flags or experiment IDs
- Analytics/tracking script changes
- CSS class name changes (build hashes)
- Comment counts or social share counts
- Cookie consent banner changes
- Minor whitespace or formatting-only changes
- Image URL changes where the image SHA256 hash is identical (CDN URL rotation)

### 4.3 HTML Normalisation Rules (Before Hashing)

Before computing the page hash for change detection, apply these normalisations:

1. Remove all `<script>` tags and their contents
2. Remove all `<noscript>` tags and their contents
3. Remove all `<style>` tags and their contents
4. Remove all HTML comments
5. Remove all `data-*` attributes
6. Remove all `class` attributes (too noisy from build hashes)
7. Remove all `id` attributes that contain hashes or random strings
8. Strip all URL query parameters matching: `utm_*`, `gclid`, `fbclid`, `sessionid`, `_ga`, `_gid`
9. Normalise all whitespace (collapse multiple spaces/newlines to single space)
10. Remove known dynamic elements by selector:
    - Cookie consent banners
    - Chat widgets
    - Analytics containers
    - Footer copyright year strings
11. Sort attributes alphabetically within each tag
12. Lowercase all tag names and attribute names

---

## 5. Extraction Strategy Per OEM

This section defines the extraction approach for each OEM — whether to use CSS selectors, JSON-LD, or LLM normalisation.

### 5.1 Extraction Priority Order (All OEMs)

For every page, try extraction in this order:

1. **JSON-LD** (`<script type="application/ld+json">`) — best structured data, present on some OEM sites
2. **OpenGraph meta tags** (`og:title`, `og:image`, `og:description`) — reliable for basic info
3. **CSS selector extraction** — OEM-specific selectors defined below
4. **LLM normalisation** — only if deterministic extraction fails to produce a complete record

### 5.2 Per-OEM Selector Hints

#### Kia Australia
- Navigation model list: `nav` links matching `/au/cars/*.html`
- Vehicle thumbnails: `img` tags within nav with `/content/dam/kwcms/au/en/images/gnb/` src
- "COMING SOON" badge: text content before model name in nav items
- Homepage hero: requires Browser Rendering — carousel container class varies by KWCMS version

#### Nissan Australia
- Vehicle cards on browse-range: `<li>` items containing vehicle images and model names
- Hero slides: full-width sections with `.ximg.full.hero.jpg` background images
- Price display: triggered after postcode selection — set `Sydney, 2000` cookie/session before rendering
- Offers: `/offers.html` with category/model filter tabs

#### Ford Australia
- Billboard slides: sections under "billboards" content path, each with desktop/mobile `<img>` + `<h1>` + CTA `<a>`
- Vehicle showcase tabs: named tabs (Ranger, Everest, F-150, etc.) with container images
- Offer cards: card components under "Latest offers" section with image + heading + description
- News cards: card components under "What's happening at Ford" section

#### Volkswagen Australia
- Model grid: `/en/models.html` — JS-rendered model cards
- Hero slides: SVG placeholders until JS loads — must use Browser Rendering
- Offers: `/app/locals/offers-pricing` — fully SPA, must render
- Stock search: `/app/locals/stock-search` — SPA

#### Mitsubishi Australia
- Vehicle carousel: horizontal scrollable cards with model name + tagline + image + CTA
- Hero: full-width section with headline + CTA
- Offers: `/offers.html` — standard tile layout
- AEM content paths for images use `_jcr_content` in URL

#### LDV Australia
- Vehicle list: ordered list under "Our Range" nav with `<h4>` model name + description + link
- Offers: `/special-offers/` — tile layout
- Price guide: `/price/` — structured table/list of models and prices

#### Isuzu UTE Australia
- Two models only — deep page structure (overview, performance, design, tech, safety, towing, range, accessories)
- Spec PDFs: linked from range pages as direct downloads
- Offers: `/offers/current-offers`

#### Mazda Australia
- Model links: footer and nav both contain full model list linking to `/cars/{slug}/`
- Homepage sections: hero banner, 50/50 blocks, offer callout blocks
- Offers: `/offers/` hub with `/offers/driveaway/` sub-page
- Build tool: `/build/{model}/` — client-side, low priority for monitoring

#### KGM Australia
- Model grid: `/models` page
- Homepage carousel: promotional slides with image + disclaimer text
- Offers: `/offers` — currently using homepage carousel as primary offer display
- Disclaimer text is inline with banner HTML — extract as-is

#### GWM Australia
- Next.js site — check `__NEXT_DATA__` script tag for structured JSON page data
- Model grid: `/au/models/` — categorised by sub-brand (Haval, Tank, Cannon, Ora, Wey)
- Homepage carousel: promotional slides with factory bonus offers
- Assets CDN: `assets.gwmanz.com` (Storyblok)
- Brochure PDFs available from Storyblok CDN — download and hash for change detection

#### Suzuki Australia
- Vehicle cards: `/vehicles/` with category tabs (SUV, Small SUV, Small Car, 4x4, Hybrid, Electric)
- Hero: full-width banner with model showcase
- Future vehicles page: `/vehicles/future/` — high-value for upcoming model detection
- jQuery + Tailwind stack — moderate JS dependency

#### Hyundai Australia
- AEM-based — images via `/content/dam/hyundai/au/` DAM paths
- Vehicle grid: `/au/en/cars` with category filters (SUVs, Eco, Small Cars, Sports, People Movers)
- Offers: `/au/en/offers` — model-specific tiles
- Price calculator: `/au/en/shop/calculator` — client-side SPA
- News section at `/au/en/news/vehicles` contains launch announcements

#### Toyota Australia
- Sitecore XM + Next.js — check `__NEXT_DATA__` for structured data
- All vehicles page: `/all-vehicles` — comprehensive model grid
- Flat URL structure: `/{model-slug}` (no category prefix)
- Pressroom at `pressroom.toyota.com.au` — separate domain for news/announcements
- Offers: `/offers` — driveaway pricing featured prominently
- News: `/news` with model-specific launch articles

---

## 6. Supabase DDL (Ready to Execute)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE oems (
  id TEXT PRIMARY KEY,  -- e.g., 'kia-au', 'ford-au'
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE import_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  pages_checked INTEGER DEFAULT 0,
  pages_changed INTEGER DEFAULT 0,
  pages_errored INTEGER DEFAULT 0,
  products_upserted INTEGER DEFAULT 0,
  offers_upserted INTEGER DEFAULT 0,
  banners_upserted INTEGER DEFAULT 0,
  error_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_import_runs_oem ON import_runs(oem_id);
CREATE INDEX idx_import_runs_status ON import_runs(status);

CREATE TABLE source_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  url TEXT NOT NULL,
  page_type TEXT NOT NULL CHECK (page_type IN ('homepage', 'vehicle', 'offers', 'news', 'sitemap', 'price_guide', 'category', 'other')),
  last_hash TEXT,
  last_rendered_hash TEXT,
  last_checked_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  last_rendered_at TIMESTAMPTZ,
  consecutive_no_change INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'error', 'blocked')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, url)
);
CREATE INDEX idx_source_pages_oem ON source_pages(oem_id);
CREATE INDEX idx_source_pages_type ON source_pages(oem_id, page_type);

-- ============================================
-- CATALOGUE TABLES
-- ============================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  source_url TEXT NOT NULL,
  external_key TEXT,
  title TEXT NOT NULL,
  subtitle TEXT,
  body_type TEXT CHECK (body_type IN ('suv', 'sedan', 'hatch', 'ute', 'van', 'bus', 'people_mover', 'sports', 'cab_chassis', 'campervan')),
  fuel_type TEXT CHECK (fuel_type IN ('petrol', 'diesel', 'hybrid', 'phev', 'electric')),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'coming_soon', 'limited_stock', 'run_out', 'discontinued')),
  price_amount NUMERIC(12,2),
  price_currency TEXT DEFAULT 'AUD',
  price_type TEXT CHECK (price_type IN ('driveaway', 'from', 'rrp', 'weekly', 'monthly', 'per_week', 'per_month', 'mrlp')),
  price_raw_string TEXT,
  disclaimer_text TEXT,
  primary_image_r2_key TEXT,
  variants_json JSONB DEFAULT '[]',
  key_features_json JSONB DEFAULT '[]',
  cta_links_json JSONB DEFAULT '[]',
  meta_json JSONB DEFAULT '{}',
  content_hash TEXT,
  current_version_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, source_url)
);
CREATE INDEX idx_products_oem ON products(oem_id);
CREATE INDEX idx_products_external ON products(oem_id, external_key);
CREATE INDEX idx_products_availability ON products(oem_id, availability);

CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  alt_text TEXT,
  sort_order INTEGER DEFAULT 0,
  source_image_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, sha256)
);
CREATE INDEX idx_product_images_product ON product_images(product_id);

CREATE TABLE product_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  import_run_id UUID REFERENCES import_runs(id),
  content_hash TEXT NOT NULL,
  json_snapshot JSONB NOT NULL,
  diff_summary TEXT,
  diff_fields_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_versions_product ON product_versions(product_id);
CREATE INDEX idx_product_versions_oem ON product_versions(oem_id);

-- ============================================
-- OFFER TABLES
-- ============================================

CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  source_url TEXT NOT NULL,
  external_key TEXT,
  title TEXT NOT NULL,
  description TEXT,
  offer_type TEXT CHECK (offer_type IN ('price_discount', 'driveaway_deal', 'finance_rate', 'bonus_accessory', 'cashback', 'free_servicing', 'plate_clearance', 'factory_bonus', 'free_charger', 'other')),
  applicable_models_json JSONB DEFAULT '[]',
  price_amount NUMERIC(12,2),
  price_currency TEXT DEFAULT 'AUD',
  price_type TEXT,
  price_raw_string TEXT,
  saving_amount NUMERIC(12,2),
  start_date DATE,
  end_date DATE,
  validity_raw_string TEXT,
  cta_text TEXT,
  cta_url TEXT,
  hero_image_r2_key TEXT,
  disclaimer_text TEXT,
  disclaimer_html TEXT,
  eligibility TEXT,
  content_hash TEXT,
  current_version_id UUID,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, source_url)
);
CREATE INDEX idx_offers_oem ON offers(oem_id);
CREATE INDEX idx_offers_type ON offers(oem_id, offer_type);

CREATE TABLE offer_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  r2_key TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  asset_type TEXT CHECK (asset_type IN ('hero_image', 'tile_image', 'pdf', 'banner')),
  source_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(offer_id, sha256)
);

CREATE TABLE offer_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  import_run_id UUID REFERENCES import_runs(id),
  content_hash TEXT NOT NULL,
  json_snapshot JSONB NOT NULL,
  diff_summary TEXT,
  diff_fields_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_versions_offer ON offer_versions(offer_id);

CREATE TABLE offer_products (
  offer_id UUID NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  variant_label TEXT,
  PRIMARY KEY (offer_id, product_id)
);

-- ============================================
-- BANNER TABLES
-- ============================================

CREATE TABLE banners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  page_url TEXT NOT NULL,
  position INTEGER NOT NULL,
  headline TEXT,
  sub_headline TEXT,
  cta_text TEXT,
  cta_url TEXT,
  image_url_desktop TEXT,
  image_url_mobile TEXT,
  image_r2_key TEXT,
  image_sha256 TEXT,
  disclaimer_text TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, page_url, position)
);
CREATE INDEX idx_banners_oem ON banners(oem_id);

CREATE TABLE banner_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  banner_id UUID NOT NULL REFERENCES banners(id) ON DELETE CASCADE,
  oem_id TEXT NOT NULL REFERENCES oems(id),
  import_run_id UUID REFERENCES import_runs(id),
  content_hash TEXT NOT NULL,
  json_snapshot JSONB NOT NULL,
  diff_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- ACCESS CONTROL
-- ============================================

CREATE TABLE oem_members (
  oem_id TEXT NOT NULL REFERENCES oems(id),
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'editor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (oem_id, user_id)
);

-- ============================================
-- CHANGE EVENTS (for notification pipeline)
-- ============================================

CREATE TABLE change_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  import_run_id UUID REFERENCES import_runs(id),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'offer', 'banner', 'sitemap', 'page')),
  entity_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'updated', 'removed', 'price_changed', 'disclaimer_changed', 'image_changed', 'availability_changed', 'new_url_discovered')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  summary TEXT,
  diff_json JSONB,
  notified_at TIMESTAMPTZ,
  notification_channel TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_change_events_oem ON change_events(oem_id);
CREATE INDEX idx_change_events_severity ON change_events(severity);
CREATE INDEX idx_change_events_notified ON change_events(notified_at) WHERE notified_at IS NULL;

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE oems ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE banners ENABLE ROW LEVEL SECURITY;
ALTER TABLE banner_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE oem_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_events ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see OEMs they are members of
CREATE POLICY oems_member_read ON oems
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM oem_members m WHERE m.oem_id = oems.id AND m.user_id = auth.uid())
  );

-- Template policy for all tenant tables (repeat for each table)
-- Example for products:
CREATE POLICY products_member_read ON products
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM oem_members m WHERE m.oem_id = products.oem_id AND m.user_id = auth.uid())
  );

CREATE POLICY products_service_write ON products
  FOR ALL USING (auth.role() = 'service_role');

-- Repeat the above pattern for: import_runs, source_pages, product_images,
-- product_versions, offers, offer_assets, offer_versions, offer_products,
-- banners, banner_versions, change_events, oem_members

-- ============================================
-- SEED DATA: OEM Registry
-- ============================================

INSERT INTO oems (id, name, base_url, config_json) VALUES
('kia-au', 'Kia Australia', 'https://www.kia.com/au/', '{"homepage": "/au/main.html", "vehicles_index": "/au/cars.html", "offers": "/au/offers.html", "news": "/au/discover/news.html", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('nissan-au', 'Nissan Australia', 'https://www.nissan.com.au/', '{"homepage": "/", "vehicles_index": "/vehicles/browse-range.html", "offers": "/offers.html", "news": "/about-nissan/news-and-events.html", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}, "render_config": {"set_postcode": "2000"}}'),
('ford-au', 'Ford Australia', 'https://www.ford.com.au/', '{"homepage": "/", "offers": "/latest-offers.html", "news": "/news.html", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('volkswagen-au', 'Volkswagen Australia', 'https://www.volkswagen.com.au/', '{"homepage": "/en.html", "vehicles_index": "/en/models.html", "offers": "/app/locals/offers-pricing", "news": "/en/brand-experience/volkswagen-newsroom/latest-news.html", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}, "render_required": ["homepage", "offers"]}'),
('mitsubishi-au', 'Mitsubishi Motors Australia', 'https://www.mitsubishi-motors.com.au/', '{"homepage": "/?group=private", "offers": "/offers.html", "news": "/company/news.html", "blog": "/blog.html", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('ldv-au', 'LDV Automotive Australia', 'https://www.ldvautomotive.com.au/', '{"homepage": "/", "vehicles_index": "/vehicles/", "offers": "/special-offers/", "news": "/ldv-stories/", "price_guide": "/price/", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('isuzu-au', 'Isuzu UTE Australia', 'https://www.isuzuute.com.au/', '{"homepage": "/", "dmax": "/d-max/overview", "mux": "/mu-x/overview", "offers": "/offers/current-offers", "news": "/discover/news", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('mazda-au', 'Mazda Australia', 'https://www.mazda.com.au/', '{"homepage": "/", "offers": "/offers/", "offers_driveaway": "/offers/driveaway/", "news": "/mazda-news/", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('kgm-au', 'KGM (SsangYong) Australia', 'https://kgm.com.au/', '{"homepage": "/", "models_index": "/models", "offers": "/offers", "discover": "/discover-kgm", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('gwm-au', 'GWM Australia', 'https://www.gwmanz.com/au/', '{"homepage": "/au/", "models_index": "/au/models/", "offers": "/au/offers/", "news": "/au/news/", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}, "sub_brands": ["haval", "tank", "cannon", "ora", "wey"]}'),
('suzuki-au', 'Suzuki Australia', 'https://www.suzuki.com.au/', '{"homepage": "/home/", "vehicles_index": "/vehicles/", "offers": "/offers/", "future": "/vehicles/future/", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}}'),
('hyundai-au', 'Hyundai Australia', 'https://www.hyundai.com/au/en', '{"homepage": "/au/en", "vehicles_index": "/au/en/cars", "offers": "/au/en/offers", "news": "/au/en/news", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}, "sub_brands": ["ioniq", "n"]}'),
('toyota-au', 'Toyota Australia', 'https://www.toyota.com.au/', '{"homepage": "/", "all_vehicles": "/all-vehicles", "offers": "/offers", "news": "/news", "schedule": {"homepage_minutes": 120, "offers_minutes": 240, "vehicles_minutes": 720, "news_minutes": 1440}, "sub_brands": ["gr"]}');
```

---

## 7. R2 Storage Key Convention

All objects follow this strict pattern:

```
oem/{oem_id}/products/{product_id}/images/{sha256}.{ext}
oem/{oem_id}/offers/{offer_id}/assets/{sha256}.{ext}
oem/{oem_id}/banners/{page_hash}/{position}_{sha256}.{ext}
oem/{oem_id}/snapshots/{url_hash}/{timestamp}.html
oem/{oem_id}/screenshots/{url_hash}/{timestamp}.png
```

**Rules:**
- `oem_id` must match a valid entry in the `oems` table.
- `sha256` is the lowercase hex digest of the file contents.
- `ext` is the original file extension (`jpg`, `png`, `webp`, `html`).
- `url_hash` is SHA256 of the normalised URL (without query params).
- `timestamp` is ISO 8601 format: `2026-02-11T10-30-00Z` (colons replaced with hyphens for filesystem safety).
- **Never accept R2 keys from external input** — always compute them in code.

---

## 8. Notification Payload Templates

### 8.1 Slack — Immediate Alert (Price Change)

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🚨 Price Change — Ford Ranger" }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*OEM:*\nFord Australia" },
        { "type": "mrkdwn", "text": "*Model:*\nRanger" },
        { "type": "mrkdwn", "text": "*Previous:*\n$56,990 driveaway" },
        { "type": "mrkdwn", "text": "*New:*\n$53,990 driveaway" },
        { "type": "mrkdwn", "text": "*Change:*\n-$3,000" },
        { "type": "mrkdwn", "text": "*Detected:*\n2026-02-11 10:30 AEDT" }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "View on OEM Site" },
          "url": "https://www.ford.com.au/showroom/trucks-and-vans/ranger.html"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "View Diff" },
          "url": "https://your-admin.example.com/changes/ford-au/products/ranger"
        }
      ]
    }
  ]
}
```

### 8.2 Slack — New Offer Discovered

```json
{
  "blocks": [
    {
      "type": "header",
      "text": { "type": "plain_text", "text": "🆕 New Offer — Mazda Australia" }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*2025 Plate Clearance*\nDriveaway deals across select 2025 models including CX-5 Maxx, CX-60 G25 Pure, CX-80 Pure and BT-50 SP & XT.\n\n*Type:* Plate Clearance\n*Validity:* While stocks last\n*Eligibility:* Private buyers"
      }
    }
  ]
}
```

### 8.3 Daily Digest Email (Summary)

Subject: `[OEM Agent] Daily Change Summary — 2026-02-11`

Body includes:
- Count of changes per OEM
- Top 5 most significant changes (by severity)
- New products/offers discovered
- Products/offers removed
- Link to full change log in admin UI

---

## 9. Agent Sales Rep — Tool Definitions

The Sales Rep agent has access to these tools, all scoped by `oem_id`:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_current_products` | `oem_id` | Returns all active products for the OEM with current pricing |
| `get_product_detail` | `oem_id`, `product_id` or `external_key` | Returns full product record with variants, images, disclaimers |
| `get_current_offers` | `oem_id` | Returns all active offers for the OEM |
| `get_offer_detail` | `oem_id`, `offer_id` | Returns full offer record with assets, disclaimers, eligibility |
| `get_recent_changes` | `oem_id`, `days` (default 7) | Returns change events for the last N days |
| `get_banner_set` | `oem_id` | Returns current homepage banner set with images |
| `compare_product_versions` | `oem_id`, `product_id`, `version_a`, `version_b` | Returns diff between two product versions |
| `generate_change_summary` | `oem_id`, `date_range` | LLM-generated summary of what changed |
| `draft_social_post` | `oem_id`, `topic`, `platform` | Generates draft social media content based on current offers/products |
| `draft_edm_copy` | `oem_id`, `campaign_type` | Generates email marketing copy using current offers |

**Scoping rule:** Every tool call must include `oem_id`. The agent's system prompt hard-states: "You are the sales representative for {OEM_NAME} only. All data retrieval and content generation must be scoped to oem_id={OEM_ID}. Do not reference, compare, or use data from any other OEM."

---

## 10. AI Model Routing Strategy

This section defines which AI model/provider handles each task in the pipeline. The principle is: **use the cheapest, fastest model that can do the job, escalate to more capable models only when needed.**

### 10.1 Provider Registry

| Provider | API Base | Auth | Models Used | Protocol |
|----------|----------|------|-------------|----------|
| **Groq** | `https://api.groq.com/openai/v1` | Bearer token | GPT-OSS 120B, GPT-OSS 20B, Kimi K2, Llama 4 Scout, Qwen3 32B | OpenAI-compatible |
| **Moonshot / Together AI** | `https://api.together.xyz/v1` | Bearer token | Kimi K2.5 (vision) | OpenAI-compatible |
| **Cloudflare AI Gateway** | Via Worker binding | Worker auth | Routes to any backend | Proxy/observability layer |
| **Anthropic** | `https://api.anthropic.com/v1` | API key | Claude Sonnet 4.5 (Sales Rep agent) | Anthropic Messages API |

### 10.2 Task-to-Model Routing

| Pipeline Stage | Task | Primary Model (Groq) | Fallback Model | Rationale |
|---------------|------|---------------------|----------------|-----------|
| **Crawl — HTML normalisation** | Strip noise, normalise HTML before hashing | Llama 4 Scout 17B | Regex rules (Section 4.3) | Ultra-fast (0.15s latency), $0.11/M tokens. Smarter than regex at preserving semantic content while stripping noise. Regex rules remain as deterministic baseline. |
| **Crawl — LLM extraction fallback** | Parse messy HTML into product/offer/banner JSON when CSS selectors fail | GPT-OSS 120B | Kimi K2 (Groq) | Best reasoning at low cost ($0.15/$0.60 per M). 131K context handles full-page HTML. Kimi K2 as fallback for complex multi-brand pages (GWM sub-brands). |
| **Crawl — Structured output validation** | Validate extracted JSON against schema, fix malformed fields | GPT-OSS 20B | N/A (fail to manual review) | Fastest + cheapest ($0.075/$0.30 per M). Schema validation is a lightweight task. |
| **Change detection — Diff classification** | Determine if a change is meaningful (price change) vs. noise (CSS class rename) | Llama 4 Scout 17B | GPT-OSS 20B | Speed-critical — runs on every detected hash change. Must decide in <200ms whether to escalate to a full render. |
| **Change detection — Summary generation** | Generate natural language summary for Slack alerts | GPT-OSS 120B | Kimi K2 (Groq) | Quality matters for user-facing summaries. Still fast enough for real-time Slack alerts. |
| **Design Agent — Visual change pre-screening** | Analyse DOM/CSS diff to determine if a full Kimi K2.5 vision capture is warranted | Kimi K2 (Groq, text-only) | GPT-OSS 120B | Reviews computed CSS changes: "is this a design change or just content swap?" Avoids unnecessary K2.5 vision calls. |
| **Design Agent — Brand token extraction** | Screenshot → brand_tokens.v1 JSON | Kimi K2.5 (Together AI, vision) | N/A (vision required) | Only model with native multimodal vision + web design understanding. Runs infrequently (quarterly + event-driven). |
| **Design Agent — Page layout decomposition** | Screenshot + DOM → page_layout.v1 JSON | Kimi K2.5 (Together AI, vision) | N/A (vision required) | Same — vision capability is non-negotiable for pixel-perfect layout extraction. |
| **Design Agent — Component detail extraction** | Component crop → CSS-equivalent styling JSON | Kimi K2.5 (Together AI, vision) | Groq Kimi K2 + computed CSS (text-only approximation) | K2.5 preferred for accuracy. K2 text-only fallback can work if DOM + computed CSS is available. |
| **Sales Rep — Conversational agent** | User-facing OEM sales assistant | Claude Sonnet 4.5 (Anthropic) | GPT-OSS 120B (Groq) | Claude for best conversational quality + tool use reliability. Groq fallback for cost-sensitive deployments. |
| **Sales Rep — Content generation** | Draft social posts, EDM copy, change summaries | GPT-OSS 120B (Groq) | Claude Sonnet 4.5 | Groq for speed + cost. Claude for premium quality when needed. |
| **Sales Rep — Data retrieval** | Query Supabase for products, offers, changes | N/A (direct DB) | N/A | No LLM needed — tool calls go direct to Supabase. |

### 10.3 Groq Configuration

```json
{
  "groq": {
    "api_base": "https://api.groq.com/openai/v1",
    "api_key_env": "GROQ_API_KEY",
    "default_params": {
      "temperature": 0.1,
      "max_tokens": 8192,
      "response_format": { "type": "json_object" }
    },
    "models": {
      "fast_classify": {
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "description": "Ultra-fast classification and lightweight tasks",
        "cost_per_m_input": 0.11,
        "cost_per_m_output": 0.34,
        "max_context": 131072,
        "latency_p50_ms": 150,
        "supports_vision": true,
        "supports_tools": true
      },
      "balanced": {
        "model": "openai/gpt-oss-20b",
        "description": "Fast reasoning, validation, structured output",
        "cost_per_m_input": 0.075,
        "cost_per_m_output": 0.30,
        "max_context": 131072,
        "latency_p50_ms": 300,
        "supports_vision": false,
        "supports_tools": true
      },
      "powerful": {
        "model": "openai/gpt-oss-120b",
        "description": "Complex extraction, summarisation, content generation",
        "cost_per_m_input": 0.15,
        "cost_per_m_output": 0.60,
        "max_context": 131072,
        "latency_p50_ms": 800,
        "supports_vision": false,
        "supports_tools": true
      },
      "reasoning": {
        "model": "moonshotai/kimi-k2-instruct",
        "description": "Complex reasoning, multi-brand page analysis",
        "cost_per_m_input": 1.00,
        "cost_per_m_output": 3.00,
        "max_context": 262144,
        "latency_p50_ms": 1200,
        "supports_vision": false,
        "supports_tools": true
      }
    },
    "batch_config": {
      "enabled": true,
      "discount_pct": 50,
      "use_for": ["news_page_extraction", "quarterly_design_audit_pre_screening", "bulk_sitemap_analysis"]
    }
  }
}
```

### 10.4 Kimi K2.5 Configuration (Vision — Outside Groq)

```json
{
  "kimi_k2_5": {
    "api_base": "https://api.together.xyz/v1",
    "api_key_env": "TOGETHER_API_KEY",
    "model": "moonshotai/Kimi-K2.5",
    "default_params": {
      "temperature": 0.6,
      "max_tokens": 16384,
      "response_format": { "type": "json_object" }
    },
    "thinking_mode_params": {
      "temperature": 1.0,
      "max_tokens": 32768
    },
    "cost_per_m_input": 0.60,
    "cost_per_m_output": 2.50,
    "max_context": 262144,
    "supports_vision": true,
    "use_for": ["brand_token_extraction", "page_layout_decomposition", "component_detail_extraction"]
  }
}
```

### 10.5 Estimated Monthly AI Costs (13 OEMs)

| Task Category | Model | Est. Monthly Calls | Avg Tokens/Call | Monthly Cost |
|--------------|-------|-------------------|----------------|-------------|
| HTML normalisation (pre-hash) | Llama 4 Scout (Groq) | ~16,200 | ~2K in / ~500 out | ~$3.60 + $2.75 = **$6.35** |
| LLM extraction fallback (~20% of renders) | GPT-OSS 120B (Groq) | ~1,100 | ~8K in / ~2K out | ~$1.32 + $1.32 = **$2.64** |
| Change diff classification | Llama 4 Scout (Groq) | ~3,000 | ~1K in / ~200 out | ~$0.33 + $0.20 = **$0.53** |
| Change summary generation | GPT-OSS 120B (Groq) | ~300 | ~3K in / ~1K out | ~$0.14 + $0.18 = **$0.32** |
| Design pre-screening | Kimi K2 (Groq) | ~50 | ~5K in / ~1K out | ~$0.25 + $0.15 = **$0.40** |
| Design vision capture | Kimi K2.5 (Together) | ~20 | ~5K in / ~3K out | ~$0.06 + $0.15 = **$0.21** |
| Sales Rep conversations | Claude Sonnet 4.5 | Variable | Variable | Usage-based |
| Sales Rep content gen | GPT-OSS 120B (Groq) | ~200 | ~2K in / ~1K out | ~$0.06 + $0.12 = **$0.18** |
| **TOTAL (excl. Sales Rep conversations)** | | | | **~$10.63/month** |

### 10.6 Routing Rules

```
1. ALWAYS try deterministic extraction first (JSON-LD, OG tags, CSS selectors)
2. ONLY invoke LLM if deterministic extraction returns <80% field coverage
3. Route to cheapest capable model:
   - Classification/validation → Llama 4 Scout (Groq)
   - Extraction/summarisation → GPT-OSS 120B (Groq)
   - Complex reasoning → Kimi K2 (Groq)
   - Vision required → Kimi K2.5 (Together AI)
   - User-facing conversation → Claude Sonnet 4.5 (Anthropic)
4. Use Groq batch API (50% discount) for non-time-sensitive tasks
5. Route through Cloudflare AI Gateway for observability on all calls
6. Set per-model monthly spend caps:
   - Groq total: $25/month hard cap
   - Together AI (K2.5): $5/month hard cap
   - Anthropic (Claude): usage-based, no cap
7. If a model returns malformed JSON, retry once with same model, then escalate to next tier
8. Log all LLM calls to `ai_inference_log` table for cost tracking and quality review
```

---

## 11. Appendix: OEM Site Technology Summary

| OEM | CMS | JS-Heavy | Browser Render Required | Sitemap Available | Offers Path | Notes |
|-----|-----|----------|------------------------|------------------|-------------|-------|
| Kia | AEM (KWCMS) | Yes | Yes | Check `/au/sitemap.xml` | `/au/offers.html` | Large model range (19+) |
| Nissan | PACE Global | Yes | Yes | Check `/sitemap.xml` | `/offers.html` | Location-dependent pricing |
| Ford | AEM | Yes | Yes | Check `/sitemap.xml` | `/latest-offers.html` | News section is launch-rich |
| Volkswagen | VW OneHub | Yes (heavy) | Yes (mandatory) | Check `/sitemap.xml` | `/app/locals/offers-pricing` (SPA) | Most JS-dependent site |
| Mitsubishi | AEM | Moderate | Yes | Check `/sitemap.xml` | `/offers.html` | Private/business audience split |
| LDV | i-Motor | Moderate | Recommended | Unlikely (check) | `/special-offers/` | Large commercial range |
| Isuzu | Dataweavers | Yes | Yes | Check `/sitemap.xml` | `/offers/current-offers` | Only 2 models |
| Mazda | Episerver | Moderate | Recommended | `/sitemap/` page exists | `/offers/` | 13 models + upcoming EVs |
| KGM | Next.js/Payload | Yes | Recommended | Unlikely (check) | `/offers` | 5 models, SSR helps |
| GWM | Storyblok + Next.js | Yes | Yes | Unlikely (check) | `/au/offers/` | 5 sub-brands, 10+ models |
| Suzuki | Custom (nginx/jQuery/Tailwind) | Moderate | Recommended | Check `/sitemap.xml` | `/offers/` | Small range, future page |
| Hyundai | AEM | Yes | Yes | Check `/sitemap.xml` | `/au/en/offers` | 25+ models, largest EV range |
| Toyota | Sitecore XM + Next.js | Yes | Yes (SSR helps) | Check `/sitemap.xml` | `/offers` | Australia's #1 brand, 20+ models |

---

## 12. Design Agent — OEM Brand Capture & Page Layout Extraction

### 12.1 Overview & Purpose

The Design Agent is a separate pipeline that runs alongside the data crawl agent. Its job is to capture the **visual design system** of each OEM's vehicle pages and encode it as structured JSON — a machine-readable brand style guide and component-level layout spec. This powers dealer microsites that mirror the OEM's current brand look with pixel-perfect fidelity, populated with live crawl data (pricing, offers, images) from the monitoring agent.

**Why this exists:** OEMs update their site designs 1-3 times per year (seasonal campaigns, model year refreshes, full redesigns). Rather than manually redesigning dealer templates each time, the Design Agent automatically detects visual changes, re-extracts the design system, and updates the dealer site templates accordingly.

### 12.2 Architecture

```
Browser Rendering (Cloudflare)
  ├── Full-page screenshot (desktop 1440px + mobile 390px)
  ├── Computed CSS extraction (key elements)
  └── Full DOM tree capture (cleaned HTML)
        │
        ▼
  R2 Storage
  oem/{oem_id}/design_captures/{page_type}/{timestamp}/
    ├── screenshot_desktop.png
    ├── screenshot_mobile.png
    ├── computed_styles.json
    └── dom_snapshot.html
        │
        ▼
  Kimi K2.5 Vision API (Moonshot / Together AI / NVIDIA NIM)
  ├── Pass 1: Brand Token Extraction (screenshot → brand_tokens.v1 JSON)
  ├── Pass 2: Page Layout Decomposition (screenshot + DOM → page_layout.v1 JSON)
  └── Pass 3: Component Detail Extraction (per-component crops → component style specs)
        │
        ▼
  Supabase
  ├── brand_tokens table (per-OEM design system)
  ├── page_layouts table (per-page component tree)
  └── design_captures table (audit trail of all captures)
        │
        ▼
  Dealer Microsite Renderer
  └── Reads brand_tokens + page_layout + live product/offer data → renders OEM-branded pages
```

### 12.3 Kimi K2.5 Integration

**Model:** `moonshotai/kimi-k2.5` (1T MoE, 32B active parameters)
**API:** OpenAI-compatible chat completions (`POST /v1/chat/completions`)
**Vision input:** Base64-encoded screenshots via `image_url` in message content
**Modes:** Thinking Mode (temperature=1.0) for brand token extraction; Instant Mode (temperature=0.6) for layout decomposition
**Context:** 256K tokens — sufficient for screenshot + DOM + detailed extraction prompt
**Cost:** ~$0.60/M input tokens, ~$2.50/M output tokens

**Provider options (in priority order):**
1. **Together AI** — `https://api.together.xyz/v1/chat/completions` — hosted, OpenAI-compatible, low latency
2. **Moonshot Platform** — `https://platform.moonshot.ai` — direct from Moonshot
3. **NVIDIA NIM** — `https://build.nvidia.com/moonshotai/kimi-k2.5` — alternative hosted endpoint
4. **Self-hosted** — MIT-licensed, can run on own GPU infrastructure if volume justifies it

**Routing:** Kimi K2.5 sits outside Cloudflare AI Gateway's built-in providers. The Sandbox container calls the API directly via outbound HTTP, or the Worker proxies it as a custom AI endpoint.

**Prompt strategy:**

The extraction uses a **three-pass approach** per page:

**Pass 1 — Brand Token Extraction** (runs once per OEM, re-runs on major visual change)
```
Input: Desktop screenshot of homepage + 2 vehicle pages
Prompt: "Analyse these screenshots from {OEM_NAME}'s Australian website. Extract the complete brand design system as JSON including: primary/secondary/accent colours (hex), typography (font families, sizes, weights for headings/body/captions), spacing scale (padding/margin values in px), border-radius values, button styles (fill, outline, text variants), card component patterns, and any signature visual treatments (gradients, overlays, shadows). Return brand_tokens.v1 JSON."
Mode: Thinking (for thorough analysis)
```

**Pass 2 — Page Layout Decomposition** (runs per page type: vehicle, offers, homepage)
```
Input: Desktop screenshot + mobile screenshot + cleaned DOM HTML
Prompt: "Decompose this {OEM_NAME} {page_type} page into a hierarchical component tree. For each component identify: type, position, dimensions, flex/grid layout properties, background treatment, and content_slots (headline, image, price, cta, etc.). Return page_layout.v1 JSON with responsive breakpoints for desktop (1440px), tablet (768px), mobile (390px)."
Mode: Instant (structured output, less reasoning needed)
```

**Pass 3 — Component Detail Extraction** (runs per unique component type)
```
Input: Cropped screenshot of individual component + component DOM fragment
Prompt: "Extract pixel-perfect styling for this {component_type} component from {OEM_NAME}: exact padding, margin, font sizes, line heights, letter spacing, colours, borders, shadows, hover states if visible, transition properties. Return as CSS-equivalent JSON properties."
Mode: Instant
```

### 12.4 Schemas

#### 12.4.1 Brand Tokens Schema (`brand_tokens.v1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OEM Brand Design Tokens",
  "type": "object",
  "required": ["oem_id", "version", "captured_at"],
  "properties": {
    "oem_id": { "type": "string" },
    "version": { "type": "integer", "description": "Auto-incrementing version number" },
    "captured_at": { "type": "string", "format": "date-time" },
    "source_pages": {
      "type": "array",
      "items": { "type": "string", "format": "uri" },
      "description": "URLs used to derive these tokens"
    },
    "colors": {
      "type": "object",
      "properties": {
        "primary": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
        "secondary": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
        "accent": { "type": ["string", "null"], "pattern": "^#[0-9A-Fa-f]{6}$" },
        "background": { "type": "string" },
        "surface": { "type": "string", "description": "Card/panel background" },
        "text_primary": { "type": "string" },
        "text_secondary": { "type": "string" },
        "text_on_primary": { "type": "string", "description": "Text colour on primary background" },
        "border": { "type": "string" },
        "error": { "type": "string" },
        "success": { "type": "string" },
        "cta_fill": { "type": "string", "description": "Primary CTA button background" },
        "cta_text": { "type": "string", "description": "Primary CTA button text" },
        "cta_hover": { "type": ["string", "null"] },
        "gradient": {
          "type": ["object", "null"],
          "properties": {
            "type": { "type": "string", "enum": ["linear", "radial"] },
            "direction": { "type": "string" },
            "stops": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "color": { "type": "string" },
                  "position": { "type": "string" }
                }
              }
            }
          }
        },
        "palette_extended": {
          "type": "object",
          "additionalProperties": { "type": "string" },
          "description": "Any additional named colours found in the design"
        }
      }
    },
    "typography": {
      "type": "object",
      "properties": {
        "font_primary": { "type": "string", "description": "Main heading font family" },
        "font_secondary": { "type": ["string", "null"], "description": "Body/secondary font family" },
        "font_mono": { "type": ["string", "null"], "description": "Monospace font if used (specs, prices)" },
        "font_cdn_urls": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Google Fonts or CDN URLs for web font loading"
        },
        "scale": {
          "type": "object",
          "description": "Typography scale: size/weight/lineHeight/letterSpacing per role",
          "properties": {
            "display": { "$ref": "#/$defs/typographyEntry" },
            "h1": { "$ref": "#/$defs/typographyEntry" },
            "h2": { "$ref": "#/$defs/typographyEntry" },
            "h3": { "$ref": "#/$defs/typographyEntry" },
            "h4": { "$ref": "#/$defs/typographyEntry" },
            "body_large": { "$ref": "#/$defs/typographyEntry" },
            "body": { "$ref": "#/$defs/typographyEntry" },
            "body_small": { "$ref": "#/$defs/typographyEntry" },
            "caption": { "$ref": "#/$defs/typographyEntry" },
            "price": { "$ref": "#/$defs/typographyEntry" },
            "disclaimer": { "$ref": "#/$defs/typographyEntry" },
            "cta": { "$ref": "#/$defs/typographyEntry" },
            "nav": { "$ref": "#/$defs/typographyEntry" }
          }
        }
      }
    },
    "spacing": {
      "type": "object",
      "properties": {
        "unit": { "type": "integer", "description": "Base spacing unit in px (typically 4 or 8)" },
        "scale": {
          "type": "object",
          "description": "Named spacing values: xs, sm, md, lg, xl, 2xl, 3xl",
          "additionalProperties": { "type": "integer" }
        },
        "section_gap": { "type": "integer", "description": "Vertical gap between major page sections" },
        "container_max_width": { "type": "integer", "description": "Max content width in px" },
        "container_padding": { "type": "integer", "description": "Horizontal padding on container" }
      }
    },
    "borders": {
      "type": "object",
      "properties": {
        "radius_sm": { "type": "string" },
        "radius_md": { "type": "string" },
        "radius_lg": { "type": "string" },
        "radius_full": { "type": "string", "description": "Pill/rounded (e.g., 9999px)" },
        "width_default": { "type": "string" },
        "color_default": { "type": "string" }
      }
    },
    "shadows": {
      "type": "object",
      "properties": {
        "sm": { "type": "string", "description": "CSS box-shadow value" },
        "md": { "type": "string" },
        "lg": { "type": "string" }
      }
    },
    "buttons": {
      "type": "object",
      "properties": {
        "primary": { "$ref": "#/$defs/buttonStyle" },
        "secondary": { "$ref": "#/$defs/buttonStyle" },
        "outline": { "$ref": "#/$defs/buttonStyle" },
        "text": { "$ref": "#/$defs/buttonStyle" }
      }
    },
    "components": {
      "type": "object",
      "description": "Reusable component-level style tokens",
      "properties": {
        "card": {
          "type": "object",
          "properties": {
            "background": { "type": "string" },
            "border_radius": { "type": "string" },
            "shadow": { "type": "string" },
            "padding": { "type": "string" },
            "hover_shadow": { "type": ["string", "null"] }
          }
        },
        "hero": {
          "type": "object",
          "properties": {
            "min_height_desktop": { "type": "string" },
            "min_height_mobile": { "type": "string" },
            "overlay": { "type": ["string", "null"], "description": "CSS overlay (e.g., rgba gradient)" },
            "text_alignment": { "type": "string" }
          }
        },
        "nav": {
          "type": "object",
          "properties": {
            "height": { "type": "string" },
            "background": { "type": "string" },
            "text_color": { "type": "string" },
            "sticky": { "type": "boolean" }
          }
        },
        "price_display": {
          "type": "object",
          "properties": {
            "font": { "type": "string" },
            "size": { "type": "string" },
            "weight": { "type": "string" },
            "color": { "type": "string" },
            "prefix_style": { "type": ["string", "null"], "description": "e.g., 'From' in smaller text" }
          }
        },
        "disclaimer": {
          "type": "object",
          "properties": {
            "font_size": { "type": "string" },
            "color": { "type": "string" },
            "line_height": { "type": "string" },
            "max_width": { "type": ["string", "null"] }
          }
        }
      }
    },
    "animations": {
      "type": ["object", "null"],
      "properties": {
        "transition_default": { "type": "string", "description": "e.g., 'all 0.3s ease'" },
        "carousel_transition": { "type": ["string", "null"] },
        "hover_scale": { "type": ["string", "null"] }
      }
    }
  },
  "$defs": {
    "typographyEntry": {
      "type": "object",
      "properties": {
        "fontFamily": { "type": "string" },
        "fontSize": { "type": "string" },
        "fontWeight": { "type": ["string", "integer"] },
        "lineHeight": { "type": "string" },
        "letterSpacing": { "type": ["string", "null"] },
        "textTransform": { "type": ["string", "null"] }
      }
    },
    "buttonStyle": {
      "type": "object",
      "properties": {
        "background": { "type": "string" },
        "color": { "type": "string" },
        "border": { "type": "string" },
        "border_radius": { "type": "string" },
        "padding": { "type": "string" },
        "font_size": { "type": "string" },
        "font_weight": { "type": ["string", "integer"] },
        "text_transform": { "type": ["string", "null"] },
        "hover_background": { "type": ["string", "null"] },
        "hover_color": { "type": ["string", "null"] }
      }
    }
  }
}
```

#### 12.4.2 Page Layout Schema (`page_layout.v1`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "OEM Page Layout Specification",
  "type": "object",
  "required": ["oem_id", "page_type", "source_url", "captured_at", "sections"],
  "properties": {
    "oem_id": { "type": "string" },
    "page_type": {
      "type": "string",
      "enum": ["homepage", "vehicle_detail", "vehicle_range", "offers", "offer_detail", "news", "news_article"]
    },
    "source_url": { "type": "string", "format": "uri" },
    "captured_at": { "type": "string", "format": "date-time" },
    "version": { "type": "integer" },
    "viewport": {
      "type": "object",
      "properties": {
        "desktop_width": { "type": "integer", "default": 1440 },
        "tablet_width": { "type": "integer", "default": 768 },
        "mobile_width": { "type": "integer", "default": 390 }
      }
    },
    "page_meta": {
      "type": "object",
      "properties": {
        "background_color": { "type": "string" },
        "max_content_width": { "type": "integer" },
        "uses_full_bleed": { "type": "boolean", "description": "Whether sections extend edge-to-edge" }
      }
    },
    "sections": {
      "type": "array",
      "items": { "$ref": "#/$defs/section" },
      "description": "Ordered list of page sections from top to bottom"
    }
  },
  "$defs": {
    "section": {
      "type": "object",
      "required": ["id", "type", "components"],
      "properties": {
        "id": { "type": "string", "description": "Unique section identifier (e.g., 'hero', 'specs-table', 'gallery')" },
        "type": {
          "type": "string",
          "enum": [
            "hero_banner", "hero_carousel", "hero_video",
            "vehicle_intro", "vehicle_highlights",
            "spec_table", "spec_comparison",
            "image_gallery", "image_carousel",
            "feature_grid", "feature_list",
            "variant_selector", "variant_cards",
            "price_display", "price_table",
            "cta_banner", "cta_strip",
            "offer_tiles", "offer_detail",
            "text_block", "two_column",
            "tabbed_content", "accordion",
            "testimonial", "review_carousel",
            "related_models", "model_cards",
            "disclaimer_block", "footer_legal",
            "breadcrumb", "sticky_nav",
            "configurator_link", "build_price_cta",
            "video_embed", "360_viewer",
            "custom"
          ]
        },
        "layout": {
          "type": "object",
          "properties": {
            "display": { "type": "string", "enum": ["flex", "grid", "block", "inline-flex"] },
            "direction": { "type": "string", "enum": ["row", "column", "row-reverse", "column-reverse"] },
            "justify": { "type": "string" },
            "align": { "type": "string" },
            "gap": { "type": "string" },
            "grid_template": { "type": ["string", "null"], "description": "CSS grid-template-columns" },
            "width": { "type": "string", "description": "e.g., '100%', '1440px'" },
            "max_width": { "type": ["string", "null"] },
            "min_height": { "type": ["string", "null"] },
            "padding": { "type": "string" },
            "margin": { "type": "string" },
            "full_bleed": { "type": "boolean", "default": false }
          }
        },
        "style": {
          "type": "object",
          "properties": {
            "background": { "type": "string" },
            "background_image": { "type": ["string", "null"] },
            "overlay": { "type": ["string", "null"] },
            "border_bottom": { "type": ["string", "null"] },
            "box_shadow": { "type": ["string", "null"] }
          }
        },
        "responsive": {
          "type": "object",
          "properties": {
            "tablet": {
              "type": ["object", "null"],
              "description": "Layout/style overrides at tablet breakpoint"
            },
            "mobile": {
              "type": ["object", "null"],
              "description": "Layout/style overrides at mobile breakpoint"
            }
          }
        },
        "content_slots": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "properties": {
              "slot_type": {
                "type": "string",
                "enum": ["text", "rich_text", "image", "price", "cta_button", "cta_link", "list", "table", "video", "html", "disclaimer", "badge"]
              },
              "data_binding": {
                "type": "string",
                "description": "JSONPath to crawl data field (e.g., 'product.title', 'offer.price.raw_string', 'product.primary_image_r2_key')"
              },
              "style": {
                "type": "object",
                "description": "Slot-specific styling overrides"
              },
              "fallback": {
                "type": ["string", "null"],
                "description": "Default content if data binding returns null"
              }
            }
          },
          "description": "Named content slots that map to crawl data fields"
        },
        "components": {
          "type": "array",
          "items": { "$ref": "#/$defs/section" },
          "description": "Nested child components (recursive)"
        }
      }
    }
  }
}
```

### 12.5 Capture Schedule & Triggers

Design captures are **infrequent and event-driven** — not on the same high-frequency schedule as data crawling.

| Trigger | Action | Pages Captured |
|---------|--------|---------------|
| **Initial onboarding** | Full capture of all page types | Homepage, 3 representative vehicle pages, offers page |
| **Homepage screenshot hash change > 30%** | Re-capture homepage layout | Homepage only |
| **Vehicle page screenshot hash change > 30%** | Re-capture vehicle layout | Affected vehicle page |
| **Manual trigger** | Full re-capture | All page types for specified OEM |
| **Quarterly scheduled** | Full design audit | All page types, all OEMs |

**30% threshold:** Compare screenshot hashes using perceptual hashing (pHash) rather than pixel-exact SHA256. A >30% pHash distance indicates a design change (not just content swap). Content-only changes (new price, new image, same layout) typically produce <10% pHash distance.

**Estimated Kimi K2.5 API cost per full OEM capture:**
- 3 passes × ~5 pages × ~2 screenshots each = ~30 API calls
- Average ~5K input tokens + ~3K output tokens per call
- Cost: ~$0.09 per full OEM capture (input) + ~$0.075 (output) ≈ **$0.17 per OEM**
- Quarterly full audit of 13 OEMs: ~**$2.20**
- Event-triggered re-captures (est. ~5/month): ~**$0.85/month**

### 12.6 Per-OEM Brand Identity Notes

These are initial observations to seed the Design Agent's first capture. The agent will extract precise values — these notes provide context and known brand elements.

#### Kia Australia
- **Brand colour:** Corporate red (`#BB162B`) + charcoal black
- **Typography:** Kia uses a custom "KiaSignature" font for headings, fallback to Helvetica/Arial
- **Design pattern:** Clean, high-contrast, lots of white space. Hero images are full-bleed with text overlay on dark gradient. Vehicle cards use hover-zoom effect.
- **Distinctive:** Kia's "Movement that inspires" tagline treatment, subtle red accent lines

#### Nissan Australia
- **Brand colour:** Nissan red (`#C3002F`) + black + white
- **Typography:** "NissanBrand" custom font, clean sans-serif
- **Design pattern:** Bold vehicle imagery, hero slides with dark overlay. Price display prominently after postcode entry. "INTELLIGENT MOBILITY" branded section headers.
- **Distinctive:** Angular design accents, strong CTAs ("VIEW OFFER"), postcode-gated content

#### Ford Australia
- **Brand colour:** Ford blue (`#003478`) + white
- **Typography:** "FordAntenna" custom font family
- **Design pattern:** Billboard-style hero, tabbed vehicle showcase below. Dark blue CTAs. "Built Ford Tough" treatment on ute/truck pages.
- **Distinctive:** Blue oval branding, "Important Info" asterisk disclaimer pattern, category-based navigation

#### Volkswagen Australia
- **Brand colour:** VW blue (`#001E50`) + white
- **Typography:** "VWHead" and "VWText" custom fonts (clean, modern sans-serif)
- **Design pattern:** Extremely minimal, lots of white space. SVG placeholder → lazy-load pattern. Flat design with subtle shadows on cards.
- **Distinctive:** Most design-forward site in the set. Logo-centric navigation. SPA-heavy with smooth transitions.

#### Mitsubishi Australia
- **Brand colour:** Mitsubishi red (`#ED0000`) + black + silver
- **Typography:** Custom "MMC" font for headings, system sans-serif body
- **Design pattern:** Bold hero with strong CTA. Diamond Advantage branding in green. Vehicle range as horizontal scrollable carousel.
- **Distinctive:** Three-diamond logo integration, "Diamond Advantage" service branding, private/business audience split

#### LDV Automotive Australia
- **Brand colour:** LDV blue (`#003DA5`) + white + orange accent
- **Typography:** System fonts (likely Open Sans / Roboto)
- **Design pattern:** Standard carousel hero, grid-based vehicle cards. Price guide page uses structured table layout.
- **Distinctive:** Strong commercial vehicle focus, dual passenger/commercial navigation, i-Motor CMS standard patterns

#### Isuzu UTE Australia
- **Brand colour:** Isuzu red (`#C00000`) + dark grey
- **Typography:** Custom "Isuzu" heading font, clean sans-serif body
- **Design pattern:** Deep page structure per model (overview → performance → design → tech → safety → towing → range → accessories). Hero with model showcase.
- **Distinctive:** Only 2 models — pages are very deep with extensive sub-navigation. Spec PDF downloads. "I-Venture Club" branding.

#### Mazda Australia
- **Brand colour:** Mazda deep red/maroon (`#910A2A`) + silver
- **Typography:** "MazdaType" custom font family
- **Design pattern:** Elegant, premium feel. Large hero imagery with model name overlay. 50/50 content blocks. Blurred placeholder images (CSS `blur=10&quality=0.1`).
- **Distinctive:** Premium positioning, category tabs (SUVs, Electric & Hybrids, Utes, Sports, Cars), Jinba Ittai philosophy references

#### KGM (SsangYong) Australia
- **Brand colour:** KGM teal/dark blue (`#00263A`) + orange accent (`#F26522`)
- **Typography:** System fonts (Next.js default stack)
- **Design pattern:** Modern Next.js site. Hero carousel with factory bonus text overlays. Extensive disclaimers inline with banners.
- **Distinctive:** Rebranded from SsangYong — transitional brand identity. Heavy use of "$X,000 Factory Bonus" in hero. 7-year warranty prominent.

#### GWM Australia
- **Brand colour:** GWM dark navy (`#1A1E2E`) + red accent (`#E41D1A`) + white
- **Typography:** Custom "GWMType" or system sans-serif
- **Design pattern:** Modern Next.js site with sub-brand sections. Category-based model grid (SUV, Ute, Hatchback). Storyblok CMS-driven content blocks.
- **Distinctive:** Multi-sub-brand architecture (Haval, Tank, Cannon, Ora, Wey) — each sub-brand has its own visual treatment within the parent GWM design system. Tank sub-brand is more rugged/premium.

#### Suzuki Australia
- **Brand colour:** Suzuki blue (`#003DA5`) + red accent + white
- **Typography:** System fonts (jQuery/Tailwind stack)
- **Design pattern:** Clean, functional. Vehicle cards with category tabs. Hero banner with model spotlight. Future vehicles section.
- **Distinctive:** Compact, efficient design reflecting brand identity. Jimny has cult following with distinct adventurous styling on its page. "/vehicles/future/" page is unique in the OEM set.

#### Hyundai Australia
- **Brand colour:** Hyundai dark blue (`#002C5F`) + light blue accent + white
- **Typography:** "HyundaiSans" custom font family
- **Design pattern:** AEM-powered, clean modern design. Category-filtered vehicle grid. N performance sub-brand uses red/black treatment. IONIQ sub-brand has distinct electric-blue styling.
- **Distinctive:** Three distinct design sub-systems: mainstream (dark blue), N performance (red/black/aggressive), IONIQ EV (electric blue/white/minimal). Price calculator SPA. Strong "i" naming convention (i20, i30).

#### Toyota Australia
- **Brand colour:** Toyota red (`#EB0A1E`) + black + white
- **Typography:** "ToyotaType" custom font family, clean and readable
- **Design pattern:** Sitecore + Next.js SSR. Large model range displayed as category sections. Hero carousel with offer CTAs. Flat URL structure (`/{model}`).
- **Distinctive:** Australia's #1 brand — design is pragmatic, information-dense. GR performance sub-brand uses black/red treatment. Hybrid badge system across most models. Pressroom at separate domain. Most vehicles now hybrid-only — expect "Hybrid" badging to be pervasive in the design.

### 12.7 Supabase DDL — Design Tables

```sql
-- ============================================
-- DESIGN AGENT TABLES
-- ============================================

CREATE TABLE brand_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  version INTEGER NOT NULL DEFAULT 1,
  tokens_json JSONB NOT NULL,
  source_pages_json JSONB DEFAULT '[]',
  screenshot_r2_keys_json JSONB DEFAULT '[]',
  content_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, version)
);
CREATE INDEX idx_brand_tokens_oem ON brand_tokens(oem_id);
CREATE INDEX idx_brand_tokens_active ON brand_tokens(oem_id) WHERE is_active = true;

CREATE TABLE page_layouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  page_type TEXT NOT NULL CHECK (page_type IN ('homepage', 'vehicle_detail', 'vehicle_range', 'offers', 'offer_detail', 'news', 'news_article')),
  source_url TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  layout_json JSONB NOT NULL,
  brand_tokens_id UUID REFERENCES brand_tokens(id),
  content_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(oem_id, page_type, source_url, version)
);
CREATE INDEX idx_page_layouts_oem ON page_layouts(oem_id);
CREATE INDEX idx_page_layouts_active ON page_layouts(oem_id, page_type) WHERE is_active = true;

CREATE TABLE design_captures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  oem_id TEXT NOT NULL REFERENCES oems(id),
  page_url TEXT NOT NULL,
  page_type TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('initial', 'visual_change', 'manual', 'quarterly_audit')),
  screenshot_desktop_r2_key TEXT,
  screenshot_mobile_r2_key TEXT,
  dom_snapshot_r2_key TEXT,
  computed_styles_r2_key TEXT,
  phash_desktop TEXT,
  phash_mobile TEXT,
  phash_distance_from_previous NUMERIC(5,2),
  kimi_request_tokens INTEGER,
  kimi_response_tokens INTEGER,
  kimi_cost_usd NUMERIC(8,4),
  brand_tokens_id UUID REFERENCES brand_tokens(id),
  page_layout_id UUID REFERENCES page_layouts(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_design_captures_oem ON design_captures(oem_id);
CREATE INDEX idx_design_captures_status ON design_captures(status);
CREATE INDEX idx_design_captures_trigger ON design_captures(oem_id, trigger_type);

-- RLS for design tables
ALTER TABLE brand_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE design_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY brand_tokens_member_read ON brand_tokens
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM oem_members m WHERE m.oem_id = brand_tokens.oem_id AND m.user_id = auth.uid())
  );
CREATE POLICY brand_tokens_service_write ON brand_tokens
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY page_layouts_member_read ON page_layouts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM oem_members m WHERE m.oem_id = page_layouts.oem_id AND m.user_id = auth.uid())
  );
CREATE POLICY page_layouts_service_write ON page_layouts
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY design_captures_member_read ON design_captures
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM oem_members m WHERE m.oem_id = design_captures.oem_id AND m.user_id = auth.uid())
  );
CREATE POLICY design_captures_service_write ON design_captures
  FOR ALL USING (auth.role() = 'service_role');
```

### 12.8 R2 Storage Key Convention — Design Assets

```
oem/{oem_id}/design_captures/{page_type}/{timestamp}/screenshot_desktop.png
oem/{oem_id}/design_captures/{page_type}/{timestamp}/screenshot_mobile.png
oem/{oem_id}/design_captures/{page_type}/{timestamp}/dom_snapshot.html
oem/{oem_id}/design_captures/{page_type}/{timestamp}/computed_styles.json
oem/{oem_id}/design_captures/{page_type}/{timestamp}/component_crops/{component_id}.png
oem/{oem_id}/brand_tokens/{version}/brand_tokens.json
oem/{oem_id}/page_layouts/{page_type}/{version}/layout.json
```

### 12.9 Design Agent Tool Definitions (Sales Rep Extension)

The Sales Rep agent gains these additional design-related tools:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `get_brand_tokens` | `oem_id` | Returns the active brand design tokens for the OEM |
| `get_page_layout` | `oem_id`, `page_type` | Returns the active page layout spec for a page type |
| `get_design_capture_history` | `oem_id`, `page_type`, `days` (default 90) | Returns design capture audit trail |
| `compare_brand_tokens` | `oem_id`, `version_a`, `version_b` | Returns diff between two brand token versions |
| `trigger_design_capture` | `oem_id`, `page_type` | Manually triggers a new design capture |
| `generate_dealer_template` | `oem_id`, `page_type`, `product_id` | Generates a populated HTML/React template using brand tokens + layout + live product data |

---

*End of document. This specification should be used alongside the PRD v1.1 to implement the multi-OEM AI monitoring agent and design capture pipeline.*
