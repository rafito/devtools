import { psSingleQuote, runPowerShell } from './powershell'

export interface HotkeyOptions {
  lnkPath: string
  target: string
  arguments: string
  workingDir: string
  hotkey: string
}

/** Cria (ou sobrescreve) o atalho .lnk com a hotkey global via WScript.Shell. */
export function createHotkey(opts: HotkeyOptions): void {
  const script = [
    '$ws = New-Object -ComObject WScript.Shell',
    `$sc = $ws.CreateShortcut(${psSingleQuote(opts.lnkPath)})`,
    `$sc.TargetPath = ${psSingleQuote(opts.target)}`,
    `$sc.Arguments = ${psSingleQuote(opts.arguments)}`,
    `$sc.WorkingDirectory = ${psSingleQuote(opts.workingDir)}`,
    '$sc.IconLocation = "$env:WINDIR\\System32\\imageres.dll,68"',
    "$sc.Description = 'clip2devbox: print do clipboard -> devbox'",
    '$sc.WindowStyle = 7',
    `$sc.HotKey = ${psSingleQuote(opts.hotkey)}`,
    '$sc.Save()',
  ].join('\n')
  runPowerShell(script)
}

/** Remove o atalho .lnk (libera a hotkey). */
export function removeHotkey(lnkPath: string): void {
  runPowerShell(
    `Remove-Item -LiteralPath ${psSingleQuote(lnkPath)} -Force -ErrorAction SilentlyContinue`
  )
}
