# Mitsubishi GraphQL API Documentation Cleanup

## Context

The legacy Mornington Mitsubishi app uses Mitsubishi Australia's Magento GraphQL endpoint for newer model and offer data, while older services still call legacy WordPress/CDN endpoints. OEM Agent already has the stronger implementation in `src/sync/mitsubishi-sync.ts`: it imports Mitsubishi variants, colours, interiors, state pricing, offers, accessories, brochure URLs, and discovered API records into Supabase.

The dashboard currently shows discovered APIs mainly by URL and data type. Multiple Mitsubishi operations share the same `/graphql` endpoint, so rows can look blank or ambiguous even when `schema_json` contains useful details.

## Design

Use OEM Agent's Mitsubishi GraphQL sync as the canonical source. The sync should seed discovered API rows with explicit operation labels, operation names, capabilities, field-to-table mappings, and sample request notes.

The API docs stored in `oems.config_json.api_docs` should describe the actual worker pipeline:

1. GraphQL source calls fetch products, configurable options, offers, pricing, and compatible accessory SKUs.
2. The sync normalizes that source into `vehicle_models`, `products`, `variant_colors`, `variant_interiors`, `variant_pricing`, `offers`, `offer_products`, `accessories`, and `accessory_models`.
3. Brochure URLs remain on `vehicle_models.brochure_url`, where the PDF embedding/spec extraction flow can consume them.
4. Dealer-facing `/api/wp/v2/*` endpoints remain downstream projections from Supabase, not the upstream Mitsubishi source API.

The dashboard discovered API table should render a readable operation label and note from `schema_json`, falling back to the URL when no label exists. This fixes the user-facing ambiguity without changing the database schema.

## Scope

In scope:
- Canonical Mitsubishi discovered API rows seeded by the worker sync.
- Matching standalone Mitsubishi API seed script docs.
- Dashboard display of operation label and source note.

Out of scope:
- Changing dealer API response contracts.
- Rebuilding the PDF extraction pipeline.
- Removing historical rows automatically; stale rows can be overwritten when they share the same `(oem_id, url)` key.

## Testing

Run focused TypeScript/build checks for the worker/dashboard surfaces touched. If full dashboard build is too expensive locally, run typecheck and inspect the changed Vue component for template type issues.
