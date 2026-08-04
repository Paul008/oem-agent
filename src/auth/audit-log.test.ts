import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import type { AppEnv } from '../types'
import {
  auditMiddleware,
  setPublicationAuditMetadata,
  writeImmutablePublicationTransitionAudit,
} from './audit-log'

class AuditBucket {
  readonly objects = new Map<string, string>()
  failPuts = false

  async get(key: string): Promise<any> {
    const body = this.objects.get(key)
    return body === undefined ? null : { text: async () => body }
  }

  async put(key: string, value: string, options?: R2PutOptions): Promise<any> {
    if (this.failPuts) throw new Error('audit unavailable')
    if (options?.onlyIf instanceof Headers
      && options.onlyIf.get('if-none-match') === '*'
      && this.objects.has(key)) return null
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

describe('immutable publication transition audit', () => {
  const record = {
    schema_version: 1 as const,
    intent_id: 'rollback-123',
    phase: 'intent' as const,
    timestamp: '2026-08-05T01:02:03.000Z',
    actor: 'rollback@test',
    page_id: 'nissan-au-ariya',
    target_revision: 21,
    expected_published_revision: 22,
    current_published_revision: 22,
  }

  it('writes each rollback audit phase to its own immutable object', async () => {
    const bucket = new AuditBucket()

    await writeImmutablePublicationTransitionAudit(bucket as unknown as R2Bucket, record)
    await writeImmutablePublicationTransitionAudit(bucket as unknown as R2Bucket, {
      ...record,
      phase: 'outcome',
      outcome: 'applied',
      resulting_published_revision: 21,
    })

    expect([...bucket.objects.keys()]).toEqual([
      'audit/publication-transitions/2026-08-05/rollback-123-intent.json',
      'audit/publication-transitions/2026-08-05/rollback-123-outcome.json',
    ])
  })

  it('rejects an overwrite instead of mutating a prior audit record', async () => {
    const bucket = new AuditBucket()
    await writeImmutablePublicationTransitionAudit(bucket as unknown as R2Bucket, record)

    await expect(writeImmutablePublicationTransitionAudit(bucket as unknown as R2Bucket, record))
      .rejects.toThrow('Publication transition audit record already exists')
    expect(bucket.objects.size).toBe(1)
  })
})
