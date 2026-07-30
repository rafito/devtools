import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModelV4 } from '@ai-sdk/provider'
import type { LlmModelRole } from './types.js'

const DEFAULTS: Record<LlmModelRole, string> = {
  fast: 'claude-haiku-4-5',
  heavy: 'claude-opus-4-7',
}

export function createAnthropicModels(
  apiKey: string,
  models?: Partial<Record<LlmModelRole, string>>
): Record<LlmModelRole, LanguageModelV4> {
  const anthropic = createAnthropic({ apiKey })
  return {
    fast: anthropic(models?.fast ?? DEFAULTS.fast),
    heavy: anthropic(models?.heavy ?? DEFAULTS.heavy),
  }
}
