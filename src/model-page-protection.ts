export const PROTECTED_MODEL_PAGE_WRITE_OEM_IDS = ['foton-au', 'gac-au', 'nissan-au'] as const;

const protectedModelPageWriteOems = new Set<string>(PROTECTED_MODEL_PAGE_WRITE_OEM_IDS);
const nissanReviewCandidateSlug = /^[a-z0-9][a-z0-9-]*--candidate-[a-z0-9][a-z0-9-]{0,80}$/;

export function isModelPageWriteProtected(
  oemId: string | null | undefined,
  modelSlug?: string | null,
): boolean {
  if (typeof oemId !== 'string' || !protectedModelPageWriteOems.has(oemId)) return false;
  if (oemId === 'nissan-au' && modelSlug && nissanReviewCandidateSlug.test(modelSlug)) return false;
  return true;
}

export function getModelPageWriteProtectedMessage(oemId: string | null | undefined): string {
  return `${oemId ?? 'unknown OEM'} model pages are protected from admin writes`;
}
