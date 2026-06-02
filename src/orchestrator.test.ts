import { describe, expect, it } from 'vitest';
import { isOfferLikeSourceUrl } from './orchestrator';

describe('isOfferLikeSourceUrl', () => {
  it('matches offer and promotion source pages', () => {
    expect(isOfferLikeSourceUrl('https://cherymotor.com.au/buying/offers')).toBe(true);
    expect(isOfferLikeSourceUrl('https://example.com/special-offers/')).toBe(true);
    expect(isOfferLikeSourceUrl('/promotions/current')).toBe(true);
  });

  it('does not match model pages', () => {
    expect(isOfferLikeSourceUrl('https://cherymotor.com.au/models/tiggo-7')).toBe(false);
    expect(isOfferLikeSourceUrl('/models/off-road')).toBe(false);
  });
});
