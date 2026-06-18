import { eq } from 'drizzle-orm'
import type { LlmMessage, LlmProvider } from '../llm/types.js'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb, ToolBundle } from '../types.js'
import { loadConversationTranscript } from './conversation.js'

export type Tier2Config = {
  llm: LlmProvider
  maxToolLoops?: number
  systemPrompt?: string
  db: SupportDb
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
- Conversa com o cliente (se fornecida): inclua a seção "Conversa com o cliente" com o transcript, é evidência direta do reporte
- Arquivos provavelmente envolvidos (com linhas)
- Dados do Sentry (se disponíveis)
- Logs correlacionados (se disponíveis)
- Sugestão de causa raiz

Seja objetivo. Investigue, depois crie o issue.`

export function createTier2Agent(cfg: Tier2Config) {
  async function run(ticketId: string): Promise<void> {
    const [ticket] = await cfg.db
      .select()
      .from(cfg.schema.supportTickets)
      .where(eq(cfg.schema.supportTickets.id, ticketId))
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)
    if (ticket.githubIssueId) return // idempotência

    const transcript = await loadConversationTranscript(cfg.db, cfg.schema, ticket.conversationId)

    let githubIssueId: number | undefined
    const initial: LlmMessage[] = [
      {
        role: 'user',
        content: [
          `Bug reportado:\n\n${ticket.description}`,
          transcript ? `Conversa com o cliente (chat de suporte):\n\n${transcript}` : null,
          ticket.sentryIssueId ? `Sentry Issue ID: ${ticket.sentryIssueId}` : null,
          ticket.tenantId ? `Tenant ID: ${ticket.tenantId}` : null,
          ticket.userId ? `Usuário ID: ${ticket.userId}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ]

    await cfg.llm.runWithTools({
      role: 'heavy',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM,
      messages: initial,
      tools: cfg.tools,
      maxToolLoops: cfg.maxToolLoops ?? 8,
      onToolResult: (name, _input, result) => {
        const issue = result as { issueNumber?: number }
        if (name === 'create_github_issue' && issue.issueNumber) {
          githubIssueId = issue.issueNumber
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
