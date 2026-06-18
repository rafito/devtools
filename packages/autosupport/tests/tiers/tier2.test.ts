import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmProvider, LlmRunOptions } from '../../src/llm/types'
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

function makeLlm(
  impl?: (
    opts: LlmRunOptions
  ) => Promise<{ text: string; steps: number; finishReason: string | null }>
): LlmProvider & { calls: LlmRunOptions[] } {
  const calls: LlmRunOptions[] = []
  return {
    calls,
    runWithTools: vi.fn(async (opts: LlmRunOptions) => {
      calls.push(opts)
      return impl ? await impl(opts) : { text: 'done', steps: 0, finishReason: 'stop' }
    }),
  }
}

const schema = {
  supportTickets: { id: 'col-id', githubIssueId: 'col' },
} as any

import { createTier2Agent } from '../../src/tiers/tier2'

describe('createTier2Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier2Agent({
      llm: makeLlm(),
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
      llm: makeLlm(),
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
      llm: makeLlm(),
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
      llm: makeLlm(),
      db,
      schema,
      tools: makeTools(),
      enqueueTier3,
    })
    await agent.run('tk-1')
    // Without issueNumber in tool result, enqueueTier3 should NOT be called
    expect(enqueueTier3).not.toHaveBeenCalled()
  })

  it('maxToolLoops customizado é aceito sem erros', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const llm = makeLlm()
    const agent = createTier2Agent({
      llm,
      maxToolLoops: 3,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
    expect(llm.calls[0].maxToolLoops).toBe(3)
  })

  it('custom systemPrompt é aceito', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const agent = createTier2Agent({
      llm: makeLlm(),
      systemPrompt: 'custom system',
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })

  it('enqueueTier3 failing silently não propaga erro', async () => {
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

    const llm = makeLlm(async (opts) => {
      const r = await opts.tools.execute('create_github_issue', {})
      opts.onToolResult?.('create_github_issue', {}, r)
      return { text: 'done', steps: 1, finishReason: 'stop' }
    })

    const agent = createTier2Agent({
      llm,
      db,
      schema,
      tools: toolsWithIssue,
      enqueueTier3,
      maxToolLoops: 2,
    })

    // Should NOT throw even though enqueueTier3 fails
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })

  it('injeta a conversa do chat no contexto quando ticket tem conversationId', async () => {
    const ticket = { id: 'tk-1', githubIssueId: null, description: 'bug', conversationId: 'conv-1' }
    const convMessages = [
      { role: 'user', content: 'não consigo logar' },
      { role: 'assistant', content: 'tentou resetar a senha?' },
    ]
    // 1ª select = ticket; 2ª select = conversa.
    let n = 0
    const db = {
      select: vi.fn().mockImplementation(() => {
        n++
        const rows = n === 1 ? [ticket] : [{ messages: convMessages }]
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }) }
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    }
    const schemaWithConv = {
      supportTickets: { id: 'c', githubIssueId: 'c' },
      supportConversations: { id: 'c', messages: 'c' },
    } as any

    const llm = makeLlm()
    const agent = createTier2Agent({
      llm,
      db,
      schema: schemaWithConv,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
      maxToolLoops: 1,
    })
    await agent.run('tk-1')

    expect(llm.calls[0].messages[0].content).toMatch(/Conversa com o cliente/)
    expect(llm.calls[0].messages[0].content).toMatch(/\*\*Cliente:\*\* não consigo logar/)
    expect(llm.calls[0].messages[0].content).toMatch(/\*\*Suporte:\*\* tentou resetar a senha/)
  })
})
