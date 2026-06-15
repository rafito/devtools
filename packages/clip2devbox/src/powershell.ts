import { execaSync } from 'execa'
import { powershellExe } from './paths'

/** Escapa uma string pra virar literal entre aspas simples no PowerShell. */
export function psSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

/**
 * Roda um script PowerShell via -EncodedCommand (base64 UTF-16LE), evitando
 * qualquer problema de escaping na fronteira Node -> powershell.
 */
export function runPowerShell(script: string): void {
  // Silencia o stream de progresso ("Preparing modules for first use" -> CLIXML).
  const full = `$ProgressPreference = 'SilentlyContinue'\n${script}`
  const encoded = Buffer.from(full, 'utf16le').toString('base64')
  execaSync(powershellExe(), ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    stdio: 'inherit',
  })
}
