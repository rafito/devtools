import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHotkey } from './hotkey'
import {
  assetsDir,
  installDir,
  packageVersion,
  powershellExe,
  scriptPath,
  sshConfigPath,
  startMenuLnk,
} from './paths'
import { setupRemote, verifyRemote } from './remote'
import { renderTemplate } from './render'
import { upsertSshHost } from './ssh-config'
import { detectDevboxHost } from './tailscale'

export interface InstallOptions {
  /** MagicDNS host da devbox. Se omitido, detecta via Tailscale. */
  host?: string
  /** Nome do peer Tailscale a procurar (default `devbox`). */
  peer: string
  /** Alias do Host no ~/.ssh/config (default `devbox`). */
  alias: string
  /** Usuario SSH remoto (default = usuario local). */
  remoteUser?: string
  /** Diretorio remoto de clips (default /home/<user>/clips). */
  remoteDir?: string
  /** Combinacao da hotkey (default CTRL+ALT+V). */
  hotkey: string
  /** Horas de retencao dos clips na devbox (default 24). */
  retentionHours: number
  /** Tamanho maximo por arquivo em MB (default 100; 0 = sem limite). */
  maxFileMb: number
  /** Acima deste tamanho (MB) mostra barra de progresso (default 5; 0 = nunca). */
  progressMinMb: number
  /** Checa e instala versao nova em background apos enviar (default true). */
  autoUpdate: boolean
}

export interface InstallResult {
  host: string
  alias: string
  remoteUser: string
  remoteDir: string
  scriptPath: string
  lnkPath: string
  hotkey: string
  retentionHours: number
}

function ensureWindows(): void {
  if (process.platform !== 'win32') {
    throw new Error('clip2devbox so funciona no Windows (clipboard + hotkey nativos).')
  }
}

export function install(opts: InstallOptions): InstallResult {
  ensureWindows()

  const host = opts.host ?? detectDevboxHost(opts.peer)?.host
  if (!host) {
    throw new Error(
      `Nao consegui detectar o host da devbox via Tailscale (peer "${opts.peer}"). Passe --host <magicdns> ou confira \`tailscale status\`.`
    )
  }

  const remoteUser = opts.remoteUser ?? os.userInfo().username.toLowerCase()
  const remoteDir = opts.remoteDir ?? `/home/${remoteUser}/clips`
  const alias = opts.alias

  // 1. ~/.ssh/config
  const configPath = sshConfigPath()
  mkdirSync(path.dirname(configPath), { recursive: true })
  let config = ''
  try {
    config = readFileSync(configPath, 'utf8')
  } catch {
    // arquivo ainda nao existe
  }
  const merged = upsertSshHost(config, alias, {
    HostName: host,
    User: remoteUser,
    StrictHostKeyChecking: 'accept-new',
  })
  if (merged !== config) {
    writeFileSync(configPath, merged, 'utf8')
    console.log(`✓ ssh config: host "${alias}" -> ${host} (user ${remoteUser})`)
  } else {
    console.log(`• ssh config: host "${alias}" ja existia, mantido`)
  }

  // 2. conectividade + usuario remoto real
  const who = verifyRemote(alias)
  if (who && who !== remoteUser) {
    console.log(`! usuario remoto detectado e "${who}" (config usa "${remoteUser}")`)
  } else {
    console.log(`✓ conexao Tailscale SSH OK (whoami: ${who})`)
  }

  // 3. lado remoto: dir de clips, /clip, cron
  setupRemote(alias, remoteDir, opts.retentionHours)

  // 4. script PowerShell renderizado
  const tmpl = readFileSync(path.join(assetsDir(), 'clip2devbox.ps1.tmpl'), 'utf8')
  const maxBytes = opts.maxFileMb > 0 ? Math.round(opts.maxFileMb * 1024 * 1024) : 0
  const progressMinBytes = opts.progressMinMb > 0 ? Math.round(opts.progressMinMb * 1024 * 1024) : 0
  const rendered = renderTemplate(tmpl, {
    HOST: alias,
    REMOTE_DIR: remoteDir,
    MAX_BYTES: String(maxBytes),
    PROGRESS_MIN_BYTES: String(progressMinBytes),
    AUTO_UPDATE: opts.autoUpdate ? '1' : '0',
    VERSION: packageVersion(),
  })
  mkdirSync(installDir(), { recursive: true })
  const sp = scriptPath()
  writeFileSync(sp, rendered, 'utf8')
  console.log(`✓ script: ${sp}`)

  // 5. hotkey
  const lnkPath = startMenuLnk()
  createHotkey({
    lnkPath,
    target: powershellExe(),
    arguments: `-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${sp}"`,
    workingDir: installDir(),
    hotkey: opts.hotkey,
  })
  console.log(`✓ hotkey ${opts.hotkey} -> ${lnkPath}`)

  return {
    host,
    alias,
    remoteUser,
    remoteDir,
    scriptPath: sp,
    lnkPath,
    hotkey: opts.hotkey,
    retentionHours: opts.retentionHours,
  }
}
