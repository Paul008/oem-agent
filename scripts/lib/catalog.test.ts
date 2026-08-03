import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exemplarAbsolutePath, loadCatalog } from './catalog';

function writeFixtureCatalog(overrides: { omitPng?: boolean; presets?: unknown[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'composer-catalog-'));
  const presets = overrides.presets ?? [
    {
      id: 'hero-standard',
      type: 'hero',
      categoryId: 'content',
      categoryLabel: 'Toyota',
      name: 'Toyota Hero',
      description: 'Large page opener.',
      propSchema: { heading: { type: 'string' } },
      demoProps: { heading: 'Demo' },
      screenshotPath: 'screenshots/hero-standard.png',
    },
  ];
  writeFileSync(join(dir, 'catalog.json'), JSON.stringify({
    version: 1, oem: 'toyota', presetCount: presets.length, categories: [], presets,
  }));
  mkdirSync(join(dir, 'screenshots'), { recursive: true });
  if (!overrides.omitPng) {
    writeFileSync(join(dir, 'screenshots', 'hero-standard.png'), Buffer.from('fake-png'));
  }
  return dir;
}

describe('loadCatalog', () => {
  it('loads a valid catalog and records its dir', async () => {
    const dir = writeFixtureCatalog();
    const catalog = await loadCatalog(dir);
    expect(catalog.presets).toHaveLength(1);
    expect(catalog.presets[0].id).toBe('hero-standard');
    expect(catalog.dir).toBe(dir);
  });

  it('resolves exemplar absolute paths', async () => {
    const dir = writeFixtureCatalog();
    const catalog = await loadCatalog(dir);
    expect(exemplarAbsolutePath(catalog, catalog.presets[0]))
      .toBe(join(dir, 'screenshots', 'hero-standard.png'));
  });

  it('throws an actionable error when an exemplar PNG is missing', async () => {
    const dir = writeFixtureCatalog({ omitPng: true });
    await expect(loadCatalog(dir)).rejects.toThrow(/hero-standard.*catalog:capture/s);
  });

  it('throws when the catalog has no presets', async () => {
    const dir = writeFixtureCatalog({ presets: [] });
    await expect(loadCatalog(dir)).rejects.toThrow(/no presets/);
  });
});
