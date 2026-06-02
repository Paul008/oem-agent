export interface BrandRecipeRow {
  id: string;
  oem_id: string;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown> | null;
}

export interface DefaultRecipeRow {
  id: string;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown> | null;
}

export interface PublicRecipe {
  id: string;
  oem_id: string | null;
  pattern: string;
  variant: string;
  label: string;
  resolves_to: string;
  defaults_json: Record<string, unknown>;
  source: 'brand' | 'default';
}

export function normalizeRecipeRows(input: {
  brandRecipes: BrandRecipeRow[] | null | undefined;
  defaultRecipes: DefaultRecipeRow[] | null | undefined;
}): PublicRecipe[] {
  const brandRecipes = input.brandRecipes ?? [];
  const defaultRecipes = input.defaultRecipes ?? [];
  const brandKeys = new Set(brandRecipes.map(r => `${r.pattern}:${r.variant}`));

  return [
    ...brandRecipes.map(r => ({
      id: r.id,
      oem_id: r.oem_id,
      pattern: r.pattern,
      variant: r.variant,
      label: r.label,
      resolves_to: r.resolves_to,
      defaults_json: r.defaults_json ?? {},
      source: 'brand' as const,
    })),
    ...defaultRecipes
      .filter(r => !brandKeys.has(`${r.pattern}:${r.variant}`))
      .map(r => ({
        id: r.id,
        oem_id: null,
        pattern: r.pattern,
        variant: r.variant,
        label: r.label,
        resolves_to: r.resolves_to,
        defaults_json: r.defaults_json ?? {},
        source: 'default' as const,
      })),
  ];
}
