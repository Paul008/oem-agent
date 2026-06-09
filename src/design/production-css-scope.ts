import { load } from 'cheerio';
import postcss from 'postcss';

export interface ScopeProductionCloneOptions {
  oemId: string;
  modelSlug: string;
  baseUrl?: string;
  fetchCss?: (url: string) => Promise<string | null>;
}

export interface ScopeProductionCloneDiagnostics {
  scopeSelector: string;
  styleTagsScoped: number;
  externalStylesheetsScoped: number;
  externalStylesheetsBlocked: number;
  rulesScoped: number;
  rulesSkipped: number;
}

export interface ScopeProductionCloneResult {
  html: string;
  diagnostics: ScopeProductionCloneDiagnostics;
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

export function scopeCss(css: string, scope: string): { css: string; rulesScoped: number; rulesSkipped: number } {
  const root = postcss.parse(css);
  let rulesScoped = 0;
  let rulesSkipped = 0;

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

  return { css: root.toString(), rulesScoped, rulesSkipped };
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

export async function scopeProductionCloneHtml(html: string, options: ScopeProductionCloneOptions): Promise<ScopeProductionCloneResult> {
  const scopeSelector = scopeSelectorFor(options);
  const $ = load(`<div data-oem-scope-root="true">${html}</div>`);
  let styleTagsScoped = 0;
  let externalStylesheetsScoped = 0;
  let externalStylesheetsBlocked = 0;
  let rulesScoped = 0;
  let rulesSkipped = 0;
  const fetchCss = options.fetchCss || defaultFetchCss;

  $('style').each((_index, element) => {
    const css = $(element).text();
    const scoped = scopeCss(css, scopeSelector);
    $(element).text(scoped.css);
    styleTagsScoped += 1;
    rulesScoped += scoped.rulesScoped;
    rulesSkipped += scoped.rulesSkipped;
  });

  const stylesheetLinks = $('link').toArray();
  for (const element of stylesheetLinks) {
    const href = stylesheetHref($, element, options.baseUrl);
    if (!href) continue;

    const css = await fetchCss(href);
    if (!css) {
      $(element)
        .removeAttr('rel')
        .removeAttr('href')
        .attr('data-oem-blocked-stylesheet-href', href);
      externalStylesheetsBlocked += 1;
      continue;
    }

    const scoped = scopeCss(css, scopeSelector);
    $(element).replaceWith(`<style data-oem-scoped-stylesheet-href="${htmlAttrEscape(href)}">${scoped.css}</style>`);
    externalStylesheetsScoped += 1;
    rulesScoped += scoped.rulesScoped;
    rulesSkipped += scoped.rulesSkipped;
  }

  const root = $('[data-oem-scope-root="true"]').first();
  root.removeAttr('data-oem-scope-root');
  root.attr('class', 'oem-production-scope');
  root.attr('data-oem-id', options.oemId);
  root.attr('data-model-slug', options.modelSlug);

  return {
    html: $.html(root),
    diagnostics: {
      scopeSelector,
      styleTagsScoped,
      externalStylesheetsScoped,
      externalStylesheetsBlocked,
      rulesScoped,
      rulesSkipped,
    },
  };
}
