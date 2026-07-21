import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260721003000_nissan_offer_lifecycle.sql';

describe('Nissan offer lifecycle migration', () => {
  it('keeps existing OEM offers active while adding staged/retired lifecycle states', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain("add column if not exists lifecycle_status text not null default 'active'");
    expect(sql).toContain("check (lifecycle_status in ('staged', 'active', 'retired'))");
    expect(sql).toContain('add column if not exists source_run_id text');
  });

  it('atomically promotes a non-empty exact staged run and retires the prior active set', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('create or replace function promote_nissan_offers');
    expect(sql).toContain("lifecycle_status = 'staged'");
    expect(sql).toContain("lifecycle_status = 'active'");
    expect(sql).toContain("lifecycle_status = 'retired'");
    expect(sql).toContain('p_expected_offers');
    expect(sql).toContain('for update');
    expect(sql).toContain('nissan_offer_promotions');
  });

  it('restores exact previous statuses on rollback and exposes RPCs only to service_role', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('create or replace function rollback_nissan_offers');
    expect(sql).toContain('previous_offer_states');
    expect(sql).toContain('promoted_offer_ids');
    expect(sql).toContain('revoke all on function promote_nissan_offers');
    expect(sql).toContain('revoke all on function rollback_nissan_offers');
    expect(sql).toContain('grant execute on function promote_nissan_offers');
    expect(sql).toContain('grant execute on function rollback_nissan_offers');
  });
});
