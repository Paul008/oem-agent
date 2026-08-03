import { describe, expect, it } from 'vitest';
import { normalizeRawSections, sectionScreenshotFile } from './section-capture';

const section = (over: Partial<{ tag: string; classes: string; top: number; left: number; width: number; height: number; html: string }>) => ({
  tag: 'section', classes: '', top: 0, left: 0, width: 1440, height: 400, html: '<section>x</section>', ...over,
});

describe('normalizeRawSections', () => {
  it('sorts by top position', () => {
    const result = normalizeRawSections([section({ top: 900, html: 'b' }), section({ top: 100, html: 'a' })]);
    expect(result.map((s) => s.html)).toEqual(['a', 'b']);
  });

  it('drops sections under the size floor', () => {
    const result = normalizeRawSections([
      section({ height: 30, html: 'small-h' }),
      section({ width: 100, html: 'small-w' }),
      section({ html: 'keep' }),
    ]);
    expect(result.map((s) => s.html)).toEqual(['keep']);
  });

  it('dedupes identical html keeping the first', () => {
    const result = normalizeRawSections([
      section({ top: 10, html: 'same' }),
      section({ top: 500, html: 'same' }),
      section({ top: 900, html: 'other' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('caps html length', () => {
    const result = normalizeRawSections([section({ html: 'x'.repeat(300_000) })], { maxHtmlLength: 1000 });
    expect(result[0].html).toHaveLength(1000);
  });
});

describe('sectionScreenshotFile', () => {
  it('zero-pads to two digits', () => {
    expect(sectionScreenshotFile(0)).toBe('sections/00.png');
    expect(sectionScreenshotFile(11)).toBe('sections/11.png');
  });
});
