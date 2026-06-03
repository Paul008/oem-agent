import { describe, expect, it } from 'vitest';
import { isOfferLikeSourceUrl, shouldSkipCrawlerProductWrites } from './orchestrator';

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

describe('shouldSkipCrawlerProductWrites', () => {
  it('protects OEMs whose products are owned by curated feed syncs', () => {
    expect(shouldSkipCrawlerProductWrites('mazda-au')).toBe(true);
    expect(shouldSkipCrawlerProductWrites('chery-au')).toBe(true);
    expect(shouldSkipCrawlerProductWrites('ford-au')).toBe(true);
    expect(shouldSkipCrawlerProductWrites('gac-au')).toBe(true);
  });

  it('continues allowing generic product extraction for other OEMs', () => {
    expect(shouldSkipCrawlerProductWrites('toyota-au')).toBe(false);
    expect(shouldSkipCrawlerProductWrites('renault-au')).toBe(false);
  });
});
