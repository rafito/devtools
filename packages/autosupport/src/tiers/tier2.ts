import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type { ToolBundle } from '../types.js'
import { runToolLoop } from './runner.js'

export type Tier2Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPrompt?: string
  db: any
  schema: SupportSchema
  tools: ToolBundle
  enqueueTier3: (ticketId: string) => Promise<unknown>
}

const DEFAULT_SYSTEM = `Você é um agente de investigação técnica. Receberá a descrição de um bug reportado e deve:

1. Investigar o código e logs relevantes
2. Identificar a causa raiz provável
3. Criar um issue no GitHub com diagnóstico completo

Regras Sentry:
- Se ticket tem sentryIssueId: chame query_sentry(issueId=<id>) PRIMEIRO
- Caso contrário: após investigar código/logs, chame query_sentry(query=<palavras-chave>)
- Inclua dados do Sentry na seção "Dados do Sentry" do issue

O issue deve conter:
- Descrição do problema (perspectiva do usuário + técnica)
- Arquivos provavelmente envolvidos (com linhas)
- Dados do Sentry (se disponíveis)
- Logs correlacionados (se disponíveis)
- Sugestão de causa raiz

Seja objetivo. Investigue, depois crie o issue.`

export function createTier2Agent(cfg: Tier2Config) {
  if (!cfg.anthropicApiKey) throw new Error('anthropicApiKey não configurada')
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey })

  async function run(ticketId: string): Promise<void> {
    const [ticket] = await cfg.db
      .select()
      .from(cfg.schema.supportTickets)
      .where(eq(cfg.schema.supportTickets.id, ticketId))
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)
    if (ticket.githubIssueId) return // idempotência

    let githubIssueId: number | undefined
    const initial = [
      {
        role: 'user' as const,
        content: [
          `Bug reportado:\n\n${ticket.description}`,
          ticket.sentryIssueId ? `Sentry Issue ID: ${ticket.sentryIssueId}` : null,
          ticket.tenantId ? `Tenant ID: ${ticket.tenantId}` : null,
          ticket.userId ? `Usuário ID: ${ticket.userId}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]

    await runToolLoop({
      client,
      model: cfg.model ?? 'claude-opus-4-7',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM,
      maxToolLoops: cfg.maxToolLoops ?? 8,
      initialMessages: initial,
      tools: cfg.tools,
      onToolResult: (name, _input, result) => {
        if (name === 'create_github_issue' && (result as any).issueNumber) {
          githubIssueId = (result as any).issueNumber
        }
      },
    })

    await cfg.db
      .update(cfg.schema.supportTickets)
      .set({ status: 'investigating', githubIssueId: githubIssueId ?? null, updatedAt: new Date() })
      .where(eq(cfg.schema.supportTickets.id, ticketId))

    if (githubIssueId) {
      try {
        await cfg.enqueueTier3(ticketId)
      } catch {
        // fila pode estar desabilitada em testes
      }
    }
  }

  return { run }
}
