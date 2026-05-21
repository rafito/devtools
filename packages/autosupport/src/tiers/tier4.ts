import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type { ToolBundle } from '../types.js'
import { runToolLoop } from './runner.js'

export type Tier4Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPrompt?: string
  db: any
  schema: SupportSchema
  tools: ToolBundle
}

const DEFAULT_SYSTEM = `Você é um agente revisor de Pull Requests. Seu trabalho:

1. Ler o PR com read_pr (título, body, branch, labels)
2. Ler os arquivos modificados com read_pr_files
3. Decidir: o fix é adequado?

Critérios de aprovação:
- O fix está relacionado ao diagnóstico no body do PR
- Nenhum arquivo de infra core foi modificado
- Nenhum teste foi removido

Se aprovado: chame approve_pr e depois merge_pr.
Se não aprovado: chame post_review_comment com motivo específico e pare.

Nunca faça merge sem aprovação prévia.`

export function createTier4Agent(cfg: Tier4Config) {
  if (!cfg.anthropicApiKey) throw new Error('anthropicApiKey não configurada')
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey })

  async function run(prNumber: number, ticketId: string): Promise<void> {
    const [ticket] = await cfg.db
      .select()
      .from(cfg.schema.supportTickets)
      .where(eq(cfg.schema.supportTickets.id, ticketId))
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)

    const initial = [
      {
        role: 'user' as const,
        content: `PR #${prNumber} está pronto para revisão.\nTicket: ${ticketId}\nIssue original: #${ticket.githubIssueId}\n\nRevise e decida: aprovar + merge OU pedir revisão humana.`,
      },
    ]

    await runToolLoop({
      client,
      model: cfg.model ?? 'claude-opus-4-7',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM,
      maxToolLoops: cfg.maxToolLoops ?? 6,
      initialMessages: initial,
      tools: cfg.tools,
    })

    // Status transitions via GitHub webhook (issues.closed after merge)
  }

  return { run }
}
