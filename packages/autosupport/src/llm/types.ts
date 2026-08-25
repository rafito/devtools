import type { ToolBundle } from '../types.js'

export type LlmMessage = { role: 'user' | 'assistant' | 'system'; content: string }
export type LlmModelRole = 'fast' | 'heavy'

export type LlmRunOptions = {
  role: LlmModelRole
  system: string
  messages: LlmMessage[]
  tools: ToolBundle
  maxToolLoops: number
  maxTokens?: number
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export type LlmRunResult = {
  text: string
  steps: number
  finishReason: string | null
  /** Aggregated token usage across every generateText step. */
  usage?: {
    inputTokens: number | undefined
    outputTokens: number | undefined
    totalTokens: number | undefined
    cacheReadTokens: number | undefined
    cacheWriteTokens: number | undefined
  }
  model?: string
  provider?: string
}

export class LlmRunError extends Error {
  readonly partialResult: LlmRunResult
  readonly cause: unknown

  constructor(message: string, partialResult: LlmRunResult, cause: unknown) {
    super(message)
    this.name = 'LlmRunError'
    this.partialResult = partialResult
    this.cause = cause
  }
}

export interface LlmProvider {
  runWithTools(opts: LlmRunOptions): Promise<LlmRunResult>
}
