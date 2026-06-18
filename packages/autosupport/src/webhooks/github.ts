import crypto from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Request, Response } from 'express'
import type { GitHubClient } from '../clients/github.js'
import { toErrorMessage } from '../errors.js'
import type { SseBus } from '../notifications/sse-bus.js'
import type { SupportQueue } from '../queue/index.js'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb } from '../types.js'

export type GithubWebhookDeps = {
  db: SupportDb
  schema: SupportSchema
  queue: SupportQueue
  sseBus: SseBus
  githubClient: GitHubClient
  webhookSecret: string
  autoLabel?: string
}

/** Subset of the GitHub webhook payload this handler reads. */
type GithubWebhookBody = {
  action?: string
  issue?: { number?: number }
  check_suite?: {
    conclusion?: string
    pull_requests?: Array<{ number: number }>
  }
}

export function createGithubWebhookHandler(deps: GithubWebhookDeps) {
  if (!deps.webhookSecret) throw new Error('webhookSecret não configurado')
  const autoLabel = deps.autoLabel ?? 'support-auto'

  function verifySignature(payload: Buffer, signature: string): boolean {
    const expected = `sha256=${crypto.createHmac('sha256', deps.webhookSecret).update(payload).digest('hex')}`
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  }

  async function handleIssuesClosed(body: GithubWebhookBody, res: Response): Promise<Response> {
    const issueNumber = body.issue?.number as number | undefined
    if (!issueNumber) return res.status(200).json({ received: true, handled: false })

    const [ticket] = await deps.db
      .select()
      .from(deps.schema.supportTickets)
      .where(eq(deps.schema.supportTickets.githubIssueId, issueNumber))

    if (!ticket) {
      console.log(`[autosupport-github-webhook] no ticket for issue #${issueNumber}`)
      return res.status(200).json({ received: true, handled: false })
    }

    if (ticket.status === 'resolved') {
      // Idempotência — já foi resolvido
      return res.status(200).json({ received: true, handled: false })
    }

    await deps.db
      .update(deps.schema.supportTickets)
      .set({ status: 'resolved', resolvedAt: new Date(), updatedAt: new Date() })
      .where(eq(deps.schema.supportTickets.id, ticket.id))

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
      await deps.db
        .update(deps.schema.supportTickets)
        .set({ notifiedAt: new Date() })
        .where(eq(deps.schema.supportTickets.id, ticket.id))
    }

    return res.status(200).json({ received: true, handled: true, ticketId: ticket.id })
  }

  async function handleCheckSuiteCompleted(
    body: GithubWebhookBody,
    res: Response
  ): Promise<Response> {
    const conclusion = body.check_suite?.conclusion
    if (conclusion !== 'success') {
      return res.status(200).json({ received: true, handled: false })
    }

    const prs: Array<{ number: number }> = body.check_suite?.pull_requests ?? []
    for (const pr of prs) {
      try {
        const prDetails = await deps.githubClient.getPullRequest(pr.number)
        const hasAutoLabel = prDetails.labels.some((l) => l.name === autoLabel)
        if (!hasAutoLabel) continue

        const [ticket] = await deps.db
          .select()
          .from(deps.schema.supportTickets)
          .where(eq(deps.schema.supportTickets.githubPrId, pr.number))

        if (!ticket) {
          console.log(`[autosupport-github-webhook] no ticket for PR #${pr.number}`)
          continue
        }

        await deps.queue.enqueueTier4(pr.number, ticket.id)
        console.log(
          `[autosupport-github-webhook] enqueued Tier 4 for PR #${pr.number}, ticket ${ticket.id}`
        )
        return res.status(200).json({ received: true, handled: true, prNumber: pr.number })
      } catch (err) {
        console.error(
          `[autosupport-github-webhook] error processing PR #${pr.number}:`,
          toErrorMessage(err)
        )
      }
    }

    return res.status(200).json({ received: true, handled: false })
  }

  return async function githubWebhookHandler(req: Request, res: Response): Promise<Response> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined
    if (!signature) return res.status(401).json({ error: 'Assinatura ausente.' })

    const payload = req.body as Buffer
    if (!Buffer.isBuffer(payload)) return res.status(400).json({ error: 'Payload inválido.' })
    if (!verifySignature(payload, signature))
      return res.status(401).json({ error: 'Assinatura inválida.' })

    const event = req.headers['x-github-event'] as string
    const body = JSON.parse(payload.toString('utf8'))

    if (event === 'issues' && body.action === 'closed') {
      return handleIssuesClosed(body, res)
    }
    if (event === 'check_suite' && body.action === 'completed') {
      return handleCheckSuiteCompleted(body, res)
    }
    return res.status(200).json({ received: true, handled: false })
  }
}
