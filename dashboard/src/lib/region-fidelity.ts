export type RegionFidelityStatus = 'pixel-perfect' | 'review' | 'mismatch'

export interface RegionPixelComparison {
  comparedPixels: number
  differentPixels: number
  mismatchRatio: number
  status: RegionFidelityStatus
}

export function classifyRegionFidelity(mismatchRatio: number): RegionFidelityStatus {
  if (!Number.isFinite(mismatchRatio) || mismatchRatio < 0)
    return 'mismatch'
  if (mismatchRatio <= 0.01)
    return 'pixel-perfect'
  if (mismatchRatio <= 0.03)
    return 'review'
  return 'mismatch'
}

export function compareRegionPixels(
  reference: Uint8ClampedArray,
  candidate: Uint8ClampedArray,
  channelThreshold = 0.1,
): RegionPixelComparison {
  if (reference.length !== candidate.length || reference.length === 0 || reference.length % 4 !== 0) {
    return {
      comparedPixels: 0,
      differentPixels: 0,
      mismatchRatio: 1,
      status: 'mismatch',
    }
  }

  const limit = Math.round(Math.min(1, Math.max(0, channelThreshold)) * 255)
  let differentPixels = 0
  for (let index = 0; index < reference.length; index += 4) {
    const delta = Math.max(
      Math.abs(reference[index] - candidate[index]),
      Math.abs(reference[index + 1] - candidate[index + 1]),
      Math.abs(reference[index + 2] - candidate[index + 2]),
      Math.abs(reference[index + 3] - candidate[index + 3]),
    )
    if (delta > limit)
      differentPixels += 1
  }

  const comparedPixels = reference.length / 4
  const mismatchRatio = differentPixels / comparedPixels
  return {
    comparedPixels,
    differentPixels,
    mismatchRatio,
    status: classifyRegionFidelity(mismatchRatio),
  }
}
