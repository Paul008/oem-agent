import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('page section type guardrails', () => {
  it('documents the extractable core type boundary', () => {
    const source = readFileSync(new URL('./page-structurer.ts', import.meta.url), 'utf8');

    expect(source).toContain('EXTRACTABLE_SECTION_TYPES');
    expect(source).toContain('hero');
    expect(source).toContain('content-block');
    expect(source).not.toContain('const VALID_SECTION_TYPES');
  });
});
