import crypto from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSentryWebhookHandler } from '../../src/webhooks/sentry'

const SECRET = 'shh'

function makeDeps() {
  const repositories = {
    tickets: {
      findById: vi.fn(),
      findByGithubIssueId: vi.fn(),
      findByGithubPrId: vi.fn(),
      admitSentryTicket: vi.fn().mockResolvedValue({
        kind: 'created',
        ticket: { id: 'ticket-1', status: 'open' },
      }),
      create: vi.fn().mockResolvedValue({ id: 'ticket-1' }),
      update: vi.fn(),
    },
    conversations: {
      findById: vi.fn(),
      findMessages: vi.fn(),
      create: vi.fn(),
      appendMessage: vi.fn(),
    },
  }
  const queue = { enqueueTier2: vi.fn().mockResolvedValue('job-1') } as any
  return { repositories, queue }
}

function makeApp(
  deps: ReturnType<typeof makeDeps>,
  overrides: Partial<{
    ingestEnabled: boolean
    dailyTicketLimit: number
    ignoredTitlePatterns: string[]
  }> = {}
) {
  const app = express()
  const handler = createSentryWebhookHandler({
    repositories: deps.repositories as any,
    queue: deps.queue,
    webhookSecret: SECRET,
    projectSlug: 'facefutura',
    ...overrides,
  })
  app.post('/wh', express.raw({ type: 'application/json' }), handler)
  return app
}

function sig(body: string): string {
  return crypto.createHmac('sha256', SECRET).update(body).digest('hex')
}

