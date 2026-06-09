import type { Product, VariantColor } from '@/composables/use-oem-data'

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/[&<>"']/g, c => HTML_ESCAPES[c as keyof typeof HTML_ESCAPES] ?? c)
    .trim()
}

function toUsd(value: number | null | undefined): string {
  if (value == null)
    return ''
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
  }
  catch {
    return `$${value.toLocaleString()}`
  }
}

function buildProductFacts(product: Product, imageUrl: string) {
  const facts: string[] = []

  if (product.variant_code)
    facts.push(`<p><strong>Code:</strong> ${escapeText(product.variant_code)}</p>`)

  const priceParts: string[] = []
  if (product.price_raw_string)
    priceParts.push(escapeText(product.price_raw_string))
  else if (product.price_amount != null)
    priceParts.push(toUsd(product.price_amount))
  if (product.price_qualifier)
    priceParts.push(escapeText(product.price_qualifier))
  if (product.price_type && !product.price_qualifier)
    priceParts.push(escapeText(product.price_type))
  if (priceParts.length)
    facts.push(`<p><strong>Price:</strong> ${priceParts.join(' • ')}</p>`)

  if (product.availability)
    facts.push(`<p><strong>Availability:</strong> ${escapeText(product.availability)}</p>`)
  if (product.body_type)
    facts.push(`<p><strong>Body:</strong> ${escapeText(product.body_type)}</p>`)
  if (product.fuel_type)
    facts.push(`<p><strong>Fuel:</strong> ${escapeText(product.fuel_type)}</p>`)

  let specs = ''
  if (product.specs_json != null) {
    specs = typeof product.specs_json === 'string'
      ? product.specs_json
      : JSON.stringify(product.specs_json)
  }
  if (specs)
    facts.push(`<p><strong>Specs:</strong> ${escapeText(specs)}</p>`)

  const featureItems = Array.isArray(product.key_features) ? product.key_features : []
  const features = featureItems
    .map((feature: unknown) => `<li>${escapeText(feature)}</li>`)
    .join('')

  const lines = [
    `<p>${escapeText(product.title || 'Variant')}</p>`,
    ...facts,
    featureItems.length ? `<p><strong>Key features:</strong></p><ul class="list-disc ml-5 space-y-1">${features}</ul>` : '',
  ]
    .filter(Boolean)
    .join('')

  if (imageUrl)
    return `${lines}<div class="mt-3"><img src="${escapeText(imageUrl)}" alt="${escapeText(product.variant_name || product.title || 'Variant')}" class="max-w-full h-auto rounded-lg"></div>`

  return lines
}

export interface CatalogBindingInput {
  oemId: string
  modelSlug: string
  regionId?: string
  products: Product[]
  variantColors: VariantColor[]
}

export function buildCatalogSectionsFromModel(input: CatalogBindingInput): Record<string, any>[] {
  const colorsByProduct = new Map<string, VariantColor[]>()
  for (const c of input.variantColors ?? []) {
    const list = colorsByProduct.get(c.product_id) ?? []
    list.push(c)
    colorsByProduct.set(c.product_id, list)
  }

  const products = [...input.products].sort((a, b) => {
    const aLabel = escapeText(a.variant_name || a.title || '')
    const bLabel = escapeText(b.variant_name || b.title || '')
    return aLabel.localeCompare(bLabel)
  })

  const tabs = products.map((product) => {
    const variantColors = colorsByProduct.get(product.id) ?? []
    const chosenColor = variantColors.find(c => c.hero_image_url) ?? variantColors[0]
    const imageUrl = chosenColor?.hero_image_url || chosenColor?.swatch_url || ''

    return {
      label: product.variant_name || product.title || 'Variant',
      content_html: buildProductFacts(product, imageUrl),
      image_url: imageUrl || '',
      image_disclaimer: '',
      disclaimer: '',
    }
  })

  const commonBinding = {
    type: 'model-catalog',
    oem_id: input.oemId,
    model_slug: input.modelSlug,
    region_id: input.regionId || null,
    generated_at: new Date().toISOString(),
  }

  return [
    {
      type: 'tabs',
      title: products.length === 1 ? 'Model variant' : 'Model variants',
      category: 'Model variants',
      variant: 'default',
      theme: 'light',
      image_position: 'right',
      tabs,
      default_tab: 0,
      _catalog_binding: commonBinding,
    },
    {
      type: 'color-picker',
      title: 'Colours',
      colors: [],
      _catalog_binding: commonBinding,
    },
  ]
}

export function buildRawHtmlSectionFromCloneRegion(html: string | null | undefined): Record<string, any> | null {
  const trimmed = typeof html === 'string' ? html.trim() : ''
  if (!trimmed)
    return null

  return {
    type: 'content-block',
    title: '',
    content_html: '',
    _generated_html: trimmed,
    animation: 'fade-in',
  }
}
