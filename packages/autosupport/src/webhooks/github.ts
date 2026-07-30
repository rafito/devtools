import crypto from 'node:crypto'
import type { GitHubClient } from '../clients/github.js'
import { toErrorMessage } from '../errors.js'
import type { SseBus } from '../notifications/sse-bus.js'
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

export type GithubWebhookDeps = {
  repositories?: SupportRepositories
  db?: SupportDb
  schema?: SupportSchema
  queue: SupportQueue
  sseBus: SseBus
  githubClient: GitHubClient
  webhookSecret: string
  autoLabel?: string
}

/** Subset of the GitHub webhook payload this processor reads. */
type GithubWebhookBody = {
  action?: string
  issue?: { number?: number }
  check_suite?: {
    conclusion?: string
    pull_requests?: Array<{ number: number }>
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

export function createGithubWebhookProcessor(deps: GithubWebhookDeps) {
  if (!deps.webhookSecret) throw new Error('webhookSecret não configurado')
  const autoLabel = deps.autoLabel ?? 'support-auto'
  const repositories = resolveSupportRepositories(deps)

  function verifySignature(payload: Buffer, signature: string): boolean {
    const digest = crypto.createHmac('sha256', deps.webhookSecret).update(payload).digest('hex')
    return secureEqual(signature, `sha256=${digest}`)
  }

  async function handleIssuesClosed(body: GithubWebhookBody): Promise<WebhookResult> {
    const issueNumber = body.issue?.number
    if (!Number.isInteger(issueNumber) || !issueNumber) {
      return { status: 200, body: { received: true, handled: false } }
    }

    const ticket = await repositories.tickets.findByGithubIssueId(issueNumber)
    if (!ticket) {
      console.log(`[autosupport-github-webhook] no ticket for issue #${issueNumber}`)
      return { status: 200, body: { received: true, handled: false } }
    }

    if (ticket.status === 'resolved') {
      return { status: 200, body: { received: true, handled: false } }
    }

    await repositories.tickets.update(ticket.id, {
      status: 'resolved',
      resolvedAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(
      `[autosupport-github-webhook] ticket ${ticket.id} resolved via issue #${issueNumber}`
    )

    const notification = {
      type: 'ticket_resolved' as const,
      ticketId: ticket.id,
      message: `Boa notícia! O problema que você reportou (ticket #${ticket.id.slice(0, 8)}) foi resolvido. Obrigado pela paciência.`,
    }

    if (ticket.userId && deps.sseBus.hasActiveListener(ticket.userId)) {
      deps.sseBus.notifyUser(ticket.userId, notification)
      await repositories.tickets.update(ticket.id, { notifiedAt: new Date() })
    }

    return {
      status: 200,
      body: { received: true, handled: true, ticketId: ticket.id },
    }
  }

  async function handleCheckSuiteCompleted(body: GithubWebhookBody): Promise<WebhookResult> {
    if (body.check_suite?.conclusion !== 'success') {
      return { status: 200, body: { received: true, handled: false } }
    }

    const prs = body.check_suite?.pull_requests ?? []
    for (const pr of prs) {
      try {
        const prDetails = await deps.githubClient.getPullRequest(pr.number)
        const hasAutoLabel = prDetails.labels.some((label) => label.name === autoLabel)
        if (!hasAutoLabel) continue

        const ticket = await repositories.tickets.findByGithubPrId(pr.number)
        if (!ticket) {
          console.log(`[autosupport-github-webhook] no ticket for PR #${pr.number}`)
          continue
        }

        await deps.queue.enqueueTier4(pr.number, ticket.id)
        console.log(
          `[autosupport-github-webhook] enqueued Tier 4 for PR #${pr.number}, ticket ${ticket.id}`
        )
        return {
          status: 200,
          body: { received: true, handled: true, prNumber: pr.number },
        }
      } catch (error) {
        console.error(
          `[autosupport-github-webhook] error processing PR #${pr.number}:`,
          toErrorMessage(error)
        )
      }
    }

    return { status: 200, body: { received: true, handled: false } }
  }

  return async function githubWebhookProcessor(
    request: WebhookProcessorRequest
  ): Promise<WebhookResult> {
    const signature = readWebhookHeader(request.headers, 'x-hub-signature-256')
    if (!signature) return { status: 401, body: { error: 'Assinatura ausente.' } }
    if (!Buffer.isBuffer(request.rawBody)) {
      return { status: 400, body: { error: 'Payload inválido.' } }
    }
    if (!verifySignature(request.rawBody, signature)) {
      return { status: 401, body: { error: 'Assinatura inválida.' } }
    }

    let body: GithubWebhookBody
    try {
      const parsed = JSON.parse(request.rawBody.toString('utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { status: 400, body: { error: 'JSON inválido.' } }
      }
      body = parsed as GithubWebhookBody
    } catch {
      return { status: 400, body: { error: 'JSON inválido.' } }
    }

    const event = readWebhookHeader(request.headers, 'x-github-event')
    if (event === 'issues' && body.action === 'closed') return handleIssuesClosed(body)
    if (event === 'check_suite' && body.action === 'completed') {
      return handleCheckSuiteCompleted(body)
    }
    return { status: 200, body: { received: true, handled: false } }
  }
}

export function createGithubWebhookHandler(deps: GithubWebhookDeps) {
  const process = createGithubWebhookProcessor(deps)
  return async function githubWebhookHandler(
    req: WebhookAdapterRequest,
    res: WebhookAdapterResponse
  ): Promise<WebhookAdapterResponse> {
    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Payload inválido.' })
    }
    return jsonWebhookResponse(res, await process({ headers: req.headers, rawBody: req.body }))
  }
}
