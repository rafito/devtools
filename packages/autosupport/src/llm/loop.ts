import type { LanguageModelV4 } from '@ai-sdk/provider'
import { type LanguageModelUsage, dynamicTool, generateText, jsonSchema, stepCountIs } from 'ai'
import { toErrorMessage } from '../errors.js'
import type { ToolBundle } from '../types.js'
import { type LlmMessage, LlmRunError, type LlmRunResult } from './types.js'

export type AgentLoopOptions = {
  system: string
  messages: LlmMessage[]
  tools: ToolBundle
  maxToolLoops: number
  maxTokens?: number
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

type LlmTokenUsage = NonNullable<LlmRunResult['usage']>

function mapUsage(usage: LanguageModelUsage): LlmTokenUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens,
  }
}

function addTokens(left: number | undefined, right: number | undefined): number | undefined {
  if (left === undefined && right === undefined) return undefined
  return (left ?? 0) + (right ?? 0)
}

function addUsage(current: LlmTokenUsage | undefined, next: LlmTokenUsage): LlmTokenUsage {
  return {
    inputTokens: addTokens(current?.inputTokens, next.inputTokens),
    outputTokens: addTokens(current?.outputTokens, next.outputTokens),
    totalTokens: addTokens(current?.totalTokens, next.totalTokens),
    cacheReadTokens: addTokens(current?.cacheReadTokens, next.cacheReadTokens),
    cacheWriteTokens: addTokens(current?.cacheWriteTokens, next.cacheWriteTokens),
  }
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

  let completedUsage: LlmTokenUsage | undefined
  let completedSteps = 0
  let generated: Awaited<ReturnType<typeof generateText>>
  try {
    generated = await generateText({
      model,
      system: opts.system,
      messages: opts.messages,
      tools: aiTools,
      maxOutputTokens: opts.maxTokens ?? 4096,
      stopWhen: stepCountIs(opts.maxToolLoops + 1),
      onStepEnd: ({ usage }) => {
        completedUsage = addUsage(completedUsage, mapUsage(usage))
        completedSteps++
      },
    })
  } catch (error) {
    throw new LlmRunError(
      toErrorMessage(error),
      {
        text: '',
        steps: completedSteps,
        finishReason: null,
        usage: completedUsage,
        model: model.modelId,
        provider: model.provider,
      },
      error
    )
  }

  const { text, steps, finishReason, usage } = generated

  return {
    text,
    steps: steps.length,
    finishReason: finishReason ?? null,
    // generateText.usage is already aggregated. Do not add the onStepEnd
    // accumulator again; that accumulator is only used on failed runs.
    usage: mapUsage(usage),
    model: model.modelId,
    provider: model.provider,
  }
}
