import { describe, expect, it } from 'vitest';
import { mapDeclarationsToTailwind } from './tailwind-declaration-mapper';

describe('mapDeclarationsToTailwind', () => {
  it('maps common OEM declarations to Tailwind utilities', () => {
    const result = mapDeclarationsToTailwind([
      { node_path: '0', property: 'display', value: 'grid' },
      { node_path: '0', property: 'text-align', value: 'center' },
      { node_path: '0', property: 'font-weight', value: '700' },
      { node_path: '0', property: 'font-size', value: '42px' },
      { node_path: '0', property: 'color', value: 'rgb(0, 0, 0)' },
      { node_path: '0', property: 'background-color', value: 'rgb(237, 0, 0)' },
    ]);

    const classes = result.flatMap(r => r.classes);
    expect(classes).toContain('grid');
    expect(classes).toContain('text-center');
    expect(classes).toContain('font-bold');
    expect(classes).toContain('text-[42px]');
    expect(classes).toContain('text-[#000000]');
    expect(classes).toContain('bg-[#ed0000]');
  });

  it('preserves unmapped declarations', () => {
    const result = mapDeclarationsToTailwind([
      { node_path: '0', property: 'background-image', value: 'linear-gradient(red, blue)' },
    ]);

    expect(result[0]).toEqual({
      node_path: '0',
      property: 'background-image',
      value: 'linear-gradient(red, blue)',
      classes: [],
      confidence: 0,
      unmapped: true,
    });
  });
});
