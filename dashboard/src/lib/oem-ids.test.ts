import { describe, expect, it } from 'vitest'

import { OEM_IDS } from './oem-ids'

describe('dashboard OEM IDs', () => {
  it('tracks the full built-in OEM set without duplicates', () => {
    expect(OEM_IDS).toHaveLength(19)
    expect(new Set(OEM_IDS).size).toBe(OEM_IDS.length)
    expect(OEM_IDS).toContain('renault-au')
  })
})
