export const PROTECTED_MODEL_PAGE_WRITE_OEM_IDS = ['foton-au', 'gac-au'] as const;

const protectedModelPageWriteOems = new Set<string>(PROTECTED_MODEL_PAGE_WRITE_OEM_IDS);

export function isModelPageWriteProtected(oemId: string | null | undefined): boolean {
  return typeof oemId === 'string' && protectedModelPageWriteOems.has(oemId);
}

export function getModelPageWriteProtectedMessage(oemId: string | null | undefined): string {
  return `${oemId ?? 'unknown OEM'} model pages are protected from admin writes`;
}
