export const VERSION = '0.1.0'

// Schema
export { createSupportSchema } from './schema/index.js'
export type { CreateSchemaOptions, SupportSchema } from './schema/index.js'

// Types
export type {
  TicketStatus, TicketSource, SupportTicketRow,
  ToolDefinition, ToolExecutor, ToolBundle,
  UserContext, AgentResult, NotificationEvent,
} from './types.js'

// Clients
export { createGitHubClient } from './clients/github.js'
export type {
  GitHubClient, GitHubIssue, GitHubPR, GitHubPRFile,
  GitHubReview, GitHubMergeResult,
} from './clients/github.js'

// Sentry
export { createSentryClient } from './clients/sentry-api.js'
export type {
  SentryClient, SentryConfig,
  SentryIssueResult, SentrySearchResult,
} from './clients/sentry-api.js'
export { initSentry, Sentry, setupExpressErrorHandler } from './clients/sentry-sdk.js'
export type { InitSentryOptions } from './clients/sentry-sdk.js'

// Notifications
export { createSseBus } from './notifications/sse-bus.js'
export type { SseBus, SseListener } from './notifications/sse-bus.js'
