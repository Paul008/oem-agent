/**
 * Ford Australia — canonical Build & Price URLs derived from Ford's own
 * nameplate menu JSON. Used by the three RSC populate scripts (pricing,
 * accessories, colour pricing) so we never hand-roll a slug → URL mapping.
 *
 * Ford's URLs don't transform cleanly from our internal slugs: internal
 * word dashes are collapsed (`/price/RangerHybrid`, not `/price/Ranger-Hybrid`)
 * while dashes in number/letter suffixes are kept (`F-150`, `Mach-E`). Some
 * nameplates share endpoints (Transit-Custom-Trail → `/TransitCustom`,
 * Ranger-Raptor → `/Ranger`). All of that is already declared in each menu
 * entry's `additionalCTA` field; we just derive the map once and expose
 * two helpers.
 *
 * Refresh the underlying menu JSON with `scripts/fetch-ford-json.ts`.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SiblingInfo = { urlName: string; siblings: string[] };

function loadUrlMap(): Map<string, SiblingInfo> {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'ford-vehiclesmenu.json');
  let raw: string;
  try { raw = readFileSync(path, 'utf8'); }
  catch { return new Map(); }
  const menu = JSON.parse(raw);

  const slugToUrl = new Map<string, string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node && typeof node === 'object') {
      const n = node as Record<string, unknown>;
      if (typeof n.name === 'string' && typeof n.additionalCTA === 'string') {
        const m = n.additionalCTA.match(/\/price\/([^/?#]+)/);
        if (m) {
          const slug = n.name.toLowerCase().replace(/\s+/g, '-');
          slugToUrl.set(slug, m[1]);
        }
      }
      for (const v of Object.values(n)) walk(v);
    }
  };
  walk(menu);

  // Group slugs that share the same URL — those are siblings.
  const urlToSlugs = new Map<string, string[]>();
  for (const [slug, url] of slugToUrl) {
    const arr = urlToSlugs.get(url) ?? [];
    arr.push(slug);
    urlToSlugs.set(url, arr);
  }

  const out = new Map<string, SiblingInfo>();
  for (const [slug, url] of slugToUrl) {
    const siblings = (urlToSlugs.get(url) ?? []).filter((s) => s !== slug);
    out.set(slug, { urlName: url, siblings });
  }
  return out;
}

const URL_MAP = loadUrlMap();

/**
 * Returns the `/price/<X>` path segment for a Ford nameplate slug. Falls
 * back to a title-cased transform for nameplates not in Ford's Build & Price
 * menu (E-Transit, Transit-Van, Transit-Bus — commercial vehicles with no
 * public pricing exposure).
 */
export function modelToUrlName(slug: string): string {
  const entry = URL_MAP.get(slug);
  if (entry) return entry.urlName;
  return slug.split('-').map((s) => s ? s[0].toUpperCase() + s.slice(1) : s).join('-');
}

/** Slugs that share the same /price endpoint as the given slug. */
export function siblingSlugsFor(slug: string): string[] {
  return URL_MAP.get(slug)?.siblings ?? [];
}
