vi.mock('../../src/llm/loop', () => ({
  runAgentLoop: vi.fn().mockResolvedValue({ text: 'ok', steps: 0, finishReason: 'stop' }),
}))

import { describe, expect, it, vi } from 'vitest'
import { createLlmProvider } from '../../src/llm'
import { runAgentLoop } from '../../src/llm/loop'

describe('createLlmProvider', () => {
  it('anthropic constrói um LlmProvider', () => {
    const p = createLlmProvider({ provider: 'anthropic', apiKey: 'sk-test' })
    expect(typeof p.runWithTools).toBe('function')
  })
  it('openai constrói um LlmProvider', () => {
    const p = createLlmProvider({ provider: 'openai', apiKey: 'sk-test' })
    expect(typeof p.runWithTools).toBe('function')
  })
  it('provider desconhecido lança', () => {
    // @ts-expect-error provider inválido
    expect(() => createLlmProvider({ provider: 'x', apiKey: 'k' })).toThrow()
  })

  it('runWithTools delega para runAgentLoop com role-selected model e opts corretos', async () => {
    const p = createLlmProvider({ provider: 'anthropic', apiKey: 'sk-test' })
    const tools = { definitions: [], execute: async () => ({}) }
    const messages = [{ role: 'user' as const, content: 'hi' }]
    await p.runWithTools({
      role: 'heavy',
      system: 's',
      messages,
      tools,
      maxToolLoops: 7,
      maxTokens: 1234,
    })
    expect(runAgentLoop).toHaveBeenCalledOnce()
    const [modelArg, optsArg] = (runAgentLoop as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(modelArg).toBeDefined()
    expect(optsArg).toEqual(
      expect.objectContaining({
        system: 's',
        maxToolLoops: 7,
        maxTokens: 1234,
        messages,
        tools,
      })
    )
  })
})
