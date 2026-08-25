import { isAbsolute } from 'node:path'
import type { LlmConfig } from '../llm/index.js'

export type ServiceTestCommand = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  timeoutMs?: number
}

export type AutosupportServiceConfig = {
  databaseUrl: string
  host: string
  port: number
  rootDir: string
  serviceToken: string
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
    ingestEnabled: boolean
    dailyTicketLimit: number
    ignoredTitlePatterns: string[]
  }
  autoFixEnabled: boolean
  logFilePath?: string
  testCommand?: ServiceTestCommand
  defaultBranch?: string
  // Orçamento de chamadas de ferramenta por tier. Sem override, cada tier usa
  // o default hardcoded (tier2=8, tier3=12, tier4=6) — bom o suficiente pra
  // repositórios pequenos, mas insuficiente pra investigar um monorepo grande
  // antes de esgotar o loop: o agente lê/grepa o código e nunca chega a criar
  // o issue (nem erro, nem log — o job pg-boss só "completa" sem efeito
  // visível). Só o modo standalone tinha esse gap; o embutido em Node já
  // aceitava via `tier2`/`tier3`/`tier4` na config do `createSupportPipeline`.
  tier2MaxToolLoops?: number
  tier3MaxToolLoops?: number
  tier4MaxToolLoops?: number
  tier2RetryLimit: number
  tier3RetryLimit: number
  tier4RetryLimit: number
}

type ServiceEnvironment = Record<string, string | undefined>

function required(env: ServiceEnvironment, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} é obrigatório`)
  return value
}

function optional(env: ServiceEnvironment, name: string): string | undefined {
  const value = env[name]?.trim()
  return value || undefined
}

function parsePort(raw: string | undefined): number {
  if (!raw) return 4310
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('AUTOSUPPORT_PORT deve ser um inteiro entre 1 e 65535')
  }
  return port
}

function parseMaxToolLoops(raw: string | undefined, name: string): number | undefined {
  if (!raw) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 1 || value > 200) {
    throw new Error(`${name} deve ser um inteiro entre 1 e 200`)
  }
  return value
}

function parseBoolean(raw: string | undefined, name: string, defaultValue: boolean): boolean {
  if (raw === undefined) return defaultValue
  if (raw.toLowerCase() === 'true') return true
  if (raw.toLowerCase() === 'false') return false
  throw new Error(`${name} deve ser true ou false`)
}

function parseNonnegativeInteger(
  raw: string | undefined,
  name: string,
  defaultValue: number
): number {
  if (raw === undefined) return defaultValue
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} deve ser um inteiro não negativo`)
  }
  return value
}

function parseIgnoredTitlePatterns(raw: string | undefined): string[] {
  if (raw === undefined) return []

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON deve conter JSON válido')
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error('AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON deve ser uma lista de strings')
  }
  return value.map((entry) => entry.trim()).filter(Boolean)
}

function parseTestCommand(raw: string | undefined): ServiceTestCommand | undefined {
  if (!raw) return undefined

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('AUTOSUPPORT_TEST_COMMAND_JSON deve conter JSON válido')
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('AUTOSUPPORT_TEST_COMMAND_JSON deve ser um objeto')
  }

  const parsed = value as Record<string, unknown>
  if (
    typeof parsed.command !== 'string' ||
    !parsed.command ||
    !/^[\w./:\\-]+$/.test(parsed.command)
  ) {
    throw new Error('test command deve ser um executável, sem operadores de shell')
  }
  if (
    parsed.args !== undefined &&
    (!Array.isArray(parsed.args) || parsed.args.some((arg) => typeof arg !== 'string'))
  ) {
    throw new Error('test command args deve ser uma lista de strings')
  }
  if (
    parsed.env !== undefined &&
    (!parsed.env ||
      typeof parsed.env !== 'object' ||
      Array.isArray(parsed.env) ||
      Object.values(parsed.env).some((entry) => typeof entry !== 'string'))
  ) {
    throw new Error('test command env deve mapear strings para strings')
  }
  if (parsed.cwd !== undefined && typeof parsed.cwd !== 'string') {
    throw new Error('test command cwd deve ser uma string')
  }
  if (
    parsed.timeoutMs !== undefined &&
    (typeof parsed.timeoutMs !== 'number' ||
      !Number.isFinite(parsed.timeoutMs) ||
      parsed.timeoutMs <= 0)
  ) {
    throw new Error('test command timeoutMs deve ser um número positivo')
  }

  return {
    command: parsed.command,
    args: parsed.args as string[] | undefined,
    env: parsed.env as Record<string, string> | undefined,
    cwd: parsed.cwd as string | undefined,
    timeoutMs: parsed.timeoutMs as number | undefined,
  }
}

function parseLlm(env: ServiceEnvironment): LlmConfig {
  const explicitProvider = optional(env, 'AUTOSUPPORT_LLM_PROVIDER')
  if (
    explicitProvider !== undefined &&
    explicitProvider !== 'openai' &&
    explicitProvider !== 'anthropic'
  ) {
    throw new Error('AUTOSUPPORT_LLM_PROVIDER deve ser openai ou anthropic')
  }

  const provider =
    explicitProvider ??
    (optional(env, 'OPENAI_API_KEY')
      ? 'openai'
      : optional(env, 'ANTHROPIC_API_KEY')
        ? 'anthropic'
        : undefined)
  if (!provider) throw new Error('Configure OPENAI_API_KEY ou ANTHROPIC_API_KEY')

  const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
  const apiKey = required(env, keyName)
  const fast = optional(env, 'AUTOSUPPORT_FAST_MODEL')
  const heavy = optional(env, 'AUTOSUPPORT_HEAVY_MODEL')
  const models =
    fast || heavy ? { ...(fast ? { fast } : {}), ...(heavy ? { heavy } : {}) } : undefined

  return { provider, apiKey, ...(models ? { models } : {}) }
}

