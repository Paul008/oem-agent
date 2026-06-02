import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  EXTRACTABLE_SECTION_TYPES,
  isExtractablePageSectionType,
} from './page-structurer';

describe('page section type guardrails', () => {
  it('exports the intended extractor-supported core types', () => {
    expect(EXTRACTABLE_SECTION_TYPES).toEqual([
      'hero',
      'intro',
      'tabs',
      'color-picker',
      'specs-grid',
      'gallery',
      'feature-cards',
      'video',
      'cta-banner',
      'content-block',
    ]);
  });

  it('accepts extractor-supported core types', () => {
    expect(isExtractablePageSectionType('hero')).toBe(true);
    expect(isExtractablePageSectionType('content-block')).toBe(true);
  });

  it('rejects dashboard-only and unknown inputs', () => {
    expect(isExtractablePageSectionType('pinned-scroll')).toBe(false);
    expect(isExtractablePageSectionType('media')).toBe(false);
    expect(isExtractablePageSectionType('finance-calculator')).toBe(false);
    expect(isExtractablePageSectionType(null)).toBe(false);
    expect(isExtractablePageSectionType(undefined)).toBe(false);
    expect(isExtractablePageSectionType(123)).toBe(false);
    expect(isExtractablePageSectionType({ type: 'hero' })).toBe(false);
  });

  it('does not reintroduce the old section type declaration', () => {
    const source = readFileSync(new URL('./page-structurer.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('const VALID_SECTION_TYPES');
  });
});
