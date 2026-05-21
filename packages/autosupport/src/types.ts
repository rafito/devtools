export type TicketStatus = 'open' | 'investigating' | 'fixing' | 'pr_review' | 'resolved'
export type TicketSource = 'chat' | 'sentry'

export type SupportTicketRow = {
  id: string
  tenantId: string | null
  userId: string | null
  conversationId: string | null
  description: string
  status: TicketStatus
  source: TicketSource
  sentryIssueId: string | null
  githubIssueId: number | null
  githubPrId: number | null
  resolvedAt: Date | null
  notifiedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ToolDefinition = {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export type ToolExecutor = (
  input: Record<string, unknown>,
) => Promise<unknown>

export type ToolBundle = {
  definitions: ToolDefinition[]
  execute: (name: string, input: Record<string, unknown>) => Promise<unknown>
}

export type UserContext = {
  fullName: string
  tenantName: string
  role: string
  currentPage: string
  [extra: string]: unknown
}

export type AgentResult = {
  text: string
  conversationId: string
  ticketId?: string
}

export type NotificationEvent = {
  type: 'ticket_resolved' | string
  ticketId: string
  message: string
  [extra: string]: unknown
}
