import type {
  CreateConversationInput,
  CreateTicketInput,
  SupportConversationRow,
  SupportMessage,
  SupportTicketRow,
  UpdateTicketInput,
} from '../types.js'

export type TicketRepository = {
  findById(id: string): Promise<SupportTicketRow | null>
  findByGithubIssueId(issueNumber: number): Promise<SupportTicketRow | null>
  findByGithubPrId(prNumber: number): Promise<SupportTicketRow | null>
  create(input: CreateTicketInput): Promise<SupportTicketRow>
  update(id: string, patch: UpdateTicketInput): Promise<void>
}

export type ConversationRepository = {
  findById(id: string): Promise<SupportConversationRow | null>
  findMessages(id: string): Promise<SupportMessage[]>
  create(input: CreateConversationInput): Promise<SupportConversationRow>
  appendMessage(id: string, message: SupportMessage): Promise<void>
}

export type SupportRepositories = {
  tickets: TicketRepository
  conversations: ConversationRepository
}

export type RepositoryPersistenceConfig = {
  repositories: SupportRepositories
  db?: never
  schema?: never
}
