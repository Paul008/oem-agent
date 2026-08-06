import { describe, expect, it, vi } from 'vitest';
import { buildOemExtractCrawlOptions } from './cron-options';

describe('buildOemExtractCrawlOptions', () => {
  it('passes the configured OEM allowlist into the scheduled orchestrator', () => {
    const onProgress = vi.fn();
    const oemIds = ['kia-au', 'nissan-au', 'gwm-au'];

    expect(buildOemExtractCrawlOptions(oemIds, 3, onProgress)).toEqual({
      oemIds,
      maxConcurrent: 3,
      onProgress,
    });
  });
});
