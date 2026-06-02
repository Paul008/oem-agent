const MEDIA_PATH_PREFIX = '/media/'

export const SECTION_IMAGE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'desktop_image_url',
  'mobile_image_url',
  'background_image_url',
  'image_url',
  'swatch_url',
  'hero_image_url',
  'poster_url',
  'avatar_url',
  'icon_url',
  'logo_url',
  'background_image',
  'background_image_mobile',
  'image',
  'mobile_image',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function resolveSectionMediaPaths<T>(value: T, resolveUrl: (url: string) => string | null): T {
  if (typeof value === 'string') {
    if (value.startsWith(MEDIA_PATH_PREFIX))
      return (resolveUrl(value) ?? value) as T
    return value
  }

  if (Array.isArray(value))
    return value.map(item => resolveSectionMediaPaths(item, resolveUrl)) as T

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveSectionMediaPaths(entry, resolveUrl)]),
    ) as T
  }

  return value
}

function countImagesInValue(value: unknown, key?: string, collectionKey?: string): number {
  if (typeof value === 'string') {
    if (!value)
      return 0
    if (key && SECTION_IMAGE_FIELD_KEYS.has(key))
      return 1
    if (key === 'url' && collectionKey === 'images')
      return 1
    return 0
  }

  if (Array.isArray(value))
    return value.reduce((count, item) => count + countImagesInValue(item, undefined, key), 0)

  if (isRecord(value)) {
    return Object.entries(value).reduce(
      (count, [entryKey, entry]) => count + countImagesInValue(entry, entryKey, collectionKey),
      0,
    )
  }

  return 0
}

export function countSectionImages(section: unknown): number {
  return countImagesInValue(section)
}
