import { describe, expect, it } from 'vitest';
import { isTailwindRecipeArtifact } from './tailwind-recipe-types';

describe('tailwind recipe artifact types', () => {
  it('accepts a valid region artifact', () => {
    expect(isTailwindRecipeArtifact({
      oem_id: 'mitsubishi-au',
      model_slug: 'outlander',
      source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
      region_id: 'outlander-variant-picker',
      viewport: { name: 'desktop', width: 1440, height: 1200 },
      root: {
        path: '0',
        tag: 'section',
        text: 'Make Your Mark. ES LS White',
        attributes: { class: 'range-selector' },
        computed_style: { display: 'grid', color: 'rgb(0, 0, 0)' },
        children: [],
      },
    })).toBe(true);
  });

  it('rejects invalid artifact input', () => {
    expect(isTailwindRecipeArtifact(null)).toBe(false);
    expect(isTailwindRecipeArtifact({ root: null })).toBe(false);
    expect(isTailwindRecipeArtifact({ root: { tag: 'section' } })).toBe(false);
  });
});
