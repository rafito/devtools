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
}

export interface LlmProvider {
  runWithTools(opts: LlmRunOptions): Promise<LlmRunResult>
}
