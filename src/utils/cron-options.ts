export function buildOemExtractCrawlOptions<T>(
  oemIds: string[],
  maxConcurrent: number,
  onProgress?: T,
): { oemIds: string[]; maxConcurrent: number; onProgress?: T } {
  return { oemIds, maxConcurrent, onProgress };
}
