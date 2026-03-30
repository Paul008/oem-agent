/**
 * OEM Website Scraper — Scrapes gwmanz.com model pages into page builder sections.
 *
 * The GWM OEM site is Nuxt SSR + Storyblok CMS, so HTML is fully server-rendered.
 * No browser rendering needed — we parse the HTML with cheerio.
 *
 * Detected section patterns:
 *   .hero-image                  → hero section
 *   .cta-cards__swiper-container → feature-cards (variant showcase)
 *   .grid-blocks__block          → feature grid (image cards with overlay text)
 *   .model-range__carousel       → comparison/range section (variants + specs)
 *   .model-range-offer           → pricing bar
 *   .sticky-cta                  → sticky bar
 *   FAQ/accordion                → accordion section
 *   YouTube iframe               → video section
 */

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

// ============================================================================
// Types
// ============================================================================

export interface OemScraperResult {
  success: boolean;
  source_url: string;
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
  sections: OemSection[];
  warnings: string[];
}

export interface OemSection {
  type: string;
  id: string;
  order: number;
  [key: string]: any;
}

// ============================================================================
// Helpers
// ============================================================================

let sectionCounter = 0;
function nextId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++sectionCounter}`;
}

function cleanText(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getImgSrc($el: cheerio.Cheerio<Element>): string {
  // Storyblok images use src with responsive srcset
  return $el.attr('src') || $el.attr('data-src') || '';
}

// ============================================================================
// Section Extractors
// ============================================================================

function extractHero($: cheerio.CheerioAPI): { section: OemSection; slide: OemScraperResult['header']['slides'][0] } | null {
  const heroImg = $('main .hero-image').first();
  if (!heroImg.length) return null;

  // Hero content is a sibling of .hero-image, not inside it
  const heroContent = $('main .hero-content').first();

  // Heading: prefer h1 inside hero-content-heading--large, then h1 in main
  const headingEl = heroContent.find('.hero-content-heading--large h1, h1').first();
  const heading = cleanText(headingEl.text()) || cleanText($('main h1').first().text());

  // Sub heading: the <p> inside heading--large, or h2
  const subHeadingEl = heroContent.find('.hero-content-heading--large p').first();
  const subHeading = cleanText(subHeadingEl.text())
    || cleanText(heroContent.find('h2').first().text());

  // Get hero image from .hero-image <picture>
  const imgEl = heroImg.find('picture img, img').first();
  const desktopUrl = getImgSrc(imgEl);
  const mobileSource = heroImg.find('picture source[media*="max-width"]').first();
  const mobileUrl = mobileSource.attr('srcset')?.split(' ')[0] || desktopUrl;

  // CTA buttons from hero-content-cta
  const ctaBtn = heroContent.find('.hero-content-cta a, .hero-content-cta button').first();
  const ctaText = cleanText(ctaBtn.text());
  const ctaUrl = ctaBtn.attr('href') || '';

  const section: OemSection = {
    type: 'hero',
    id: nextId('hero'),
    order: 0,
    heading,
    sub_heading: subHeading,
    cta_text: ctaText,
    cta_url: ctaUrl,
    desktop_image_url: desktopUrl,
    mobile_image_url: mobileUrl,
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

  const slide = {
    heading,
    sub_heading: subHeading,
    button: ctaText,
    desktop: desktopUrl,
    mobile: mobileUrl,
    bottom_strip: [{ heading: '', sub_heading: '' }],
  };

  return { section, slide };
}

function extractCtaCards($: cheerio.CheerioAPI, order: number): OemSection | null {
  const container = $('main .cta-cards__swiper-container').first();
  if (!container.length) return null;

  const cards: Array<{ title: string; description: string; image_url: string }> = [];
  container.find('.cta-card').each((_, el) => {
    const $card = $(el);
    const title = cleanText($card.find('.cta-card__heading--large, .cta-card__heading').first().text());
    const subHeading = cleanText($card.find('.cta-card__sub-heading').first().text());
    const description = cleanText($card.find('.cta-card__rich-text, .cta-card__text-container').first().text());
    const img = getImgSrc($card.find('.cta-card__media-container img').first());

    if (title || img) {
      cards.push({
        title: subHeading ? `${title} — ${subHeading}` : title,
        description,
        image_url: img,
      });
    }
  });

  if (cards.length === 0) return null;

  return {
    type: 'feature-cards',
    id: nextId('fc'),
    order,
    title: '',
    cards,
    columns: Math.min(cards.length, 3),
    animation: 'stagger-children',
  };
}

function extractGridBlocks($: cheerio.CheerioAPI, order: number): OemSection | null {
  const blocks = $('main .grid-blocks__block');
  if (blocks.length < 2) return null;

  const cards: Array<{ title: string; description: string; image_url: string }> = [];
  blocks.each((_, el) => {
    const $block = $(el);
    const title = cleanText($block.find('.grid-blocks__block-heading').first().text());
    const link = $block.find('a').first();
    const linkText = cleanText(link.text());
    const img = getImgSrc($block.find('.grid-blocks__block-media img').first());

    if (title || img) {
      cards.push({
        title,
        description: linkText && linkText !== title ? linkText : '',
        image_url: img,
      });
    }
  });

  if (cards.length === 0) return null;

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

function extractIntroText($: cheerio.CheerioAPI, order: number): OemSection | null {
  // Look for large intro paragraphs between hero and first feature section
  // These are often in a container with large text styling
  const mainEl = $('main');
  const introBlocks: string[] = [];

  // Find text blocks that aren't inside known section types
  mainEl.find('p, h2, h3').each((_, el) => {
    const $el = $(el);
    // Skip if inside a known section
    if ($el.closest('.hero-image, .cta-card, .grid-blocks__block, .model-range, .sticky-cta, .model-range-offer, footer, nav, header').length) return;

    const text = cleanText($el.text());
    if (text.length > 40) {
      introBlocks.push(text);
    }
  });

  if (introBlocks.length === 0) return null;

  // Take the first substantial text block as the intro
  const bodyHtml = introBlocks.slice(0, 3).map(t => `<p>${t}</p>`).join('\n');

  return {
    type: 'content-block',
    id: nextId('intro'),
    order,
    title: '',
    content_html: bodyHtml,
    layout: 'contained',
    background: '',
    image_url: '',
    animation: 'fade-up',
  };
}

function extractVideoEmbed($: cheerio.CheerioAPI, order: number): OemSection | null {
  const iframe = $('main iframe[src*="youtube"], main iframe[src*="youtu.be"]').first();
  if (!iframe.length) return null;

  const src = iframe.attr('src') || '';
  const title = iframe.attr('title') || '';

  return {
    type: 'video',
    id: nextId('vid'),
    order,
    title: cleanText(title),
    video_url: src,
    poster_url: '',
    autoplay: false,
    layout: 'contained',
    animation: 'fade-in',
  };
}

function extractModelRange($: cheerio.CheerioAPI, order: number): OemSection | null {
  const carousel = $('main .model-range__carousel').first();
  if (!carousel.length) return null;

  const heading = cleanText($('main').find('h2').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('range') || text.includes('variant');
  }).first().text());

  // Extract variant names and features
  const variants: Array<{ name: string; features: string[]; image_url: string }> = [];
  carousel.find('.swiper-slide').each((_, el) => {
    const $slide = $(el);
    const name = cleanText($slide.find('.model-range__name-next, .model-range__name-prev, .model-range__caption').first().text());
    const img = getImgSrc($slide.find('img').first());

    const features: string[] = [];
    $slide.find('.model-range-features__name').each((_, feat) => {
      const f = cleanText($(feat).text());
      if (f) features.push(f);
    });

    if (name || img) {
      variants.push({ name, features, image_url: img });
    }
  });

  if (variants.length === 0) return null;

  // Convert to comparison table
  return {
    type: 'comparison-table',
    id: nextId('range'),
    order,
    title: heading || 'The Range',
    columns: [
      { label: 'Feature', highlighted: false },
      ...variants.slice(0, 6).map(v => ({ label: v.name, highlighted: false })),
    ],
    rows: variants[0]?.features.map((_, fi) => ({
      feature: variants[0]?.features[fi] || '',
      values: variants.slice(0, 6).map(v => v.features[fi] || ''),
    })) || [],
  };
}

function extractPricing($: cheerio.CheerioAPI, order: number): OemSection | null {
  const offerPanel = $('main .model-range-offer').first();
  if (!offerPanel.length) return null;

  const price = cleanText(offerPanel.find('.model-range-offer__price').first().text());
  const heading = cleanText(offerPanel.find('.model-range-offer__heading').first().text());

  if (!price && !heading) return null;

  return {
    type: 'cta-banner',
    id: nextId('price'),
    order,
    heading: heading || 'Driveaway Price',
    body: price,
    cta_text: 'Enquire Now',
    cta_url: '#',
    background_color: '',
    animation: 'fade-up',
  };
}

function extractFaqSections($: cheerio.CheerioAPI, order: number): OemSection[] {
  const sections: OemSection[] = [];

  // Look for FAQ/accordion patterns — h2 headings with adjacent content
  // On the OEM site these are the ownership cards (Overview, Roadside, Tech, Warranty, Safety, Service)
  const ownershipHeadings = ['Overview', 'Roadside', 'Tech', 'Warranty', 'Safety', 'Service'];
  const cards: Array<{ title: string; body: string; cta_text?: string; cta_url?: string }> = [];

  $('main h2').each((_, el) => {
    const $h2 = $(el);
    const heading = cleanText($h2.text());

    // Skip if it's inside a known section
    if ($h2.closest('.hero-image, .cta-card, .grid-blocks__block, .model-range__carousel').length) return;

    // Check if it matches ownership headings
    const isOwnership = ownershipHeadings.some(oh => heading.toLowerCase().includes(oh.toLowerCase()));
    if (!isOwnership) return;

    // Get the body text after this heading
    const bodyEl = $h2.nextAll('p, div').first();
    const body = cleanText(bodyEl.text());
    const cta = $h2.parent().find('a[class*="button"], a').filter((_, a) => {
      const text = $(a).text().toLowerCase();
      return text.includes('learn') || text.includes('more');
    }).first();

    if (body.length > 20) {
      cards.push({
        title: heading,
        body,
        ...(cta.length ? { cta_text: cleanText(cta.text()), cta_url: cta.attr('href') || '' } : {}),
      });
    }
  });

  if (cards.length >= 2) {
    const hasCta = cards.some(c => c.cta_text);
    sections.push({
      type: 'card-grid',
      id: nextId('own'),
      order,
      title: '',
      columns: Math.min(cards.length, 3),
      cards: cards.map(c => ({
        title: c.title,
        body: c.body,
        image_url: '',
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
    });
  }

  // Also look for actual FAQ accordion (Common Questions)
  const faqHeading = $('main').find('h2, h3').filter((_, el) => {
    const text = $(el).text().toLowerCase();
    return text.includes('faq') || text.includes('common questions') || text.includes('frequently asked');
  }).first();

  if (faqHeading.length) {
    const items: Array<{ question: string; answer: string }> = [];
    const faqContainer = faqHeading.parent();

    // Look for accordion items — could be <details>, <button>, or custom classes
    faqContainer.find('details, [class*="accordion"], [class*="faq-item"]').each((_, el) => {
      const $item = $(el);
      const question = cleanText($item.find('summary, [class*="question"], [class*="heading"], button').first().text());
      const answer = cleanText($item.find('[class*="answer"], [class*="content"], [class*="body"], p').first().text());
      if (question) items.push({ question, answer });
    });

    // Fallback: look for H3/H4 pairs
    if (items.length === 0) {
      faqContainer.find('h3, h4').each((_, el) => {
        const question = cleanText($(el).text());
        const answer = cleanText($(el).nextAll('p, div').first().text());
        if (question && answer) items.push({ question, answer });
      });
    }

    if (items.length > 0) {
      sections.push({
        type: 'accordion',
        id: nextId('faq'),
        order: order + 1,
        title: cleanText(faqHeading.text()),
        items,
        section_id: 'faq',
      });
    }
  }

  return sections;
}

function extractStickyBar($: cheerio.CheerioAPI, order: number, modelName: string): OemSection | null {
  const sticky = $('main .sticky-cta').first();
  if (!sticky.length) return null;

  const buttons: Array<{ text: string; url: string; variant: string }> = [];
  sticky.find('a, button').each((_, el) => {
    const $btn = $(el);
    const text = cleanText($btn.text());
    const url = $btn.attr('href') || '#';
    if (text && text.length > 1 && text.length < 50) {
      buttons.push({
        text,
        url,
        variant: buttons.length === 0 ? 'primary' : 'secondary',
      });
    }
  });

  if (buttons.length === 0) return null;

  return {
    type: 'sticky-bar',
    id: nextId('stk'),
    order,
    position: 'bottom',
    model_name: modelName,
    price_text: '',
    buttons: buttons.slice(0, 3),
    show_after_scroll_px: 300,
    background_color: '',
  };
}

// ============================================================================
// Main Scraper
// ============================================================================

/**
 * Scrape a GWM OEM model page and convert to page builder sections.
 *
 * @param html - The full HTML of the page (fetched via curl/fetch)
 * @param sourceUrl - The URL the page was fetched from (for metadata)
 */
export function scrapeOemModelPage(html: string, sourceUrl: string): OemScraperResult {
  sectionCounter = 0;
  const $ = cheerio.load(html, { xmlMode: false });
  const warnings: string[] = [];
  const sections: OemSection[] = [];
  let order = 0;

  // Extract model name from h1 or title
  const pageTitle = cleanText($('title').first().text());
  const modelName = cleanText($('main h1').first().text())
    || pageTitle.split(':')[0].replace(/^\d{4}\s*/, '').trim();

  // Build slug from URL
  const urlParts = sourceUrl.replace(/\/+$/, '').split('/');
  const slug = urlParts[urlParts.length - 1] || 'unknown';

  // --- 1. Hero ---
  const hero = extractHero($);
  if (hero) {
    sections.push(hero.section);
    order++;
  } else {
    warnings.push('No hero section found');
  }

  // --- 2. Intro text ---
  const intro = extractIntroText($, order);
  if (intro) {
    sections.push(intro);
    order++;
  }

  // --- 3. CTA cards carousel (variant showcase) ---
  const ctaCards = extractCtaCards($, order);
  if (ctaCards) {
    sections.push(ctaCards);
    order++;
  }

  // --- 4. Video embed ---
  const video = extractVideoEmbed($, order);
  if (video) {
    sections.push(video);
    order++;
  }

  // --- 5. Feature grid ---
  const gridBlocks = extractGridBlocks($, order);
  if (gridBlocks) {
    sections.push(gridBlocks);
    order++;
  }

  // --- 6. Model range / variants ---
  const range = extractModelRange($, order);
  if (range) {
    sections.push(range);
    order++;
  }

  // --- 7. Pricing ---
  const pricing = extractPricing($, order);
  if (pricing) {
    sections.push(pricing);
    order++;
  }

  // --- 8. Ownership / FAQ ---
  const faqSections = extractFaqSections($, order);
  for (const faq of faqSections) {
    faq.order = order++;
    sections.push(faq);
  }

  // --- 9. Sticky bar ---
  const stickyBar = extractStickyBar($, order, modelName);
  if (stickyBar) {
    sections.push(stickyBar);
    order++;
  }

  return {
    success: sections.length > 0,
    source_url: sourceUrl,
    slug,
    name: modelName,
    header: {
      slides: hero ? [hero.slide] : [{
        heading: modelName,
        sub_heading: '',
        button: '',
        desktop: '',
        mobile: '',
        bottom_strip: [{ heading: '', sub_heading: '' }],
      }],
    },
    sections,
    warnings,
  };
}

/**
 * Known GWM OEM model page URLs.
 */
export const GWM_OEM_MODEL_URLS: Record<string, string> = {
  'haval-h6': 'https://www.gwmanz.com/au/models/suv/haval-h6/',
  'haval-h7': 'https://www.gwmanz.com/au/models/suv/haval-h7/',
  'jolion': 'https://www.gwmanz.com/au/models/suv/haval-jolion/',
  'haval-jolion': 'https://www.gwmanz.com/au/models/suv/haval-jolion/',
  'tank-300': 'https://www.gwmanz.com/au/models/suv/tank-300/',
  'tank-500': 'https://www.gwmanz.com/au/models/suv/tank-500/',
  'cannon': 'https://www.gwmanz.com/au/models/ute/cannon/',
  'cannon-alpha': 'https://www.gwmanz.com/au/models/ute/cannon-alpha/',
  'ora': 'https://www.gwmanz.com/au/models/hatchback/ora/',
  'h6gt': 'https://www.gwmanz.com/au/models/suv/haval-h6gt/',
  'haval-h6gt-phev': 'https://www.gwmanz.com/au/models/suv/haval-h6gt-phev/',
};
