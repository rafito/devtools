import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'
import crypto from 'node:crypto'
import { createSentryWebhookHandler } from '../../src/webhooks/sentry'

const SECRET = 'shh'

function makeDeps() {
  const inserted: any[] = []
  const db = {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          const t = { id: 'ticket-1' }
          inserted.push(t)
          return Promise.resolve([t])
        }),
      }),
    }),
  }
  const queue = { enqueueTier2: vi.fn().mockResolvedValue('job-1') } as any
  const schema = { supportTickets: {} } as any
  return { db, queue, schema, inserted }
}

function makeApp(deps: any) {
  const app = express()
  const handler = createSentryWebhookHandler({
    db: deps.db, schema: deps.schema, queue: deps.queue,
    webhookSecret: SECRET, projectSlug: 'facefutura',
  })
  app.post('/wh', express.raw({ type: 'application/json' }), handler)
  return app
}

function sig(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('createSentryWebhookHandler', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => { deps = makeDeps() })

  it('webhookSecret vazio lança', () => {
    expect(() => createSentryWebhookHandler({
      db: {}, schema: {} as any, queue: {} as any,
      webhookSecret: '', projectSlug: 'p',
    })).toThrow(/webhookSecret/)
  })

  it('projectSlug vazio lança', () => {
    expect(() => createSentryWebhookHandler({
      db: {}, schema: {} as any, queue: {} as any,
      webhookSecret: 's', projectSlug: '',
    })).toThrow(/projectSlug/)
  })

  it('sem assinatura → 401', async () => {
    const app = makeApp(deps)
    const r = await request(app).post('/wh').send({ action: 'created' })
    expect(r.status).toBe(401)
  })

  it('assinatura inválida → 401', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'created' })
    const r = await request(app).post('/wh')
      .set('sentry-hook-signature', 'xx')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(401)
  })

  it('action != created → 200 handled:false', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'resolved' })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('project.slug diferente → 200 handled:false', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: { issue: { id: '1', title: 't', project: { slug: 'outro' } } },
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('issue.created válido → cria ticket + enfileira Tier 2 + 200 handled:true', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: { issue: {
        id: 'sentry-abc', title: 'TypeError', culprit: 'a.ts',
        permalink: 'https://sentry/x', project: { slug: 'facefutura' },
      }},
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(true)
    expect(r.body.ticketId).toBe('ticket-1')
    expect(deps.queue.enqueueTier2).toHaveBeenCalledWith('ticket-1')
    expect(deps.db.insert).toHaveBeenCalled()
  })
})
