export const OEM_IDS = [
  'chery-au',
  'ford-au',
  'foton-au',
  'gac-au',
  'gmsv-au',
  'gwm-au',
  'hyundai-au',
  'isuzu-au',
  'kia-au',
  'kgm-au',
  'ldv-au',
  'mazda-au',
  'mitsubishi-au',
  'nissan-au',
  'renault-au',
  'subaru-au',
  'suzuki-au',
  'toyota-au',
  'volkswagen-au',
] as const

export type OemId = typeof OEM_IDS[number]

export const PROTECTED_MODEL_PAGE_WRITE_OEM_IDS = ['foton-au', 'gac-au'] as const

export function isModelPageWriteProtected(oemId: string | null | undefined): boolean {
  return PROTECTED_MODEL_PAGE_WRITE_OEM_IDS.includes(oemId as typeof PROTECTED_MODEL_PAGE_WRITE_OEM_IDS[number])
}

export function getModelPageWriteProtectedMessage(oemNameOrId: string): string {
  return `${oemNameOrId} model pages are protected from dashboard writes`
}
