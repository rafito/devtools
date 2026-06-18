import type { Request, Response } from 'express'
import { type GitHubClient, createGitHubClient } from './clients/github.js'
import { type SentryClient, createSentryClient } from './clients/sentry-api.js'
import { type LlmConfig, createLlmProvider } from './llm/index.js'
import { type SseBus, createSseBus } from './notifications/sse-bus.js'
import { type SupportQueue, createSupportQueue } from './queue/index.js'
import { type SupportSchema, createSupportSchema } from './schema/index.js'
import { createTier1Agent } from './tiers/tier1.js'
import { createTier2Agent } from './tiers/tier2.js'
import { createTier3Agent } from './tiers/tier3.js'
import { createTier4Agent } from './tiers/tier4.js'
import { createFilesystemTools } from './tools/filesystem.js'
import { createGitTools } from './tools/git.js'
import { createGithubTools } from './tools/github-tools.js'
import { createLogsTool } from './tools/logs.js'
import { createSentryTool } from './tools/sentry-tools.js'
import { createTestsTool } from './tools/tests.js'
import type { SupportDb, ToolBundle, UserContext } from './types.js'
import { createGithubWebhookHandler } from './webhooks/github.js'
import { createSentryWebhookHandler } from './webhooks/sentry.js'

export type SupportPipelineConfig = {
  db: SupportDb
  schema?: SupportSchema
  llm: LlmConfig

  github: {
    token: string
    repo: string
    webhookSecret: string
    autoLabel?: string
  }
  sentry: {
    apiToken: string
    orgSlug: string
    projectSlug: string
    webhookSecret: string
  }
  queue: { connectionString: string }

  // Tier 2-4 environment
  rootDir: string
  logFilePath?: string
  testCommand?: {
    command?: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    timeoutMs?: number
  }
  protectedPatterns?: RegExp[]

  // Tier-specific overrides.
  // Per-role model selection lives in `llm.models` ({ fast, heavy }); per-tier
  // model overrides are deferred to a later phase, so there is no `model` here.
  tier1: {
    maxToolLoops?: number
    systemPromptBuilder: (ctx: UserContext) => string
    customTools?: ToolBundle
  }
  tier2?: { maxToolLoops?: number; systemPrompt?: string }
  tier3?: {
    maxToolLoops?: number
    systemPrompt?: string
    branchPrefix?: string
    defaultBranch?: string
  }
  tier4?: { maxToolLoops?: number; systemPrompt?: string }
}

export type SupportPipeline = {
  schema: SupportSchema
  tier1: ReturnType<typeof createTier1Agent>
  tier2: ReturnType<typeof createTier2Agent>
  tier3: ReturnType<typeof createTier3Agent>
  tier4: ReturnType<typeof createTier4Agent>
  queue: SupportQueue
  sseBus: SseBus
  webhooks: {
    github: ReturnType<typeof createGithubWebhookHandler>
    sentry: ReturnType<typeof createSentryWebhookHandler>
  }
  clients: {
    github: GitHubClient
    sentry: SentryClient
  }
}

function mergeBundles(bundles: ToolBundle[]): ToolBundle {
  const definitions = bundles.flatMap((b) => b.definitions)
  const ownerOf = new Map<string, ToolBundle>()
  for (const b of bundles) for (const d of b.definitions) ownerOf.set(d.name, b)
  return {
    definitions,
    execute: (name, input) => {
      const owner = ownerOf.get(name)
      if (!owner) return Promise.resolve({ error: `Ferramenta desconhecida: ${name}` })
      return owner.execute(name, input)
    },
  }
}

function pickBundle(bundle: ToolBundle, names: string[]): ToolBundle {
  const set = new Set(names)
  return {
    definitions: bundle.definitions.filter((d) => set.has(d.name)),
    execute: (name, input) =>
      set.has(name)
        ? bundle.execute(name, input)
        : Promise.resolve({ error: `Ferramenta desconhecida: ${name}` }),
  }
}

