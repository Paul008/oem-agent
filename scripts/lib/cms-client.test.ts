import { describe, expect, it, vi } from 'vitest';
import { createDraftPage, loginToCms } from './cms-client';

function loginResponse(setCookies: string[], ok = true, status = 200) {
  return {
    ok,
    status,
    headers: { getSetCookie: () => setCookies },
    text: async () => JSON.stringify({ success: ok }),
  } as unknown as Response;
}

describe('loginToCms', () => {
  it('captures auth_token and refresh_token cookies from Set-Cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse([
      'auth_token=abc123; Path=/; HttpOnly; SameSite=Lax',
      'refresh_token=def456; Path=/; HttpOnly',
    ]));
    const session = await loginToCms('http://localhost:3000', 'a@b.c', 'pw', fetchImpl as unknown as typeof fetch);
    expect(session.cookie).toBe('auth_token=abc123; refresh_token=def456');
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3000/api/auth/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.c', password: 'pw' }),
    }));
  });

  it('throws when login response has no auth_token cookie', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse(['other=1; Path=/']));
    await expect(loginToCms('http://x', 'a@b.c', 'pw', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/auth_token/);
  });

  it('throws with status on non-ok login', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(loginResponse([], false, 401));
    await expect(loginToCms('http://x', 'a@b.c', 'bad', fetchImpl as unknown as typeof fetch))
      .rejects.toThrow(/401/);
  });
});

describe('createDraftPage', () => {
  it('POSTs the draft with cookie header and status draft', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => JSON.stringify({ id: 7, slug: 'composed-rav4' }),
    } as unknown as Response);
    const result = await createDraftPage(
      { baseUrl: 'http://localhost:3000', cookie: 'auth_token=abc123' },
      { title: 'Composed RAV4', slug: 'composed-rav4', content: { version: 1 } },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({ id: 7, slug: 'composed-rav4' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/admin/pages');
    expect((init.headers as Record<string, string>).Cookie).toBe('auth_token=abc123');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Composed RAV4', slug: 'composed-rav4', status: 'draft', content: { version: 1 },
    });
  });

  it('throws with response body excerpt on failure', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false, status: 500, text: async () => 'relation "pages" does not exist',
    } as unknown as Response);
    await expect(createDraftPage(
      { baseUrl: 'http://x', cookie: 'auth_token=a' },
      { title: 'T', content: {} },
      fetchImpl as unknown as typeof fetch,
    )).rejects.toThrow(/500.*pages/s);
  });
});
