import { describe, expect, it, vi } from 'vitest'
import { runToolLoop } from '../../src/tiers/runner'
import type { ToolBundle } from '../../src/types'

function mockTools(): ToolBundle {
  return {
    definitions: [
      {
        name: 'test_tool',
        description: 'd',
        input_schema: { type: 'object', properties: {} },
      },
    ],
    execute: vi.fn().mockResolvedValue({ ok: true }),
  }
}

function fakeAnthropic(responses: any[]) {
  let i = 0
  return {
    messages: { create: vi.fn().mockImplementation(async () => responses[i++]) },
  } as any
}

describe('runToolLoop', () => {
  it('end_turn imediato — retorna texto sem tool calls', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'hello' }],
      },
    ])
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
    })
    expect(r.text).toBe('hello')
    expect(r.loops).toBe(0)
    expect(r.stopReason).toBe('end_turn')
  })

  it('tool_use seguido de end_turn — executa tool e retorna texto', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'test_tool', input: {} }],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'done' }],
      },
    ])
    const tools = mockTools()
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools,
    })
    expect(r.text).toBe('done')
    expect(r.loops).toBe(1)
    expect(tools.execute).toHaveBeenCalledWith('test_tool', {})
  })

  it('chega no maxToolLoops — para sem text', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'tool_use',
          content: [{ type: 'tool_use', id: 'x', name: 'test_tool', input: {} }],
        }),
      },
    } as any
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 2,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
    })
    expect(r.loops).toBe(2)
  })

  it('onToolResult é chamado para cada tool execution', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'test_tool', input: { a: 1 } }],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      },
    ])
    const onResult = vi.fn()
    await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
      onToolResult: onResult,
    })
    expect(onResult).toHaveBeenCalledWith('test_tool', { a: 1 }, { ok: true })
  })

  it('tool execute lançando vira { error } no resultado', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'test_tool', input: {} }],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'ok' }],
      },
    ])
    const tools: ToolBundle = {
      definitions: [
        { name: 'test_tool', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockRejectedValue(new Error('boom')),
    }
    const onResult = vi.fn()
    await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools,
      onToolResult: onResult,
    })
    expect(onResult).toHaveBeenCalledWith(
      'test_tool',
      {},
      expect.objectContaining({ error: expect.stringContaining('boom') })
    )
  })

  it('múltiplos text blocks são concatenados', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'end_turn',
        content: [
          { type: 'text', text: 'part1' },
          { type: 'text', text: 'part2' },
        ],
      },
    ])
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
    })
    expect(r.text).toBe('part1part2')
  })

  it('mensagens do loop são acumuladas corretamente', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'test_tool', input: {} }],
      },
      {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'final' }],
      },
    ])
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
    })
    // initial user + assistant (tool_use) + user (tool_result) + assistant (end_turn)
    expect(r.messages.length).toBe(4)
    expect(r.messages[0]).toEqual({ role: 'user', content: 'hi' })
    expect(r.messages[3].role).toBe('assistant')
  })

  it('stop_reason desconhecido sai do loop imediatamente', async () => {
    const client = fakeAnthropic([
      {
        stop_reason: 'max_tokens',
        content: [],
      },
    ])
    const r = await runToolLoop({
      client,
      model: 'm',
      system: 's',
      maxToolLoops: 5,
      initialMessages: [{ role: 'user', content: 'hi' }],
      tools: mockTools(),
    })
    expect(r.stopReason).toBe('max_tokens')
    expect(r.loops).toBe(0)
    expect(r.text).toBe('')
  })
})
