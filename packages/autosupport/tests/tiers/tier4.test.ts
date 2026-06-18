import { beforeEach, describe, expect, it, vi } from 'vitest'
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
  supportTickets: { id: 'col-id' },
} as any

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'reviewed' }],
        }),
      },
    })),
  }
})

import { createTier4Agent } from '../../src/tiers/tier4'

describe('createTier4Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('apiKey vazia lança', () => {
    expect(() =>
      createTier4Agent({
        anthropicApiKey: '',
        db: {},
        schema,
        tools: makeTools(),
      })
    ).toThrow(/anthropicApiKey/)
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier4Agent({
      anthropicApiKey: 'k',
      db: makeDb(null),
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(42, 'tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('happy path: executa sem erro, sem DB write (webhook faz isso)', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: 10 })
    const agent = createTier4Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(99, 'tk-1')).resolves.toBeUndefined()
    // Tier 4 never writes to DB — status transitions happen via webhook
    expect(db.update).not.toHaveBeenCalled()
  })

  it('custom model, maxToolLoops e systemPrompt são aceitos', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: 5 })
    const agent = createTier4Agent({
      anthropicApiKey: 'k',
      model: 'claude-opus-4-5',
      maxToolLoops: 3,
      systemPrompt: 'custom reviewer',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(10, 'tk-1')).resolves.toBeUndefined()
  })

  it('passa prNumber e ticketId corretos na mensagem inicial', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const createMock = vi.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'ok' }],
    })
    Anthropic.mockImplementation(() => ({
      messages: { create: createMock },
    }))

    const db = makeDb({ id: 'tk-abc', githubIssueId: 7 })
    const agent = createTier4Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run(88, 'tk-abc')

    const callArgs = createMock.mock.calls[0][0]
    const content = callArgs.messages[0].content as string
    expect(content).toContain('PR #88')
    expect(content).toContain('tk-abc')
    expect(content).toContain('#7')
  })

  it('tool calls são executadas dentro do loop', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'r1', name: 'read_pr', input: { prNumber: 5 } }],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'approved' }],
          }),
      },
    }))

    const tools: ToolBundle = {
      definitions: [
        { name: 'read_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue({ title: 'fix: x', body: 'Closes #7' }),
    }

    const db = makeDb({ id: 'tk-1', githubIssueId: 7 })
    const agent = createTier4Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools,
      maxToolLoops: 3,
    })
    await agent.run(5, 'tk-1')
    expect(tools.execute).toHaveBeenCalledWith('read_pr', { prNumber: 5 })
  })
})
