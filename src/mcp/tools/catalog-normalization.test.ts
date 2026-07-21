import { describe, expect, it } from 'vitest';
import { selectEffectivePricingRow } from './catalog-normalization';

describe('selectEffectivePricingRow', () => {
  it('prefers regional driveaway while preserving separate MLP rows', () => {
    const rows = [
      { price_type: 'mlp', rrp: 35_100 },
      { price_type: 'driveaway', driveaway_vic: 39_990 },
    ];
    expect(selectEffectivePricingRow(rows)).toBe(rows[1]);
    expect(rows).toHaveLength(2);
  });

  it('falls back conservatively and handles no pricing', () => {
    expect(selectEffectivePricingRow([{ price_type: 'mlp', rrp: 35_100 }])).toEqual({
      price_type: 'mlp',
      rrp: 35_100,
    });
    expect(selectEffectivePricingRow([])).toBeNull();
  });
});
