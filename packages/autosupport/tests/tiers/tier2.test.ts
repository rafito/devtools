import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LlmRunError } from '../../src/llm/types'
import type { ToolBundle } from '../../src/types'
import { makeLlm, makeTools } from './helpers'

function makeDb(ticket: any) {
  const storedTicket = ticket ? { status: 'open', ...ticket } : null
  const updateChain = {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(storedTicket ? [storedTicket] : []),
      }),
    }),
    update: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
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

  it('idempotência: skip se Tier 2 já terminou sem criar issue', async () => {
    const db = makeDb({
      id: 'tk-1',
      status: 'investigating',
      githubIssueId: null,
      description: 'xx',
    })
    const llm = makeLlm()
    const agent = createTier2Agent({
      llm,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })

    await agent.run('tk-1')

    expect(llm.runWithTools).not.toHaveBeenCalled()
    expect(db.update).not.toHaveBeenCalled()
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

  it('auto-fix disabled still creates the GitHub issue without enqueueing Tier 3', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: null, description: 'bug' })
    const enqueueTier3 = vi.fn()
    const llm = makeLlm(async (opts) => {
      opts.onToolResult?.('create_github_issue', {}, { issueNumber: 42 })
      return { text: 'done', steps: 1, finishReason: 'stop' }
    })
    const agent = createTier2Agent({
      llm,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3,
      autoFixEnabled: false,
    })

    await agent.run('tk-1')

    expect(db._updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ githubIssueId: 42, status: 'investigating' })
    )
    expect(enqueueTier3).not.toHaveBeenCalled()
  })

  it('logs structured token usage for the tier and ticket', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const db = makeDb({ id: 'tk-usage', githubIssueId: null, description: 'bug' })
    const llm = makeLlm(async () => ({
      text: 'done',
      steps: 3,
      finishReason: 'stop',
      model: 'claude-test',
      provider: 'anthropic',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cacheReadTokens: 80,
        cacheWriteTokens: 10,
      },
    }))
    const agent = createTier2Agent({
      llm,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })

    await agent.run('tk-usage')

    expect(info).toHaveBeenCalledWith(
      '[autosupport-llm-usage]',
      JSON.stringify({
        tier: 'tier2',
        ticketId: 'tk-usage',
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 80,
        cacheWriteTokens: 10,
        totalTokens: 120,
        steps: 3,
        model: 'claude-test',
        provider: 'anthropic',
      })
    )
    info.mockRestore()
  })

  it('logs completed-step token usage when a later LLM step fails', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const db = makeDb({ id: 'tk-failed-usage', githubIssueId: null, description: 'bug' })
    const partialResult = {
      text: '',
      steps: 1,
      finishReason: null,
      model: 'claude-test',
      provider: 'anthropic',
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        cacheReadTokens: 80,
        cacheWriteTokens: 10,
      },
    }
    const llm = makeLlm(async () => {
      throw new LlmRunError(
        'provider unavailable',
        partialResult,
        new Error('provider unavailable')
      )
    })
    const agent = createTier2Agent({
      llm,
      db,
      schema,
      tools: makeTools(),
      enqueueTier3: vi.fn(),
    })

    await expect(agent.run('tk-failed-usage')).rejects.toThrow('provider unavailable')

    expect(info).toHaveBeenCalledWith(
      '[autosupport-llm-usage]',
      expect.stringContaining('"failed":true')
    )
    expect(info).toHaveBeenCalledWith(
      '[autosupport-llm-usage]',
      expect.stringContaining('"inputTokens":100')
    )
    expect(db.update).not.toHaveBeenCalled()
    info.mockRestore()
  })

  it('injeta a conversa do chat no contexto quando ticket tem conversationId', async () => {
    const ticket = {
      id: 'tk-1',
      status: 'open',
      githubIssueId: null,
      description: 'bug',
      conversationId: 'conv-1',
    }
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
