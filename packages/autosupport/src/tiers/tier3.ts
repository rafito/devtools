import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { GitHubClient } from '../clients/github.js'
import { toErrorMessage } from '../errors.js'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb, ToolBundle } from '../types.js'
import { loadConversationTranscript } from './conversation.js'
import { runToolLoop } from './runner.js'

const execFileAsync = promisify(execFile)

export type Tier3Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPrompt?: string
  branchPrefix?: string
  db: SupportDb
  schema: SupportSchema
  tools: ToolBundle
  /** Cliente GitHub usado para postar comentário na issue quando Tier 3 falha. */
  githubClient?: GitHubClient
  /** Branch default usado para checkout no cleanup pós-falha. Default: 'main'. */
  defaultBranch?: string
  /** Raiz do repo onde rodar git cleanup. Se ausente, cleanup é pulado. */
  rootDir?: string
}

const DEFAULT_SYSTEM = (branchPrefix: string) =>
  `Você é um agente autônomo de correção de bugs. Receberá o diagnóstico de um bug (ticket + issue GitHub) e deve:

1. Explorar o código com read_file / search_code
2. Criar branch com git_branch (nome: "${branchPrefix}{ticketId[:8]}")
3. Escrever o fix com write_file (Tier 3 pode escrever também testes novos)
4. git_commit_push (não rode testes localmente — CI valida no PR)
5. create_pr com label "support-auto"

Não rode testes localmente. Faça o fix, commit, push, abra o PR — o CI no GitHub valida. Tier 4 só vai aprovar quando o CI passar.

Se você não consegue identificar o fix em algumas iterações, pare. A próxima ação será Tier 4 revisando o PR (se CI passar) ou um humano (se você não criar PR ou se Tier 4 bloquear).

O PR deve ter título "[Support] fix: <descrição>" e body com "Closes #{issueNumber}" + diagnóstico do Tier 2 + explicação do fix. Se a conversa com o cliente vier no contexto, inclua a seção "## Conversa com o cliente" com o transcript no body do PR — é o reporte original e dá contexto pra quem revisar.

Nunca escreva em arquivos protegidos (a tool write_file rejeita).`

export async function cleanupTier3Failure(
  rootDir: string,
  branchName: string | undefined,
  defaultBranch: string
): Promise<void> {
  const ops: [string, string[]][] = [
    ['git', ['checkout', defaultBranch]],
    ...(branchName ? [['git', ['branch', '-D', branchName]] as [string, string[]]] : []),
    ['git', ['restore', '.']],
  ]
  for (const [cmd, args] of ops) {
    try {
      await execFileAsync(cmd, args, { cwd: rootDir })
    } catch (err) {
      console.warn(
        `[autosupport-tier3-cleanup] ${cmd} ${args.join(' ')} failed: ${toErrorMessage(err)}`
      )
    }
  }
}

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

    const transcript = await loadConversationTranscript(cfg.db, cfg.schema, ticket.conversationId)

    let prNumber: number | undefined
    const writtenFiles: string[] = []
    const branchesCreated: string[] = []

    const initial = [
      {
        role: 'user' as const,
        content: [
          `Ticket ID: ${ticketId}`,
          `GitHub Issue: #${ticket.githubIssueId}`,
          '',
          'Descrição:',
          ticket.description,
          transcript ? `\nConversa com o cliente (chat de suporte):\n\n${transcript}` : null,
          `\nInvestigue, aplique o fix e crie o PR. Branch sugerida: ${branchPrefix}${ticketId.slice(0, 8)}`,
        ]
          .filter((l) => l !== null)
          .join('\n'),
      },
    ]

    await runToolLoop({
      client,
      model: cfg.model ?? 'claude-opus-4-7',
      system: cfg.systemPrompt ?? DEFAULT_SYSTEM(branchPrefix),
      maxToolLoops: cfg.maxToolLoops ?? 12,
      initialMessages: initial,
      tools: cfg.tools,
      onToolResult: (name, input, result) => {
        const r = result as { prNumber?: number; success?: boolean }
        const args = input as { path?: string; name?: string }
        if (name === 'create_pr' && r?.prNumber) {
          prNumber = r.prNumber
        }
        if (name === 'write_file' && r?.success) {
          if (typeof args?.path === 'string') writtenFiles.push(args.path)
        }
        if (name === 'git_branch' && r?.success) {
          if (typeof args?.name === 'string') branchesCreated.push(args.name)
        }
      },
    })

    if (prNumber) {
      await cfg.db
        .update(cfg.schema.supportTickets)
        .set({ status: 'fixing', githubPrId: prNumber, updatedAt: new Date() })
        .where(eq(cfg.schema.supportTickets.id, ticketId))
      return
    }

    // Caminho de falha: nenhum PR criado.
    // 1) Posta comentário na issue resumindo o que foi tentado.
    if (cfg.githubClient && ticket.githubIssueId) {
      try {
        const lines = [
          'Tier 3 não conseguiu criar um PR autonomamente. Requer revisão humana.',
          '',
          writtenFiles.length ? `**Arquivos modificados:** ${writtenFiles.join(', ')}` : null,
          branchesCreated.length
            ? `**Branch tentada:** ${branchesCreated[0]} (deletada após cleanup)`
            : null,
          '',
          'Reabra ou comente para reenfileirar Tier 3.',
        ].filter((l): l is string => l !== null)
        await cfg.githubClient.postIssueComment(ticket.githubIssueId, lines.join('\n'))
      } catch (err) {
        console.warn('[autosupport-tier3] failed to post failure comment:', toErrorMessage(err))
      }
    }

    // 2) Cleanup: volta para defaultBranch, deleta branch criada, restaura working tree.
    if (cfg.rootDir) {
      await cleanupTier3Failure(cfg.rootDir, branchesCreated[0], cfg.defaultBranch ?? 'main')
    }

    // 3) Atualiza status do ticket.
    await cfg.db
      .update(cfg.schema.supportTickets)
      .set({ status: 'investigating', updatedAt: new Date() })
      .where(eq(cfg.schema.supportTickets.id, ticketId))
  }

  return { run }
}
