export interface Recipe {
  id: string
  oem_id: string | null
  pattern: string
  variant: string
  label: string
  resolves_to: string
  defaults_json: Record<string, any>
  source: 'brand' | 'default'
}

export function normalizeRecipesResponse(result: any): Recipe[] {
  if (Array.isArray(result?.recipes)) {
    return result.recipes.map((recipe: any) => ({
      ...recipe,
      defaults_json: recipe.defaults_json ?? {},
    })) as Recipe[]
  }

  const brandRecipes = Array.isArray(result?.brand_recipes) ? result.brand_recipes : []
  const defaultRecipes = Array.isArray(result?.default_recipes) ? result.default_recipes : []
  const brandKeys = new Set(brandRecipes.map((recipe: any) => `${recipe.pattern}:${recipe.variant}`))

  return [
    ...brandRecipes.map((recipe: any) => ({
      id: recipe.id,
      oem_id: recipe.oem_id,
      pattern: recipe.pattern,
      variant: recipe.variant,
      label: recipe.label,
      resolves_to: recipe.resolves_to,
      defaults_json: recipe.defaults_json ?? {},
      source: 'brand' as const,
    })),
    ...defaultRecipes
      .filter((recipe: any) => !brandKeys.has(`${recipe.pattern}:${recipe.variant}`))
      .map((recipe: any) => ({
        id: recipe.id,
        oem_id: null,
        pattern: recipe.pattern,
        variant: recipe.variant,
        label: recipe.label,
        resolves_to: recipe.resolves_to,
        defaults_json: recipe.defaults_json ?? {},
        source: 'default' as const,
      })),
  ]
}
