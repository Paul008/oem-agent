/** OEMs whose catalog/pricing may only be written by a dedicated official connector. */
export const OFFICIAL_CONNECTOR_ONLY_OEM_IDS = ['nissan-au'] as const;

const officialConnectorOnlyOems = new Set<string>(OFFICIAL_CONNECTOR_ONLY_OEM_IDS);

export function requiresDedicatedOfficialConnector(oemId: string): boolean {
  return officialConnectorOnlyOems.has(oemId);
}
