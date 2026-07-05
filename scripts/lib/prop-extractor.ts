import { load, type CheerioAPI, type Cheerio } from 'cheerio';
import type { CatalogPreset, CatalogPropSchemaValue } from './catalog';

export type Extraction = {
  props: Record<string, unknown>;
  filledRatio: number;
  missing: string[];
};

const IDENTITY_KEYS = new Set(['variant', 'columns', 'formType']);

export function extractProps(
  sectionHtml: string,
  preset: CatalogPreset,
  sourceUrl: string,
): Extraction {
  const $ = load(sectionHtml);
  const schema = preset.propSchema;
  const props: Record<string, unknown> = {};

  const headingEl = $('h1, h2, h3').first();
  const heading = collapse(headingEl.text());

  for (const [key, value] of Object.entries(schema)) {
    if (IDENTITY_KEYS.has(key)) {
      if (key in preset.demoProps) props[key] = preset.demoProps[key];
      continue;
    }
    if (value.type === 'array') {
      props[key] = extractItems($, value.item, sourceUrl);
      continue;
    }
    switch (key) {
      case 'heading':
        if (heading) props[key] = heading;
        break;
      case 'eyebrow': {
        const eyebrow = extractEyebrow($, headingEl, heading);
        if (eyebrow) props[key] = eyebrow;
        break;
      }
      case 'body': {
        const body = extractBody($);
        if (body) props[key] = body;
        break;
      }
      case 'imageUrl': {
        const src = imageSource($('img').first());
        const absolute = absolutize(src, sourceUrl);
        if (absolute) props[key] = absolute;
        break;
      }
      case 'imageAlt': {
        const alt = collapse($('img').first().attr('alt') || '');
        if (alt) props[key] = alt;
        break;
      }
      case 'buttonLabel':
      case 'buttonHref': {
        const cta = extractCta($);
        if (key === 'buttonLabel' && cta.label) props[key] = cta.label;
        if (key === 'buttonHref') {
          const absolute = absolutize(cta.href, sourceUrl);
          if (absolute) props[key] = absolute;
        }
        break;
      }
      case 'address': {
        const address = collapse($('address').first().text());
        if (address) props[key] = address;
        break;
      }
      case 'mapHref': {
        const map = $('a[href]').toArray().map((el) => String($(el).attr('href') || ''))
          .find((href) => href.includes('google.com/maps') || href.startsWith('https://maps'));
        const absolute = absolutize(map || '', sourceUrl);
        if (absolute) props[key] = absolute;
        break;
      }
      default:
        break;
    }
  }

  const keys = Object.keys(schema);
  const missing = keys.filter((key) => !isFilled(props[key]));
  return {
    props,
    filledRatio: keys.length === 0 ? 1 : (keys.length - missing.length) / keys.length,
    missing,
  };
}

function extractEyebrow($: CheerioAPI, headingEl: Cheerio<any>, heading: string): string {
  if (headingEl.length === 0) return '';
  const headingNode = headingEl.get(0);
  let candidate = '';
  for (const el of $('*').toArray()) {
    if (el === headingNode) break;
    const own = collapse($(el).clone().children().remove().end().text());
    if (own.length >= 2 && own.length <= 60 && own !== heading) candidate = own;
  }
  return candidate;
}

function extractBody($: CheerioAPI): string {
  const paragraphs = $('p').toArray().map((el) => collapse($(el).text()));
  const substantive = paragraphs.find((text) => text.length >= 40);
  if (substantive) return substantive;
  const longest = [...paragraphs].sort((a, b) => b.length - a.length)[0] || '';
  return longest.length >= 20 ? longest : '';
}

function extractCta($: CheerioAPI): { label: string; href: string } {
  const preferred = $('a[href]').filter('[class*=btn], [class*=button], [class*=cta]').first();
  const anchor = preferred.length
    ? preferred
    : $('a[href]').filter((_, el) => {
        const text = collapse($(el).text());
        return text.length >= 2 && text.length <= 40;
      }).first();
  if (!anchor.length) return { label: '', href: '' };
  return { label: collapse(anchor.text()), href: String(anchor.attr('href') || '') };
}

