import { beforeEach, describe, expect, it } from 'vitest';
import { mountR2Storage } from './r2';
import { createMockEnv, createMockProcess, createMockSandbox, suppressConsole } from '../test-utils';

describe('mountR2Storage', () => {
  beforeEach(() => {
    suppressConsole();
  });

  it('mounts the MOLTBOT_BUCKET binding without credentials in deployed mode', async () => {
    const { sandbox, mountBucketMock } = createMockSandbox({ mounted: false });
    const env = createMockEnv({
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
      CF_ACCOUNT_ID: undefined,
    });

    const result = await mountR2Storage(sandbox, env);

    expect(result).toBe(true);
    expect(mountBucketMock).toHaveBeenCalledWith('MOLTBOT_BUCKET', '/data/moltbot', {});
  });

  it('uses the SDK local bucket mode only when explicitly enabled', async () => {
    const { sandbox, mountBucketMock } = createMockSandbox({ mounted: false });
    const env = createMockEnv({ LOCAL_R2_MOUNT: 'true' });

    const result = await mountR2Storage(sandbox, env);

    expect(result).toBe(true);
    expect(mountBucketMock).toHaveBeenCalledWith('MOLTBOT_BUCKET', '/data/moltbot', {
      localBucket: true,
    });
  });

  it('returns false without attempting a mount when the binding is unavailable', async () => {
    const { sandbox, mountBucketMock } = createMockSandbox({ mounted: false });
    const env = createMockEnv({ MOLTBOT_BUCKET: undefined as unknown as R2Bucket });

    const result = await mountR2Storage(sandbox, env);

    expect(result).toBe(false);
    expect(mountBucketMock).not.toHaveBeenCalled();
  });

  it('returns true without remounting when the mount already exists', async () => {
    const { sandbox, mountBucketMock } = createMockSandbox({ mounted: true });

    const result = await mountR2Storage(sandbox, createMockEnv());

    expect(result).toBe(true);
    expect(mountBucketMock).not.toHaveBeenCalled();
  });

  it('fails safely when the SDK mount throws and the path remains unmounted', async () => {
    const { sandbox, mountBucketMock, startProcessMock } = createMockSandbox({ mounted: false });
    mountBucketMock.mockRejectedValue(new Error('Mount failed'));
    startProcessMock
      .mockResolvedValueOnce(createMockProcess(''))
      .mockResolvedValueOnce(createMockProcess(''));

    const result = await mountR2Storage(sandbox, createMockEnv());

    expect(result).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Failed to mount R2 bucket:', expect.any(Error));
  });

  it('accepts a successful concurrent mount reported after an SDK error', async () => {
    const { sandbox, mountBucketMock, startProcessMock } = createMockSandbox({ mounted: false });
    mountBucketMock.mockRejectedValue(new Error('Already mounted'));
    startProcessMock
      .mockResolvedValueOnce(createMockProcess(''))
      .mockResolvedValueOnce(createMockProcess('moltbot on /data/moltbot type fuse\n'));

    const result = await mountR2Storage(sandbox, createMockEnv());

    expect(result).toBe(true);
  });
});
