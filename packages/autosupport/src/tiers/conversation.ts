import { resolveSupportRepositories } from '../persistence/drizzle.js'
import type { SupportRepositories } from '../persistence/types.js'
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
export function loadConversationTranscript(
  repositories: SupportRepositories,
  conversationId: string | null | undefined
): Promise<string | null>
export function loadConversationTranscript(
  db: SupportDb,
  schema: SupportSchema,
  conversationId: string | null | undefined
): Promise<string | null>
export async function loadConversationTranscript(
  repositoriesOrDb: SupportRepositories | SupportDb,
  schemaOrConversationId: SupportSchema | string | null | undefined,
  legacyConversationId?: string | null
): Promise<string | null> {
  const repositoryMode =
    typeof repositoriesOrDb === 'object' &&
    repositoriesOrDb !== null &&
    'conversations' in repositoriesOrDb
  const repositories = repositoryMode
    ? (repositoriesOrDb as SupportRepositories)
    : resolveSupportRepositories({
        db: repositoriesOrDb,
        schema: schemaOrConversationId as SupportSchema,
      })
  const conversationId = repositoryMode
    ? (schemaOrConversationId as string | null | undefined)
    : legacyConversationId

  if (!conversationId) return null
  const messages = (await repositories.conversations.findMessages(
    conversationId
  )) as StoredMessage[]
  if (!messages.length) return null
  return messages.map((m) => `**${ROLE_LABELS[m.role] ?? m.role}:** ${m.content}`).join('\n')
}
