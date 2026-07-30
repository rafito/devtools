import { describe, expect, it, vi } from 'vitest'
import { createSupportPipeline } from '../src/factory'
import type { UserContext } from '../src/types'

vi.mock('pg-boss', () => {
  const mockBoss = {
    on: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createQueue: vi.fn().mockResolvedValue(undefined),
    work: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue('job-1'),
  }
  return { PgBoss: vi.fn(() => mockBoss) }
})

describe('createSupportPipeline', () => {
  const baseConfig = {
    db: {} as any,
    llm: { provider: 'anthropic' as const, apiKey: 'test-key' },
    github: {
      token: 'gh-token',
      repo: 'org/repo',
      webhookSecret: 'gh-secret',
    },
    sentry: {
      apiToken: 'sentry-token',
      orgSlug: 'org',
      projectSlug: 'proj',
      webhookSecret: 'sentry-secret',
    },
    queue: { connectionString: 'postgres://x' },
    rootDir: '/tmp/test-pipeline',
    tier1: {
      systemPromptBuilder: (_ctx: UserContext) => 'system',
    },
  }

  it('retorna pipeline com todos os campos esperados', () => {
    const p = createSupportPipeline(baseConfig)
    expect(p.schema).toBeDefined()
    expect(p.schema.supportTickets).toBeDefined()
    expect(p.tier1).toBeDefined()
    expect(p.tier2).toBeDefined()
    expect(p.tier3).toBeDefined()
    expect(p.tier4).toBeDefined()
    expect(p.queue).toBeDefined()
    expect(p.sseBus).toBeDefined()
    expect(p.webhooks.github).toBeDefined()
    expect(p.webhooks.sentry).toBeDefined()
    expect(p.clients.github).toBeDefined()
    expect(p.clients.sentry).toBeDefined()
  })

  it('respeita schema custom se fornecido', () => {
    const customSchema = {
      supportTickets: { id: 'x' },
      supportConversations: {},
      supportTicketStatusEnum: {},
      supportTicketSourceEnum: {},
    } as any
    const p = createSupportPipeline({ ...baseConfig, schema: customSchema })
    expect(p.schema).toBe(customSchema)
  })

  it('aceita repositories sem db para integrações não-Drizzle', () => {
    const repositories = {
      tickets: {
        findById: vi.fn(),
        findByGithubIssueId: vi.fn(),
        findByGithubPrId: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      conversations: {
        findById: vi.fn(),
        findMessages: vi.fn(),
        create: vi.fn(),
        appendMessage: vi.fn(),
      },
    } as any

    const p = createSupportPipeline({
      ...baseConfig,
      db: undefined,
      repositories,
    })

    expect(p.repositories).toBe(repositories)
  })

  it('aceita customTools no tier1', () => {
    const customTools = {
      definitions: [
        {
          name: 'read_data',
          description: 'd',
          input_schema: { type: 'object' as const, properties: {} },
        },
      ],
      execute: vi.fn(),
    }
    const p = createSupportPipeline({
      ...baseConfig,
      tier1: { ...baseConfig.tier1, customTools },
    })
    expect(p.tier1).toBeDefined()
  })

  it('configura testCommand custom', () => {
    const p = createSupportPipeline({
      ...baseConfig,
      testCommand: { command: 'pytest', args: ['-x'] },
    })
    expect(p.tier3).toBeDefined()
  })

  it('protectedPatterns são repassados para filesystem tools', () => {
    const p = createSupportPipeline({
      ...baseConfig,
      protectedPatterns: [/\.env/],
    })
    expect(p.tier3).toBeDefined()
  })

  it('lança se github.token vazio', () => {
    expect(() =>
      createSupportPipeline({
        ...baseConfig,
        github: { ...baseConfig.github, token: '' },
      })
    ).toThrow()
  })

  it('aceita llm: { provider: openai }', () => {
    const p = createSupportPipeline({
      ...baseConfig,
      llm: { provider: 'openai', apiKey: 'k' },
    })
    expect(p.tier1).toBeDefined()
    expect(p.tier2).toBeDefined()
    expect(p.tier3).toBeDefined()
    expect(p.tier4).toBeDefined()
  })

  it('lança se llm não fornecido', () => {
    expect(() => createSupportPipeline({ ...baseConfig, llm: undefined } as any)).toThrow(
      'cfg.llm é obrigatório'
    )
  })
})
