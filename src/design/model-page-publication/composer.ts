import { load } from 'cheerio';

import {
  hydrateProductionInteractions,
  scopeCss,
  scopeProductionAssetHtml,
  stripProductionHeroHtml,
} from '../production-css-scope';

export type PublicationInteractionKind = 'none' | 'accordion' | 'tabs' | 'modal' | 'carousel' | 'slider';

export interface ComposedRegion {
  regionId: string;
  order: number;
  renderer: 'clone' | 'tailwind';
  interactionKind: PublicationInteractionKind;
  html: string;
  fallbackReason?: string;
}

export interface ComposedPublicationCandidate {
  body: string;
  referenceBody: string;
  regions: ComposedRegion[];
  warnings: string[];
  bytes: number;
  sha256: string;
  etag: string;
}

interface ProductionBodyDocumentOptions {
  candidate?: boolean;
  alpineRuntime?: string;
}

const DOCUMENT_STYLE = [
  'html,body{margin:0;padding:0;width:100%;overflow-x:hidden}',
  '[data-compid="story-section-comp"]{width:100%;max-width:none;margin-inline:0}',
  '[data-compid="story-section-comp"]>.full-viewport-height{height:clamp(420px,56.25vw,720px)!important;min-height:0!important}',
  '[data-oem-faq-answer="true"][hidden]{display:none!important}',
  '[data-oem-faq-answer="true"]:not([hidden]){display:block!important;height:auto!important;max-height:none!important;opacity:1!important;visibility:visible!important}',
  '.oem-faq-toggle-icon{align-items:center;border:1px solid #b8b8b8;display:inline-flex;flex:0 0 32px;height:32px;justify-content:center;width:32px}',
  '.oem-faq-toggle-icon:before{content:"+";font:400 24px/1 Arial,sans-serif}',
  '[data-oem-faq-trigger="true"][aria-expanded="true"]~.oem-faq-toggle-icon:before{content:"−"}',
].join('');

const PRODUCTION_INTERACTION_SCRIPT = `(()=>{const selector='[data-oem-faq-trigger="true"]';const toggle=(trigger)=>{const id=trigger.getAttribute('aria-controls');const answer=id?document.getElementById(id):null;if(!answer)return;const open=trigger.getAttribute('aria-expanded')!=='true';trigger.setAttribute('aria-expanded',String(open));answer.hidden=!open;answer.setAttribute('aria-hidden',String(!open));trigger.closest('.question-container')?.classList.toggle('oem-faq-open',open)};document.addEventListener('click',(event)=>{const target=event.target instanceof Element?event.target.closest(selector):null;if(target)toggle(target)});document.addEventListener('keydown',(event)=>{if(event.key!=='Enter'&&event.key!==' ')return;const target=event.target instanceof Element?event.target.closest(selector):null;if(!target)return;event.preventDefault();toggle(target)})})();`;

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cloneStylesheetLinks(page: Record<string, any>): string {
  const urls = page?.content?.modes?.clone?.stylesheet_urls;
  if (!Array.isArray(urls)) return '';
  return [...new Set(urls.filter((url): url is string => {
    if (typeof url !== 'string') return false;
    try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
  }))]
    .map(url => `<link rel="stylesheet" href="${escapeAttribute(url)}">`).join('');
}

