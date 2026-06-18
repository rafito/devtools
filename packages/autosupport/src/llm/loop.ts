import { type LanguageModelV2, generateText, jsonSchema, stepCountIs, tool } from 'ai'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle } from '../types.js'
import type { LlmMessage, LlmRunResult } from './types.js'

export type AgentLoopOptions = {
  system: string
  messages: LlmMessage[]
  tools: ToolBundle
  maxToolLoops: number
  maxTokens?: number
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export async function runAgentLoop(
  model: LanguageModelV2,
  opts: AgentLoopOptions
): Promise<LlmRunResult> {
  const aiTools = Object.fromEntries(
    opts.tools.definitions.map((d) => [
      d.name,
      tool({
        description: d.description,
        inputSchema: jsonSchema(d.input_schema),
        execute: async (input: Record<string, unknown>) => {
          let result: unknown
          try {
            result = await opts.tools.execute(d.name, input)
          } catch (err) {
            result = { error: `Tool execution failed: ${toErrorMessage(err)}` }
          }
          opts.onToolResult?.(d.name, input, result)
          return result
        },
      }),
    ])
  )

  const { text, steps, finishReason } = await generateText({
    model,
    system: opts.system,
    messages: opts.messages,
    tools: aiTools,
    maxOutputTokens: opts.maxTokens ?? 4096,
    stopWhen: stepCountIs(opts.maxToolLoops + 1),
  })

  return { text, steps: steps.length, finishReason: finishReason ?? null }
}
