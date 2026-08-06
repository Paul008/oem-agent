export interface VariantVisibilityProduct {
  oem_id: string
  model_id: string | null
  title: string
  subtitle: string | null
  variant_name: string | null
  variant_code: string | null
  body_type: string | null
  fuel_type: string | null
  specs_json: Record<string, unknown> | null
  key_features: string[] | null
}

export interface VariantVisibilityModel {
  id: string
  oem_id: string
  name: string
}

function normalizedCatalogName(value: string): string {
  return value
    .toLowerCase()
    .replace(/^(?:all[ -]?new|new)\s+/, '')
    .replace(/[^a-z0-9]/g, '')
}

export function isNissanModelShell(
  product: VariantVisibilityProduct,
  models: VariantVisibilityModel[],
): boolean {
  if (product.oem_id !== 'nissan-au')
    return false

  const normalizedTitle = normalizedCatalogName(product.title)
  const matchesNissanModel = models.some(model =>
    model.oem_id === 'nissan-au'
    && normalizedCatalogName(model.name) === normalizedTitle
    && (!product.model_id || model.id === product.model_id),
  )
  if (!matchesNissanModel)
    return false

  const hasVariantIdentity = Boolean(product.variant_code || product.variant_name || product.subtitle)
  const hasVariantDetails = Boolean(
    product.body_type
    || product.fuel_type
    || (product.specs_json && Object.keys(product.specs_json).length > 0)
    || (Array.isArray(product.key_features) && product.key_features.length > 0),
  )

  return !hasVariantIdentity && !hasVariantDetails
}
