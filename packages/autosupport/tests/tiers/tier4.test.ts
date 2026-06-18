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
  supportTickets: { id: 'col-id' },
} as any

import { createTier4Agent } from '../../src/tiers/tier4'

describe('createTier4Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier4Agent({
      llm: makeLlm(),
      db: makeDb(null),
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(42, 'tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('happy path: executa sem erro, sem DB write (webhook faz isso)', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: 10 })
    const agent = createTier4Agent({
      llm: makeLlm(),
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(99, 'tk-1')).resolves.toBeUndefined()
    // Tier 4 never writes to DB — status transitions happen via webhook
    expect(db.update).not.toHaveBeenCalled()
  })

  it('maxToolLoops e systemPrompt customizados são aceitos', async () => {
    const db = makeDb({ id: 'tk-1', githubIssueId: 5 })
    const agent = createTier4Agent({
      llm: makeLlm(),
      maxToolLoops: 3,
      systemPrompt: 'custom reviewer',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run(10, 'tk-1')).resolves.toBeUndefined()
  })

  it('passa prNumber e ticketId corretos na mensagem inicial', async () => {
    const db = makeDb({ id: 'tk-abc', githubIssueId: 7 })
    const llm = makeLlm()
    const agent = createTier4Agent({
      llm,
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run(88, 'tk-abc')

    const content = llm.calls[0].messages[0].content as string
    expect(content).toContain('PR #88')
    expect(content).toContain('tk-abc')
    expect(content).toContain('#7')
  })

  it('tool calls são executadas dentro do loop', async () => {
    const tools: ToolBundle = {
      definitions: [
        { name: 'read_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValue({ title: 'fix: x', body: 'Closes #7' }),
    }

    const llm = makeLlm(async (opts) => {
      await opts.tools.execute('read_pr', { prNumber: 5 })
      return { text: 'approved', steps: 1, finishReason: 'stop' }
    })

    const db = makeDb({ id: 'tk-1', githubIssueId: 7 })
    const agent = createTier4Agent({
      llm,
      db,
      schema,
      tools,
      maxToolLoops: 3,
    })
    await agent.run(5, 'tk-1')
    expect(tools.execute).toHaveBeenCalledWith('read_pr', { prNumber: 5 })
  })
})