describe('createSentryWebhookHandler', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('webhookSecret vazio lança', () => {
    expect(() =>
      createSentryWebhookHandler({
        db: {},
        schema: {} as any,
        queue: {} as any,
        webhookSecret: '',
        projectSlug: 'p',
      })
    ).toThrow(/webhookSecret/)
  })

  it('projectSlug vazio lança', () => {
    expect(() =>
      createSentryWebhookHandler({
        db: {},
        schema: {} as any,
        queue: {} as any,
        webhookSecret: 's',
        projectSlug: '',
      })
    ).toThrow(/projectSlug/)
  })

  it('sem assinatura → 401', async () => {
    const app = makeApp(deps)
    const r = await request(app).post('/wh').send({ action: 'created' })
    expect(r.status).toBe(401)
  })

  it('assinatura inválida → 401', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'created' })
    const r = await request(app)
      .post('/wh')
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
      data: {
        issue: {
          id: 'sentry-abc',
          title: 'TypeError',
          culprit: 'a.ts',
          permalink: 'https://sentry/x',
          project: { slug: 'facefutura' },
        },
      },
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
    expect(deps.repositories.tickets.admitSentryTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: expect.objectContaining({ sentryIssueId: 'sentry-abc', source: 'sentry' }),
      })
    )
  })

  it('ingest disabled acknowledges the webhook without creating a ticket', async () => {
    const app = makeApp(deps, { ingestEnabled: false })
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 'sentry-1', title: 'TypeError', project: { slug: 'facefutura' } },
      },
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({
      received: true,
      handled: false,
      reason: 'sentry_ingest_disabled',
    })
    expect(deps.repositories.tickets.admitSentryTicket).not.toHaveBeenCalled()
    expect(deps.queue.enqueueTier2).not.toHaveBeenCalled()
  })

  it('deduplicates exact Sentry issue IDs through persistent repositories', async () => {
    deps.repositories.tickets.admitSentryTicket.mockResolvedValue({
      kind: 'duplicate',
      ticket: { id: 'existing-ticket', status: 'open' },
    })
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 123, title: 'TypeError', project: { slug: 'facefutura' } },
      },
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(deps.repositories.tickets.admitSentryTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket: expect.objectContaining({ sentryIssueId: '123' }),
      })
    )
    expect(r.body).toMatchObject({
      received: true,
      handled: false,
      reason: 'duplicate_sentry_issue',
      ticketId: 'existing-ticket',
    })
  })

  it('ignores title patterns using case-insensitive substring matching', async () => {
    const app = makeApp(deps, { ignoredTitlePatterns: ['Circuit Breaker', 'throttle'] })
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: {
          id: 'sentry-2',
          title: 'Expected CIRCUIT BREAKER opened for database',
          project: { slug: 'facefutura' },
        },
      },
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(r.body).toMatchObject({
      received: true,
      handled: false,
      reason: 'ignored_sentry_title',
    })
    expect(deps.repositories.tickets.admitSentryTicket).not.toHaveBeenCalled()
  })

  it('enforces the persistent Sentry ticket limit for the current UTC day', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-25T18:30:00.000Z'))
    deps.repositories.tickets.admitSentryTicket.mockResolvedValue({ kind: 'daily_limit', count: 5 })
    const app = makeApp(deps, { dailyTicketLimit: 5 })
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 'sentry-3', title: 'New failure', project: { slug: 'facefutura' } },
      },
    })
    const r = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(deps.repositories.tickets.admitSentryTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        dailyTicketLimit: 5,
        utcDayStart: new Date('2026-08-25T00:00:00.000Z'),
        utcDayEnd: new Date('2026-08-26T00:00:00.000Z'),
      })
    )
    expect(r.body).toMatchObject({
      received: true,
      handled: false,
      reason: 'sentry_daily_ticket_limit_reached',
      limit: 5,
    })
  })

  it('enqueues exactly once when concurrent deliveries race for the same Sentry issue', async () => {
    let admitted = false
    let tail = Promise.resolve()
    deps.repositories.tickets.admitSentryTicket.mockImplementation(async () => {
      const previous = tail
      let releaseCurrent: () => void = () => undefined
      tail = new Promise<void>((resolve) => {
        releaseCurrent = resolve
      })
      await previous
      try {
        if (admitted) return { kind: 'duplicate', ticket: { id: 'ticket-1', status: 'open' } }
        await Promise.resolve()
        admitted = true
        return { kind: 'created', ticket: { id: 'ticket-1', status: 'open' } }
      } finally {
        releaseCurrent()
      }
    })
    deps.queue.enqueueTier2.mockResolvedValueOnce('job-1').mockResolvedValueOnce(null)
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 'sentry-race', title: 'TypeError', project: { slug: 'facefutura' } },
      },
    })

    const [first, second] = await Promise.all([
      request(app)
        .post('/wh')
        .set('sentry-hook-signature', sig(body))
        .set('Content-Type', 'application/json')
        .send(body),
      request(app)
        .post('/wh')
        .set('sentry-hook-signature', sig(body))
        .set('Content-Type', 'application/json')
        .send(body),
    ])

    expect([first.body.handled, second.body.handled].sort()).toEqual([false, true])
    expect(deps.repositories.tickets.admitSentryTicket).toHaveBeenCalledTimes(2)
    expect(deps.queue.enqueueTier2).toHaveBeenCalledTimes(2)
  })

  it('repairs a persisted ticket when the first Tier 2 enqueue fails', async () => {
    deps.repositories.tickets.admitSentryTicket
      .mockResolvedValueOnce({ kind: 'created', ticket: { id: 'ticket-1', status: 'open' } })
      .mockResolvedValueOnce({ kind: 'duplicate', ticket: { id: 'ticket-1', status: 'open' } })
    deps.queue.enqueueTier2
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockResolvedValueOnce('job-1')
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 'sentry-retry', title: 'TypeError', project: { slug: 'facefutura' } },
      },
    })

    const first = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)
    const retry = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(first.status).toBe(500)
    expect(retry.status).toBe(200)
    expect(retry.body).toMatchObject({
      handled: false,
      reason: 'duplicate_sentry_issue',
      ticketId: 'ticket-1',
    })
    expect(deps.queue.enqueueTier2).toHaveBeenCalledTimes(2)
  })

  it('does not re-enqueue a duplicate ticket after Tier 2 has completed', async () => {
    deps.repositories.tickets.admitSentryTicket.mockResolvedValue({
      kind: 'duplicate',
      ticket: { id: 'ticket-complete', status: 'investigating' },
    })
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'created',
      data: {
        issue: { id: 'sentry-done', title: 'TypeError', project: { slug: 'facefutura' } },
      },
    })

    const response = await request(app)
      .post('/wh')
      .set('sentry-hook-signature', sig(body))
      .set('Content-Type', 'application/json')
      .send(body)

    expect(response.status).toBe(200)
    expect(deps.queue.enqueueTier2).not.toHaveBeenCalled()
  })
})
