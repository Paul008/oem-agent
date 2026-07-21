import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationPath = 'supabase/migrations/20260721002000_nissan_catalog_lifecycle.sql';

describe('Nissan atomic catalog lifecycle migration', () => {
  it('records named promotion and rollback evidence with one promotion per model/run', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('create table if not exists nissan_catalog_promotions');
    expect(sql).toContain('source_run_id');
    expect(sql).toContain('reviewer_email');
    expect(sql).toContain('rollback_reviewer_email');
    expect(sql).toContain('unique (model_slug, source_run_id)');
    expect(sql).toContain('promoted_product_ids');
  });

  it('promotes model and products atomically only when every row is staged', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('create or replace function promote_nissan_catalog');
    expect(sql).toContain('for update');
    expect(sql).toContain("oem_id = 'nissan-au'");
    expect(sql).toContain("availability = 'staged'");
    expect(sql).toContain("availability = 'available'");
    expect(sql).toContain('p_expected_products');
    expect(sql).toContain('raise exception');
  });

  it('rolls back only the exact recorded product IDs and revokes public execution', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('create or replace function rollback_nissan_catalog');
    expect(sql).toContain('promoted_product_ids');
    expect(sql).toContain("availability = 'staged'");
    expect(sql).toContain('rolled_back_at is null');
    expect(sql).toContain('revoke all on function promote_nissan_catalog');
    expect(sql).toContain('revoke all on function rollback_nissan_catalog');
    expect(sql).toContain('grant execute on function promote_nissan_catalog');
    expect(sql).toContain('grant execute on function rollback_nissan_catalog');
    expect(sql).not.toContain('adus.com.au');
    expect(sql).not.toContain('nissan-adme');
  });
});
