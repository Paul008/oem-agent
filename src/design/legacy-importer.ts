/**
 * Legacy Page Importer — Converts UIkit-based vehicle page JSON into page builder sections.
 *
 * Legacy format (WordPress + UIkit):
 *   - header.slides[] → hero section
 *   - content.rendered → UIkit HTML blob parsed into sections
 *
 * Output: VehicleModelPage-compatible object with content.sections[]
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { OemId } from '../oem/types';

// ============================================================================
// Types
// ============================================================================

export interface LegacyVehicleJson {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  metatitle?: { rendered: string };
  header: {
    slides: Array<{
      desktop: string;
      mobile: string;
      video: boolean | string;
      heading: string;
      sub_heading: string;
      button: string;
      link: string;
      bottom_strip?: Array<{ heading: string; sub_heading: string }>;
    }>;
  };
  model: string;
  segment_slug: string;
  oem_slug: string;
  variant_link: string;
  form: string;
  formbg: string;
  content: { rendered: string };
}

export interface ImportedSection {
  type: string;
  id: string;
  order: number;
  [key: string]: any;
}

export interface LegacyImportResult {
  success: boolean;
  slug: string;
  name: string;
  header: {
    slides: Array<{
      heading: string;
      sub_heading: string;
      button: string;
      desktop: string;
      mobile: string;
      bottom_strip: Array<{ heading: string; sub_heading: string }>;
    }>;
  };
  sections: ImportedSection[];
  variant_link: string;
  warnings: string[];
}

// ============================================================================
// Helpers
// ============================================================================

let sectionCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++sectionCounter}`;
}

function cleanText(html: string): string {
  // Strip tags, decode entities, collapse whitespace
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#8220;/g, '\u201C')
    .replace(/&#8221;/g, '\u201D')
    .replace(/&#8212;/g, '\u2014')
    .replace(/&#038;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidImageUrl(url: string): boolean {
  if (!url || url.length < 10) return false;
  // Reject broken UIkit data-src placeholders (just query strings, no path)
  if (url.startsWith('?')) return false;
  // Must look like a URL
  return url.startsWith('http') || url.startsWith('/');
}

function extractImageUrl($el: cheerio.Cheerio<Element>): string {
  // UIkit uses data-src for lazy loading, fall back to src
  const url = $el.attr('data-src') || $el.attr('src') || '';
  return isValidImageUrl(url) ? url : '';
}

function sanitizeHtml(html: string): string {
  // Strip UIkit classes and attributes, keep semantic content
  return html
    .replace(/\s*class="[^"]*"/g, '')
    .replace(/\s*uk-[a-z-]+(?:="[^"]*")?/g, '')
    .replace(/\s*data-src="[^"]*"/g, '')
    .replace(/\s*tabindex="[^"]*"/g, '')
    .replace(/\s*style="[^"]*"/g, '')
    .replace(/\s*loading="[^"]*"/g, '')
    .replace(/\s*decoding="[^"]*"/g, '')
    .replace(/\s*srcset="[^"]*"/g, '')
    .replace(/\s*sizes="[^"]*"/g, '')
    .replace(/<div[^>]*>\s*<\/div>/g, '')
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

// ============================================================================
// Block Detection — Identify UIkit patterns in top-level elements
// ============================================================================

interface ParsedBlock {
  type: 'image' | 'heading' | 'content' | 'slider' | 'cards' | 'image-grid' | 'image-overlay' | 'video' | 'unknown';
  data: Record<string, any>;
}

function detectBlock($: cheerio.CheerioAPI, el: Element): ParsedBlock {
  const $el = $(el);
  const html = $.html(el);

  // 1. UIkit slider → feature-cards carousel
  if (html.includes('uk-slider') || $el.find('[uk-slider]').length > 0) {
    const cards: Array<{ title: string; description: string; image_url: string; video_url?: string }> = [];
    $el.find('li').each((_, li) => {
      const $li = $(li);
      const title = cleanText($li.find('p').first().html() || '');
      const img = extractImageUrl($li.find('img').first());
      const video = $li.find('video source').attr('src') || '';
      cards.push({
        title,
        description: '',
        image_url: img,
        ...(video ? { video_url: video } : {}),
      });
    });
    return { type: 'slider', data: { cards } };
  }

  // 2. Card grid — uk-card uk-card-default
  if ($el.find('.uk-card.uk-card-default').length >= 2) {
    const cards: Array<{ title: string; body: string; cta_text?: string; cta_url?: string }> = [];
    $el.find('.uk-card.uk-card-default').each((_, card) => {
      const $card = $(card);
      const title = cleanText($card.find('.uk-card-title').html() || '');
      // Get body text: everything after the title, excluding links
      const bodyParts: string[] = [];
      $card.find('p').each((_, p) => {
        const $p = $(p);
        if (!$p.hasClass('uk-margin-remove-bottom') && !$p.find('.uk-card-title').length) {
          const text = cleanText($p.html() || '');
          if (text) bodyParts.push(text);
        }
      });
      const ctaLink = $card.find('a.uk-button').first();
      cards.push({
        title,
        body: bodyParts.join(' '),
        ...(ctaLink.length ? {
          cta_text: cleanText(ctaLink.html() || ''),
          cta_url: ctaLink.attr('href') || '',
        } : {}),
      });
    });
    return { type: 'cards', data: { cards } };
  }

  // 3. Image grid — multiple uk-width-1-3 or uk-width-1-2 columns with overlay text
  //    Common in Tank/Cannon pages: 3-6 image cells each with title + subtitle overlay
  const gridCells = $el.find('[class*="uk-width-1-3"], [class*="uk-width-1-2@m"]').toArray();
  const overlayedCells = gridCells.filter(cell => {
    const $cell = $(cell);
    return $cell.find('img').length > 0 && ($cell.find('.hero-txt, .el-overlay, [class*="uk-position"]').length > 0);
  });
  if (overlayedCells.length >= 2) {
    const cards: Array<{ title: string; description: string; image_url: string }> = [];
    for (const cell of overlayedCells) {
      const $cell = $(cell);
      const title = cleanText($cell.find('.hero-txt, .uk-h3, .uk-h2, h3, h2').first().html() || '');
      const desc = cleanText($cell.find('.uk-margin-remove-adjacent, .el-overlay div:not(.hero-txt)').last().text() || '');
      const img = $cell.find('img').first();
      const imgUrl = extractImageUrl(img) || img.attr('src') || '';
      if (title || imgUrl) {
        cards.push({ title, description: desc, image_url: isValidImageUrl(imgUrl) ? imgUrl : '' });
      }
    }
    if (cards.length >= 2) {
      return { type: 'image-grid', data: { cards } };
    }
  }

  // 4. Single image with text overlay (uk-position-center, uk-position-left, etc.)
  const hasOverlay = $el.find('[class*="uk-position-center"], [class*="uk-position-left"], [class*="uk-position-right"]').length > 0;
  const hasImg = $el.find('img').length > 0;
  if (hasOverlay && hasImg) {
    const overlayEl = $el.find('[class*="uk-position-center"], [class*="uk-position-left"], [class*="uk-position-right"]').first();
    const heading = cleanText(overlayEl.find('.uk-h1, h1, .hero-txt').first().html() || '');
    const img = $el.find('img').first();
    return {
      type: 'image-overlay',
      data: {
        heading,
        desktop_image_url: extractImageUrl(img) || img.attr('src') || '',
      },
    };
  }

  // 4. Standalone heading (h1 with uk-h1 class, no sibling content)
  const h1 = $el.find('h1.uk-h1, h1.uk-text-light').first();
  if (h1.length && !$el.find('h3, p').length) {
    return {
      type: 'heading',
      data: { heading: cleanText(h1.html() || '') },
    };
  }

  // 5. Full-width image (grid with just an img, no text)
  const imgs = $el.find('img');
  const textContent = cleanText($el.text());
  if (imgs.length === 1 && textContent.length < 20 && !$el.find('h1, h2, h3, p').filter((_, el) => cleanText($(el).text()).length > 10).length) {
    return {
      type: 'image',
      data: { desktop_image_url: extractImageUrl(imgs.first()) },
    };
  }

  // 6. Content block — has headings and/or paragraphs
  const headings: string[] = [];
  const bodies: string[] = [];
  $el.find('h1, h2').each((_, h) => {
    const text = cleanText($(h).html() || '');
    if (text) headings.push(text);
  });
  $el.find('h3, p').each((_, p) => {
    const text = cleanText($(p).html() || '');
    if (text && text.length > 10) bodies.push(text);
  });
  const contentImg = imgs.length ? extractImageUrl(imgs.first()) : '';

  if (headings.length || bodies.length > 0) {
    return {
      type: 'content',
      data: {
        title: headings[0] || '',
        body_parts: bodies,
        image_url: contentImg,
        has_multiple_headings: headings.length > 1,
        all_headings: headings,
      },
    };
  }

  // 7. Standalone video
  const video = $el.find('video source').first();
  if (video.length) {
    return {
      type: 'video',
      data: { video_url: video.attr('src') || '' },
    };
  }

  return { type: 'unknown', data: { html: $.html(el).slice(0, 500) } };
}

// ============================================================================
// Section Builders — Convert parsed blocks into page builder sections
// ============================================================================

function buildHeroSection(slide: LegacyVehicleJson['header']['slides'][0], order: number): ImportedSection {
  return {
    type: 'hero',
    id: nextId('hero'),
    order,
    heading: slide.heading || '',
    sub_heading: slide.sub_heading || '',
    cta_text: slide.button || '',
    cta_url: slide.link || '',
    desktop_image_url: slide.desktop || '',
    mobile_image_url: slide.mobile || slide.desktop || '',
    heading_size: '3xl',
    heading_weight: 'bold',
    sub_heading_size: 'lg',
    sub_heading_weight: 'normal',
    text_color: '#ffffff',
    text_align: 'left',
    overlay_position: 'bottom-left',
    show_overlay: true,
    full_width_image: false,
    animation: 'none',
  };
}

function buildImageSection(imageUrl: string, order: number): ImportedSection {
  return {
    type: 'image',
    id: nextId('img'),
    order,
    desktop_image_url: imageUrl,
    mobile_image_url: imageUrl,
    alt: '',
    caption: '',
    layout: 'full-width',
    aspect_ratio: 'auto',
    rounded: false,
    shadow: false,
  };
}

function buildHeadingSection(heading: string, order: number): ImportedSection {
  return {
    type: 'heading',
    id: nextId('hdg'),
    order,
    heading,
    heading_tag: 'h2',
    heading_size: '3xl',
    heading_weight: 'bold',
    sub_heading: '',
    sub_heading_size: 'lg',
    sub_heading_weight: 'normal',
    text_align: 'left',
    text_color: '',
    line_gap: '8',
    background_color: '',
    animation: 'fade-up',
  };
}

function buildContentBlockSection(title: string, bodyHtml: string, imageUrl: string, order: number): ImportedSection {
  return {
    type: 'content-block',
    id: nextId('cb'),
    order,
    title,
    content_html: bodyHtml,
    layout: imageUrl ? 'two-column' : 'contained',
    background: '',
    image_url: imageUrl,
    animation: 'fade-up',
  };
}

function buildSplitContentSection(title: string, bodyHtml: string, imageUrl: string, order: number): ImportedSection {
  return {
    type: 'split-content',
    id: nextId('sc'),
    order,
    title,
    body_html: bodyHtml,
    image_url: imageUrl,
    image_position: 'right',
    layout: 'contained',
    background: '',
  };
}

function buildFeatureCardsSection(
  title: string,
  cards: Array<{ title: string; description: string; image_url: string; video_url?: string }>,
  order: number,
): ImportedSection {
  return {
    type: 'feature-cards',
    id: nextId('fc'),
    order,
    title,
    cards,
    columns: Math.min(cards.length, 3),
    animation: 'stagger-children',
  };
}

function buildCardGridSection(
  cards: Array<{ title: string; body: string; image_url?: string; cta_text?: string; cta_url?: string }>,
  order: number,
): ImportedSection {
  const hasCta = cards.some(c => c.cta_text);
  return {
    type: 'card-grid',
    id: nextId('cg'),
    order,
    title: '',
    columns: Math.min(cards.length, 3),
    cards: cards.map(c => ({
      title: c.title,
      body: c.body,
      image_url: c.image_url || '',
      ...(c.cta_text ? { cta_text: c.cta_text, cta_url: c.cta_url } : {}),
    })),
    card_composition: hasCta ? ['title', 'body', 'cta'] : ['title', 'body'],
    card_style: {
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      border_radius: 8,
      shadow: false,
      text_align: 'left',
      padding: '24',
    },
    section_style: { background: '', padding: '' },
  };
}

function buildImageGridSection(
  cards: Array<{ title: string; description: string; image_url: string }>,
  order: number,
): ImportedSection {
  return {
    type: 'feature-cards',
    id: nextId('fg'),
    order,
    title: '',
    cards,
    columns: Math.min(cards.length, 3),
    animation: 'stagger-children',
  };
}

function buildImageOverlaySection(heading: string, imageUrl: string, order: number): ImportedSection {
  return {
    type: 'image-showcase',
    id: nextId('iso'),
    order,
    title: '',
    images: [{
      url: imageUrl,
      alt: heading,
      caption: '',
      description: '',
      overlay_position: 'center',
    }],
    layout: 'stacked',
    height: 'large',
    overlay_style: 'dark',
  };
}

function buildVideoSection(videoUrl: string, title: string, order: number): ImportedSection {
  return {
    type: 'video',
    id: nextId('vid'),
    order,
    title,
    video_url: videoUrl,
    poster_url: '',
    autoplay: false,
    layout: 'contained',
    animation: 'fade-in',
  };
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse legacy UIkit vehicle JSON into page builder sections.
 *
 * Accepts a single legacy vehicle object (or array with one element).
 * Returns sections ready to be saved to R2 via the update-sections endpoint.
 */
