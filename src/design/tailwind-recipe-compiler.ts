import { mapDeclarationsToTailwind } from './tailwind-declaration-mapper';
import { normalizeRegionStyles } from './tailwind-style-normalizer';
import type {
  TailwindRecipeArtifact,
  TailwindRecipeCompileResult,
} from './tailwind-recipe-types';

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

export function compileTailwindRecipe(artifact: TailwindRecipeArtifact): TailwindRecipeCompileResult {
  const declarations = normalizeRegionStyles(artifact);
  const mappings = mapDeclarationsToTailwind(declarations);
  const mappedCount = mappings.filter((m) => !m.unmapped).length;
  const mappingConfidence = mappings.length ? mappedCount / mappings.length : 0;

  if (hasVariantPickerSignals(artifact)) {
    return {
      section_type: 'variant-color-explorer',
      section: {
        type: 'variant-color-explorer',
        oem_id: artifact.oem_id,
        model_slug: artifact.model_slug,
        data_source: 'database',
        eyebrow: 'PETROL RANGE',
        heading: extractHeading(artifact.root.text),
        cta_text: 'Build your own',
        cta_url: '',
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
