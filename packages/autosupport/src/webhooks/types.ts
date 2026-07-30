export type WebhookHeaders = Record<string, string | string[] | undefined>

export type WebhookProcessorRequest = {
  headers: WebhookHeaders
  rawBody: Buffer
}

export type WebhookResult = {
  status: number
  body: Record<string, unknown>
}

export type WebhookAdapterRequest = {
  headers: WebhookHeaders
  body: unknown
}

export type WebhookAdapterResponse = {
  status(code: number): WebhookAdapterResponse
  json(body: Record<string, unknown>): WebhookAdapterResponse
}

export function readWebhookHeader(headers: WebhookHeaders, name: string): string | undefined {
  const normalizedName = name.toLowerCase()
  const matchingKey = Object.keys(headers).find((key) => key.toLowerCase() === normalizedName)
  const value = matchingKey ? headers[matchingKey] : undefined
  return Array.isArray(value) ? value[0] : value
}

export function jsonWebhookResponse(
  res: WebhookAdapterResponse,
  result: WebhookResult
): WebhookAdapterResponse {
  return res.status(result.status).json(result.body)
}
