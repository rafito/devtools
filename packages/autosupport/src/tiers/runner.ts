import type Anthropic from '@anthropic-ai/sdk'
import type { ToolBundle } from '../types.js'

export type ToolLoopOptions = {
  client: Anthropic
  model: string
  system: string
  maxTokens?: number
  maxToolLoops: number
  initialMessages: Anthropic.MessageParam[]
  tools: ToolBundle
  onToolResult?: (name: string, input: Record<string, unknown>, result: unknown) => void
}

export type ToolLoopResult = {
  text: string
  stopReason: Anthropic.Message['stop_reason'] | null
  loops: number
  messages: Anthropic.MessageParam[]
}

export async function runToolLoop(opts: ToolLoopOptions): Promise<ToolLoopResult> {
  const messages = [...opts.initialMessages]
  const anthroTools = opts.tools.definitions.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as any,
  }))

  let loops = 0
  let stopReason: Anthropic.Message['stop_reason'] | null = null
  let text = ''

  while (loops < opts.maxToolLoops) {
    const response = await opts.client.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages,
      tools: anthroTools,
    })
    stopReason = response.stop_reason

    if (response.stop_reason === 'end_turn') {
      text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      messages.push({ role: 'assistant', content: response.content })
      break
    }

    if (response.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: response.content })
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue
        let result: unknown
        try {
          result = await opts.tools.execute(block.name, block.input as Record<string, unknown>)
        } catch (err: any) {
          result = { error: `Tool execution failed: ${err.message}` }
        }
        opts.onToolResult?.(block.name, block.input as Record<string, unknown>, result)
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result),
        })
      }
      messages.push({ role: 'user', content: toolResults })
      loops++
      continue
    }

    break
  }

  return { text, stopReason, loops, messages }
}
