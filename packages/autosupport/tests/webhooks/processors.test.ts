import crypto from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createGithubWebhookProcessor } from '../../src/webhooks/github'
import { createSentryWebhookProcessor } from '../../src/webhooks/sentry'

const githubSecret = 'github-secret'
const sentrySecret = 'sentry-secret'

function createRepositories() {
  return {
    tickets: {
      findById: vi.fn(),
      findByGithubIssueId: vi.fn(),
      findByGithubPrId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    conversations: {
      findById: vi.fn(),
      findMessages: vi.fn(),
      create: vi.fn(),
      appendMessage: vi.fn(),
    },
  } as any
}

describe('framework-neutral webhook processors', () => {
  it('processes GitHub raw requests without Express', async () => {
    const repositories = createRepositories()
    repositories.tickets.findByGithubIssueId.mockResolvedValue(null)
    const rawBody = Buffer.from(JSON.stringify({ action: 'closed', issue: { number: 42 } }))
    const signature = `sha256=${crypto
      .createHmac('sha256', githubSecret)
      .update(rawBody)
      .digest('hex')}`
    const processor = createGithubWebhookProcessor({
      repositories,
      queue: { enqueueTier4: vi.fn() } as any,
      sseBus: { hasActiveListener: vi.fn() } as any,
      githubClient: {} as any,
      webhookSecret: githubSecret,
    })

    const result = await processor({
      headers: {
        'x-hub-signature-256': signature,
        'x-github-event': 'issues',
      },
      rawBody,
    })

    expect(result).toEqual({
      status: 200,
      body: { received: true, handled: false },
    })
  })

  it('processes Sentry raw requests through repositories', async () => {
    const repositories = createRepositories()
    repositories.tickets.create.mockResolvedValue({ id: 'ticket-1' })
    const rawBody = Buffer.from(
      JSON.stringify({
        action: 'created',
        data: {
          issue: {
            id: 'sentry-1',
            title: 'TypeError',
            project: { slug: 'app' },
          },
        },
      })
    )
    const signature = crypto.createHmac('sha256', sentrySecret).update(rawBody).digest('hex')
    const queue = { enqueueTier2: vi.fn().mockResolvedValue('job-1') } as any
    const processor = createSentryWebhookProcessor({
      repositories,
      queue,
      webhookSecret: sentrySecret,
      projectSlug: 'app',
    })

    const result = await processor({
      headers: { 'sentry-hook-signature': signature },
      rawBody,
    })

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ handled: true, ticketId: 'ticket-1' })
    expect(repositories.tickets.create).toHaveBeenCalled()
    expect(queue.enqueueTier2).toHaveBeenCalledWith('ticket-1')
  })

  it('returns 400 for signed malformed JSON', async () => {
    const repositories = createRepositories()
    const rawBody = Buffer.from('{')
    const signature = crypto.createHmac('sha256', sentrySecret).update(rawBody).digest('hex')
    const processor = createSentryWebhookProcessor({
      repositories,
      queue: {} as any,
      webhookSecret: sentrySecret,
      projectSlug: 'app',
    })

    await expect(
      processor({
        headers: { 'sentry-hook-signature': signature },
        rawBody,
      })
    ).resolves.toEqual({
      status: 400,
      body: { error: 'JSON inválido.' },
    })
  })

  it('returns 400 for a signed JSON value that is not an object', async () => {
    const repositories = createRepositories()
    const rawBody = Buffer.from('null')
    const signature = crypto.createHmac('sha256', sentrySecret).update(rawBody).digest('hex')
    const processor = createSentryWebhookProcessor({
      repositories,
      queue: {} as any,
      webhookSecret: sentrySecret,
      projectSlug: 'app',
    })

    const result = await processor({
      headers: { 'Sentry-Hook-Signature': signature },
      rawBody,
    })

    expect(result).toEqual({ status: 400, body: { error: 'JSON inválido.' } })
  })
})
