/**
 * Cloudflare Pages Function — proxies FIL S3 assets so the browser can save
 * them (S3 has no CORS) and streams a ZIP for multi-asset packs.
 *
 * Routes:
 *   GET /dam/download?url=<cdn_url>&name=<filename>
 *       → streams a single file with Content-Disposition: attachment
 *
 *   POST /dam/download?zip=1&packName=<name>
 *        body: { assets: [{ url, name }, ...] }
 *       → streams a single ZIP containing every asset
 *
 * Security: only URLs under fil-filestor-storage-au (public FIL S3 bucket)
 * are proxied, so this can't be used as an open proxy.
 */
import { downloadZip } from 'client-zip'

const ALLOWED_HOSTS = new Set([
  's3-ap-southeast-2.amazonaws.com',
  's3.ap-southeast-2.amazonaws.com',
])
const ALLOWED_PATH_PREFIX = '/fil-filestor-storage-au/'

function isAllowed(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    return ALLOWED_HOSTS.has(u.hostname) && u.pathname.startsWith(ALLOWED_PATH_PREFIX)
  }
  catch {
    return false
  }
}

function asciiFilename(name: string): string {
  // Content-Disposition must be ASCII — strip anything non-safe.
  return name.replace(/[^\w.\- ]+/g, '_').slice(0, 200) || 'asset'
}

async function handleSingle(url: string, name: string): Promise<Response> {
  if (!isAllowed(url)) return new Response('Disallowed URL', { status: 400 })

  const upstream = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } })
  if (!upstream.ok) return new Response('Upstream error', { status: upstream.status })

  const filename = asciiFilename(name || url.split('/').pop() || 'asset')
  const h = new Headers(upstream.headers)
  h.set('Content-Disposition', `attachment; filename="${filename}"`)
  h.set('Access-Control-Allow-Origin', '*')
  h.delete('content-security-policy')
  h.delete('x-frame-options')

  return new Response(upstream.body, { status: 200, headers: h })
}

async function handleZip(assets: { url: string; name: string }[], packName: string): Promise<Response> {
  const valid = assets.filter(a => isAllowed(a.url))
  if (valid.length === 0) return new Response('No valid assets', { status: 400 })

  // Stream via an async generator so client-zip's single-pass consumer can
  // pull one file's bytes at a time without buffering the whole pack.
  async function* gen() {
    for (const a of valid) {
      const r = await fetch(a.url, { cf: { cacheTtl: 3600, cacheEverything: true } })
      if (!r.ok || !r.body) continue
      yield { name: asciiFilename(a.name), lastModified: new Date(), input: r }
    }
  }

  const zipResponse = downloadZip(gen())
  const filename = asciiFilename(packName || 'ford-fil-pack') + '.zip'

  // Pass the client-zip response body straight through. Copy only the
  // transfer-related headers we care about to avoid clobbering its stream.
  return new Response(zipResponse.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    },
  })
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const u = new URL(request.url)
  const target = u.searchParams.get('url')
  const name = u.searchParams.get('name') || ''
  if (!target) return new Response('Missing ?url', { status: 400 })
  return handleSingle(target, name)
}

export const onRequestPost: PagesFunction = async ({ request }) => {
  const u = new URL(request.url)
  if (u.searchParams.get('zip') !== '1') return new Response('Missing ?zip=1', { status: 400 })
  const packName = u.searchParams.get('packName') || 'ford-fil-pack'

  let body: { assets: { url: string; name: string }[] }
  try {
    body = await request.json()
  }
  catch {
    return new Response('Invalid JSON body', { status: 400 })
  }
  if (!Array.isArray(body?.assets) || body.assets.length === 0) {
    return new Response('Empty assets[]', { status: 400 })
  }
  if (body.assets.length > 500) {
    return new Response('Pack limit is 500 assets', { status: 413 })
  }
  return handleZip(body.assets, packName)
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600',
    },
  })
