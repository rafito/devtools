import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type { ToolBundle } from '../types.js'
import { runToolLoop } from './runner.js'

export type Tier3Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPrompt?: string
  branchPrefix?: string
  db: any
  schema: SupportSchema
  tools: ToolBundle
}

const DEFAULT_SYSTEM = (branchPrefix: string) =>
  `Você é um agente autônomo de correção de bugs. Receberá o diagnóstico de um bug (ticket + issue GitHub) e deve:

1. Explorar o código com read_file / search_code
2. Criar branch com git_branch (nome: "${branchPrefix}{ticketId[:8]}")
3. Escrever o fix com write_file
4. Rodar testes com run_tests — se falharem, iterar (máx 3 ciclos write→test)
5. Se passarem: git_commit_push e create_pr
6. Se 3 ciclos falharem: pare e informe que não conseguiu

O PR deve ter título "[Support] fix: <descrição>" e body com "Closes #{issueNumber}" + diagnóstico + explicação.

Nunca escreva em arquivos protegidos (a tool write_file rejeita).`

export function createTier3Agent(cfg: Tier3Config) {
  if (!cfg.anthropicApiKey) throw new Error('anthropicApiKey não configurada')
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey })
  const branchPrefix = cfg.branchPrefix ?? 'support/fix-'

  async function run(ticketId: string): Promise<void> {
    const [ticket] = await cfg.db
      .select()
      .from(cfg.schema.supportTickets)
      .where(eq(cfg.schema.supportTickets.id, ticketId))
    if (!ticket) throw new Error(`Ticket ${ticketId} não encontrado`)
    if (ticket.githubPrId) return // idempotência

    let prNumber: number | undefined
    const initial = [
      {
        role: 'user' as const,
        content: `Ticket ID: ${ticketId}\nGitHub Issue: #${ticket.githubIssueId}\n\nDescrição:\n${ticket.description}\n\nInvestigue, aplique o fix, rode os testes e crie o PR. Branch sugerida: ${branchPrefix}${ticketId.slice(0, 8)}`,
      },
    ]

    await runToolLoop({
      client,
      model: cfg.model ?? 'claude-opus-4-7',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM(branchPrefix),
      maxToolLoops: cfg.maxToolLoops ?? 12,
      initialMessages: initial,
      tools: cfg.tools,
      onToolResult: (name, _input, result) => {
        if (name === 'create_pr' && (result as any).prNumber) {
          prNumber = (result as any).prNumber
        }
      },
    })

    if (prNumber) {
      await cfg.db
        .update(cfg.schema.supportTickets)
        .set({ status: 'fixing', githubPrId: prNumber, updatedAt: new Date() })
        .where(eq(cfg.schema.supportTickets.id, ticketId))
    } else {
      await cfg.db
        .update(cfg.schema.supportTickets)
        .set({ status: 'investigating', updatedAt: new Date() })
        .where(eq(cfg.schema.supportTickets.id, ticketId))
    }
  }

  return { run }
}
