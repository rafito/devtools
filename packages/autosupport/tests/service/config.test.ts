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
})
