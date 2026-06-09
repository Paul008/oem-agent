import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const targets = JSON.parse(readFileSync(new URL('./mitsubishi-clone-targets.json', import.meta.url), 'utf8'));

describe('mitsubishi clone targets', () => {
  it('covers the five primary Mitsubishi model pages with unique slugs', () => {
    expect(targets).toHaveLength(5);
    expect(new Set(targets.map(target => target.modelSlug)).size).toBe(5);
    expect(targets.map(target => target.modelSlug).sort()).toEqual([
      'asx',
      'eclipse-cross',
      'outlander',
      'pajero-sport',
      'triton',
    ]);
  });

  it('uses explicit Mitsubishi live source URLs', () => {
    for (const target of targets) {
      expect(target.oemId).toBe('mitsubishi-au');
      expect(target.sourceUrl).toMatch(/^https:\/\/www\.mitsubishi-motors\.com\.au\/vehicles\/.+\.html$/);
      expect(target.name).toEqual(expect.any(String));
    }
  });
});