export function createSupportPipeline(cfg: SupportPipelineConfig): SupportPipeline {
  if (!cfg.llm) throw new Error('cfg.llm é obrigatório')
  const llm = createLlmProvider(cfg.llm)

  const schema = cfg.schema ?? createSupportSchema()

  // Nota: initSentry NÃO é chamado aqui. O consumer deve chamar initSentry({ dsn })
  // antes de qualquer import que use Express, no topo do entry point. Ver README.

  // Clients
  const githubClient = createGitHubClient({
    token: cfg.github.token,
    repo: cfg.github.repo,
  })
  const sentryApiConfigured = Boolean(
    cfg.sentry.apiToken && cfg.sentry.orgSlug && cfg.sentry.projectSlug
  )
  const sentryClient: SentryClient = sentryApiConfigured
    ? createSentryClient({
        apiToken: cfg.sentry.apiToken,
        orgSlug: cfg.sentry.orgSlug,
        projectSlug: cfg.sentry.projectSlug,
      })
    : {
        getIssue: async () => ({
          error: 'Sentry não configurado (apiToken/orgSlug/projectSlug ausentes)',
        }),
        searchIssues: async () => ({
          error: 'Sentry não configurado (apiToken/orgSlug/projectSlug ausentes)',
        }),
      }

  // SSE bus
  const sseBus = createSseBus()

  // Tool primitives
  const fsTools = createFilesystemTools({
    rootDir: cfg.rootDir,
    protectedPatterns: cfg.protectedPatterns,
  })
  const logsTool = createLogsTool({
    logFilePath: cfg.logFilePath ?? `${cfg.rootDir}/logs/server.log`,
  })
  // testsTool é opt-in: só registrado quando o consumer fornece cfg.testCommand.
  // Em produção, Tier 3 não roda testes — o CI valida no PR (Tier 4 só fecha o ciclo após CI verde).
  const testsTool = cfg.testCommand
    ? createTestsTool({
        command: cfg.testCommand.command ?? 'npx',
        args: cfg.testCommand.args ?? ['vitest', 'run', '--reporter=verbose'],
        env: cfg.testCommand.env,
        cwd: cfg.testCommand.cwd ?? cfg.rootDir,
        timeoutMs: cfg.testCommand.timeoutMs,
      })
    : null
  const gitTools = createGitTools({
    token: cfg.github.token,
    repo: cfg.github.repo,
    rootDir: cfg.rootDir,
  })
  const ghTools = createGithubTools({
    client: githubClient,
    autoLabel: cfg.github.autoLabel,
  })
  const sentryToolBundle = createSentryTool(sentryClient)

  // Bundles compostos por tier
  const tier2Tools = mergeBundles([
    fsTools,
    logsTool,
    sentryToolBundle,
    pickBundle(ghTools, ['create_github_issue']),
  ])
  const tier3Tools = mergeBundles([
    fsTools,
    logsTool,
    ...(testsTool ? [testsTool] : []),
    gitTools,
    pickBundle(ghTools, ['create_pr']),
  ])
  const tier4Tools = pickBundle(ghTools, [
    'read_pr',
    'read_pr_files',
    'approve_pr',
    'merge_pr',
    'post_review_comment',
  ])

  // Declared before the agents so they can capture it via closure (the Tier 2
  // agent's enqueueTier3 references `queue` before it is assigned below).
  // biome-ignore lint/style/useConst: late-bound after the agents capture it
  let queue: SupportQueue

  // Agents
  const tier2 = createTier2Agent({
    llm,
    maxToolLoops: cfg.tier2?.maxToolLoops,
    systemPrompt: cfg.tier2?.systemPrompt,
    db: cfg.db,
    schema,
    tools: tier2Tools,
    enqueueTier3: (id) => queue.enqueueTier3(id),
  })
  const tier3 = createTier3Agent({
    llm,
    maxToolLoops: cfg.tier3?.maxToolLoops,
    systemPrompt: cfg.tier3?.systemPrompt,
    branchPrefix: cfg.tier3?.branchPrefix,
    defaultBranch: cfg.tier3?.defaultBranch,
    rootDir: cfg.rootDir,
    githubClient,
    db: cfg.db,
    schema,
    tools: tier3Tools,
  })
  const tier4 = createTier4Agent({
    llm,
    maxToolLoops: cfg.tier4?.maxToolLoops,
    systemPrompt: cfg.tier4?.systemPrompt,
    db: cfg.db,
    schema,
    tools: tier4Tools,
  })

  const tier1 = createTier1Agent({
    llm,
    maxToolLoops: cfg.tier1.maxToolLoops,
    systemPromptBuilder: cfg.tier1.systemPromptBuilder,
    customTools: cfg.tier1.customTools,
    db: cfg.db,
    schema,
  })

  // Queue wired after agents (needs agent runners)
  queue = createSupportQueue({
    connectionString: cfg.queue.connectionString,
    runners: {
      tier2: (id) => tier2.run(id),
      tier3: (id) => tier3.run(id),
      tier4: (pr, id) => tier4.run(pr, id),
    },
  })

  // Webhooks. Sentry handler só é criado se webhookSecret + projectSlug presentes.
  const sentryWebhookConfigured = Boolean(cfg.sentry.webhookSecret && cfg.sentry.projectSlug)
  const webhooks = {
    github: createGithubWebhookHandler({
      db: cfg.db,
      schema,
      queue,
      sseBus,
      githubClient,
      webhookSecret: cfg.github.webhookSecret,
      autoLabel: cfg.github.autoLabel,
    }),
    sentry: sentryWebhookConfigured
      ? createSentryWebhookHandler({
          db: cfg.db,
          schema,
          queue,
          webhookSecret: cfg.sentry.webhookSecret,
          projectSlug: cfg.sentry.projectSlug,
        })
      : ((async (_req: Request, res: Response) =>
          res.status(503).json({
            error: 'Sentry webhook não configurado (webhookSecret ausente)',
          })) as ReturnType<typeof createSentryWebhookHandler>),
  }

  return {
    schema,
    tier1,
    tier2,
    tier3,
    tier4,
    queue,
    sseBus,
    webhooks,
    clients: { github: githubClient, sentry: sentryClient },
  }
}
