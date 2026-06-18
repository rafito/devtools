import { beforeEach, describe, expect, it, vi } from 'vitest'
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

function makeTools(): ToolBundle {
  return { definitions: [], execute: vi.fn().mockResolvedValue({}) }
}

const schema = {
  supportConversations: { id: 'col-id', messages: 'col-messages' },
} as any

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Olá! Como posso ajudar?' }],
        }),
      },
    })),
  }
})

import { createTier1Agent } from '../../src/tiers/tier1'

describe('createTier1Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('apiKey vazia lança', () => {
    expect(() =>
      createTier1Agent({
        anthropicApiKey: '',
        db: {},
        schema,
        systemPromptBuilder: () => 'sys',
      })
    ).toThrow(/anthropicApiKey/)
  })

  it('happy path: retorna text e conversationId', async () => {
    const db = makeDb({ messages: [] })
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
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
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
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
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    await expect(
      agent.run({ message: 'oi', conversationId: 'conv-new', userContext: userCtx })
    ).resolves.toBeDefined()
  })

  it('retorna fallback quando text está vazio', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'max_tokens',
          content: [],
        }),
      },
    }))

    const db = makeDb({ messages: [] })
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
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
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi
          .fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'c1', name: 'create_ticket', input: { description: 'bug' } },
            ],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'Ticket criado.' }],
          }),
      },
    }))

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
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
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

  it('custom model e maxToolLoops são aceitos', async () => {
    const db = makeDb({ messages: [] })
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
      model: 'claude-haiku-4-5',
      maxToolLoops: 3,
      db,
      schema,
      systemPromptBuilder: () => 'sys',
    })
    await expect(
      agent.run({ message: 'oi', conversationId: 'conv-5', userContext: userCtx })
    ).resolves.toBeDefined()
  })

  it('sem customTools usa no-op tools (retorna error silenciosamente)', async () => {
    const db = makeDb({ messages: [] })
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
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
    const agent = createTier1Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      systemPromptBuilder: builder,
    })
    await agent.run({ message: 'oi', conversationId: 'conv-7', userContext: userCtx })
    expect(builder).toHaveBeenCalledWith(userCtx)
  })
})
