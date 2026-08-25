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
  ingestEnabled?: boolean
  dailyTicketLimit?: number
  ignoredTitlePatterns?: string[]
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

function currentUtcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  )
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export function createSentryWebhookProcessor(deps: SentryWebhookDeps) {
  if (!deps.webhookSecret) throw new Error('webhookSecret não configurado')
  if (!deps.projectSlug) throw new Error('projectSlug não configurado')
  const dailyTicketLimit = deps.dailyTicketLimit ?? 0
  if (!Number.isInteger(dailyTicketLimit) || dailyTicketLimit < 0) {
    throw new Error('dailyTicketLimit deve ser um inteiro não negativo')
  }
  const ignoredTitlePatterns = (deps.ignoredTitlePatterns ?? [])
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean)
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

    if (deps.ingestEnabled === false) {
      return {
        status: 200,
        body: { received: true, handled: false, reason: 'sentry_ingest_disabled' },
      }
    }

    const sentryIssueId = String(issue.id)
    const normalizedTitle = (issue.title ?? '').toLowerCase()
    if (ignoredTitlePatterns.some((pattern) => normalizedTitle.includes(pattern))) {
      return {
        status: 200,
        body: { received: true, handled: false, reason: 'ignored_sentry_title' },
      }
    }

    const description = `[Sentry] ${issue.title ?? 'Erro sem título'}\nCulprit: ${
      issue.culprit ?? 'desconhecido'
    }\n${issue.permalink ?? ''}`.trim()
    const { start, end } = currentUtcDayRange(new Date())
    const admission = await repositories.tickets.admitSentryTicket({
      ticket: {
        tenantId: null,
        userId: null,
        description,
        source: 'sentry',
        sentryIssueId,
        status: 'open',
      },
      dailyTicketLimit,
      utcDayStart: start,
      utcDayEnd: end,
    })

    if (admission.kind === 'daily_limit') {
      return {
        status: 200,
        body: {
          received: true,
          handled: false,
          reason: 'sentry_daily_ticket_limit_reached',
          limit: dailyTicketLimit,
        },
      }
    }

    const ticket = admission.ticket
    // Duplicate deliveries retry enqueue for still-open tickets. This repairs
    // persistence-before-enqueue failures and response-loss retries; the queue
    // uses a deterministic pg-boss job ID to collapse concurrent attempts.
    if (ticket.status === 'open') await deps.queue.enqueueTier2(ticket.id)

    if (admission.kind === 'duplicate') {
      return {
        status: 200,
        body: {
          received: true,
          handled: false,
          reason: 'duplicate_sentry_issue',
          ticketId: ticket.id,
        },
      }
    }

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
