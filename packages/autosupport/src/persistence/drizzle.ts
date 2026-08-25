import { and, count, eq, gte, lt, sql } from 'drizzle-orm'
import type { SupportSchema } from '../schema/index.js'
import type {
  CreateConversationInput,
  CreateTicketInput,
  SupportConversationRow,
  SupportDb,
  SupportMessage,
  SupportTicketRow,
  UpdateTicketInput,
} from '../types.js'
import type {
  SentryTicketAdmissionInput,
  SentryTicketAdmissionResult,
  SupportRepositories,
} from './types.js'

export type DrizzlePersistenceConfig = {
  repositories?: never
  db: SupportDb
  schema: SupportSchema
}

export type SupportPersistenceConfig =
  | DrizzlePersistenceConfig
  | {
      repositories: SupportRepositories
      db?: never
      schema?: never
    }

export function createDrizzleRepositories(
  db: SupportDb,
  schema: SupportSchema
): SupportRepositories {
  const tickets = {
    async findById(id: string): Promise<SupportTicketRow | null> {
      const [ticket] = await db
        .select()
        .from(schema.supportTickets)
        .where(eq(schema.supportTickets.id, id))
      return (ticket as SupportTicketRow | undefined) ?? null
    },

    async findByGithubIssueId(issueNumber: number): Promise<SupportTicketRow | null> {
      const [ticket] = await db
        .select()
        .from(schema.supportTickets)
        .where(eq(schema.supportTickets.githubIssueId, issueNumber))
      return (ticket as SupportTicketRow | undefined) ?? null
    },

    async findByGithubPrId(prNumber: number): Promise<SupportTicketRow | null> {
      const [ticket] = await db
        .select()
        .from(schema.supportTickets)
        .where(eq(schema.supportTickets.githubPrId, prNumber))
      return (ticket as SupportTicketRow | undefined) ?? null
    },

    async admitSentryTicket(
      input: SentryTicketAdmissionInput
    ): Promise<SentryTicketAdmissionResult> {
      if (!Number.isInteger(input.dailyTicketLimit) || input.dailyTicketLimit < 0) {
        throw new Error('dailyTicketLimit deve ser um inteiro não negativo')
      }

      return db.transaction(async (tx: SupportDb) => {
        // The transaction-scoped advisory lock serializes all Sentry admissions
        // across service processes sharing this PostgreSQL database. Duplicate
        // lookup, daily-cap count, and insert therefore form one atomic decision.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('devorama-autosupport-sentry-admission'))`
        )

        const [duplicate] = await tx
          .select()
          .from(schema.supportTickets)
          .where(eq(schema.supportTickets.sentryIssueId, input.ticket.sentryIssueId))
        if (duplicate) {
          return { kind: 'duplicate', ticket: duplicate as SupportTicketRow }
        }

        if (input.dailyTicketLimit > 0) {
          const [result] = await tx
            .select({ value: count() })
            .from(schema.supportTickets)
            .where(
              and(
                eq(schema.supportTickets.source, 'sentry'),
                gte(schema.supportTickets.createdAt, input.utcDayStart),
                lt(schema.supportTickets.createdAt, input.utcDayEnd)
              )
            )
          const dailyCount = Number(result?.value ?? 0)
          if (dailyCount >= input.dailyTicketLimit) {
            return { kind: 'daily_limit', count: dailyCount }
          }
        }

        const [ticket] = await tx.insert(schema.supportTickets).values(input.ticket).returning()
        if (!ticket) throw new Error('Falha ao criar ticket de suporte')
        return { kind: 'created', ticket: ticket as SupportTicketRow }
      })
    },

    async create(input: CreateTicketInput): Promise<SupportTicketRow> {
      const [ticket] = await db.insert(schema.supportTickets).values(input).returning()
      if (!ticket) throw new Error('Falha ao criar ticket de suporte')
      return ticket as SupportTicketRow
    },

    async update(id: string, patch: UpdateTicketInput): Promise<void> {
      await db.update(schema.supportTickets).set(patch).where(eq(schema.supportTickets.id, id))
    },
  }

  const conversations = {
    async findById(id: string): Promise<SupportConversationRow | null> {
      const [conversation] = await db
        .select()
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.id, id))
      return (conversation as SupportConversationRow | undefined) ?? null
    },

    async findMessages(id: string): Promise<SupportMessage[]> {
      const [conversation] = await db
        .select({ messages: schema.supportConversations.messages })
        .from(schema.supportConversations)
        .where(eq(schema.supportConversations.id, id))
      return (conversation?.messages as SupportMessage[] | undefined) ?? []
    },

    async create(input: CreateConversationInput): Promise<SupportConversationRow> {
      const [conversation] = await db
        .insert(schema.supportConversations)
        .values({ ...input, messages: input.messages ?? [] })
        .returning()
      if (!conversation) throw new Error('Falha ao criar conversa de suporte')
      return conversation as SupportConversationRow
    },

    async appendMessage(id: string, message: SupportMessage): Promise<void> {
      const existing = await conversations.findMessages(id)
      await db
        .update(schema.supportConversations)
        .set({ messages: [...existing, message], updatedAt: new Date() })
        .where(eq(schema.supportConversations.id, id))
    },
  }

  return { tickets, conversations }
}

export function resolveSupportRepositories(config: {
  repositories?: SupportRepositories
  db?: SupportDb
  schema?: SupportSchema
}): SupportRepositories {
  if (config.repositories) return config.repositories
  if (config.db && config.schema) return createDrizzleRepositories(config.db, config.schema)
  throw new Error('Configure repositories ou db + schema para persistência do autosupport')
}
