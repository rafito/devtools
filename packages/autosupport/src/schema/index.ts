import { sql } from 'drizzle-orm'
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type CreateSchemaOptions = {
  tablePrefix?: string // default ''
}

export function createSupportSchema(opts: CreateSchemaOptions = {}) {
  const p = opts.tablePrefix ?? ''

  const supportTicketStatusEnum = pgEnum(`${p}support_ticket_status`, [
    'open',
    'investigating',
    'fixing',
    'pr_review',
    'resolved',
  ])

  const supportTicketSourceEnum = pgEnum(`${p}support_ticket_source`, ['chat', 'sentry'])

  const supportConversations = pgTable(`${p}support_conversations`, {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    messages: jsonb('messages')
      .$type<{ role: string; content: string; ts: string }[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  })

  const supportTickets = pgTable(`${p}support_tickets`, {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    userId: uuid('user_id'),
    conversationId: uuid('conversation_id'),
    description: text('description').notNull(),
    status: supportTicketStatusEnum('status').notNull().default('open'),
    source: supportTicketSourceEnum('source').notNull().default('chat'),
    sentryIssueId: text('sentry_issue_id'),
    githubIssueId: integer('github_issue_id'),
    githubPrId: integer('github_pr_id'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    notifiedAt: timestamp('notified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  })

  return {
    supportTicketStatusEnum,
    supportTicketSourceEnum,
    supportConversations,
    supportTickets,
  }
}

export type SupportSchema = ReturnType<typeof createSupportSchema>
