import crypto from 'node:crypto'
import { resolveSupportRepositories } from '../persistence/drizzle.js'
import type { SupportRepositories } from '../persistence/types.js'
import type { SupportQueue } from '../queue/index.js'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb } from '../types.js'
import {
  type WebhookAdapterRequest,
  type WebhookAdapterResponse,
  type WebhookProcessorRequest,
  type WebhookResult,
  jsonWebhookResponse,
  readWebhookHeader,
} from './types.js'

export type SentryWebhookDeps = {
  repositories?: SupportRepositories
  db?: SupportDb
  schema?: SupportSchema
  queue: SupportQueue
  webhookSecret: string
  projectSlug: string
}

type SentryWebhookBody = {
  action?: string
  data?: {
    issue?: {
      id?: string | number
      title?: string
      culprit?: string
      permalink?: string
      project?: { slug?: string }
    }
  }
}

function secureEqual(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual)
  const expectedBytes = Buffer.from(expected)
  return (
    actualBytes.length === expectedBytes.length &&
    crypto.timingSafeEqual(actualBytes, expectedBytes)
  )
}

export function createSentryWebhookProcessor(deps: SentryWebhookDeps) {
  if (!deps.webhookSecret) throw new Error('webhookSecret não configurado')
  if (!deps.projectSlug) throw new Error('projectSlug não configurado')
  const repositories = resolveSupportRepositories(deps)

  function verifySignature(payload: Buffer, signature: string): boolean {
    const expected = crypto.createHmac('sha256', deps.webhookSecret).update(payload).digest('hex')
    return secureEqual(signature, expected)
  }

  return async function sentryWebhookProcessor(
    request: WebhookProcessorRequest
  ): Promise<WebhookResult> {
    const signature = readWebhookHeader(request.headers, 'sentry-hook-signature')
    if (!signature) return { status: 401, body: { error: 'Assinatura ausente.' } }
    if (!Buffer.isBuffer(request.rawBody)) {
      return { status: 400, body: { error: 'Payload inválido.' } }
    }
    if (!verifySignature(request.rawBody, signature)) {
      return { status: 401, body: { error: 'Assinatura inválida.' } }
    }

    let body: SentryWebhookBody
    try {
      const parsed = JSON.parse(request.rawBody.toString('utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { status: 400, body: { error: 'JSON inválido.' } }
      }
      body = parsed as SentryWebhookBody
    } catch {
      return { status: 400, body: { error: 'JSON inválido.' } }
    }

    if (body.action !== 'created') {
      return { status: 200, body: { received: true, handled: false } }
    }

    const issue = body.data?.issue
    if (!issue || issue.id === undefined || issue.project?.slug !== deps.projectSlug) {
      return { status: 200, body: { received: true, handled: false } }
    }

    const description = `[Sentry] ${issue.title ?? 'Erro sem título'}\nCulprit: ${
      issue.culprit ?? 'desconhecido'
    }\n${issue.permalink ?? ''}`.trim()

    const ticket = await repositories.tickets.create({
      tenantId: null,
      userId: null,
      description,
      source: 'sentry',
      sentryIssueId: String(issue.id),
      status: 'open',
    })

    await deps.queue.enqueueTier2(ticket.id)
    console.log(`[autosupport-sentry-webhook] ticket ${ticket.id} criado para issue ${issue.id}`)
    return {
      status: 200,
      body: { received: true, handled: true, ticketId: ticket.id },
    }
  }
}

export function createSentryWebhookHandler(deps: SentryWebhookDeps) {
  const process = createSentryWebhookProcessor(deps)
  return async function sentryWebhookHandler(
    req: WebhookAdapterRequest,
    res: WebhookAdapterResponse
  ): Promise<WebhookAdapterResponse> {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Payload inválido.' })
    }
    return jsonWebhookResponse(res, await process({ headers: req.headers, rawBody: req.body }))
  }
}
