import type { Request, Response } from 'express'
import crypto from 'node:crypto'
import type { SupportSchema } from '../schema/index.js'
import type { SupportQueue } from '../queue/index.js'

export type SentryWebhookDeps = {
  db: any
  schema: SupportSchema
  queue: SupportQueue
  webhookSecret: string
  projectSlug: string
}

export function createSentryWebhookHandler(deps: SentryWebhookDeps) {
  if (!deps.webhookSecret) throw new Error('webhookSecret não configurado')
  if (!deps.projectSlug) throw new Error('projectSlug não configurado')

  function verifySignature(payload: Buffer, signature: string): boolean {
    const expected = crypto.createHmac('sha256', deps.webhookSecret).update(payload).digest('hex')
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    } catch {
      return false
    }
  }

  return async function sentryWebhookHandler(req: Request, res: Response): Promise<Response> {
    const signature = req.headers['sentry-hook-signature'] as string | undefined
    if (!signature) return res.status(401).json({ error: 'Assinatura ausente.' })

    const payload = req.body as Buffer
    if (!Buffer.isBuffer(payload)) return res.status(400).json({ error: 'Payload inválido.' })
    if (!verifySignature(payload, signature)) return res.status(401).json({ error: 'Assinatura inválida.' })

    const body = JSON.parse(payload.toString('utf8'))
    if (body.action !== 'created') return res.status(200).json({ received: true, handled: false })

    const issue = body.data?.issue
    if (!issue) return res.status(200).json({ received: true, handled: false })
    if (issue.project?.slug !== deps.projectSlug) {
      return res.status(200).json({ received: true, handled: false })
    }

    const description = `[Sentry] ${issue.title}\nCulprit: ${issue.culprit ?? 'desconhecido'}\n${issue.permalink ?? ''}`.trim()

    const [ticket] = await deps.db
      .insert(deps.schema.supportTickets)
      .values({
        tenantId: null, userId: null, description,
        source: 'sentry', sentryIssueId: String(issue.id), status: 'open',
      })
      .returning()

    await deps.queue.enqueueTier2(ticket.id)
    console.log(`[autosupport-sentry-webhook] ticket ${ticket.id} criado para issue ${issue.id}`)
    return res.status(200).json({ received: true, handled: true, ticketId: ticket.id })
  }
}
