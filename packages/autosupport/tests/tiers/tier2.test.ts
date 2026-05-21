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
  supportTickets: { id: 'col-id', githubIssueId: 'col' },
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

import { createTier2Agent } from '../../src/tiers/tier2'

describe('createTier2Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('apiKey vazia lança', () => {
    expect(() =>
      createTier2Agent({
        anthropicApiKey: '',
        db: {},
        schema,
        tools: makeTools(),
        enqueueTier3: vi.fn(),
      }),
    ).toThrow(/anthropicApiKey/)
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      db: makeDb(null),
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })
    await expect(agent.run('tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('idempotência: skip se já tem githubIssueId', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: 99, description: 'xx' })
    const enqueueTier3 = vi.fn()
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      enqueueTier3,
    })
    await agent.run('tk-1')
    expect(db.update).not.toHaveBeenCalled()
    expect(enqueueTier3).not.toHaveBeenCalled()
  })

  it('happy path: status atualizado para investigating', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug xpto' })
    const enqueueTier3 = vi.fn().mockResolvedValue(undefined)
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      enqueueTier3,
    })
    await agent.run('tk-1')
    expect(db.update).toHaveBeenCalled()
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('investigating')
  })

  it('enqueueTier3 não é chamado se issue não criado', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const enqueueTier3 = vi.fn()
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      enqueueTier3,
    })
    await agent.run('tk-1')
    // Without issueNumber in tool result, enqueueTier3 should NOT be called
    expect(enqueueTier3).not.toHaveBeenCalled()
  })

  it('custom model e maxToolLoops são aceitos sem erros', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      model: 'claude-opus-4-5',
      maxToolLoops: 3,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })

  it('custom systemPrompt é aceito', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      systemPrompt: 'custom system',
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })

  it('enqueueTier3 failing silently não propaga erro', async () => {
    // Simulate issueNumber being returned by onToolResult
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'tool_use',
          content: [
            {
              type: 'tool_use',
              id: 'x1',
              name: 'create_github_issue',
              input: {},
            },
          ],
        }),
      },
    }))

    const toolsWithIssue: ToolBundle = {
      definitions: [
        {
          name: 'create_github_issue',
          description: 'd',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      execute: vi.fn().mockResolvedValueOnce({ issueNumber: 42 }).mockResolvedValue({}),
    }

    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const enqueueTier3 = vi.fn().mockRejectedValue(new Error('queue down'))

    const agent = createTier2Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: toolsWithIssue,
      enqueueTier3,
      maxToolLoops: 2,
    })

    // Should NOT throw even though enqueueTier3 fails
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })
})