export function parseLegacyVehicleJson(input: LegacyVehicleJson | LegacyVehicleJson[]): LegacyImportResult {
  sectionCounter = 0;
  const legacy = Array.isArray(input) ? input[0] : input;
  const warnings: string[] = [];
  const sections: ImportedSection[] = [];
  let order = 0;

  // --- Header → Hero section ---
  if (legacy.header?.slides?.length) {
    const slide = legacy.header.slides[0];
    sections.push(buildHeroSection(slide, order++));
  } else {
    warnings.push('No header slides found — skipping hero section');
  }

  // Collect hero image URLs so we can skip duplicates in body content
  const heroImageUrls = new Set(
    legacy.header?.slides?.flatMap(s => [s.desktop, s.mobile].filter(Boolean)) || [],
  );

  // --- Parse content.rendered HTML ---
  const html = legacy.content?.rendered;
  if (!html) {
    warnings.push('No content.rendered HTML found');
    return buildResult(legacy, sections, warnings);
  }

  // Wrap in a root element so cheerio can iterate top-level children
  const $ = cheerio.load(`<root>${html}</root>`, { xmlMode: false });
  const topLevelElements = $('root').children().toArray();

  // Sometimes UIkit nests the content inside empty wrapper divs.
  // Walk top-level elements, detect block types, and merge adjacent related blocks.

  let pendingHeading: string | null = null;

  for (const el of topLevelElements) {
    const block = detectBlock($, el);

    switch (block.type) {
      case 'heading': {
        // Buffer heading — it likely titles the next section
        pendingHeading = block.data.heading;
        break;
      }

      case 'image': {
        const url = block.data.desktop_image_url;
        if (!isValidImageUrl(url)) {
          warnings.push(`Skipped image with broken/empty URL: ${url}`);
        } else if (heroImageUrls.has(url)) {
          // Skip images that duplicate the hero slide
          warnings.push(`Skipped duplicate hero image: ${url.slice(-50)}`);
        } else {
          sections.push(buildImageSection(url, order++));
        }
        // Don't consume pending heading for standalone images
        break;
      }

      case 'content': {
        const { title, body_parts, image_url, all_headings } = block.data;
        const heading = pendingHeading || title || '';
        pendingHeading = null;

        // Build HTML body from paragraphs
        const bodyHtml = body_parts
          .map((p: string) => `<p>${p}</p>`)
          .join('\n');

        if (image_url && image_url.length > 10 && !image_url.includes('?width=420')) {
          // Content + image → split-content
          sections.push(buildSplitContentSection(heading, bodyHtml, image_url, order++));
        } else if (bodyHtml.length > 20) {
          // If there are multiple headings, create a richer content block
          if (all_headings?.length > 1) {
            // Build content with inline headings
            const richHtml = all_headings.slice(1).reduce((acc: string, h: string, i: number) => {
              const body = body_parts[i + 1] ? `<p>${body_parts[i + 1]}</p>` : '';
              return `${acc}\n<h3>${h}</h3>\n${body}`;
            }, bodyHtml);
            sections.push(buildContentBlockSection(heading, richHtml, '', order++));
          } else {
            sections.push(buildContentBlockSection(heading, bodyHtml, '', order++));
          }
        }
        break;
      }

      case 'slider': {
        const heading = pendingHeading || '';
        pendingHeading = null;
        const cards = block.data.cards.filter((c: any) => c.title || c.video_url);
        if (cards.length) {
          sections.push(buildFeatureCardsSection(heading, cards, order++));
        }
        break;
      }

      case 'cards': {
        pendingHeading = null;
        const cards = block.data.cards.filter((c: any) => c.title);
        if (cards.length) {
          sections.push(buildCardGridSection(cards, order++));
        }
        break;
      }

      case 'image-grid': {
        pendingHeading = null;
        const gridCards = block.data.cards.filter((c: any) => c.title || c.image_url);
        if (gridCards.length) {
          sections.push(buildImageGridSection(gridCards, order++));
        }
        break;
      }

      case 'image-overlay': {
        pendingHeading = null;
        sections.push(buildImageOverlaySection(
          block.data.heading,
          block.data.desktop_image_url,
          order++,
        ));
        break;
      }

      case 'video': {
        const heading = pendingHeading || '';
        pendingHeading = null;
        sections.push(buildVideoSection(block.data.video_url, heading, order++));
        break;
      }

      case 'unknown': {
        // Emit the buffered heading as its own section if followed by unknown
        if (pendingHeading) {
          sections.push(buildHeadingSection(pendingHeading, order++));
          pendingHeading = null;
        }
        warnings.push(`Skipped unrecognized block: ${block.data.html?.slice(0, 100)}...`);
        break;
      }
    }
  }

  // Flush any trailing buffered heading
  if (pendingHeading) {
    sections.push(buildHeadingSection(pendingHeading, order++));
  }

  return buildResult(legacy, sections, warnings);
}

function buildResult(
  legacy: LegacyVehicleJson,
  sections: ImportedSection[],
  warnings: string[],
): LegacyImportResult {
  const slide = legacy.header?.slides?.[0];
  return {
    success: true,
    slug: legacy.oem_slug || legacy.segment_slug || legacy.model,
    name: cleanText(legacy.title?.rendered || ''),
    header: {
      slides: legacy.header?.slides?.map(s => ({
        heading: s.heading || '',
        sub_heading: s.sub_heading || '',
        button: s.button || '',
        desktop: s.desktop || '',
        mobile: s.mobile || s.desktop || '',
        bottom_strip: s.bottom_strip || [{ heading: '', sub_heading: '' }],
      })) || [{
        heading: '',
        sub_heading: '',
        button: '',
        desktop: '',
        mobile: '',
        bottom_strip: [{ heading: '', sub_heading: '' }],
      }],
    },
    sections,
    variant_link: legacy.variant_link || '',
    warnings,
  };
}
