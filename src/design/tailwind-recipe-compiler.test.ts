import { describe, expect, it } from 'vitest';
import { compileTailwindRecipe } from './tailwind-recipe-compiler';
import type { TailwindRecipeArtifact } from './tailwind-recipe-types';

const outlanderArtifact: TailwindRecipeArtifact = {
  oem_id: 'mitsubishi-au',
  model_slug: 'outlander',
  source_url: 'https://www.mitsubishi-motors.com.au/vehicles/outlander.html',
  region_id: 'outlander-variant-picker',
  viewport: { name: 'desktop', width: 1440, height: 1200 },
  root: {
    path: '0',
    tag: 'section',
    text: 'PETROL RANGE Make Your Mark. ES LS Black Edition Aspire Exceed White Key Features Build your own',
    attributes: { class: 'range-selector colour-picker' },
    computed_style: { display: 'grid', color: 'rgb(0, 0, 0)', 'font-size': '20px' },
    children: [
      {
        path: '0.0',
        tag: 'button',
        text: 'ES',
        attributes: { class: 'tab active' },
        computed_style: { 'font-weight': '700', 'text-align': 'center' },
        children: [],
      },
      {
        path: '0.1',
        tag: 'button',
        text: 'White',
        attributes: { class: 'colour-swatch' },
        computed_style: { 'background-color': 'rgb(255, 255, 255)', 'border-radius': '9999px' },
        children: [],
      },
      {
        path: '0.2',
        tag: 'img',
        text: '',
        attributes: { src: 'https://example.test/outlander-white.png', alt: 'Outlander ES White' },
        computed_style: { 'object-fit': 'contain' },
        children: [],
      },
    ],
  },
};

describe('compileTailwindRecipe', () => {
  it('classifies the Mitsubishi Outlander range picker as variant-color-explorer', () => {
    const result = compileTailwindRecipe(outlanderArtifact);
    expect(result.section_type).toBe('variant-color-explorer');
    expect(result.section.type).toBe('variant-color-explorer');
    expect(result.section.oem_id).toBe('mitsubishi-au');
    expect(result.section.model_slug).toBe('outlander');
    expect(result.section.heading).toBe('Make Your Mark.');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('keeps captured variant, colour, image, and feature data as manual fallback', () => {
    const result = compileTailwindRecipe({
      ...outlanderArtifact,
      root: {
        ...outlanderArtifact.root,
        children: [
          {
            path: '0.0',
            tag: 'button',
            text: 'ES',
            attributes: { class: 'tab active', 'aria-selected': 'true' },
            computed_style: { 'font-weight': '700', 'text-align': 'center' },
            children: [],
          },
          {
            path: '0.1',
            tag: 'button',
            text: 'LS',
            attributes: { class: 'tab' },
            computed_style: { 'font-weight': '400', 'text-align': 'center' },
            children: [],
          },
          {
            path: '0.2',
            tag: 'button',
            text: 'White',
            attributes: { class: 'colour-swatch active' },
            computed_style: { 'background-color': 'rgb(255, 255, 255)', 'border-radius': '9999px' },
            children: [],
          },
          {
            path: '0.3',
            tag: 'button',
            text: 'Red Diamond',
            attributes: { class: 'colour-swatch' },
            computed_style: { 'background-color': 'rgb(200, 0, 20)', 'border-radius': '9999px' },
            children: [],
          },
          {
            path: '0.4',
            tag: 'img',
            text: '',
            attributes: { src: 'https://example.test/outlander-es-white.png', alt: 'Outlander ES White' },
            computed_style: { 'object-fit': 'contain' },
            children: [],
          },
          {
            path: '0.5',
            tag: 'li',
            text: 'Wireless Apple CarPlay',
            attributes: { class: 'feature-item' },
            computed_style: {},
            children: [],
          },
          {
            path: '0.6',
            tag: 'li',
            text: 'Dynamic Yamaha Sound',
            attributes: { class: 'feature-item' },
            computed_style: {},
            children: [],
          },
        ],
      },
    });

    expect(result.section.variants).toEqual([
      {
        title: 'ES',
        description: '',
        image_url: 'https://example.test/outlander-es-white.png',
        key_features: ['Wireless Apple CarPlay', 'Dynamic Yamaha Sound'],
        colors: [
          { name: 'White', hero_image_url: 'https://example.test/outlander-es-white.png', hex: 'rgb(255, 255, 255)' },
          { name: 'Red Diamond', hero_image_url: '', hex: 'rgb(200, 0, 20)' },
        ],
      },
      {
        title: 'LS',
        description: '',
        image_url: '',
        key_features: [],
        colors: [],
      },
    ]);
    expect(result.section.fallback_image_url).toBe('https://example.test/outlander-es-white.png');
  });

  it('falls back to content-block for unknown regions', () => {
    const result = compileTailwindRecipe({
      ...outlanderArtifact,
      root: { ...outlanderArtifact.root, text: 'A plain paragraph about a vehicle', attributes: { class: 'copy' }, children: [] },
    });
    expect(result.section_type).toBe('content-block');
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.diagnostics).toContain('No typed Tailwind recipe matched this region.');
  });
});
