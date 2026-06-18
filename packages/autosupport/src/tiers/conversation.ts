import { eq } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type { SupportDb } from '../types.js'

type StoredMessage = { role: string; content: string; ts?: string }

// Rótulos legíveis pro transcript. 'user' é o cliente que abriu o chat; o
// 'assistant' é o agente de suporte (Tier 1). Qualquer outro role cai no próprio
// nome (defensivo — o schema só grava user/assistant hoje).
const ROLE_LABELS: Record<string, string> = {
  user: 'Cliente',
  assistant: 'Suporte',
}

/**
 * Carrega a conversa de chat (support_conversations.messages) associada a um
 * ticket e a formata como markdown legível, pronta pra anexar ao contexto do
 * agente (Tier 2) ou ao corpo do PR (Tier 3).
 *
 * Retorna null quando não há o que anexar — sem conversationId, conversa
 * inexistente, ou sem mensagens — pra que o chamador simplesmente omita a seção.
 */
export async function loadConversationTranscript(
  db: SupportDb,
  schema: SupportSchema,
  conversationId: string | null | undefined
): Promise<string | null> {
  if (!conversationId) return null
  const [conv] = await db
    .select({ messages: schema.supportConversations.messages })
    .from(schema.supportConversations)
    .where(eq(schema.supportConversations.id, conversationId))
  if (!conv) return null
  const messages = (conv.messages ?? []) as StoredMessage[]
  if (!messages.length) return null
  return messages.map((m) => `**${ROLE_LABELS[m.role] ?? m.role}:** ${m.content}`).join('\n')
}
