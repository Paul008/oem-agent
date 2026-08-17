import { describe, expect, it } from 'vitest';
import { resolveModelPageReadAlias } from './model-page-aliases';

describe('resolveModelPageReadAlias', () => {
  it('routes legacy Nissan preview slugs to the reviewed canonical pages', () => {
    expect(resolveModelPageReadAlias('nissan-au-navara')).toBe('nissan-au-all-new-navara');
    expect(resolveModelPageReadAlias('nissan-au-x-trail')).toBe('nissan-au-new-x-trail');
    expect(resolveModelPageReadAlias('nissan-au-qashqai')).toBe('nissan-au-qashqai');
  });
});