function extractItems(
  $: CheerioAPI,
  itemSchema: Record<string, CatalogPropSchemaValue>,
  sourceUrl: string,
): Array<Record<string, unknown>> {
  const candidates: Array<{ element: any; cardLikeCount: number }> = [];
  for (const el of $('*').toArray()) {
    const children = $(el).children().toArray();
    if (children.length < 2) continue;
    const tagCounts = new Map<string, number>();
    for (const child of children) {
      const tag = child.tagName?.toLowerCase() || '';
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
    const [dominantTag, dominantCount] = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominantCount < 2) continue;
    const cardLike = children.filter((child) => {
      if ((child.tagName?.toLowerCase() || '') !== dominantTag) return false;
      const $child = $(child);
      return $child.find('img').length > 0 || $child.find('h3, h4, h5, h6').length > 0;
    });
    if (cardLike.length >= 2) {
      candidates.push({ element: el, cardLikeCount: cardLike.length });
    }
  }

  // Discard any candidate that is an ancestor of another candidate — the
  // leaf-most repeating structure is the real grid, not a page-level wrapper
  // that happens to contain other card-like sibling blocks (hero/cta/footer).
  const survivors = candidates.filter((candidate) => {
    return !candidates.some((other) => {
      if (other === candidate) return false;
      return $(other.element).parents().toArray().includes(candidate.element);
    });
  });

  let bestParent: Cheerio<any> | null = null;
  let bestCount = 0;
  for (const candidate of survivors) {
    if (candidate.cardLikeCount > bestCount) {
      bestCount = candidate.cardLikeCount;
      bestParent = $(candidate.element);
    }
  }
  if (!bestParent) return [];

  const items: Array<Record<string, unknown>> = [];
  for (const child of bestParent.children().toArray()) {
    const $child = $(child);
    const title = collapse($child.find('h1, h2, h3, h4, h5, h6, strong').first().text());
    if (!title) continue;
    const item: Record<string, unknown> = {};
    if ('title' in itemSchema) item.title = title;
    if ('body' in itemSchema) {
      const body = collapse($child.find('p').first().text());
      if (body) item.body = body;
    }
    if ('imageUrl' in itemSchema) {
      const src = absolutize(imageSource($child.find('img').first()), sourceUrl);
      if (src) item.imageUrl = src;
    }
    if ('imageAlt' in itemSchema) {
      const alt = collapse($child.find('img').first().attr('alt') || '');
      if (alt) item.imageAlt = alt;
    }
    const anchor = $child.find('a[href]').first();
    if (anchor.length) {
      if ('href' in itemSchema) {
        const href = absolutize(String(anchor.attr('href') || ''), sourceUrl);
        if (href) item.href = href;
      }
      if ('buttonLabel' in itemSchema) {
        const label = collapse(anchor.text());
        if (label) item.buttonLabel = label;
      }
    }
    items.push(item);
    if (items.length >= 12) break;
  }
  return items;
}

function imageSource(img: Cheerio<any>): string {
  if (!img.length) return '';
  const src = String(img.attr('src') || '');
  if (src && !src.startsWith('data:')) return src;
  const dataSrc = String(img.attr('data-src') || '');
  if (dataSrc) return dataSrc;
  const srcset = String(img.attr('srcset') || '');
  if (srcset) return srcset.split(',')[0].trim().split(/\s+/)[0];
  return '';
}

function absolutize(value: string, base: string): string {
  const trimmed = (value || '').trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('javascript:')) return '';
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return '';
  }
}

function collapse(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function isFilled(value: unknown): boolean {
  if (typeof value === 'string') return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

// --- AI-assisted extraction (behind --ai-extract) ---

export function buildAiExtractPrompt(sectionHtml: string, preset: CatalogPreset): string {
  const keys = Object.entries(preset.propSchema)
    .map(([key, value]) => `- ${key}: ${value.type === 'array' ? `array of {${Object.keys(value.item).join(', ')}}` : value.type}`)
    .join('\n');
  return [
    `Extract content values from this HTML section for the CMS preset "${preset.name}" (${preset.id}).`,
    'Return ONLY a JSON object with these keys (omit keys you cannot fill; never invent content):',
    keys,
    'Use the literal text and URLs from the HTML. HTML:',
    sectionHtml.slice(0, 60_000),
  ].join('\n\n');
}

export function parseAiExtractResponse(
  content: string,
  preset: CatalogPreset,
): Record<string, unknown> {
  const cleaned = content.replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const allowed = new Set(Object.keys(preset.propSchema));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => allowed.has(key)));
}

const AI_URL_KEYS = ['imageUrl', 'buttonHref', 'mapHref'] as const;
const AI_ITEM_URL_KEYS = ['imageUrl', 'href'] as const;

function absolutizeAiProps(props: Record<string, unknown>, sourceUrl: string): void {
  for (const key of AI_URL_KEYS) {
    const value = props[key];
    if (typeof value === 'string' && value) {
      props[key] = absolutize(value, sourceUrl);
    }
  }
  if (Array.isArray(props.items)) {
    for (const item of props.items) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      for (const key of AI_ITEM_URL_KEYS) {
        const value = record[key];
        if (typeof value === 'string' && value) {
          record[key] = absolutize(value, sourceUrl);
        }
      }
    }
  }
}

export async function aiExtractProps(opts: {
  sectionHtml: string;
  preset: CatalogPreset;
  sourceUrl: string;
  apiKey: string;
  apiBase?: string;
  model?: string;
  fetchImpl?: typeof fetch;
}): Promise<Extraction> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const response = await fetchImpl(`${opts.apiBase ?? 'https://api.together.xyz/v1'}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? 'moonshotai/Kimi-K2.5',
      messages: [{ role: 'user', content: buildAiExtractPrompt(opts.sectionHtml, opts.preset) }],
      temperature: 0.2,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }),
  });
  if (!response.ok) {
    throw new Error(`AI extract failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  }
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const props = parseAiExtractResponse(data.choices?.[0]?.message?.content || '{}', opts.preset);
  absolutizeAiProps(props, opts.sourceUrl);
  const keys = Object.keys(opts.preset.propSchema);
  const missing = keys.filter((key) => !isFilled(props[key]));
  return { props, filledRatio: keys.length ? (keys.length - missing.length) / keys.length : 1, missing };
}
