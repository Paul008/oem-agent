import { load } from 'cheerio';
import postcss from 'postcss';

export interface ScopedCssCache {
  get: (key: string) => Promise<string | null>;
  put: (key: string, css: string) => Promise<void>;
}

export interface ScopeProductionCloneOptions {
  oemId: string;
  modelSlug: string;
  baseUrl?: string;
  fetchCss?: (url: string) => Promise<string | null>;
  cssCache?: ScopedCssCache;
}

export interface ScopeProductionCloneDiagnostics {
  scopeSelector: string;
  styleTagsScoped: number;
  externalStylesheetsScoped: number;
  externalStylesheetsBlocked: number;
  rulesScoped: number;
  rulesSkipped: number;
  warnings: string[];
}

export interface ScopeProductionCloneResult {
  html: string;
  diagnostics: ScopeProductionCloneDiagnostics;
}

export interface ScopeProductionAssetOptions {
  scopeSelector: string;
  baseUrl?: string;
  mediaBaseUrl?: string;
  absolutizeInlineCss?: boolean;
  fetchCss?: (url: string) => Promise<string | null>;
  cssCache?: ScopedCssCache;
}

// Versioned OEM CDN stylesheets are immutable, so their scoped output is cacheable keyed by
// (scope selector, stylesheet URL, media base). Persisting each sheet as soon as it is scoped
// means a request that dies mid-build (Workers CPU/memory limits on multi-MB bundles) still
// makes progress — the next request skips every sheet already cached.
// Bump the version whenever scoping OUTPUT changes for the same input (e.g. new at-rule
// stripping) — cached entries are keyed on it, so stale transforms age out automatically.
const SCOPED_CSS_CACHE_VERSION = 'v2';

export function scopedCssCacheKey(scopeSelector: string, href: string, mediaBaseUrl?: string): string {
  return `${SCOPED_CSS_CACHE_VERSION}\n${scopeSelector}\n${href}\n${mediaBaseUrl || ''}`;
}

function attrEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function htmlAttrEscape(value: string): string {
  return attrEscape(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function scopeSelectorFor(options: ScopeProductionCloneOptions): string {
  return `.oem-production-scope[data-oem-id="${attrEscape(options.oemId)}"][data-model-slug="${attrEscape(options.modelSlug)}"]`;
}

function splitSelectorList(selector: string): string[] {
  const selectors: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: string | null = null;

  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    const previous = selector[i - 1];

    if (quote) {
      current += char;
      if (char === quote && previous !== '\\') quote = null;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') parenDepth += 1;
    if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (char === '[') bracketDepth += 1;
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      selectors.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) selectors.push(current.trim());
  return selectors;
}

function isGlobalSelector(selector: string): boolean {
  return /^(html|body|:root)(\b|$|[.#[:\s>+~])/.test(selector.trim());
}

function stripGlobalRoot(selector: string): string {
  return selector
    .trim()
    .replace(/^(html|body|:root)(\b|$)/, '')
    .trim();
}

function shouldSkipSelector(selector: string): boolean {
  const trimmed = selector.trim();
  return (
    !trimmed ||
    trimmed.startsWith('@') ||
    trimmed.includes(':host') ||
    trimmed.includes('::backdrop') ||
    trimmed.includes('.oem-production-scope')
  );
}

function scopeOneSelector(selector: string, scope: string): string {
  if (shouldSkipSelector(selector)) return selector;

  if (isGlobalSelector(selector)) {
    const remainder = stripGlobalRoot(selector);
    if (!remainder || remainder.startsWith(':') || remainder.startsWith('.') || remainder.startsWith('#') || remainder.startsWith('[')) {
      return `${scope}${remainder}`;
    }
    return `${scope} ${remainder}`;
  }

  if (selector.startsWith('>') || selector.startsWith('+') || selector.startsWith('~')) {
    return `${scope} ${selector}`;
  }

  return `${scope} ${selector}`;
}

// Captured production CSS (e.g. styled-components output) can contain orphan declaration
// tokens with no property/value pair, such as the literal `false;` seen in VW's captured
// stylesheets: `.eLFisM{padding-top:0;false;padding-bottom:var(--size-dynamic0270);}`.
// Browsers silently skip these per CSS error-recovery rules; postcss's strict parser does not.
// Strip any bare identifier sitting directly between a `;`/`{` boundary and the next `;` that
// contains no `:` — this can only be an orphan token, never a real declaration or selector.
const ORPHAN_DECLARATION_RE = /([;{])\s*[A-Za-z_$][\w$-]*\s*;/g;

// A `;` living inside a quoted string (`content: "Sale; ends;"`) or a `/* ... */` comment is
// literal text, not a declaration boundary — applying ORPHAN_DECLARATION_RE across it would
// corrupt real content. Tokenize-lite: walk the stylesheet, carve out string/comment spans and
// re-emit them verbatim, and only run the regex over the code spans between them.
export function sanitizeOrphanDeclarations(css: string): string {
  let out = '';
  let code = '';
  const flushCode = () => {
    out += code.replace(ORPHAN_DECLARATION_RE, '$1');
    code = '';
  };

  const n = css.length;
  let i = 0;
  while (i < n) {
    const char = css[i];

    // /* ... */ comment: copy through to the closing delimiter (or end of input).
    if (char === '/' && css[i + 1] === '*') {
      flushCode();
      const end = css.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += css.slice(i, stop);
      i = stop;
      continue;
    }

    // Quoted string: copy through to the matching unescaped quote (or end of input).
    if (char === '"' || char === "'") {
      flushCode();
      out += char;
      i += 1;
      while (i < n) {
        const c = css[i];
        if (c === '\\' && i + 1 < n) {
          out += c + css[i + 1];
          i += 2;
          continue;
        }
        out += c;
        i += 1;
        if (c === char) break;
      }
      continue;
    }

    code += char;
    i += 1;
  }

  flushCode();
  return out;
}

export function scopeCss(css: string, scope: string): { css: string; rulesScoped: number; rulesSkipped: number; warnings: string[] } {
  const sanitized = sanitizeOrphanDeclarations(css);

  let root;
  try {
    root = postcss.parse(sanitized);
  } catch (error) {
    // Catastrophically malformed CSS (unbalanced strings/braces, etc.) that survives
    // sanitization must never bubble up as a route 500 — degrade to passing the original
    // stylesheet through unscoped and record a diagnostics warning instead.
    const message = error instanceof Error ? error.message : String(error);
    return {
      css,
      rulesScoped: 0,
      rulesSkipped: 0,
      warnings: [`CSS parse failed; stylesheet passed through unscoped: ${message}`],
    };
  }

  let rulesScoped = 0;
  let rulesSkipped = 0;

  // At-rules that cannot be selector-scoped and are either meaningless inline (@charset, @use)
  // or would leak styling/requests outside the scope (@page, @import) are stripped entirely.
  const KEEP_AT_RULES = /^(?:(?:-\w+-)?keyframes|font-face|media|supports|container|layer)$/i;
  root.walkAtRules((rule) => {
    if (!KEEP_AT_RULES.test(rule.name)) {
      rule.remove();
      rulesSkipped += 1;
    }
  });

  root.walkRules((rule) => {
    try {
      const parent = rule.parent as { type?: string; name?: string } | undefined;
      if (parent?.type === 'atrule' && /keyframes$/i.test(parent.name || '')) {
        return;
      }

      const before = rule.selector;
      const scopedSelectors = splitSelectorList(before).map((selector) => scopeOneSelector(selector, scope));
      rule.selector = scopedSelectors.join(', ');
      if (rule.selector !== before) rulesScoped += 1;
    } catch {
      rulesSkipped += 1;
    }
  });

  return { css: root.toString(), rulesScoped, rulesSkipped, warnings: [] };
}

async function defaultFetchCss(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType && !/css|text\/plain/i.test(contentType)) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function stylesheetHref($: ReturnType<typeof load>, element: any, baseUrl?: string): string | null {
  const rel = ($(element).attr('rel') || '').toLowerCase();
  const href = $(element).attr('href') || '';
  if (!rel.split(/\s+/).includes('stylesheet')) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (!baseUrl) return null;
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function absolutizeCssAssetUrls(css: string, stylesheetUrl: string, mediaBaseUrl?: string): string {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (match, quote: string, rawUrl: string) => {
    const value = rawUrl.trim();
    if (!value || /^(?:data:|blob:|https?:|\/\/|#)/i.test(value)) {
      return match;
    }

    try {
      const absolute = new URL(value, value.startsWith('/media/') && mediaBaseUrl ? mediaBaseUrl : stylesheetUrl).href;
      const delimiter = quote || '"';
      return `url(${delimiter}${absolute}${delimiter})`;
    } catch {
      return match;
    }
  });
}

export function stripProductionHeroHtml(html: string): string {
  const $ = load(`<div data-oem-body-root="true">${html}</div>`);
  const root = $('[data-oem-body-root="true"]').first();

  root.find([
    '[data-compid="simple-hero-comp"]',
    '[data-compid="grade-walk-comp"]',
    // Region snapshots from the capture annotator carry Nissan's data-id component markers
    // but not data-compid, so the same platform components must match by data-id as well.
    '[data-id*="cmp_simplehero"]',
    '[data-id*="cmp_versiongrid"]',
    '[data-oem-section-type="hero"]',
    '[data-section-type="hero"]',
  ].join(',')).remove();

  return root.html() || '';
}

interface CapturedFaqItem {
  faqAnswer?: unknown;
}

/**
 * Restores data that Nissan's client-side FAQ component normally hydrates at
 * runtime. The body-only artifact intentionally does not load the OEM app, so
 * captured answer nodes would otherwise remain empty and non-interactive.
 */
export function hydrateProductionInteractions(html: string): string {
  const $ = load(`<div data-oem-interaction-root="true">${html}</div>`);
  const documentRoot = $('[data-oem-interaction-root="true"]').first();

  documentRoot.find('[data-compid="faq-level1-comp"]').each((faqIndex, faqElement) => {
    let items: CapturedFaqItem[] = [];
    try {
      const props = JSON.parse($(faqElement).attr('data-compprops') || '{}') as { faqItems?: unknown };
      if (Array.isArray(props.faqItems)) {
        items = props.faqItems as CapturedFaqItem[];
      }
    } catch {
      return;
    }

    $(faqElement).find('[data-id="question-container"], .question-container').each((itemIndex, containerElement) => {
      const container = $(containerElement);
      const trigger = container.find('[role="button"]').first();
      const capturedAnswer = container.find('.answer').first();
      if (!trigger.length || !capturedAnswer.length) return;

      const answerId = `oem-faq-answer-${faqIndex}-${itemIndex}`;
      const item = items[itemIndex];
      const answerHtml = typeof item?.faqAnswer === 'string' ? item.faqAnswer : capturedAnswer.html() || '';
      const answer = $('<div></div>')
        .attr(capturedAnswer.attr() || {})
        .attr('id', answerId)
        .attr('data-oem-faq-answer', 'true')
        .attr('aria-hidden', 'true')
        .attr('hidden', '')
        .html(answerHtml);

      capturedAnswer.replaceWith(answer);
      trigger
        .attr('data-oem-faq-trigger', 'true')
        .attr('aria-expanded', 'false')
        .attr('aria-controls', answerId);

      const emptyIcon = container.find('.question img[src=""]').first();
      if (emptyIcon.length) {
        emptyIcon.replaceWith('<span class="oem-faq-toggle-icon" aria-hidden="true"></span>');
      }
    });
  });

  return documentRoot.html() || '';
}

export async function scopeProductionAssetHtml(html: string, options: ScopeProductionAssetOptions): Promise<ScopeProductionCloneResult> {
  const scopeSelector = options.scopeSelector;
  const $ = load(`<div data-oem-scope-root="true">${html}</div>`);
  let styleTagsScoped = 0;
  let externalStylesheetsScoped = 0;
  let externalStylesheetsBlocked = 0;
  let rulesScoped = 0;
  let rulesSkipped = 0;
  const warnings: string[] = [];
  const fetchCss = options.fetchCss || defaultFetchCss;

  $('style').each((_index, element) => {
    const rawCss = $(element).text();
    const css = options.absolutizeInlineCss && options.baseUrl
      ? absolutizeCssAssetUrls(rawCss, options.baseUrl, options.mediaBaseUrl)
      : rawCss;
    const scoped = scopeCss(css, scopeSelector);
    $(element).text(scoped.css);
    styleTagsScoped += 1;
    rulesScoped += scoped.rulesScoped;
    rulesSkipped += scoped.rulesSkipped;
    warnings.push(...scoped.warnings);
  });

  // Scoped stylesheets can total many MB (Nissan's CDN bundles are ~5MB). Splicing that text
  // into the cheerio DOM and re-serializing it explodes CPU/memory on Workers, so links are
  // replaced with comment tokens and the CSS is string-spliced into the serialized output.
  const inlinedStylesheets: string[] = [];
  const slotToken = (index: number) => `<!--oem-scoped-css-slot:${index}-->`;
  const stylesheetLinks = $('link').toArray();
  for (const element of stylesheetLinks) {
    const href = stylesheetHref($, element, options.baseUrl);
    if (!href) continue;

    const cacheKey = scopedCssCacheKey(scopeSelector, href, options.mediaBaseUrl);
    const cachedCss = options.cssCache ? await options.cssCache.get(cacheKey).catch(() => null) : null;
    if (cachedCss !== null) {
      const slot = inlinedStylesheets.push(`<style data-oem-scoped-stylesheet-href="${htmlAttrEscape(href)}">${cachedCss}</style>`) - 1;
      $(element).replaceWith(slotToken(slot));
      externalStylesheetsScoped += 1;
      continue;
    }

    const css = await fetchCss(href);
    if (!css) {
      $(element)
        .removeAttr('rel')
        .removeAttr('href')
        .attr('data-oem-blocked-stylesheet-href', href);
      externalStylesheetsBlocked += 1;
      continue;
    }

    const scoped = scopeCss(absolutizeCssAssetUrls(css, href, options.mediaBaseUrl), scopeSelector);
    if (options.cssCache && scoped.warnings.length === 0) {
      // Awaited (not fire-and-forget) so progress survives a request that later exceeds limits.
      await options.cssCache.put(cacheKey, scoped.css).catch(() => {});
    }
    const slot = inlinedStylesheets.push(`<style data-oem-scoped-stylesheet-href="${htmlAttrEscape(href)}">${scoped.css}</style>`) - 1;
    $(element).replaceWith(slotToken(slot));
    externalStylesheetsScoped += 1;
    rulesScoped += scoped.rulesScoped;
    rulesSkipped += scoped.rulesSkipped;
    warnings.push(...scoped.warnings);
  }

  const root = $('[data-oem-scope-root="true"]').first();
  let serialized = root.html() || '';
  for (let index = 0; index < inlinedStylesheets.length; index++) {
    serialized = serialized.replace(slotToken(index), () => inlinedStylesheets[index]);
  }
  return {
    html: serialized,
    diagnostics: {
      scopeSelector,
      styleTagsScoped,
      externalStylesheetsScoped,
      externalStylesheetsBlocked,
      rulesScoped,
      rulesSkipped,
      warnings,
    },
  };
}

export async function scopeProductionCloneHtml(html: string, options: ScopeProductionCloneOptions): Promise<ScopeProductionCloneResult> {
  const scopeSelector = scopeSelectorFor(options);
  const scoped = await scopeProductionAssetHtml(html, {
    scopeSelector,
    baseUrl: options.baseUrl,
    fetchCss: options.fetchCss,
    cssCache: options.cssCache,
  });
  // String-wrap instead of re-parsing: the scoped HTML can be many MB once stylesheets are
  // inlined, and a second cheerio parse of it exceeds Workers resource limits.
  const wrapped = `<div class="oem-production-scope" data-oem-id="${htmlAttrEscape(options.oemId)}" data-model-slug="${htmlAttrEscape(options.modelSlug)}">${scoped.html}</div>`;

  return { html: wrapped, diagnostics: scoped.diagnostics };
}
