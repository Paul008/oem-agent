export function isProductionArtifactPath(pathname: string): boolean {
  return /^\/api\/v1\/oem-agent\/pages\/[^/]+\/production-(html|manifest)$/.test(pathname);
}

export function shouldAttachSandboxForPath(pathname: string): boolean {
  if (pathname === '/media' || pathname.startsWith('/media/')) {
    return false;
  }

  if (pathname === '/mcp' || pathname.startsWith('/mcp/')) {
    return false;
  }

  if (isProductionArtifactPath(pathname)) {
    return false;
  }

  return true;
}
