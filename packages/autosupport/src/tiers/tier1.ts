import type { ContentPart, LlmMessage, LlmProvider } from '../llm/types.js'
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
  images?: { mediaType: string; data: string }[]
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
    const { message, conversationId, userContext, images } = input
    const history = await loadHistory(conversationId)

    // Nunca persiste o base64 da imagem — só um placeholder de texto no
    // histórico. A imagem em si só é enviada ao LLM no turno atual (abaixo).
    const persistedContent = images?.length
      ? `${message}\n\n[imagem anexada — conteúdo não persistido]`
      : message
    await saveMessage(conversationId, 'user', persistedContent)

    const userContent: LlmMessage['content'] = images?.length
      ? [
          { type: 'text', text: message } satisfies ContentPart,
          ...images.map((img): ContentPart => ({ type: 'file', mediaType: img.mediaType, data: img.data })),
        ]
      : message

    const initial: LlmMessage[] = [...history, { role: 'user', content: userContent }]

    let ticketId: string | undefined
    let humanHelpOffer: { agendaUrl: string; whatsapp: string } | undefined
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
        const offer = r as { agendaUrl?: string; whatsapp?: string }
        if (name === 'offer_human_help' && offer.agendaUrl && offer.whatsapp) {
          humanHelpOffer = { agendaUrl: offer.agendaUrl, whatsapp: offer.whatsapp }
        }
      },
    })

    const text = result.text || 'Desculpe, não consegui processar sua solicitação. Tente novamente.'
    await saveMessage(conversationId, 'assistant', text)
    return { text, conversationId, ticketId, humanHelpOffer }
  }

  return { run }
}
