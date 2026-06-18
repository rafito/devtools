import { vi } from 'vitest'
import type { LlmProvider, LlmRunOptions } from '../../src/llm/types'
import type { ToolBundle } from '../../src/types'

/** Empty tool bundle whose execute resolves `{}` — shared across tier tests. */
export function makeTools(): ToolBundle {
  return { definitions: [], execute: vi.fn().mockResolvedValue({}) }
}

/**
 * A fake `LlmProvider` that records every `runWithTools` call on `.calls` so
 * tests can assert what the tier sent (system, messages, maxToolLoops). Pass
 * `impl` to drive tool execution / onToolResult; otherwise it resolves a plain
 * `{ text: 'done' }` result.
 */
export function makeLlm(
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
