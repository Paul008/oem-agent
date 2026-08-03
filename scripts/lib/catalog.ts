import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export type CatalogPropSchemaValue =
  | { type: 'string' | 'number' | 'boolean' }
  | { type: 'array'; item: Record<string, CatalogPropSchemaValue> };

export type CatalogPreset = {
  id: string;
  type: string;
  categoryId: string;
  categoryLabel: string;
  name: string;
  description: string;
  propSchema: Record<string, CatalogPropSchemaValue>;
  demoProps: Record<string, unknown>;
  screenshotPath: string;
};

export type LoadedCatalog = {
  version: number;
  oem: string;
  presetCount: number;
  categories: Array<{ id: string; label: string; description: string }>;
  presets: CatalogPreset[];
  dir: string;
};

export async function loadCatalog(catalogDir: string): Promise<LoadedCatalog> {
  const catalogFile = join(catalogDir, 'catalog.json');
  let raw: Omit<LoadedCatalog, 'dir'>;
  try {
    raw = JSON.parse(await readFile(catalogFile, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read catalog at ${catalogFile}: ${(error as Error).message}`);
  }

  if (!Array.isArray(raw.presets) || raw.presets.length === 0) {
    throw new Error(`Catalog at ${catalogFile} has no presets — regenerate with catalog:build in toyota-theme-nuxt`);
  }

  const missing: string[] = [];
  for (const preset of raw.presets) {
    try {
      await access(join(catalogDir, preset.screenshotPath));
    } catch {
      missing.push(preset.id);
    }
  }
  if (missing.length) {
    throw new Error(
      `Catalog exemplar screenshots missing for: ${missing.join(', ')} — run catalog:capture in toyota-theme-nuxt`,
    );
  }

  return { ...raw, dir: catalogDir };
}

export function exemplarAbsolutePath(catalog: LoadedCatalog, preset: CatalogPreset): string {
  return join(catalog.dir, preset.screenshotPath);
}
