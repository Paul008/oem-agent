import { describe, expect, it } from 'vitest';
import { buildFordPriceFields } from './all-oem-sync';

describe('buildFordPriceFields', () => {
  it('uses incoming ADME price when present', () => {
    expect(buildFordPriceFields(72123.45, {
      price_amount: 65000,
      price_type: 'driveaway',
      price_raw_string: '$65,000 driveaway',
      price_qualifier: 'Ford RSC driveaway price',
    })).toEqual({
      price_amount: 72123.45,
      price_currency: 'AUD',
      price_type: 'driveaway',
      price_raw_string: '$72,123.45',
      price_qualifier: 'Ford ADME driveaway price',
    });
  });

  it('preserves existing price fields when ADME omits price', () => {
    expect(buildFordPriceFields(null, {
      price_amount: 153998.6,
      price_currency: 'AUD',
      price_type: 'driveaway',
      price_raw_string: '$153,999 driveaway',
      price_qualifier: 'Ford RSC driveaway price',
    })).toEqual({
      price_amount: 153998.6,
      price_currency: 'AUD',
      price_type: 'driveaway',
      price_raw_string: '$153,999 driveaway',
      price_qualifier: 'Ford RSC driveaway price',
    });
  });

  it('keeps Ford rows unpriced when neither source has a price', () => {
    expect(buildFordPriceFields(null, null)).toEqual({
      price_amount: null,
      price_currency: 'AUD',
      price_type: null,
      price_raw_string: null,
      price_qualifier: null,
    });
  });
});
