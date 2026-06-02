import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeRecipeRows } from './recipe-response';

describe('normalizeRecipeRows', () => {
  it('returns brand recipes first and marks their source', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
      }],
      defaultRecipes: [{
        id: 'default-1',
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toEqual([
      {
        id: 'brand-1',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: { heading_size: '4xl' },
        source: 'brand',
      },
      {
        id: 'default-1',
        oem_id: null,
        pattern: 'hero',
        variant: 'video',
        label: 'Video Hero',
        resolves_to: 'hero',
        defaults_json: {},
        source: 'default',
      },
    ]);
  });

  it('lets brand recipes override defaults with the same pattern and variant', () => {
    const recipes = normalizeRecipeRows({
      brandRecipes: [{
        id: 'brand-hero',
        oem_id: 'ford-au',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Ford Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
      defaultRecipes: [{
        id: 'default-hero',
        pattern: 'hero',
        variant: 'image-overlay',
        label: 'Generic Hero',
        resolves_to: 'hero',
        defaults_json: {},
      }],
    });

    expect(recipes).toHaveLength(1);
    expect(recipes[0].id).toBe('brand-hero');
    expect(recipes[0].source).toBe('brand');
  });
});

describe('oem-agent route registration', () => {
  it('registers the public recipe route exactly once', () => {
    const source = readFileSync(new URL('../routes/oem-agent.ts', import.meta.url), 'utf8');
    const matches = source.match(/app\.get\('\/recipes\/:oemId'/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
