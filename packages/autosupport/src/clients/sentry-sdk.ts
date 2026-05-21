import * as Sentry from '@sentry/node'

export type InitSentryOptions = {
  dsn?: string
  environment?: string
  tracesSampleRate?: number
}

export function initSentry(opts: InitSentryOptions = {}): void {
  if (!opts.dsn) return
  Sentry.init({
    dsn: opts.dsn,
    environment: opts.environment ?? 'development',
    tracesSampleRate: opts.tracesSampleRate ?? 0,
  })
}

export { Sentry }
export { setupExpressErrorHandler } from '@sentry/node'
