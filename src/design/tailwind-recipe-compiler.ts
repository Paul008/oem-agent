import { mapDeclarationsToTailwind } from './tailwind-declaration-mapper';
import { normalizeRegionStyles } from './tailwind-style-normalizer';
import type {
  TailwindRecipeArtifact,
  TailwindRecipeNode,
  TailwindRecipeCompileResult,
} from './tailwind-recipe-types';

interface ExplorerColorFallback {
  name: string;
  hero_image_url: string;
  hex: string | null;
}

interface ExplorerVariantFallback {
  title: string;
  description: string;
  image_url: string;
  key_features: string[];
  colors: ExplorerColorFallback[];
}

interface CtaFallback {
  text: string;
  url: string;
}

function hasVariantPickerSignals(artifact: TailwindRecipeArtifact): boolean {
  const text = artifact.root.text.toLowerCase();
  const classes = artifact.root.attributes.class?.toLowerCase() || '';
  return artifact.oem_id === 'mitsubishi-au'
    && /make your mark|key features|build your own/.test(text)
    && /range|colour|color|picker|selector/.test(`${text} ${classes}`);
}

function extractHeading(text: string): string {
  const match = text.match(/Make Your Mark\./i);
  return match ? match[0] : 'Make Your Mark.';
}

function extractEyebrow(text: string): string {
  const match = cleanText(text).match(/\b([A-Z0-9][A-Z0-9 &+-]{1,28}\s+RANGE)\b/);
  return match ? match[1] : 'PETROL RANGE';
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function walkNodes(node: TailwindRecipeNode): TailwindRecipeNode[] {
  return [node, ...node.children.flatMap(child => walkNodes(child))];
}

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const label of labels) {
    const normalized = cleanText(label);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function nodeSignal(node: TailwindRecipeNode): string {
  return [
    node.tag,
    node.attributes.class || '',
    node.attributes.role || '',
    node.attributes['aria-selected'] || '',
    node.attributes['data-color'] || '',
    node.attributes['data-colour'] || '',
  ].join(' ').toLowerCase();
}

function isShortLabel(text: string): boolean {
  const label = cleanText(text);
  return label.length > 0 && label.length <= 36 && !/[.!?]\s*$/.test(label);
}

function extractVariantLabels(artifact: TailwindRecipeArtifact): string[] {
  return uniqueLabels(walkNodes(artifact.root)
    .filter((node) => {
      const signal = nodeSignal(node);
      return !/color|colour|swatch|picker/.test(signal)
        && (/(^|\s)tab($|\s|-)|aria-selected|active|selected/.test(signal))
        && isShortLabel(node.text);
    })
    .map(node => node.text));
}

function isCssColor(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value) || /^(rgb|rgba|hsl|hsla)\(/i.test(value);
}

function extractColors(artifact: TailwindRecipeArtifact, fallbackImageUrl: string): ExplorerColorFallback[] {
  return uniqueLabels(walkNodes(artifact.root)
    .filter((node) => {
      const signal = nodeSignal(node);
      return /color|colour|swatch/.test(signal) && isShortLabel(node.text);
    })
    .map(node => node.text))
    .map((name, index) => {
      const source = walkNodes(artifact.root).find(node => cleanText(node.text).toLowerCase() === name.toLowerCase());
      const background = cleanText(source?.computed_style['background-color'] || '');
      return {
        name,
        hero_image_url: index === 0 ? fallbackImageUrl : '',
        hex: isCssColor(background) && !/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\s*\)/i.test(background) ? background : null,
      };
    });
}

function extractImageUrl(artifact: TailwindRecipeArtifact): string {
  const image = walkNodes(artifact.root).find(node => node.tag === 'img' && (node.attributes.src || node.attributes.currentSrc || node.attributes['data-src']));
  return image?.attributes.src || image?.attributes.currentSrc || image?.attributes['data-src'] || '';
}

function extractFeatureItems(artifact: TailwindRecipeArtifact): string[] {
  return uniqueLabels(walkNodes(artifact.root)
    .filter((node) => {
      const signal = nodeSignal(node);
      const text = cleanText(node.text);
      return text.length > 0
        && text.length <= 120
        && !/key features|build your own|make your mark/i.test(text)
        && (node.tag === 'li' || /feature/.test(signal));
    })
    .map(node => node.text))
    .slice(0, 8);
}

function extractCta(artifact: TailwindRecipeArtifact): CtaFallback {
  const cta = walkNodes(artifact.root).find((node) => {
    const text = cleanText(node.text);
    const signal = nodeSignal(node);
    const hasHref = typeof node.attributes.href === 'string' && node.attributes.href.length > 0;
    return text.length > 0
      && text.length <= 48
      && (/build|configure|price|own|enquire/i.test(text) || /primary|cta/.test(signal) || hasHref)
      && (node.tag === 'a' || node.tag === 'button' || hasHref);
  });

  return {
    text: cleanText(cta?.text || '') || 'Build your own',
    url: cta?.attributes.href || '',
  };
}

function buildVariantFallbacks(artifact: TailwindRecipeArtifact): { fallbackImageUrl: string; variants: ExplorerVariantFallback[] } {
  const fallbackImageUrl = extractImageUrl(artifact);
  const features = extractFeatureItems(artifact);
  const colors = extractColors(artifact, fallbackImageUrl);
  const variants = extractVariantLabels(artifact).map((title, index) => ({
    title,
    description: '',
    image_url: index === 0 ? fallbackImageUrl : '',
    key_features: index === 0 ? features : [],
    colors: index === 0 ? colors : [],
  }));

  return { fallbackImageUrl, variants };
}

export function compileTailwindRecipe(artifact: TailwindRecipeArtifact): TailwindRecipeCompileResult {
  const declarations = normalizeRegionStyles(artifact);
  const mappings = mapDeclarationsToTailwind(declarations);
  const mappedCount = mappings.filter((m) => !m.unmapped).length;
  const mappingConfidence = mappings.length ? mappedCount / mappings.length : 0;

  if (hasVariantPickerSignals(artifact)) {
    const fallback = buildVariantFallbacks(artifact);
    const cta = extractCta(artifact);
    return {
      section_type: 'variant-color-explorer',
      section: {
        type: 'variant-color-explorer',
        oem_id: artifact.oem_id,
        model_slug: artifact.model_slug,
        data_source: 'database',
        eyebrow: extractEyebrow(artifact.root.text),
        heading: extractHeading(artifact.root.text),
        cta_text: cta.text,
        cta_url: cta.url,
        fallback_image_url: fallback.fallbackImageUrl,
        variants: fallback.variants,
        _tailwind_recipe: {
          source_url: artifact.source_url,
          region_id: artifact.region_id,
          viewport: artifact.viewport,
          class_hints: mappings.flatMap((m) => m.classes),
        },
      },
      confidence: Math.max(0.7, Math.min(0.95, 0.7 + mappingConfidence * 0.2)),
      mappings,
      diagnostics: [],
    };
  }

  return {
    section_type: 'content-block',
    section: {
      type: 'content-block',
      title: '',
      content_html: `<p>${artifact.root.text}</p>`,
      _tailwind_recipe: {
        source_url: artifact.source_url,
        region_id: artifact.region_id,
        viewport: artifact.viewport,
        class_hints: mappings.flatMap((m) => m.classes),
      },
    },
    confidence: Math.min(0.5, mappingConfidence),
    mappings,
    diagnostics: ['No typed Tailwind recipe matched this region.'],
  };
}
