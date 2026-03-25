import { describe, it, expect } from 'vitest';
import { CrawlScheduler } from './scheduler';
import type { SourcePage } from '../oem/types';

function makePage(overrides: Partial<SourcePage> = {}): SourcePage {
  return {
    id: 'test-page-1',
    oem_id: 'kia-au',
    url: 'https://www.kia.com/au/',
    page_type: 'homepage',
    status: 'active',
    last_checked_at: null,
    last_changed_at: null,
    last_rendered_at: null,
    last_hash: null,
    last_rendered_hash: null,
    consecutive_no_change: 0,
    error_message: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as SourcePage;
}

describe('CrawlScheduler', () => {
  const scheduler = new CrawlScheduler();

  describe('shouldCrawl', () => {
    it('returns true for pages never checked', () => {
      const page = makePage({ last_checked_at: null });
      const result = scheduler.shouldCrawl(page);
      expect(result.shouldCrawl).toBe(true);
    });

    it('returns false if checked too recently', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const page = makePage({ last_checked_at: fiveMinAgo, page_type: 'homepage' });
      const result = scheduler.shouldCrawl(page);
      expect(result.shouldCrawl).toBe(false);
      expect(result.reason).toContain('Too soon');
    });

    it('returns true if enough time has passed', () => {
      const threeHoursAgo = new Date(Date.now() - 180 * 60 * 1000).toISOString();
      const page = makePage({ last_checked_at: threeHoursAgo, page_type: 'homepage' }); // 120min interval
      const result = scheduler.shouldCrawl(page);
      expect(result.shouldCrawl).toBe(true);
    });

    it('applies backoff for pages with many consecutive no-changes', () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      // homepage interval = 120min, backoffAfterDays=7, so threshold = 7 * (1440/120) = 84
      const page = makePage({
        last_checked_at: oneHourAgo,
        page_type: 'homepage',
        consecutive_no_change: 100, // above threshold
      });
      const result = scheduler.shouldCrawl(page);
      // With backoff, effective interval doubles, so 1 hour is still too soon
      expect(result.shouldCrawl).toBe(false);
    });
  });

  describe('shouldRender', () => {
    it('skips render when hash unchanged (even for requiresBrowserRendering OEMs)', () => {
      const page = makePage({
        oem_id: 'kia-au', // requiresBrowserRendering: false now
        last_hash: 'abc123',
        last_rendered_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      });
      const result = scheduler.shouldRender(page, 'abc123');
      expect(result.shouldRender).toBe(false);
      expect(result.reason).toContain('hash unchanged');
    });

    it('renders when hash changed', () => {
      const page = makePage({
        last_hash: 'old-hash',
        last_rendered_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      });
      const result = scheduler.shouldRender(page, 'new-hash');
      expect(result.shouldRender).toBe(true);
    });

    it('renders pages that have never been rendered', () => {
      const page = makePage({ last_rendered_at: null, last_hash: null });
      const result = scheduler.shouldRender(page, 'some-hash');
      expect(result.shouldRender).toBe(true);
      expect(result.reason).toContain('never been rendered');
    });

    it('respects render rate limit', () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const page = makePage({
        last_rendered_at: thirtyMinAgo, // within 120min limit
        last_hash: 'old',
      });
      const result = scheduler.shouldRender(page, 'new-hash');
      expect(result.shouldRender).toBe(false);
      expect(result.reason).toContain('Render rate limit');
    });

    it('renders when hash is null (first time)', () => {
      const page = makePage({
        last_hash: null,
        last_rendered_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      });
      const result = scheduler.shouldRender(page, 'any-hash');
      // last_hash is null, so hash check passes (null && ... = false), goes to "never rendered" or OEM check
      expect(result.shouldRender).toBe(true);
    });
  });

  describe('updateAfterCrawl', () => {
    it('stores the HTML hash', () => {
      const page = makePage();
      const updates = scheduler.updateAfterCrawl(page, false, false, undefined, 'new-hash-123');
      expect(updates.last_hash).toBe('new-hash-123');
    });

    it('resets consecutive_no_change when HTML changed', () => {
      const page = makePage({ consecutive_no_change: 10 });
      const updates = scheduler.updateAfterCrawl(page, true, false);
      expect(updates.consecutive_no_change).toBe(0);
      expect(updates.last_changed_at).toBeDefined();
    });

    it('increments consecutive_no_change when unchanged', () => {
      const page = makePage({ consecutive_no_change: 5 });
      const updates = scheduler.updateAfterCrawl(page, false, false);
      expect(updates.consecutive_no_change).toBe(6);
    });

    it('sets last_rendered_at when rendered', () => {
      const page = makePage();
      const updates = scheduler.updateAfterCrawl(page, false, true);
      expect(updates.last_rendered_at).toBeDefined();
    });
  });
});
