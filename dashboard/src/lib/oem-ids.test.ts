import { describe, expect, it } from 'vitest'

import { OEM_IDS, isModelPageWriteProtected } from './oem-ids'

describe('dashboard OEM IDs', () => {
  it('tracks the full built-in OEM set without duplicates', () => {
    expect(OEM_IDS).toHaveLength(19)
    expect(new Set(OEM_IDS).size).toBe(OEM_IDS.length)
    expect(OEM_IDS).toContain('renault-au')
  })

  it('marks live website OEM model pages as dashboard-write protected', () => {
    expect(isModelPageWriteProtected('gac-au')).toBe(true)
    expect(isModelPageWriteProtected('foton-au')).toBe(true)
    expect(isModelPageWriteProtected('ford-au')).toBe(false)
  })
})
