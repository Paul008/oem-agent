import { describe, expect, it } from 'vitest'

import { DEFAULT_CAPTURE_PROFILE, resolveCaptureProfile } from './capture-profiles'

describe('resolveCaptureProfile', () => {
  it('returns defaults for an OEM with no overrides', () => {
    const profile = resolveCaptureProfile('mazda-au')

    expect(profile).toEqual(DEFAULT_CAPTURE_PROFILE)
    expect(profile.backendOrder).toEqual(['cloudflare-browser'])
    expect(profile.featureAppShellSelectors).toEqual([])
    expect(profile.hydration.budgetMs).toBe(90_000)
    expect(profile.completeness.maxEmptyShells).toBe(0)
  })

  it('gives volkswagen-au feature-app shell selectors and a bigger hydration budget', () => {
    const profile = resolveCaptureProfile('volkswagen-au')

    expect(profile.featureAppShellSelectors).toContain('[class*="CmsFeatureAppLoader"]')
    expect(profile.featureAppShellSelectors).toContain('.featureAppSection')
    expect(profile.hydration.budgetMs).toBe(120_000)
    expect(profile.backendOrder).toEqual(['cloudflare-browser'])
  })

  it('gives toyota-au a scrapling-stealth escalation path', () => {
    const profile = resolveCaptureProfile('toyota-au')

    expect(profile.backendOrder).toEqual(['cloudflare-browser', 'scrapling-stealth'])
    expect(profile.hydration.budgetMs).toBe(90_000)
  })

  it('merges partial hydration overrides over defaults without mutating them', () => {
    const before = { ...DEFAULT_CAPTURE_PROFILE.hydration }
    resolveCaptureProfile('volkswagen-au')

    expect(DEFAULT_CAPTURE_PROFILE.hydration).toEqual(before)
  })
})
