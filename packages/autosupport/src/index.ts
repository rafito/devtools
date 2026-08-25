export { VERSION } from './version.js'

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
  SupportMessage,
  SupportConversationRow,
  CreateTicketInput,
  UpdateTicketInput,
  CreateConversationInput,
  ToolDefinition,
  ToolExecutor,
  ToolBundle,
  UserContext,
  AgentResult,
  NotificationEvent,
} from './types.js'

// Persistence ports and built-in Drizzle adapter
export { createDrizzleRepositories, resolveSupportRepositories } from './persistence/drizzle.js'
export type {
  DrizzlePersistenceConfig,
  SupportPersistenceConfig,
} from './persistence/drizzle.js'
export type {
  TicketRepository,
  SentryTicketAdmissionInput,
  SentryTicketAdmissionResult,
  ConversationRepository,
  SupportRepositories,
  RepositoryPersistenceConfig,
} from './persistence/types.js'

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
export { createGithubWebhookProcessor } from './webhooks/github.js'
export type { GithubWebhookDeps } from './webhooks/github.js'
export { createSentryWebhookHandler } from './webhooks/sentry.js'
export { createSentryWebhookProcessor } from './webhooks/sentry.js'
export type { SentryWebhookDeps } from './webhooks/sentry.js'
export type {
  WebhookHeaders,
  WebhookProcessorRequest,
  WebhookResult,
  WebhookAdapterRequest,
  WebhookAdapterResponse,
} from './webhooks/types.js'

// LLM provider port
export { createLlmProvider } from './llm/index.js'
export { LlmRunError } from './llm/index.js'
export type {
  LlmProvider,
  LlmConfig,
  LlmMessage,
  LlmRunOptions,
  LlmRunResult,
  LlmModelRole,
} from './llm/index.js'

// Tiers
export { loadConversationTranscript } from './tiers/conversation.js'
export { createTier1Agent } from './tiers/tier1.js'
export type { Tier1Config, RunTier1Input } from './tiers/tier1.js'
export { createTier2Agent } from './tiers/tier2.js'
export type { Tier2Config } from './tiers/tier2.js'
export { createTier3Agent } from './tiers/tier3.js'
export type { Tier3Config } from './tiers/tier3.js'
export { createTier4Agent } from './tiers/tier4.js'
export type { Tier4Config } from './tiers/tier4.js'

// Standalone cross-stack HTTP service
export {
  startAutosupportService,
  loadServiceConfig,
  createAutosupportHttpServer,
  bootstrapServiceSchema,
  createServiceDatabase,
} from './service/index.js'
export type {
  AutosupportService,
  AutosupportServiceConfig,
  ServiceTestCommand,
  AutosupportHttpServerDeps,
} from './service/index.js'