export function loadServiceConfig(env: ServiceEnvironment = process.env): AutosupportServiceConfig {
  const serviceToken = required(env, 'AUTOSUPPORT_SERVICE_TOKEN')
  if (serviceToken.length < 16) {
    throw new Error('AUTOSUPPORT_SERVICE_TOKEN deve ter pelo menos 16 caracteres')
  }

  const repo = required(env, 'AUTOSUPPORT_GITHUB_REPO')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repo)) {
    throw new Error("AUTOSUPPORT_GITHUB_REPO deve usar o formato 'owner/repo'")
  }
  const rootDir = required(env, 'AUTOSUPPORT_ROOT_DIR')
  if (!isAbsolute(rootDir)) {
    throw new Error('AUTOSUPPORT_ROOT_DIR deve ser um caminho absoluto')
  }

  const sentry = {
    apiToken: optional(env, 'AUTOSUPPORT_SENTRY_API_TOKEN') ?? '',
    orgSlug: optional(env, 'AUTOSUPPORT_SENTRY_ORG') ?? '',
    projectSlug: optional(env, 'AUTOSUPPORT_SENTRY_PROJECT') ?? '',
    webhookSecret: optional(env, 'AUTOSUPPORT_SENTRY_WEBHOOK_SECRET') ?? '',
    ingestEnabled: parseBoolean(
      optional(env, 'AUTOSUPPORT_SENTRY_INGEST_ENABLED'),
      'AUTOSUPPORT_SENTRY_INGEST_ENABLED',
      true
    ),
    dailyTicketLimit: parseNonnegativeInteger(
      optional(env, 'AUTOSUPPORT_SENTRY_DAILY_TICKET_LIMIT'),
      'AUTOSUPPORT_SENTRY_DAILY_TICKET_LIMIT',
      0
    ),
    ignoredTitlePatterns: parseIgnoredTitlePatterns(
      optional(env, 'AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON')
    ),
  }
  if (sentry.webhookSecret && !sentry.projectSlug) {
    throw new Error(
      'AUTOSUPPORT_SENTRY_PROJECT é obrigatório quando AUTOSUPPORT_SENTRY_WEBHOOK_SECRET é usado'
    )
  }
  if (
    (sentry.apiToken || sentry.orgSlug) &&
    !(sentry.apiToken && sentry.orgSlug && sentry.projectSlug)
  ) {
    throw new Error(
      'Configure AUTOSUPPORT_SENTRY_API_TOKEN, AUTOSUPPORT_SENTRY_ORG e AUTOSUPPORT_SENTRY_PROJECT juntos'
    )
  }

  return {
    databaseUrl: required(env, 'AUTOSUPPORT_DATABASE_URL'),
    host: optional(env, 'AUTOSUPPORT_HOST') ?? '127.0.0.1',
    port: parsePort(optional(env, 'AUTOSUPPORT_PORT')),
    rootDir,
    serviceToken,
    llm: parseLlm(env),
    github: {
      token: required(env, 'AUTOSUPPORT_GITHUB_TOKEN'),
      repo,
      webhookSecret: required(env, 'AUTOSUPPORT_GITHUB_WEBHOOK_SECRET'),
      autoLabel: optional(env, 'AUTOSUPPORT_AUTO_LABEL'),
    },
    sentry,
    autoFixEnabled: parseBoolean(
      optional(env, 'AUTOSUPPORT_AUTO_FIX_ENABLED'),
      'AUTOSUPPORT_AUTO_FIX_ENABLED',
      true
    ),
    logFilePath: optional(env, 'AUTOSUPPORT_LOG_FILE'),
    testCommand: parseTestCommand(optional(env, 'AUTOSUPPORT_TEST_COMMAND_JSON')),
    defaultBranch: optional(env, 'AUTOSUPPORT_DEFAULT_BRANCH'),
    tier2MaxToolLoops: parseMaxToolLoops(
      optional(env, 'AUTOSUPPORT_TIER2_MAX_TOOL_LOOPS'),
      'AUTOSUPPORT_TIER2_MAX_TOOL_LOOPS'
    ),
    tier3MaxToolLoops: parseMaxToolLoops(
      optional(env, 'AUTOSUPPORT_TIER3_MAX_TOOL_LOOPS'),
      'AUTOSUPPORT_TIER3_MAX_TOOL_LOOPS'
    ),
    tier4MaxToolLoops: parseMaxToolLoops(
      optional(env, 'AUTOSUPPORT_TIER4_MAX_TOOL_LOOPS'),
      'AUTOSUPPORT_TIER4_MAX_TOOL_LOOPS'
    ),
    tier2RetryLimit: parseNonnegativeInteger(
      optional(env, 'AUTOSUPPORT_TIER2_RETRY_LIMIT'),
      'AUTOSUPPORT_TIER2_RETRY_LIMIT',
      3
    ),
    tier3RetryLimit: parseNonnegativeInteger(
      optional(env, 'AUTOSUPPORT_TIER3_RETRY_LIMIT'),
      'AUTOSUPPORT_TIER3_RETRY_LIMIT',
      1
    ),
    tier4RetryLimit: parseNonnegativeInteger(
      optional(env, 'AUTOSUPPORT_TIER4_RETRY_LIMIT'),
      'AUTOSUPPORT_TIER4_RETRY_LIMIT',
      1
    ),
  }
}
