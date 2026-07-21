export interface DealerPricingRow {
  price_type?: string | null;
  driveaway_vic?: number | null;
  driveaway_nsw?: number | null;
}

function positiveAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Resolve the legacy dealer driveaway display price without ever treating an
 * MLP/RRP amount as driveaway. A true regional row wins; a standard row is
 * accepted only when it contains an explicit state driveaway field.
 */
export function resolveDealerDriveawayAmount(rows: DealerPricingRow[]): number | null {
  for (const priceType of ['driveaway', 'standard']) {
    const row = rows.find(item => item.price_type === priceType);
    if (!row) continue;
    const amount = positiveAmount(row.driveaway_vic) ?? positiveAmount(row.driveaway_nsw);
    if (amount !== null) return amount;
  }
  return null;
}
