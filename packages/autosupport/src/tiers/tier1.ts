import type { LlmMessage, LlmProvider } from '../llm/types.js'
import { resolveSupportRepositories } from '../persistence/drizzle.js'
import type { SupportRepositories } from '../persistence/types.js'
import type { SupportSchema } from '../schema/index.js'
import type { AgentResult, SupportDb, ToolBundle, UserContext } from '../types.js'

type StoredMessage = { role: 'user' | 'assistant'; content: string; ts: string }

export type Tier1Config = {
  llm: LlmProvider
  maxToolLoops?: number
  systemPromptBuilder: (ctx: UserContext) => string
  customTools?: ToolBundle
  repositories?: SupportRepositories
  db?: SupportDb
  schema?: SupportSchema
}

export type RunTier1Input = {
  message: string
  conversationId: string
  userContext: UserContext
}

export function createTier1Agent(cfg: Tier1Config) {
  const repositories = resolveSupportRepositories(cfg)

  async function loadHistory(conversationId: string): Promise<LlmMessage[]> {
    const stored = (await repositories.conversations.findMessages(
      conversationId
    )) as StoredMessage[]
    return stored.map((m) => ({ role: m.role, content: m.content }))
  }

  async function saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    await repositories.conversations.appendMessage(conversationId, {
      role,
      content,
      ts: new Date().toISOString(),
    })
  }

  async function run(input: RunTier1Input): Promise<AgentResult> {
    const { message, conversationId, userContext } = input
    const history = await loadHistory(conversationId)
    await saveMessage(conversationId, 'user', message)

    const initial: LlmMessage[] = [...history, { role: 'user', content: message }]

    let ticketId: string | undefined
    const result = await cfg.llm.runWithTools({
      role: 'fast',
      system: cfg.systemPromptBuilder(userContext),
      messages: initial,
      tools: cfg.customTools ?? {
        definitions: [],
        execute: async () => ({ error: 'no tools' }),
      },
      maxToolLoops: cfg.maxToolLoops ?? 5,
      maxTokens: 2048,
      onToolResult: (name, _input, r) => {
        const ticket = r as { ticketId?: string }
        if (name === 'create_ticket' && ticket.ticketId) ticketId = ticket.ticketId
      },
    })

    const text = result.text || 'Desculpe, não consegui processar sua solicitação. Tente novamente.'
    await saveMessage(conversationId, 'assistant', text)
    return { text, conversationId, ticketId }
  }

  return { run }
}
