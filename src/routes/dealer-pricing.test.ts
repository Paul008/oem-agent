import { describe, expect, it } from 'vitest';
import { resolveDealerDriveawayAmount } from './dealer-pricing';

describe('resolveDealerDriveawayAmount', () => {
  it('never treats Nissan PACE MLP or RRP as driveaway', () => {
    expect(resolveDealerDriveawayAmount([
      { price_type: 'mlp' },
      { price_type: 'rrp' },
    ])).toBeNull();
  });

  it('prefers a regional Choices driveaway row', () => {
    expect(resolveDealerDriveawayAmount([
      { price_type: 'standard', driveaway_vic: 42_000 },
      { price_type: 'driveaway', driveaway_vic: 41_500 },
      { price_type: 'mlp' },
    ])).toBe(41_500);
  });

  it('accepts a legacy standard row only when it has an explicit state amount', () => {
    expect(resolveDealerDriveawayAmount([
      { price_type: 'standard', driveaway_nsw: 43_250 },
    ])).toBe(43_250);
    expect(resolveDealerDriveawayAmount([
      { price_type: 'standard' },
    ])).toBeNull();
  });
});
