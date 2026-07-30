import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosupportHttpServer } from '../../src/service/server'

function createRepositories() {
  const tickets = new Map<string, any>()
  return {
    tickets: {
      findById: vi.fn(async (id: string) => tickets.get(id) ?? null),
      findByGithubIssueId: vi.fn(),
      findByGithubPrId: vi.fn(),
      create: vi.fn(async (input: any) => {
        const ticket = {
          id: '11111111-1111-4111-8111-111111111111',
          status: 'open',
          tenantId: null,
          userId: null,
          conversationId: null,
          sentryIssueId: null,
          githubIssueId: null,
          githubPrId: null,
          resolvedAt: null,
          notifiedAt: null,
          createdAt: new Date('2026-07-30T00:00:00Z'),
          updatedAt: new Date('2026-07-30T00:00:00Z'),
          ...input,
        }
        tickets.set(ticket.id, ticket)
        return ticket
      }),
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

describe('createAutosupportHttpServer', () => {
  let server: ReturnType<typeof createAutosupportHttpServer>
  let baseUrl: string
  let repositories: ReturnType<typeof createRepositories>
  let queue: { enqueueTier2: ReturnType<typeof vi.fn> }
  let githubWebhook: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    repositories = createRepositories()
    queue = { enqueueTier2: vi.fn().mockResolvedValue('job-1') }
    githubWebhook = vi.fn().mockResolvedValue({
      status: 200,
      body: { received: true, handled: false },
    })
    server = createAutosupportHttpServer({
      serviceToken: 'service-token-with-enough-entropy',
      repositories,
      queue: queue as any,
      githubWebhook,
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    )
  })

  it('reports health without authentication', async () => {
    const response = await fetch(`${baseUrl}/health`)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ status: 'ok', version: '0.6.0' })
  })

  it('requires bearer authentication for API routes', async () => {
    const response = await fetch(`${baseUrl}/v1/tickets`)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Não autorizado.' })
  })

  it('creates, enqueues, and reads a ticket', async () => {
    const created = await fetch(`${baseUrl}/v1/tickets`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer service-token-with-enough-entropy',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: 'Checkout retorna erro 500', source: 'chat' }),
    })

    expect(created.status).toBe(202)
    const body = (await created.json()) as { ticketId: string; status: string }
    expect(body.status).toBe('open')
    expect(queue.enqueueTier2).toHaveBeenCalledWith(body.ticketId)

    const found = await fetch(`${baseUrl}/v1/tickets/${body.ticketId}`, {
      headers: { Authorization: 'Bearer service-token-with-enough-entropy' },
    })
    expect(found.status).toBe(200)
    await expect(found.json()).resolves.toMatchObject({
      id: body.ticketId,
      description: 'Checkout retorna erro 500',
    })
  })

  it('validates ticket input and JSON', async () => {
    const headers = {
      Authorization: 'Bearer service-token-with-enough-entropy',
      'Content-Type': 'application/json',
    }
    const empty = await fetch(`${baseUrl}/v1/tickets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ description: ' ' }),
    })
    expect(empty.status).toBe(400)

    const malformed = await fetch(`${baseUrl}/v1/tickets`, {
      method: 'POST',
      headers,
      body: '{',
    })
    expect(malformed.status).toBe(400)
  })

  it('returns 413 for request bodies larger than 1 MiB', async () => {
    const response = await fetch(`${baseUrl}/v1/tickets`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer service-token-with-enough-entropy',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: 'x'.repeat(1024 * 1024 + 1) }),
    })
    expect(response.status).toBe(413)
  })

  it('routes raw GitHub webhook payloads without bearer auth', async () => {
    const response = await fetch(`${baseUrl}/webhooks/github`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': 'signature',
      },
      body: '{"action":"closed"}',
    })

    expect(response.status).toBe(200)
    expect(githubWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: Buffer.from('{"action":"closed"}') })
    )
  })

  it('returns 404 for unknown routes', async () => {
    const response = await fetch(`${baseUrl}/unknown`)
    expect(response.status).toBe(404)
  })
})
