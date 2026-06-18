export const VERSION = '0.3.2'

// Headline factory
export { createSupportPipeline } from './factory.js'
export type { SupportPipelineConfig, SupportPipeline } from './factory.js'

// Schema
export { createSupportSchema } from './schema/index.js'
export type { CreateSchemaOptions, SupportSchema } from './schema/index.js'

// Types
export type {
  SupportDb,
  TicketStatus,
  TicketSource,
  SupportTicketRow,
  ToolDefinition,
  ToolExecutor,
  ToolBundle,
  UserContext,
  AgentResult,
  NotificationEvent,
} from './types.js'

// Clients
export { createGitHubClient } from './clients/github.js'
export type {
  GitHubClient,
  GitHubIssue,
  GitHubPR,
  GitHubPRFile,
  GitHubReview,
  GitHubMergeResult,
} from './clients/github.js'

// Sentry
export { createSentryClient } from './clients/sentry-api.js'
export type {
  SentryClient,
  SentryConfig,
  SentryIssueResult,
  SentrySearchResult,
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

// Webhooks
export { createGithubWebhookHandler } from './webhooks/github.js'
export type { GithubWebhookDeps } from './webhooks/github.js'
export { createSentryWebhookHandler } from './webhooks/sentry.js'
export type { SentryWebhookDeps } from './webhooks/sentry.js'

// Tiers
export { loadConversationTranscript } from './tiers/conversation.js'
export { runToolLoop } from './tiers/runner.js'
export type { ToolLoopOptions, ToolLoopResult } from './tiers/runner.js'
export { createTier1Agent } from './tiers/tier1.js'
export type { Tier1Config, RunTier1Input } from './tiers/tier1.js'
export { createTier2Agent } from './tiers/tier2.js'
export type { Tier2Config } from './tiers/tier2.js'
export { createTier3Agent } from './tiers/tier3.js'
export type { Tier3Config } from './tiers/tier3.js'
export { createTier4Agent } from './tiers/tier4.js'
export type { Tier4Config } from './tiers/tier4.js'
