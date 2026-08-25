import { describe, expect, it } from 'vitest'
import { loadServiceConfig } from '../../src/service/config'

const required = {
  AUTOSUPPORT_DATABASE_URL: 'postgres://localhost/autosupport',
  AUTOSUPPORT_GITHUB_TOKEN: 'github-token',
  AUTOSUPPORT_GITHUB_REPO: 'org/repo',
  AUTOSUPPORT_GITHUB_WEBHOOK_SECRET: 'github-webhook-secret',
  AUTOSUPPORT_ROOT_DIR: '/workspace/app',
  AUTOSUPPORT_SERVICE_TOKEN: 'service-token-with-enough-entropy',
  OPENAI_API_KEY: 'openai-key',
}

describe('loadServiceConfig', () => {
  it('loads required values and safe defaults', () => {
    const config = loadServiceConfig(required)

    expect(config.host).toBe('127.0.0.1')
    expect(config.port).toBe(4310)
    expect(config.llm).toEqual({ provider: 'openai', apiKey: 'openai-key' })
    expect(config.github.repo).toBe('org/repo')
    expect(config.sentry.ingestEnabled).toBe(true)
    expect(config.sentry.dailyTicketLimit).toBe(0)
    expect(config.sentry.ignoredTitlePatterns).toEqual([])
    expect(config.autoFixEnabled).toBe(true)
    expect(config.tier2RetryLimit).toBe(3)
    expect(config.tier3RetryLimit).toBe(1)
    expect(config.tier4RetryLimit).toBe(1)
  })

  it('supports Anthropic, model overrides, Sentry, and pytest configuration', () => {
    const config = loadServiceConfig({
      ...required,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: 'anthropic-key',
      AUTOSUPPORT_LLM_PROVIDER: 'anthropic',
      AUTOSUPPORT_FAST_MODEL: 'fast-model',
      AUTOSUPPORT_HEAVY_MODEL: 'heavy-model',
      AUTOSUPPORT_SENTRY_API_TOKEN: 'sentry-token',
      AUTOSUPPORT_SENTRY_ORG: 'org',
      AUTOSUPPORT_SENTRY_PROJECT: 'project',
      AUTOSUPPORT_SENTRY_WEBHOOK_SECRET: 'sentry-secret',
      AUTOSUPPORT_TEST_COMMAND_JSON: JSON.stringify({
        command: 'python',
        args: ['-m', 'pytest'],
        cwd: '/workspace/app',
        timeoutMs: 300_000,
      }),
    })

    expect(config.llm).toEqual({
      provider: 'anthropic',
      apiKey: 'anthropic-key',
      models: { fast: 'fast-model', heavy: 'heavy-model' },
    })
    expect(config.sentry.projectSlug).toBe('project')
    expect(config.testCommand?.args).toEqual(['-m', 'pytest'])
  })

  it.each([
    ['AUTOSUPPORT_DATABASE_URL'],
    ['AUTOSUPPORT_GITHUB_TOKEN'],
    ['AUTOSUPPORT_GITHUB_REPO'],
    ['AUTOSUPPORT_GITHUB_WEBHOOK_SECRET'],
    ['AUTOSUPPORT_ROOT_DIR'],
    ['AUTOSUPPORT_SERVICE_TOKEN'],
  ])('rejects missing %s', (name) => {
    expect(() => loadServiceConfig({ ...required, [name]: undefined })).toThrow(name)
  })

  it('rejects an invalid port and weak empty token', () => {
    expect(() => loadServiceConfig({ ...required, AUTOSUPPORT_PORT: '70000' })).toThrow(
      'AUTOSUPPORT_PORT'
    )
    expect(() => loadServiceConfig({ ...required, AUTOSUPPORT_SERVICE_TOKEN: '   ' })).toThrow(
      'AUTOSUPPORT_SERVICE_TOKEN'
    )
    expect(() => loadServiceConfig({ ...required, AUTOSUPPORT_ROOT_DIR: 'relative/path' })).toThrow(
      'AUTOSUPPORT_ROOT_DIR'
    )
  })

  it('rejects malformed or unsafe test command JSON', () => {
    expect(() => loadServiceConfig({ ...required, AUTOSUPPORT_TEST_COMMAND_JSON: '{' })).toThrow(
      'AUTOSUPPORT_TEST_COMMAND_JSON'
    )
    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_TEST_COMMAND_JSON: JSON.stringify({ command: 'pytest && echo unsafe' }),
      })
    ).toThrow('command')
  })

  it('requires the API key for an explicitly selected provider', () => {
    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: undefined,
      })
    ).toThrow('ANTHROPIC_API_KEY')
  })

  it('rejects incomplete Sentry configuration', () => {
    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_SENTRY_WEBHOOK_SECRET: 'sentry-secret',
      })
    ).toThrow('AUTOSUPPORT_SENTRY_PROJECT')

    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_SENTRY_API_TOKEN: 'sentry-token',
        AUTOSUPPORT_SENTRY_PROJECT: 'project',
      })
    ).toThrow('AUTOSUPPORT_SENTRY_ORG')
  })

  it('leaves tier maxToolLoops undefined by default (tiers use their own hardcoded default)', () => {
    const config = loadServiceConfig(required)

    expect(config.tier2MaxToolLoops).toBeUndefined()
    expect(config.tier3MaxToolLoops).toBeUndefined()
    expect(config.tier4MaxToolLoops).toBeUndefined()
  })

  it('parses tier maxToolLoops overrides', () => {
    const config = loadServiceConfig({
      ...required,
      AUTOSUPPORT_TIER2_MAX_TOOL_LOOPS: '20',
      AUTOSUPPORT_TIER3_MAX_TOOL_LOOPS: '25',
      AUTOSUPPORT_TIER4_MAX_TOOL_LOOPS: '10',
    })

    expect(config.tier2MaxToolLoops).toBe(20)
    expect(config.tier3MaxToolLoops).toBe(25)
    expect(config.tier4MaxToolLoops).toBe(10)
  })

  it('parses cost-control flags, Sentry filters, and retry limits', () => {
    const config = loadServiceConfig({
      ...required,
      AUTOSUPPORT_SENTRY_INGEST_ENABLED: 'false',
      AUTOSUPPORT_AUTO_FIX_ENABLED: 'FALSE',
      AUTOSUPPORT_SENTRY_DAILY_TICKET_LIMIT: '12',
      AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON: JSON.stringify([
        'circuit breaker',
        'throttle',
      ]),
      AUTOSUPPORT_TIER2_RETRY_LIMIT: '0',
      AUTOSUPPORT_TIER3_RETRY_LIMIT: '2',
      AUTOSUPPORT_TIER4_RETRY_LIMIT: '4',
    })

    expect(config.sentry).toMatchObject({
      ingestEnabled: false,
      dailyTicketLimit: 12,
      ignoredTitlePatterns: ['circuit breaker', 'throttle'],
    })
    expect(config.autoFixEnabled).toBe(false)
    expect(config.tier2RetryLimit).toBe(0)
    expect(config.tier3RetryLimit).toBe(2)
    expect(config.tier4RetryLimit).toBe(4)
  })

  it.each([
    ['AUTOSUPPORT_SENTRY_DAILY_TICKET_LIMIT', '-1'],
    ['AUTOSUPPORT_SENTRY_DAILY_TICKET_LIMIT', '1.5'],
    ['AUTOSUPPORT_TIER2_RETRY_LIMIT', '-1'],
    ['AUTOSUPPORT_TIER3_RETRY_LIMIT', '1.5'],
    ['AUTOSUPPORT_TIER4_RETRY_LIMIT', 'nope'],
  ])('rejects invalid nonnegative integer %s=%s', (name, value) => {
    expect(() => loadServiceConfig({ ...required, [name]: value })).toThrow(name)
  })

  it.each(['AUTOSUPPORT_SENTRY_INGEST_ENABLED', 'AUTOSUPPORT_AUTO_FIX_ENABLED'])(
    'rejects invalid boolean %s',
    (name) => {
      expect(() => loadServiceConfig({ ...required, [name]: 'yes' })).toThrow(name)
    }
  )

  it('rejects malformed or non-string Sentry ignored patterns', () => {
    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON: '{',
      })
    ).toThrow('AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON')
    expect(() =>
      loadServiceConfig({
        ...required,
        AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON: JSON.stringify(['ok', 42]),
      })
    ).toThrow('AUTOSUPPORT_SENTRY_IGNORED_TITLE_PATTERNS_JSON')
  })

  it.each([
    ['AUTOSUPPORT_TIER2_MAX_TOOL_LOOPS'],
    ['AUTOSUPPORT_TIER3_MAX_TOOL_LOOPS'],
    ['AUTOSUPPORT_TIER4_MAX_TOOL_LOOPS'],
  ])('rejects an invalid %s', (name) => {
    expect(() => loadServiceConfig({ ...required, [name]: '0' })).toThrow(name)
    expect(() => loadServiceConfig({ ...required, [name]: '201' })).toThrow(name)
    expect(() => loadServiceConfig({ ...required, [name]: 'not-a-number' })).toThrow(name)
  })
})
