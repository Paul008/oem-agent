import { describe, expect, it } from 'vitest';
import { normalizeRegionStyles } from './tailwind-style-normalizer';
import type { TailwindRecipeArtifact } from './tailwind-recipe-types';

const artifact: TailwindRecipeArtifact = {
  oem_id: 'mitsubishi-au',
  model_slug: 'outlander',
  source_url: 'https://example.test/outlander',
  region_id: 'variant-picker',
  viewport: { name: 'desktop', width: 1440, height: 1200 },
  root: {
    path: '0',
    tag: 'section',
    text: 'Make Your Mark.',
    attributes: { class: 'range-selector' },
    computed_style: {
      display: 'grid',
      color: 'rgb(0, 0, 0)',
      'font-size': '42px',
      'background-color': 'rgba(0, 0, 0, 0)',
      cursor: 'auto',
    },
    children: [{
      path: '0.0',
      tag: 'button',
      text: 'ES',
      attributes: { class: 'active' },
      computed_style: {
        display: 'block',
        'font-weight': '700',
        'text-align': 'center',
        opacity: '1',
      },
      children: [],
    }],
  },
};

describe('normalizeRegionStyles', () => {
  it('keeps only style properties useful for Tailwind recipe generation', () => {
    const declarations = normalizeRegionStyles(artifact);
    expect(declarations).toContainEqual({ node_path: '0', property: 'display', value: 'grid' });
    expect(declarations).toContainEqual({ node_path: '0', property: 'font-size', value: '42px' });
    expect(declarations).toContainEqual({ node_path: '0.0', property: 'font-weight', value: '700' });
    expect(declarations.some(d => d.property === 'cursor')).toBe(false);
  });

  it('skips transparent empty background colours', () => {
    const declarations = normalizeRegionStyles(artifact);
    expect(declarations.some(d => d.property === 'background-color')).toBe(false);
  });
});
