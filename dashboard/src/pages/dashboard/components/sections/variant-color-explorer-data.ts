export interface ExplorerColor {
  name: string
  code?: string
  swatch_url?: string | null
  hero_image_url?: string | null
  hex?: string | null
}

export interface ExplorerVariant {
  id?: string
  title: string
  description?: string
  price_label?: string
  cta_text?: string
  cta_url?: string
  key_features?: string[]
  image_url?: string | null
  colors?: ExplorerColor[]
}

function key(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase()
}

function matchingFallbackColor(dbColor: ExplorerColor, fallbackColors: ExplorerColor[], index: number): ExplorerColor | undefined {
  const dbKeys = [dbColor.code, dbColor.name].map(key).filter(Boolean)
  return fallbackColors.find(color => [color.code, color.name].map(key).some(value => dbKeys.includes(value))) || fallbackColors[index]
}

function colorKeys(color: ExplorerColor): string[] {
  return [color.code, color.name].map(key).filter(Boolean)
}

function mergeColors(dbColors: ExplorerColor[] | undefined, fallbackColors: ExplorerColor[] | undefined, fallbackImageUrl: string | null | undefined): ExplorerColor[] {
  const database = dbColors || []
  const captured = fallbackColors || []
  if (!database.length)
    return captured

  const merged = database.map((color, index) => {
    const fallback = matchingFallbackColor(color, captured, index)
    return {
      ...fallback,
      ...color,
      name: color.name || fallback?.name || '',
      code: color.code || fallback?.code,
      swatch_url: color.swatch_url || fallback?.swatch_url || null,
      hero_image_url: color.hero_image_url || fallback?.hero_image_url || fallbackImageUrl || null,
      hex: color.hex || fallback?.hex || null,
    }
  })
  const databaseKeys = new Set(database.flatMap(colorKeys))
  return [
    ...merged,
    ...captured.filter(color => !colorKeys(color).some(value => databaseKeys.has(value))),
  ]
}

export function mergeVariantFallbacks(dbVariants: ExplorerVariant[], manualVariants: ExplorerVariant[]): ExplorerVariant[] {
  if (!dbVariants.length)
    return manualVariants

  const manualByTitle = new Map(manualVariants.map(variant => [key(variant.title), variant]))

  return dbVariants.map((variant, index) => {
    const fallback = manualByTitle.get(key(variant.title)) || manualVariants[index]
    if (!fallback)
      return variant

    const dbFeatures = variant.key_features || []
    const fallbackFeatures = fallback.key_features || []

    return {
      ...variant,
      description: variant.description || fallback.description || '',
      image_url: variant.image_url || fallback.image_url || null,
      key_features: dbFeatures.length ? dbFeatures : fallbackFeatures,
      colors: mergeColors(variant.colors, fallback.colors, variant.image_url || fallback.image_url),
    }
  })
}
