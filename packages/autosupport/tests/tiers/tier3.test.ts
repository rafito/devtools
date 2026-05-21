import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolBundle } from '../../src/types'

function makeDb(ticket: any) {
  const updateChain = {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(ticket ? [ticket] : []),
      }),
    }),
    update: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
  }
}

function makeTools(): ToolBundle {
  return { definitions: [], execute: vi.fn().mockResolvedValue({}) }
}

const schema = {
  supportTickets: { id: 'col-id', githubPrId: 'col' },
} as any

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done' }],
        }),
      },
    })),
  }
})

import { createTier3Agent } from '../../src/tiers/tier3'

describe('createTier3Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('apiKey vazia lança', () => {
    expect(() =>
      createTier3Agent({
        anthropicApiKey: '',
        db: {},
        schema,
        tools: makeTools(),
      }),
    ).toThrow(/anthropicApiKey/)
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db: makeDb(null),
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('idempotência: skip se já tem githubPrId', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: 55, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run('tk-1')
    expect(db.update).not.toHaveBeenCalled()
  })

  it('happy path sem PR criado: status volta para investigating', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run('tk-1')
    expect(db.update).toHaveBeenCalled()
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('investigating')
  })

  it('happy path com PR criado: status muda para fixing', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'x1', name: 'create_pr', input: {} }],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'done' }],
          }),
      },
    }))

    const toolsWithPr: ToolBundle = {
      definitions: [
        { name: 'create_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValueOnce({ prNumber: 77 }).mockResolvedValue({}),
    }

    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: toolsWithPr,
      maxToolLoops: 2,
    })
    await agent.run('tk-1')
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('fixing')
    expect(setCall.githubPrId).toBe(77)
  })

  it('custom branchPrefix é aceito', async () => {
    const db = makeDb({ id: 'abcdefgh-xyz', githubPrId: null, githubIssueId: 5, description: 'b' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      branchPrefix: 'hotfix/',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('abcdefgh-xyz')).resolves.toBeUndefined()
  })

  it('custom model e maxToolLoops são aceitos sem erros', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 5, description: 'b' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      model: 'claude-sonnet-4-6',
      maxToolLoops: 4,
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })
})
