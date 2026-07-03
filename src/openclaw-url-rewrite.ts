const OPENCLAW_ROOT_FILES = new Set([
  'apple-touch-icon.png',
  'favicon-32.png',
  'favicon.svg',
  'manifest.webmanifest',
]);

export function rewriteOpenClawNestedAssetPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length < 2)
    return pathname;

  const [, openClawPath, ...rest] = parts;

  if (openClawPath === 'assets' || openClawPath === '__openclaw')
    return `/${[openClawPath, ...rest].join('/')}`;

  if (parts.length === 2 && OPENCLAW_ROOT_FILES.has(openClawPath))
    return `/${openClawPath}`;

  return pathname;
}

export function rewriteOpenClawNestedAssetRequest(request: Request): Request {
  const url = new URL(request.url);
  const rewrittenPath = rewriteOpenClawNestedAssetPath(url.pathname);
  if (rewrittenPath === url.pathname)
    return request;

  url.pathname = rewrittenPath;
  return new Request(url.toString(), request);
}
