import { describe, expect, it } from 'vitest'

import { isNissanModelShell } from './variant-visibility'

const nissanModels = [
  { id: 'patrol-model', oem_id: 'nissan-au', name: 'Patrol' },
  { id: 'xtrail-model', oem_id: 'nissan-au', name: 'NEW X-TRAIL' },
]

function product(overrides: Record<string, unknown> = {}) {
  return {
    oem_id: 'nissan-au',
    model_id: null,
    title: 'Patrol',
    subtitle: null,
    variant_name: null,
    variant_code: null,
    body_type: null,
    fuel_type: null,
    specs_json: null,
    key_features: null,
    ...overrides,
  }
}

describe('isNissanModelShell', () => {
  it('hides a legacy Nissan model shell even when model_id is null', () => {
    expect(isNissanModelShell(product(), nissanModels)).toBe(true)
  })

  it('hides a linked Nissan model shell whose title uses a launch prefix', () => {
    expect(isNissanModelShell(product({
      model_id: 'xtrail-model',
      title: 'All New X-Trail',
    }), nissanModels)).toBe(true)
  })

  it('keeps real Nissan variants', () => {
    expect(isNissanModelShell(product({
      model_id: 'patrol-model',
      variant_name: 'Ti-L',
      variant_code: '30170-ti-l',
      body_type: 'SUV',
      fuel_type: 'Petrol',
    }), nissanModels)).toBe(false)
  })

  it('does not hide products from another OEM', () => {
    expect(isNissanModelShell(product({ oem_id: 'ford-au' }), nissanModels)).toBe(false)
  })
})
