export type CmsSession = { baseUrl: string; cookie: string };

export async function loginToCms(
  baseUrl: string,
  email: string,
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CmsSession> {
  const response = await fetchImpl(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CMS login failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const setCookies: string[] =
    (response.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  const cookie = setCookies
    .map((entry) => entry.split(';')[0].trim())
    .filter((pair) => pair.startsWith('auth_token=') || pair.startsWith('refresh_token='))
    .join('; ');
  if (!cookie.includes('auth_token=')) {
    throw new Error('CMS login succeeded but no auth_token cookie was set');
  }
  return { baseUrl, cookie };
}

export async function createDraftPage(
  session: CmsSession,
  input: { title: string; slug?: string; content: unknown },
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, unknown>> {
  const response = await fetchImpl(`${session.baseUrl}/api/admin/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
    body: JSON.stringify({
      title: input.title,
      slug: input.slug,
      status: 'draft',
      content: input.content,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`CMS draft create failed: ${response.status} ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}
