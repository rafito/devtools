import type { LanguageModelV4 } from '@ai-sdk/provider'
import { dynamicTool, generateText, jsonSchema, stepCountIs } from 'ai'
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
  model: LanguageModelV4,
  opts: AgentLoopOptions
): Promise<LlmRunResult> {
  const aiTools = Object.fromEntries(
    opts.tools.definitions.map((d) => [
      d.name,
      dynamicTool({
        description: d.description,
        inputSchema: jsonSchema<Record<string, unknown>>(d.input_schema),
        execute: async (input: unknown) => {
          const toolInput = input as Record<string, unknown>
          let result: unknown
          try {
            result = await opts.tools.execute(d.name, toolInput)
          } catch (err) {
            result = { error: `Tool execution failed: ${toErrorMessage(err)}` }
          }
          opts.onToolResult?.(d.name, toolInput, result)
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
