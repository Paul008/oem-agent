import { describe, expect, it } from 'vitest';

import { classifyVisualMismatch, PUBLICATION_SCREENSHOT_OPTIONS } from './browser-validator';

describe('publication browser validation policy', () => {
  it('captures only the configured viewport to keep Worker memory bounded', () => {
    expect(PUBLICATION_SCREENSHOT_OPTIONS).toEqual({ fullPage: false, type: 'png' });
  });

  it('aligns the publication gate with the fidelity assistant thresholds', () => {
    expect(classifyVisualMismatch(0.01)).toBe('pass');
    expect(classifyVisualMismatch(0.0101)).toBe('warning');
    expect(classifyVisualMismatch(0.03)).toBe('warning');
    expect(classifyVisualMismatch(0.0301)).toBe('blocking');
  });
});
