import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../types'
import { auditMiddleware, setPublicationAuditMetadata } from './audit-log'

class AuditBucket {
  readonly objects = new Map<string, string>()

  async get(key: string): Promise<any> {
    const body = this.objects.get(key)
    return body === undefined ? null : { text: async () => body }
  }

  async put(key: string, value: string): Promise<any> {
    this.objects.set(key, value)
    return { key, etag: 'audit-etag' }
  }
}

async function settleAudit(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('audit middleware publication metadata', () => {
  it('uses the authenticated accessUser and appends typed publication metadata once', async () => {
    const bucket = new AuditBucket()
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('accessUser', { email: 'publisher@test', name: 'Publisher' })
      await next()
    })
    app.use('*', auditMiddleware())
    app.post('/admin/model-pages/nissan-au-ariya/publication/publish', (c) => {
      setPublicationAuditMetadata(c, {
        page_id: 'nissan-au-ariya',
        draft_revision: 24,
        candidate_revision: 25,
        published_revision: 25,
        action: 'publication.publish',
      })
      return c.json({ ok: true })
    })

    const response = await app.request(
      'https://admin.test/admin/model-pages/nissan-au-ariya/publication/publish',
      { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.7' } },
      { MOLTBOT_BUCKET: bucket as unknown as R2Bucket } as AppEnv['Bindings'],
    )
    await settleAudit()

    expect(response.status).toBe(200)
    const lines = [...bucket.objects.values()].flatMap(value => value.split('\n'))
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0])).toMatchObject({
      user: 'publisher@test',
      page_id: 'nissan-au-ariya',
      draft_revision: 24,
      candidate_revision: 25,
      published_revision: 25,
      action: 'publication.publish',
      status: 200,
      ip: '203.0.113.7',
    })
  })

  it('does not attach publication fields when a route sets no publication metadata', async () => {
    const bucket = new AuditBucket()
    const app = new Hono<AppEnv>()
    app.use('*', async (c, next) => {
      c.set('accessUser', { email: 'editor@test' })
      await next()
    })
    app.use('*', auditMiddleware())
    app.put('/admin/settings', c => c.json({ ok: true }))

    await app.request(
      'https://admin.test/admin/settings',
      { method: 'PUT' },
      { MOLTBOT_BUCKET: bucket as unknown as R2Bucket } as AppEnv['Bindings'],
    )
    await settleAudit()

    const entry = JSON.parse([...bucket.objects.values()][0])
    expect(entry.user).toBe('editor@test')
    expect(entry).not.toHaveProperty('page_id')
    expect(entry).not.toHaveProperty('action')
  })
})
