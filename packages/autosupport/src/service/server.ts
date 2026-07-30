import crypto from 'node:crypto'
import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http'
import type { SupportRepositories } from '../persistence/types.js'
import type { SupportQueue } from '../queue/index.js'
import { VERSION } from '../version.js'
import type { WebhookProcessorRequest, WebhookResult } from '../webhooks/types.js'

const MAX_BODY_BYTES = 1024 * 1024
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type WebhookProcessor = (request: WebhookProcessorRequest) => Promise<WebhookResult>

export type AutosupportHttpServerDeps = {
  serviceToken: string
  repositories: SupportRepositories
  queue: Pick<SupportQueue, 'enqueueTier2'>
  githubWebhook: WebhookProcessor
  sentryWebhook?: WebhookProcessor
  version?: string
}

type ReadBodyResult = { kind: 'ok'; body: Buffer } | { kind: 'too-large' }

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>): void {
  const encoded = Buffer.from(JSON.stringify(body))
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': encoded.length,
  })
  response.end(encoded)
}

function readBody(request: IncomingMessage): Promise<ReadBodyResult> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false

    request.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      if (!tooLarge) chunks.push(buffer)
    })
    request.on('end', () => {
      resolve(tooLarge ? { kind: 'too-large' } : { kind: 'ok', body: Buffer.concat(chunks) })
    })
    request.on('aborted', () => reject(new Error('Request abortado')))
    request.on('error', reject)
  })
}

function secureTokenEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return (
    actualBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(actualBytes, expectedBytes)
  )
}

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) return false
  return secureTokenEqual(header.slice('Bearer '.length), expectedToken)
}

function parseOptionalUuid(
  value: unknown,
  field: string
): { value?: string | null; error?: string } {
  if (value === undefined || value === null || value === '') return { value: null }
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return { error: `${field} deve ser um UUID válido.` }
  }
  return { value }
}

async function readJsonObject(
  request: IncomingMessage,
  response: ServerResponse
): Promise<Record<string, unknown> | null> {
  const body = await readBody(request)
  if (body.kind === 'too-large') {
    sendJson(response, 413, { error: 'Payload excede o limite de 1 MiB.' })
    return null
  }
  try {
    const parsed = JSON.parse(body.body.toString('utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(response, 400, { error: 'O corpo deve ser um objeto JSON.' })
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    sendJson(response, 400, { error: 'JSON inválido.' })
    return null
  }
}

export function createAutosupportHttpServer(deps: AutosupportHttpServerDeps): Server {
  async function handleWebhook(
    request: IncomingMessage,
    response: ServerResponse,
    processor: WebhookProcessor | undefined
  ): Promise<void> {
    if (!processor) {
      sendJson(response, 503, { error: 'Webhook não configurado.' })
      return
    }
    const body = await readBody(request)
    if (body.kind === 'too-large') {
      sendJson(response, 413, { error: 'Payload excede o limite de 1 MiB.' })
      return
    }
    const result = await processor({ headers: request.headers, rawBody: body.body })
    sendJson(response, result.status, result.body)
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://autosupport.local')
    const path = url.pathname

    if (request.method === 'GET' && path === '/health') {
      sendJson(response, 200, { status: 'ok', version: deps.version ?? VERSION })
      return
    }

    if (request.method === 'POST' && path === '/webhooks/github') {
      await handleWebhook(request, response, deps.githubWebhook)
      return
    }
    if (request.method === 'POST' && path === '/webhooks/sentry') {
      await handleWebhook(request, response, deps.sentryWebhook)
      return
    }

    if (path.startsWith('/v1/') && !isAuthorized(request, deps.serviceToken)) {
      sendJson(response, 401, { error: 'Não autorizado.' })
      return
    }

    if (request.method === 'POST' && path === '/v1/tickets') {
      const input = await readJsonObject(request, response)
      if (!input) return
      const description = typeof input.description === 'string' ? input.description.trim() : ''
      if (!description) {
        sendJson(response, 400, { error: 'description é obrigatório.' })
        return
      }
      const source = input.source ?? 'chat'
      if (source !== 'chat' && source !== 'sentry') {
        sendJson(response, 400, { error: 'source deve ser chat ou sentry.' })
        return
      }

      const tenantId = parseOptionalUuid(input.tenantId, 'tenantId')
      const userId = parseOptionalUuid(input.userId, 'userId')
      const conversationId = parseOptionalUuid(input.conversationId, 'conversationId')
      const validationError = tenantId.error ?? userId.error ?? conversationId.error
      if (validationError) {
        sendJson(response, 400, { error: validationError })
        return
      }
      if (input.sentryIssueId !== undefined && typeof input.sentryIssueId !== 'string') {
        sendJson(response, 400, { error: 'sentryIssueId deve ser uma string.' })
        return
      }

      const ticket = await deps.repositories.tickets.create({
        description,
        source,
        status: 'open',
        tenantId: tenantId.value,
        userId: userId.value,
        conversationId: conversationId.value,
        sentryIssueId: (input.sentryIssueId as string | undefined) ?? null,
      })

      try {
        await deps.queue.enqueueTier2(ticket.id)
      } catch {
        sendJson(response, 503, {
          error: 'Ticket criado, mas não foi possível enfileirar a investigação.',
          ticketId: ticket.id,
        })
        return
      }

      sendJson(response, 202, { ticketId: ticket.id, status: ticket.status })
      return
    }

    const ticketMatch = request.method === 'GET' ? path.match(/^\/v1\/tickets\/([^/]+)$/) : null
    if (ticketMatch) {
      const ticketId = decodeURIComponent(ticketMatch[1])
      const ticket = await deps.repositories.tickets.findById(ticketId)
      if (!ticket) {
        sendJson(response, 404, { error: 'Ticket não encontrado.' })
        return
      }
      sendJson(response, 200, ticket as unknown as Record<string, unknown>)
      return
    }

    sendJson(response, 404, { error: 'Rota não encontrada.' })
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      console.error('[autosupport-service] request failed:', error)
      if (!response.headersSent) sendJson(response, 500, { error: 'Erro interno.' })
      else response.end()
    })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 10_000
  server.maxHeadersCount = 100
  return server
}
