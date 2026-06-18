import { describe, expect, it } from 'vitest'
import { createLlmProvider } from '../../src/llm'

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
})
