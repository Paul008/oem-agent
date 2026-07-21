export interface McpPricingRow {
  price_type?: string | null;
  [key: string]: unknown;
}

/** Select display metadata without collapsing the full pricing row set. */
export function selectEffectivePricingRow<T extends McpPricingRow>(rows: T[]): T | null {
  for (const priceType of ['driveaway', 'standard', 'rrp', 'mlp']) {
    const row = rows.find(item => item.price_type === priceType);
    if (row) return row;
  }
  return rows[0] || null;
}
