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

export interface BuildEditableSectionFromCloneRegionInput {
  html?: string | null
  tailwindRecipeArtifact?: any
  compileTailwindRecipeArtifact?: (artifact: any) => Promise<any>
}

export async function buildEditableSectionFromCloneRegion(input: BuildEditableSectionFromCloneRegionInput): Promise<Record<string, any> | null> {
  if (input.tailwindRecipeArtifact && input.compileTailwindRecipeArtifact) {
    try {
      const response = await input.compileTailwindRecipeArtifact(input.tailwindRecipeArtifact)
      const result = response?.result
      if (response?.success && result?.section && Number(result.confidence) >= 0.7)
        return result.section
    }
    catch {
      // Fall through to raw HTML conversion. The caller can still save the region.
    }
  }

  return buildRawHtmlSectionFromCloneRegion(input.html)
}

export interface BuildPreviewReplacementHtmlFromCloneRegionInput extends BuildEditableSectionFromCloneRegionInput {
  regionId?: string | null
}

export async function buildPreviewReplacementHtmlFromCloneRegion(input: BuildPreviewReplacementHtmlFromCloneRegionInput): Promise<string | null> {
  const section = await buildEditableSectionFromCloneRegion(input)
  if (!section)
    return null

  return renderPreviewSectionHtml(section, input)
}

function renderPreviewSectionHtml(section: Record<string, any>, input: BuildPreviewReplacementHtmlFromCloneRegionInput): string | null {
  const regionId = escapeText(input.regionId || section?._tailwind_recipe?.region_id || '')

  if (section.type === 'variant-color-explorer')
    return renderVariantColorExplorerPreviewHtml(section, regionId)

  const generatedHtml = typeof section._generated_html === 'string' ? section._generated_html.trim() : ''
  if (generatedHtml)
    return generatedHtml

  const contentHtml = typeof section.content_html === 'string' ? section.content_html.trim() : ''
  if (contentHtml)
    return `<section${regionId ? ` data-oem-region-id="${regionId}"` : ''} class="px-5 py-14 md:px-10 md:py-20">${contentHtml}</section>`

  const fallbackHtml = typeof input.html === 'string' ? input.html.trim() : ''
  return fallbackHtml || null
}

function renderVariantColorExplorerPreviewHtml(section: Record<string, any>, regionId: string): string {
  const variants = Array.isArray(section.variants) ? section.variants : []
  const selectedVariant = variants[0] || {}
  const colors = Array.isArray(selectedVariant.colors) ? selectedVariant.colors : []
  const selectedColor = colors[0] || {}
  const selectedImage = selectedColor.hero_image_url || selectedVariant.image_url || section.fallback_image_url || ''
  const selectedColorName = selectedColor.name || ''
  const ctaText = selectedVariant.cta_text || section.cta_text || 'Build your own'
  const ctaUrl = selectedVariant.cta_url || section.cta_url || '#'
  const features = Array.isArray(selectedVariant.key_features) ? selectedVariant.key_features : []

  const variantButtons = variants.map((variant: any, index: number) => `
          <button type="button" class="relative whitespace-nowrap pb-4 text-base ${index === 0 ? 'font-black' : 'font-medium'} text-neutral-950 transition-colors md:text-lg">
            ${escapeText(variant.title || `Variant ${index + 1}`)}
            ${index === 0 ? '<span class="absolute bottom-0 left-0 h-[3px] w-7 bg-red-600"></span>' : ''}
          </button>`).join('')

  const featureItems = features.map((feature: unknown) => `
                <li class="border-l-2 border-red-600 pl-3">${escapeText(feature)}</li>`).join('')

  const swatches = colors.map((color: any, index: number) => {
    const swatchUrl = typeof color.swatch_url === 'string' ? color.swatch_url : ''
    const swatchStyle = !swatchUrl && color.hex ? ` style="background-color: ${escapeText(color.hex)}"` : ''
    return `
                <button type="button" class="grid place-items-center" title="${escapeText(color.name || '')}">
                  <span class="block size-14 rounded-full border border-white shadow-[0_4px_12px_rgba(0,0,0,0.28)] ring-offset-4 transition ${index === 0 ? 'ring-2 ring-neutral-300' : 'ring-0'}">
                    ${swatchUrl
                      ? `<img src="${escapeText(swatchUrl)}" alt="${escapeText(color.name || '')}" class="size-full rounded-full object-cover">`
                      : `<span class="block size-full rounded-full bg-neutral-200"${swatchStyle}></span>`}
                  </span>
                </button>`
  }).join('')

  return `<section${regionId ? ` data-oem-region-id="${regionId}"` : ''} class="bg-white px-5 py-14 text-neutral-950 md:px-10 md:py-20">
    <div class="mx-auto max-w-7xl">
      <div class="text-center">
        ${section.eyebrow ? `<p class="text-[0.7rem] font-bold uppercase tracking-[0.34em] text-neutral-500">${escapeText(section.eyebrow)}</p>` : ''}
        <h2 class="mt-5 text-3xl font-black leading-tight md:text-5xl">${escapeText(section.heading || 'Make Your Mark.')}</h2>
      </div>

      <div class="mt-10 md:mt-14">
        ${variants.length
          ? `<div class="-mx-5 overflow-x-auto px-5 md:mx-0 md:px-0">
          <div class="mx-auto flex w-max min-w-full items-center justify-start gap-8 md:justify-center">
            ${variantButtons}
          </div>
        </div>`
          : ''}

        <div class="mt-12 grid gap-8 lg:grid-cols-[0.42fr_0.58fr] lg:items-start">
          <div class="order-2 lg:order-1">
            <h3 class="text-4xl font-black leading-none md:text-5xl">${escapeText(selectedVariant.title || '')}</h3>
            ${selectedVariant.description ? `<p class="mt-8 max-w-md text-lg leading-8 text-neutral-900">${escapeText(selectedVariant.description)}</p>` : ''}
            ${selectedVariant.price_label ? `<p class="mt-5 text-sm font-bold text-neutral-600">${escapeText(selectedVariant.price_label)}</p>` : ''}

            <div class="mt-10 border-y border-neutral-300">
              <div class="flex w-full items-center justify-between py-5 text-left text-xl font-black">Key Features</div>
              ${featureItems ? `<ul class="grid gap-3 pb-6 text-sm leading-6 text-neutral-700 md:grid-cols-2">${featureItems}</ul>` : ''}
            </div>

            <a href="${escapeText(ctaUrl)}" class="mt-10 inline-flex min-h-14 items-center justify-center bg-red-600 px-7 text-base font-black text-white transition-colors hover:bg-red-700">${escapeText(ctaText)}</a>
          </div>

          <div class="order-1 lg:order-2">
            <div class="flex min-h-[260px] items-center justify-center md:min-h-[430px]">
              ${selectedImage
                ? `<img src="${escapeText(selectedImage)}" alt="${escapeText([selectedVariant.title, selectedColorName].filter(Boolean).join(' '))}" class="max-h-[260px] w-full object-contain md:max-h-[430px]">`
                : '<div class="flex aspect-[16/9] w-full items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-500">Vehicle image unavailable</div>'}
            </div>

            ${colors.length ? `<div class="mt-8 text-center">
              <p class="text-base font-black">${escapeText(selectedColorName)}</p>
              <div class="mt-7 flex flex-wrap justify-center gap-x-10 gap-y-8">${swatches}</div>
            </div>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>`
}
