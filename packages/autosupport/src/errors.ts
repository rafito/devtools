/**
 * Extracts a human-readable message from an unknown thrown value.
 *
 * Use inside `catch` blocks: under `strict` (`useUnknownInCatchVariables`) the
 * caught value is typed `unknown`, so accessing `.message` directly is unsafe.
 */
export function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return String(err)
}
