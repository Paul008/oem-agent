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
