import { describe, expect, it } from 'vitest'
import type { LlmProvider, LlmRunOptions, LlmRunResult } from '../../src/llm/types'
import type { ToolBundle } from '../../src/types'

describe('LlmProvider contract', () => {
  it('runWithTools resolve um LlmRunResult', async () => {
    const tools: ToolBundle = { definitions: [], execute: async () => ({}) }
    const fake: LlmProvider = {
      runWithTools: async (opts: LlmRunOptions): Promise<LlmRunResult> => ({
        text: `${opts.role}:ok`,
        steps: 0,
        finishReason: 'stop',
      }),
    }
    const r = await fake.runWithTools({
      role: 'fast',
      system: 's',
      messages: [{ role: 'user', content: 'hi' }],
      tools,
      maxToolLoops: 5,
    })
    expect(r.text).toBe('fast:ok')
  })
})
