import { rmSync } from 'node:fs'
import { removeHotkey } from './hotkey'
import { installDir, startMenuLnk } from './paths'
import { teardownRemote } from './remote'

export interface UninstallOptions {
  /** Alias do Host no ssh config, usado pra mexer no lado remoto. */
  alias: string
  /** Tambem remover /clip e cron na devbox (default false). */
  remote: boolean
}

export function uninstall(opts: UninstallOptions): void {
  // hotkey
  removeHotkey(startMenuLnk())
  console.log('✓ hotkey removida')

  // script local
  rmSync(installDir(), { recursive: true, force: true })
  console.log('✓ script local removido')

  // lado remoto (opcional)
  if (opts.remote) {
    teardownRemote(opts.alias)
  } else {
    console.log('• lado remoto (/clip, cron) preservado — use --remote pra remover tambem')
  }

  console.log('• ~/.ssh/config preservado (remova o bloco Host manualmente se quiser)')
}
