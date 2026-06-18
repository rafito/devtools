import crypto from 'node:crypto'
import express from 'express'
import request from 'supertest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGithubWebhookHandler } from '../../src/webhooks/github'

const SECRET = 'gh-shh'

function makeDeps() {
  let storedTicket: any = null
  const db = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi
          .fn()
          .mockImplementation(() => Promise.resolve(storedTicket ? [storedTicket] : [])),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }
  const queue = { enqueueTier4: vi.fn().mockResolvedValue('job-1') } as any
  const sseBus = {
    hasActiveListener: vi.fn().mockReturnValue(false),
    notifyUser: vi.fn(),
  } as any
  const githubClient = {
    getPullRequest: vi.fn(),
  } as any
  const schema = {
    supportTickets: { id: 'col-id', githubIssueId: 'col-issue', githubPrId: 'col-pr' },
  } as any
  return {
    db,
    queue,
    sseBus,
    githubClient,
    schema,
    setTicket: (t: any) => {
      storedTicket = t
    },
  }
}

function makeApp(deps: any) {
  const app = express()
  const handler = createGithubWebhookHandler({
    db: deps.db,
    schema: deps.schema,
    queue: deps.queue,
    sseBus: deps.sseBus,
    githubClient: deps.githubClient,
    webhookSecret: SECRET,
  })
  app.post('/wh', express.raw({ type: 'application/json' }), handler)
  return app
}

function sig(body: string): string {
  return `sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`
}

describe('createGithubWebhookHandler', () => {
  let deps: ReturnType<typeof makeDeps>
  beforeEach(() => {
    deps = makeDeps()
  })

  it('webhookSecret vazio lança', () => {
    expect(() =>
      createGithubWebhookHandler({
        db: {},
        schema: {} as any,
        queue: {} as any,
        sseBus: {} as any,
        githubClient: {} as any,
        webhookSecret: '',
      })
    ).toThrow(/webhookSecret/)
  })

  it('sem assinatura → 401', async () => {
    const app = makeApp(deps)
    const r = await request(app).post('/wh').send({})
    expect(r.status).toBe(401)
  })

  it('assinatura inválida → 401', async () => {
    const app = makeApp(deps)
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', 'sha256=invalid')
      .set('Content-Type', 'application/json')
      .send('{}')
    expect(r.status).toBe(401)
  })

  it('issues.closed sem ticket existente → 200 handled:false', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'closed', issue: { number: 99 } })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'issues')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('issues.closed com ticket → resolve + notifica online + 200', async () => {
    deps.setTicket({ id: 'tk-1', userId: 'u1', status: 'fixing' })
    deps.sseBus.hasActiveListener.mockReturnValue(true)
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'closed', issue: { number: 42 } })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'issues')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(true)
    expect(r.body.ticketId).toBe('tk-1')
    expect(deps.sseBus.notifyUser).toHaveBeenCalled()
  })

  it('issues.closed já resolved → 200 handled:false (idempotência)', async () => {
    deps.setTicket({ id: 'tk-1', userId: 'u1', status: 'resolved' })
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'closed', issue: { number: 42 } })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'issues')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('check_suite conclusion=failure → 200 handled:false', async () => {
    const app = makeApp(deps)
    const body = JSON.stringify({ action: 'completed', check_suite: { conclusion: 'failure' } })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'check_suite')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('check_suite success sem label support-auto → 200 handled:false', async () => {
    deps.githubClient.getPullRequest.mockResolvedValue({
      number: 7,
      labels: [{ name: 'bug' }],
      head: { ref: 'b', sha: 's' },
    })
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'completed',
      check_suite: { conclusion: 'success', pull_requests: [{ number: 7 }] },
    })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'check_suite')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(false)
  })

  it('check_suite success com label support-auto → enfileira Tier 4', async () => {
    deps.githubClient.getPullRequest.mockResolvedValue({
      number: 7,
      labels: [{ name: 'support-auto' }],
      head: { ref: 'b', sha: 's' },
    })
    deps.setTicket({ id: 'tk-1' })
    const app = makeApp(deps)
    const body = JSON.stringify({
      action: 'completed',
      check_suite: { conclusion: 'success', pull_requests: [{ number: 7 }] },
    })
    const r = await request(app)
      .post('/wh')
      .set('x-hub-signature-256', sig(body))
      .set('x-github-event', 'check_suite')
      .set('Content-Type', 'application/json')
      .send(body)
    expect(r.status).toBe(200)
    expect(r.body.handled).toBe(true)
    expect(deps.queue.enqueueTier4).toHaveBeenCalledWith(7, 'tk-1')
  })
})
