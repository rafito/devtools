import type { LanguageModelV2 } from '@ai-sdk/provider'
import { createAnthropicModels } from './anthropic.js'
import { runAgentLoop } from './loop.js'
import { createOpenAIModels } from './openai.js'
import type { LlmModelRole, LlmProvider } from './types.js'

export type LlmConfig = {
  provider: 'anthropic' | 'openai'
  apiKey: string
  models?: Partial<Record<LlmModelRole, string>>
}

export function createLlmProvider(cfg: LlmConfig): LlmProvider {
  let models: Record<LlmModelRole, LanguageModelV2>
  if (cfg.provider === 'anthropic') models = createAnthropicModels(cfg.apiKey, cfg.models)
  else if (cfg.provider === 'openai') models = createOpenAIModels(cfg.apiKey, cfg.models)
  else throw new Error(`LLM provider desconhecido: ${(cfg as { provider: string }).provider}`)

  return {
    runWithTools: (opts) =>
      runAgentLoop(models[opts.role], {
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        maxToolLoops: opts.maxToolLoops,
        maxTokens: opts.maxTokens,
        onToolResult: opts.onToolResult,
      }),
  }
}

// LlmConfig já é exportado localmente acima (export type LlmConfig). Reexporta o resto de types.ts:
export type { LlmProvider, LlmMessage, LlmRunOptions, LlmRunResult, LlmModelRole } from './types.js'
