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

// Queue
export { createSupportQueue } from './queue/index.js'
export type { SupportQueue, CreateQueueOptions, SupportQueueRunners } from './queue/index.js'

// Tools (primitives)
export { createFilesystemTools } from './tools/filesystem.js'
export type { FilesystemToolsConfig } from './tools/filesystem.js'
export { createLogsTool } from './tools/logs.js'
export type { LogsToolConfig } from './tools/logs.js'
export { createTestsTool } from './tools/tests.js'
export type { TestsToolConfig } from './tools/tests.js'
export { createGitTools } from './tools/git.js'
export type { GitToolsConfig } from './tools/git.js'

// Tools (bundles)
export { createGithubTools } from './tools/github-tools.js'
export type { GithubToolsConfig } from './tools/github-tools.js'
export { createSentryTool } from './tools/sentry-tools.js'
