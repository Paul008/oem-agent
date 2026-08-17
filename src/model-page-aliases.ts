const MODEL_PAGE_READ_ALIASES: Readonly<Record<string, string>> = {
  'nissan-au-navara': 'nissan-au-all-new-navara',
  'nissan-au-x-trail': 'nissan-au-new-x-trail',
};

export function resolveModelPageReadAlias(pageSlug: string): string {
  return MODEL_PAGE_READ_ALIASES[pageSlug] || pageSlug;
}