function resizeScript(slugParts: { oemId: string; modelSlug: string }): string {
  const message = JSON.stringify({ type: 'oem-production-body-height', ...slugParts }).replace(/</g, '\\u003c');
  return `(()=>{const message=${message};let lastHeight=0;const report=()=>{const height=Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0);if(height===lastHeight)return;lastHeight=height;parent.postMessage({...message,height},'*')};addEventListener('load',report);if('ResizeObserver'in window)new ResizeObserver(report).observe(document.documentElement);setTimeout(report,0);setTimeout(report,500)})();`;
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function sha256Base64(value: string): Promise<string> {
  const bytes = await sha256Bytes(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Hex(value: string): Promise<string> {
  return Array.from(await sha256Bytes(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Shared body-document shell used by both the legacy clone route and publication composition. */
export async function productionBodyDocument(
  page: Record<string, any>,
  bodyHtml: string,
  slugParts: { oemId: string; modelSlug: string },
  options: ProductionBodyDocumentOptions = {},
): Promise<string> {
  const sourceUrl = page?.content?.modes?.clone?.source_url || page?.source_url;
  const baseTag = !options.candidate && typeof sourceUrl === 'string' && /^https?:\/\//i.test(sourceUrl)
    ? `<base href="${escapeAttribute(sourceUrl)}">` : '';
  const resize = resizeScript(slugParts);
  const scripts = [
    ...(options.candidate && options.alpineRuntime ? [{ attr: 'data-oem-alpine-runtime="true"', body: options.alpineRuntime.replace(/<\/script/gi, '<\\/script') }] : []),
    { attr: 'data-oem-embed-resize="true"', body: resize },
    { attr: 'data-oem-production-interactions="true"', body: PRODUCTION_INTERACTION_SCRIPT },
  ];
  const csp = options.candidate
    ? `default-src 'none'; img-src https: data:; media-src https: data: blob:; font-src https: data:; style-src 'unsafe-inline'; script-src ${(await Promise.all(scripts.map(script => sha256Base64(script.body)))).map(hash => `'sha256-${hash}'`).join(' ')}; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action https:`
    : '';

  return [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    options.candidate ? `<meta http-equiv="Content-Security-Policy" content="${csp}">` : `${baseTag}${cloneStylesheetLinks(page)}`,
    `<style>${DOCUMENT_STYLE}</style></head><body>${bodyHtml}`,
    ...scripts.map(script => `<script ${script.attr}>${script.body}</script>`),
    '</body></html>',
  ].join('');
}

function slugParts(pageId: string): { oemId: string; modelSlug: string } {
  const parts = pageId.split('-');
  return { oemId: parts.slice(0, 2).join('-'), modelSlug: parts.slice(2).join('-') || pageId };
}

function assetUrl(value: string, sourceUrl: string | undefined, origin: string): string {
  if (!value || /^(?:https?:|data:|blob:|#|mailto:|tel:|\/\/)/i.test(value)) return value;
  try { return new URL(value, value.startsWith('/media/') ? origin : sourceUrl || origin).href; } catch { return value; }
}

function absolutizeHtml(html: string, sourceUrl: string | undefined, origin: string): string {
  const $ = load(`<div data-absolute-root>${html}</div>`);
  const root = $('[data-absolute-root]').first();
  root.find('[src], [poster]').addBack('[src], [poster]').each((_i, element) => {
    for (const attr of ['src', 'poster']) {
      const value = $(element).attr(attr);
      if (value) $(element).attr(attr, assetUrl(value, sourceUrl, origin));
    }
  });
  root.find('[srcset]').addBack('[srcset]').each((_i, element) => {
    const value = $(element).attr('srcset');
    if (!value) return;
    $(element).attr('srcset', value.split(',').map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      return [assetUrl(parts.shift() || '', sourceUrl, origin), ...parts].join(' ');
    }).join(', '));
  });
  return root.html() || '';
}

function interactionKind(html: string, type?: unknown): PublicationInteractionKind {
  const match = html.match(/data-clone-interaction=["']([^"']+)/i)?.[1] || String(type || '');
  if (match === 'gallery-lightbox' || match === 'modal') return 'modal';
  return ['accordion', 'tabs', 'carousel', 'slider'].includes(match) ? match as PublicationInteractionKind : 'none';
}

function isPlatformRegion(value: Record<string, any>, html: string): boolean {
  const role = String(value.role || value.region_role || '').toLowerCase();
  const type = String(value.type || '').toLowerCase();
  return ['hero', 'variants', 'inventory'].includes(role)
    || ['hero', 'variants', 'inventory'].includes(type)
    || /data-oem-region-role=["'](?:hero|variants|inventory)["']/i.test(html);
}

function containsIndexedChild(html: string, id: string): boolean {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`data-oem-region-id\\s*=\\s*["']${escaped}["']`, 'i').test(html);
}

function cloneRegionIds(section: Record<string, any>): string[] {
  const values = Array.isArray(section._clone_region_ids)
    ? section._clone_region_ids
    : [section._clone_region_id];
  return values.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
}

function stripNissanCompatibilityHtml(pageId: string, html: string): string {
  return pageId.startsWith('nissan-au-') ? stripProductionHeroHtml(html).trim() : html;
}

function wrapRegion(region: Omit<ComposedRegion, 'html'>, html: string, css?: string): string {
  const selector = `[data-oem-region-id="${region.regionId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
  const scopedCss = css?.trim() ? scopeCss(css, selector).css : '';
  return `${scopedCss ? `<style data-oem-region-css="true">${scopedCss}</style>` : ''}<div data-oem-region-id="${escapeAttribute(region.regionId)}" data-oem-published-renderer="${region.renderer}" data-oem-interaction-kind="${region.interactionKind}">${html}</div>`;
}

export async function composePublicationCandidate(input: {
  pageId: string;
  page: Record<string, any>;
  origin: string;
}): Promise<ComposedPublicationCandidate> {
  const clone = input.page?.content?.modes?.clone || {};
  const sourceUrl = typeof clone.source_url === 'string' ? clone.source_url : input.page?.source_url;
  const indexedRegions = (Array.isArray(clone.section_index) ? clone.section_index : [])
    .filter((item: unknown): item is Record<string, any> => Boolean(item && typeof item === 'object' && typeof (item as any).id === 'string'))
    .sort((a: any, b: any) => Number(a.top || 0) - Number(b.top || 0));
  const leaves = indexedRegions.filter((candidate: Record<string, any>) => {
    const html = typeof candidate.html === 'string' ? candidate.html : '';
    return !indexedRegions.some((other: Record<string, any>) => other.id !== candidate.id && containsIndexedChild(html, other.id));
  });
  const sections = Array.isArray(input.page?.content?.modes?.sections?.items)
    ? input.page.content.modes.sections.items.filter((item: unknown) => item && typeof item === 'object') : [];
  const mapped = new Map<string, Record<string, any>>();
  for (const section of sections) {
    const ids = cloneRegionIds(section);
    if (typeof section._generated_html !== 'string' || !section._generated_html.trim()) continue;
    for (const id of ids) mapped.set(id, section);
  }

  const regions: ComposedRegion[] = [];
  const referenceParts: string[] = [];
  const emitted = new Set<Record<string, any>>();
  const warnings: string[] = [];
  for (const leaf of leaves) {
    let cloneHtml = typeof leaf.html === 'string' ? leaf.html.trim() : '';
    if (!cloneHtml) continue;
    if (isPlatformRegion(leaf, cloneHtml)) continue;
    cloneHtml = stripNissanCompatibilityHtml(input.pageId, cloneHtml);
    if (!cloneHtml) continue;
    const section = mapped.get(leaf.id);
    if (section) {
      if (emitted.has(section)) continue;
      emitted.add(section);
      const ids = cloneRegionIds(section);
      const id = ids.length > 1 ? String(section.id || ids.join('--')) : leaf.id;
      const generatedHtml = stripNissanCompatibilityHtml(input.pageId, section._generated_html);
      const html = absolutizeHtml(generatedHtml, sourceUrl, input.origin);
      if (!html.trim()) continue;
      if (isPlatformRegion(section, html)) continue;
      const base = { regionId: id, order: regions.length, renderer: 'tailwind' as const, interactionKind: interactionKind(html, section.type) };
      const wrapped = wrapRegion(base, html, section._generated_css || section._tailwind_leftover_css);
      regions.push({ ...base, html: wrapped });
      const originalHtml = stripNissanCompatibilityHtml(input.pageId, section._tailwind_original_html || cloneHtml);
      const original = absolutizeHtml(originalHtml, sourceUrl, input.origin);
      referenceParts.push(wrapRegion({ ...base, renderer: 'clone', interactionKind: interactionKind(original) }, original));
      continue;
    }
    cloneHtml = absolutizeHtml(hydrateProductionInteractions(cloneHtml), sourceUrl, input.origin);
    const base = { regionId: leaf.id, order: regions.length, renderer: 'clone' as const, interactionKind: interactionKind(cloneHtml, clone.interactions?.find((entry: any) => entry.id === leaf.id)?.type) };
    const wrapped = wrapRegion(base, cloneHtml);
    regions.push({ ...base, html: wrapped, fallbackReason: 'No converted structured section' });
    referenceParts.push(wrapped);
  }

  const manual = sections.filter((section: any) => cloneRegionIds(section).length === 0 && typeof section._generated_html === 'string')
    .sort((a: any, b: any) => Number(a.order || 0) - Number(b.order || 0));
  for (const section of manual) {
    const generatedHtml = stripNissanCompatibilityHtml(input.pageId, section._generated_html);
    const html = absolutizeHtml(generatedHtml, sourceUrl, input.origin);
    if (!html.trim() || isPlatformRegion(section, html)) continue;
    const base = { regionId: String(section.id || `manual-${regions.length + 1}`), order: regions.length, renderer: 'tailwind' as const, interactionKind: interactionKind(html, section.type) };
    const wrapped = wrapRegion(base, html, section._generated_css || section._tailwind_leftover_css);
    regions.push({ ...base, html: wrapped });
    referenceParts.push(wrapped);
  }
  if (!regions.length) throw new Error('Publication candidate body is empty');

  const links = cloneStylesheetLinks(input.page);
  regions.forEach((region, index) => { region.order = index; });
  const bodyAssets = await scopeProductionAssetHtml(`${links}${regions.map(region => region.html).join('')}`, { scopeSelector: '[data-oem-publication-body="true"]', baseUrl: sourceUrl || input.origin, mediaBaseUrl: input.origin, absolutizeInlineCss: true });
  const referenceAssets = await scopeProductionAssetHtml(`${links}${referenceParts.join('')}`, { scopeSelector: '[data-oem-publication-body="true"]', baseUrl: sourceUrl || input.origin, mediaBaseUrl: input.origin, absolutizeInlineCss: true });
  warnings.push(...bodyAssets.diagnostics.warnings, ...referenceAssets.diagnostics.warnings);
  const runtime = regions.some(region => region.interactionKind !== 'none') && typeof clone.runtime_js === 'string' ? clone.runtime_js : undefined;
  const parts = slugParts(input.pageId);
  const body = await productionBodyDocument(input.page, `<main data-oem-publication-body="true">${bodyAssets.html}</main>`, parts, { candidate: true, alpineRuntime: runtime });
  const referenceBody = await productionBodyDocument(input.page, `<main data-oem-publication-body="true">${referenceAssets.html}</main>`, parts, { candidate: true, alpineRuntime: runtime });
  const sha256 = await sha256Hex(body);
  return { body, referenceBody, regions, warnings, bytes: new TextEncoder().encode(body).byteLength, sha256, etag: `"sha256-${sha256}"` };
}
