import { MockLanguageModelV4 } from 'ai/test'
import { expect, it, vi } from 'vitest'
import { runAgentLoop } from '../../src/llm/loop'
import { LlmRunError } from '../../src/llm/types'
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
  inputTokens: { total: 6, noCache: 3, cacheRead: 2, cacheWrite: 1 },
  outputTokens: { total: 2, text: 2, reasoning: undefined },
}

it('end_turn imediato — retorna texto, 0 tool steps', async () => {
  const model = new MockLanguageModelV4({
    provider: 'anthropic',
    modelId: 'claude-test',
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
  expect(r.usage).toEqual({
    inputTokens: 6,
    outputTokens: 2,
    totalTokens: 8,
    cacheReadTokens: 2,
    cacheWriteTokens: 1,
  })
  expect(r.model).toBe('claude-test')
  expect(r.provider).toBe('anthropic')
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
  expect(r.usage.inputTokens).toBe(12)
  expect(r.usage.outputTokens).toBe(4)
  expect(r.usage.totalTokens).toBe(16)
  expect(r.usage.cacheReadTokens).toBe(4)
  expect(r.usage.cacheWriteTokens).toBe(2)
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

it('preserves completed-step usage when a later model step fails', async () => {
  let call = 0
  const model = new MockLanguageModelV4({
    provider: 'anthropic',
    modelId: 'claude-test',
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
      throw new Error('provider unavailable')
    },
  })

  const failure = await runAgentLoop(model, {
    system: 's',
    messages: [{ role: 'user', content: 'hi' }],
    tools: tools(),
    maxToolLoops: 5,
  }).catch((error: unknown) => error)

  expect(failure).toBeInstanceOf(LlmRunError)
  expect(failure).toMatchObject({
    partialResult: {
      steps: 1,
      model: 'claude-test',
      provider: 'anthropic',
      usage: {
        inputTokens: 6,
        outputTokens: 2,
        totalTokens: 8,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
      },
    },
  })
})
