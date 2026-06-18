import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModelV2 } from '@ai-sdk/provider'
import type { LlmModelRole } from './types.js'

const DEFAULTS: Record<LlmModelRole, string> = {
  fast: 'gpt-4.1-mini',
  heavy: 'gpt-4.1',
}

export function createOpenAIModels(
  apiKey: string,
  models?: Partial<Record<LlmModelRole, string>>
): Record<LlmModelRole, LanguageModelV2> {
  const openai = createOpenAI({ apiKey })
  return {
    fast: openai(models?.fast ?? DEFAULTS.fast),
    heavy: openai(models?.heavy ?? DEFAULTS.heavy),
  }
}
