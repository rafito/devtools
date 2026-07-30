import { MockLanguageModelV4 } from 'ai/test'
import { expect, it, vi } from 'vitest'
import { runAgentLoop } from '../../src/llm/loop'
import type { ToolBundle } from '../../src/types'

function tools(execute = vi.fn().mockResolvedValue({ ok: true })): ToolBundle {
  return {
    definitions: [
      { name: 'test_tool', description: 'd', input_schema: { type: 'object', properties: {} } },
    ],
    execute,
  }
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
}

it('end_turn imediato — retorna texto, 0 tool steps', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => ({
      finishReason: { unified: 'stop', raw: undefined },
      usage,
      content: [{ type: 'text', text: 'hello' }],
      warnings: [],
    }),
  })
  const r = await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(),
    maxToolLoops: 5,
  })
  expect(r.text).toBe('hello')
  expect(r.finishReason).toBe('stop')
})

it('onToolResult dispara no execute de cada tool', async () => {
  // Primeira geração chama a tool; segunda encerra com texto.
  let call = 0
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      call++
      if (call === 1) {
        return {
          finishReason: { unified: 'tool-calls', raw: undefined },
          usage,
          content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'test_tool', input: '{}' }],
          warnings: [],
        }
      }
      return {
        finishReason: { unified: 'stop', raw: undefined },
        usage,
        content: [{ type: 'text', text: 'done' }],
        warnings: [],
      }
    },
  })
  const onToolResult = vi.fn()
  const r = await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(),
    maxToolLoops: 5,
    onToolResult,
  })
  expect(r.text).toBe('done')
  expect(onToolResult).toHaveBeenCalledWith('test_tool', {}, { ok: true })
})

it('tool execute lançando vira { error }', async () => {
  let call = 0
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      call++
      return call === 1
        ? {
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
            content: [{ type: 'tool-call', toolCallId: 't1', toolName: 'test_tool', input: '{}' }],
            warnings: [],
          }
        : {
            finishReason: { unified: 'stop', raw: undefined },
            usage,
            content: [{ type: 'text', text: 'ok' }],
            warnings: [],
          }
    },
  })
  const onToolResult = vi.fn()
  await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(vi.fn().mockRejectedValue(new Error('boom'))),
    maxToolLoops: 5,
    onToolResult,
  })
  expect(onToolResult).toHaveBeenCalledWith(
    'test_tool',
    {},
    expect.objectContaining({ error: expect.stringContaining('boom') })
  )
})
