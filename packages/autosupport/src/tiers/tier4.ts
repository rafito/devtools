import type { LlmMessage, LlmProvider, LlmRunResult } from '../llm/types.js'
import { resolveSupportRepositories } from '../persistence/drizzle.js'
import type { SupportRepositories } from '../persistence/types.js'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb, ToolBundle } from '../types.js'
import { logTicketLlmFailure, logTicketLlmUsage } from './usage.js'

export type Tier4Config = {
  llm: LlmProvider
  maxToolLoops?: number
  systemPrompt?: string
  repositories?: SupportRepositories
  db?: SupportDb
  schema?: SupportSchema
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
  const repositories = resolveSupportRepositories(cfg)

  async function run(prNumber: number, ticketId: string): Promise<void> {
    const ticket = await repositories.tickets.findById(ticketId)
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)

    const initial: LlmMessage[] = [
      {
        role: 'user',
        content: `PR #${prNumber} está pronto para revisão.\nTicket: ${ticketId}\nIssue original: #${ticket.githubIssueId}\n\nRevise e decida: aprovar + merge OU pedir revisão humana.`,
      },
    ]

    let result: LlmRunResult
    try {
      result = await cfg.llm.runWithTools({
        role: 'heavy',
        system: cfg.systemPrompt ?? DEFAULT_SYSTEM,
        messages: initial,
        tools: cfg.tools,
        maxToolLoops: cfg.maxToolLoops ?? 6,
      })
    } catch (error) {
      logTicketLlmFailure('tier4', ticketId, error)
      throw error
    }
    logTicketLlmUsage('tier4', ticketId, result)

    // Status transitions via GitHub webhook (issues.closed after merge)
  }

  return { run }
}
