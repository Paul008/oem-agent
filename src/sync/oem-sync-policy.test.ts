import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_CONNECTOR_ONLY_OEM_IDS,
  requiresDedicatedOfficialConnector,
} from './oem-sync-policy';
import { GENERIC_PRICING_OEM_IDS } from './all-oem-sync';

describe('official connector sync policy', () => {
  it('reserves Nissan for its dedicated official connector', () => {
    expect(OFFICIAL_CONNECTOR_ONLY_OEM_IDS).toContain('nissan-au');
    expect(requiresDedicatedOfficialConnector('nissan-au')).toBe(true);
    expect(GENERIC_PRICING_OEM_IDS).not.toContain('nissan-au');
  });

  it('does not block unrelated OEM crawls', () => {
    expect(requiresDedicatedOfficialConnector('gac-au')).toBe(false);
  });
});
