import { toErrorMessage } from '../errors.js'
import { LlmRunError, type LlmRunResult } from '../llm/types.js'

type TicketTier = 'tier2' | 'tier3' | 'tier4'

export function logTicketLlmUsage(tier: TicketTier, ticketId: string, result: LlmRunResult): void {
  if (!result.usage) return

  console.info(
    '[autosupport-llm-usage]',
    JSON.stringify({
      tier,
      ticketId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      totalTokens: result.usage.totalTokens,
      steps: result.steps,
      model: result.model,
      provider: result.provider,
    })
  )
}

export function logTicketLlmFailure(tier: TicketTier, ticketId: string, error: unknown): void {
  if (!(error instanceof LlmRunError) || !error.partialResult.usage) return

  const result = error.partialResult
  console.info(
    '[autosupport-llm-usage]',
    JSON.stringify({
      tier,
      ticketId,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      cacheReadTokens: result.usage.cacheReadTokens,
      cacheWriteTokens: result.usage.cacheWriteTokens,
      totalTokens: result.usage.totalTokens,
      steps: result.steps,
      model: result.model,
      provider: result.provider,
      failed: true,
      error: toErrorMessage(error.cause),
    })
  )
}
