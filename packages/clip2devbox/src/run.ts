import { existsSync } from 'node:fs'
import { execaSync } from 'execa'
import { powershellExe, scriptPath } from './paths'

/** Roda o script instalado (mesma acao da hotkey) — util pra testar manualmente. */
export function run(): void {
  if (process.platform !== 'win32') {
    throw new Error('clip2devbox so funciona no Windows.')
  }
  const sp = scriptPath()
  if (!existsSync(sp)) {
    throw new Error('Nao instalado. Rode primeiro: clip2devbox install')
  }
  // O proprio script ja sinaliza erro (beep + balao) e sai com codigo != 0 em
  // casos esperados (sem imagem, devbox fora). Nao relancamos: so propagamos o
  // exit code, sem despejar stacktrace do execa.
  const result = execaSync(
    powershellExe(),
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp],
    {
      stdio: 'inherit',
      reject: false,
    }
  )
  if (typeof result.exitCode === 'number' && result.exitCode !== 0) {
    process.exitCode = result.exitCode
  }
}
