import { stat } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { createSupportPipeline } from '../factory.js'
import { VERSION } from '../version.js'
import { createGithubWebhookProcessor } from '../webhooks/github.js'
import { createSentryWebhookProcessor } from '../webhooks/sentry.js'
import type { AutosupportServiceConfig } from './config.js'
import { createServiceDatabase } from './database.js'
import { createAutosupportHttpServer } from './server.js'

const SERVICE_PROTECTED_PATTERNS = [
  /^\.env(?:\.|$)/,
  /^\.git(?:\/|$)/,
  /^\.github\/workflows(?:\/|$)/,
]

async function assertProjectDirectory(rootDir: string): Promise<void> {
  const info = await stat(rootDir).catch(() => {
    throw new Error(`AUTOSUPPORT_ROOT_DIR não existe: ${rootDir}`)
  })
  if (!info.isDirectory()) {
    throw new Error(`AUTOSUPPORT_ROOT_DIR não é um diretório: ${rootDir}`)
  }
}

export async function startAutosupportService(config: AutosupportServiceConfig) {
  await assertProjectDirectory(config.rootDir)
  const database = await createServiceDatabase(config.databaseUrl)

  const pipeline = createSupportPipeline({
    repositories: database.repositories,
    llm: config.llm,
    github: config.github,
    sentry: config.sentry,
    queue: { connectionString: config.databaseUrl },
    rootDir: config.rootDir,
    logFilePath: config.logFilePath,
    testCommand: config.testCommand,
    protectedPatterns: SERVICE_PROTECTED_PATTERNS,
    tier1: {
      systemPromptBuilder: () =>
        'Você é o agente de suporte técnico. Responda com clareza e encaminhe bugs para investigação.',
    },
    tier3: {
      defaultBranch: config.defaultBranch,
    },
  })

  const githubWebhook = createGithubWebhookProcessor({
    repositories: database.repositories,
    queue: pipeline.queue,
    sseBus: pipeline.sseBus,
    githubClient: pipeline.clients.github,
    webhookSecret: config.github.webhookSecret,
    autoLabel: config.github.autoLabel,
  })
  const sentryWebhook =
    config.sentry.webhookSecret && config.sentry.projectSlug
      ? createSentryWebhookProcessor({
          repositories: database.repositories,
          queue: pipeline.queue,
          webhookSecret: config.sentry.webhookSecret,
          projectSlug: config.sentry.projectSlug,
        })
      : undefined

  const server = createAutosupportHttpServer({
    serviceToken: config.serviceToken,
    repositories: database.repositories,
    queue: pipeline.queue,
    githubWebhook,
    sentryWebhook,
    version: VERSION,
  })

  try {
    await pipeline.queue.start()
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => {
        server.off('listening', onListening)
        reject(error)
      }
      const onListening = () => {
        server.off('error', onError)
        resolve()
      }
      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(config.port, config.host)
    })
  } catch (error) {
    await pipeline.queue.stop().catch(() => undefined)
    await database.close().catch(() => undefined)
    throw error
  }

  let closed = false
  async function close(): Promise<void> {
    if (closed) return
    closed = true
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await pipeline.queue.stop()
    await database.close()
  }

  const address = server.address() as AddressInfo
  return {
    server,
    pipeline,
    database,
    url: `http://${config.host}:${address.port}`,
    close,
  }
}

export type AutosupportService = Awaited<ReturnType<typeof startAutosupportService>>

export { loadServiceConfig } from './config.js'
export type { AutosupportServiceConfig, ServiceTestCommand } from './config.js'
export { createAutosupportHttpServer } from './server.js'
export type { AutosupportHttpServerDeps } from './server.js'
export { bootstrapServiceSchema, createServiceDatabase } from './database.js'
