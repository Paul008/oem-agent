export function shouldAttachSandboxForPath(pathname: string): boolean {
  if (pathname === '/media' || pathname.startsWith('/media/')) {
    return false;
  }

  if (/^\/api\/v1\/oem-agent\/pages\/[^/]+\/production-(html|manifest)$/.test(pathname)) {
    return false;
  }

  return true;
}
