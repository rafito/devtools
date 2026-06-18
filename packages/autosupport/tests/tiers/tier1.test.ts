import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LlmProvider, LlmRunOptions } from '../../src/llm/types'
import type { ToolBundle, UserContext } from '../../src/types'

const userCtx: UserContext = {
  fullName: 'Ana Lima',
  tenantName: 'Acme',
  role: 'admin',
  currentPage: '/dashboard',
}

function makeDb(conversation: any) {
  const updateChain = {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(conversation ? [conversation] : []),
      }),
    }),
    update: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
  }
}

const schema = {
  supportConversations: { id: 'col-id', messages: 'col-messages' },
} as any

function makeLlm(
  override?: (opts: LlmRunOptions) => ReturnType<LlmProvider['runWithTools']>
): LlmProvider & { calls: LlmRunOptions[] } {
  const calls: LlmRunOptions[] = []
  return {
    calls,
    runWithTools: vi.fn(async (opts: LlmRunOptions) => {
      calls.push(opts)
      return override
        ? await override(opts)
        : { text: 'Olá! Como posso ajudar?', steps: 0, finishReason: 'stop' }
    }),
  }
}

import { createTier1Agent } from '../../src/tiers/tier1'

describe('createTier1Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: retorna text e conversationId', async () => {
    const db = makeDb({ messages: [] })
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: (ctx) => `Ajudando ${ctx.fullName}`,
    })
    const result = await agent.run({
      message: 'Preciso de ajuda',
      conversationId: 'conv-1',
      userContext: userCtx,
    })
    expect(result.text).toBe('Olá! Como posso ajudar?')
    expect(result.conversationId).toBe('conv-1')
    expect(result.ticketId).toBeUndefined()
  })

  it('salva mensagem user e assistant na conversa', async () => {
    const db = makeDb({ messages: [] })
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    await agent.run({ message: 'oi', conversationId: 'conv-2', userContext: userCtx })
    // update should be called twice: once for user msg, once for assistant msg
    expect(db.update).toHaveBeenCalledTimes(2)
  })

  it('histórico vazio (conversa nova) não lança', async () => {
    const db = makeDb(null) // no existing conversation
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    await expect(
      agent.run({ message: 'oi', conversationId: 'conv-new', userContext: userCtx })
    ).resolves.toBeDefined()
  })

  it('retorna fallback quando text está vazio', async () => {
    const db = makeDb({ messages: [] })
    const llm = makeLlm(async () => ({ text: '', steps: 0, finishReason: 'max_tokens' }))
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    const result = await agent.run({
      message: 'oi',
      conversationId: 'conv-3',
      userContext: userCtx,
    })
    expect(result.text).toContain('Desculpe')
  })

  it('captura ticketId de create_ticket tool call', async () => {
    const tools: ToolBundle = {
      definitions: [
        {
          name: 'create_ticket',
          description: 'cria ticket',
          input_schema: { type: 'object', properties: {} },
        },
      ],
      execute: vi.fn().mockResolvedValue({ ticketId: 'tk-abc' }),
    }

    const db = makeDb({ messages: [] })
    const llm: LlmProvider = {
      runWithTools: vi.fn(async (opts: LlmRunOptions) => {
        // simulate the tool loop calling execute and reporting via onToolResult
        const r = await opts.tools.execute('create_ticket', { description: 'bug' })
        opts.onToolResult?.('create_ticket', { description: 'bug' }, r)
        return { text: 'Ticket criado.', steps: 1, finishReason: 'stop' }
      }),
    }

    const agent = createTier1Agent({
      llm,
      db,
      schema,
      customTools: tools,
      systemPromptBuilder: () => 'sys',
      maxToolLoops: 3,
    })
    const result = await agent.run({
      message: 'tenho um bug',
      conversationId: 'conv-4',
      userContext: userCtx,
    })
    expect(result.ticketId).toBe('tk-abc')
    expect(result.text).toBe('Ticket criado.')
  })

  it('maxToolLoops é aceito', async () => {
    const db = makeDb({ messages: [] })
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      maxToolLoops: 3,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    await expect(
      agent.run({ message: 'oi', conversationId: 'conv-5', userContext: userCtx })
    ).resolves.toBeDefined()
    expect(llm.calls[0].maxToolLoops).toBe(3)
  })

  it('sem customTools usa no-op tools (retorna error silenciosamente)', async () => {
    const db = makeDb({ messages: [] })
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
      // no customTools
    })
    await expect(
      agent.run({ message: 'oi', conversationId: 'conv-6', userContext: userCtx })
    ).resolves.toBeDefined()
  })

  it('systemPromptBuilder recebe userContext correto', async () => {
    const builder = vi.fn().mockReturnValue('prompt built')
    const db = makeDb({ messages: [] })
    const llm = makeLlm()
    const agent = createTier1Agent({
      llm,
      db,
      schema,
      systemPromptBuilder: builder,
    })
    await agent.run({ message: 'oi', conversationId: 'conv-7', userContext: userCtx })
    expect(builder).toHaveBeenCalledWith(userCtx)
  })
})
