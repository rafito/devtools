import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Diretorio `assets/` empacotado (../assets relativo ao dist). */
export function assetsDir(): string {
  return fileURLToPath(new URL('../assets/', import.meta.url))
}

/** Pasta de instalacao local: %LOCALAPPDATA%\clip2devbox. */
export function installDir(): string {
  const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local')
  return path.join(base, 'clip2devbox')
}

/** Caminho do script PowerShell renderizado. */
export function scriptPath(): string {
  return path.join(installDir(), 'clip2devbox.ps1')
}

/** ~/.ssh/config */
export function sshConfigPath(): string {
  return path.join(os.homedir(), '.ssh', 'config')
}

/** Atalho .lnk no Start Menu (onde o Windows registra a hotkey global). */
export function startMenuLnk(): string {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming')
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'clip2devbox.lnk')
}

/** powershell.exe (Windows PowerShell 5.1) por caminho absoluto. */
export function powershellExe(): string {
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  return path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}
