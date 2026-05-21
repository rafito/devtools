import Anthropic from '@anthropic-ai/sdk'
import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type { ToolBundle, UserContext, AgentResult } from '../types.js'
import { runToolLoop } from './runner.js'

type StoredMessage = { role: 'user' | 'assistant'; content: string; ts: string }

export type Tier1Config = {
  anthropicApiKey: string
  model?: string
  maxToolLoops?: number
  systemPromptBuilder: (ctx: UserContext) => string
  customTools?: ToolBundle
  db: any
  schema: SupportSchema
}

export type RunTier1Input = {
  message: string
  conversationId: string
  userContext: UserContext
}

export function createTier1Agent(cfg: Tier1Config) {
  if (!cfg.anthropicApiKey) throw new Error('anthropicApiKey não configurada')
  const client = new Anthropic({ apiKey: cfg.anthropicApiKey })

  async function loadHistory(conversationId: string): Promise<Anthropic.MessageParam[]> {
    const [conv] = await cfg.db
      .select({ messages: cfg.schema.supportConversations.messages })
      .from(cfg.schema.supportConversations)
      .where(eq(cfg.schema.supportConversations.id, conversationId))
    if (!conv) return []
    const stored = conv.messages as StoredMessage[]
    return stored.map((m) => ({ role: m.role, content: m.content }))
  }

  async function saveMessage(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<void> {
    const [conv] = await cfg.db
      .select({ messages: cfg.schema.supportConversations.messages })
      .from(cfg.schema.supportConversations)
      .where(eq(cfg.schema.supportConversations.id, conversationId))
    const existing = (conv?.messages ?? []) as StoredMessage[]
    const updated = [...existing, { role, content, ts: new Date().toISOString() }]
    await cfg.db
      .update(cfg.schema.supportConversations)
      .set({ messages: updated, updatedAt: new Date() })
      .where(eq(cfg.schema.supportConversations.id, conversationId))
  }

  async function run(input: RunTier1Input): Promise<AgentResult> {
    const { message, conversationId, userContext } = input
    const history = await loadHistory(conversationId)
    await saveMessage(conversationId, 'user', message)

    const initial: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: message },
    ]

    let ticketId: string | undefined
    const result = await runToolLoop({
      client,
      model: cfg.model ?? 'claude-haiku-4-5',
      maxTokens: 2048,
      system: cfg.systemPromptBuilder(userContext),
      maxToolLoops: cfg.maxToolLoops ?? 5,
      initialMessages: initial,
      tools: cfg.customTools ?? {
        definitions: [],
        execute: async () => ({ error: 'no tools' }),
      },
      onToolResult: (name, _input, r) => {
        if (name === 'create_ticket' && (r as any).ticketId) ticketId = (r as any).ticketId
      },
    })

    const text =
      result.text || 'Desculpe, não consegui processar sua solicitação. Tente novamente.'
    await saveMessage(conversationId, 'assistant', text)
    return { text, conversationId, ticketId }
  }

  return { run }
}
