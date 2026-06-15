#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { install } from './install'
import { run } from './run'
import { uninstall } from './uninstall'

/** Executa a acao e, em erro, imprime mensagem limpa em vez de stacktrace. */
function guard(fn: () => void): void {
  try {
    fn()
  } catch (err) {
    console.error(`clip2devbox: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

const program = new Command()

program
  .name('clip2devbox')
  .description(
    'Print do clipboard (Windows) -> devbox via Tailscale/scp, pronto pra colar no Claude Code'
  )
  .version('0.1.0')

program
  .command('install')
  .description('Configura ssh, hotkey, /clip e limpeza na devbox')
  .option('--host <magicdns>', 'Host MagicDNS da devbox (default: detecta via Tailscale)')
  .option('--peer <name>', 'Nome do peer Tailscale a procurar', 'devbox')
  .option('--alias <name>', 'Alias do Host no ~/.ssh/config', 'devbox')
  .option('--remote-user <user>', 'Usuario SSH remoto (default: usuario local)')
  .option('--remote-dir <path>', 'Diretorio remoto de clips (default /home/<user>/clips)')
  .option('--hotkey <combo>', 'Combinacao da hotkey', 'CTRL+ALT+V')
  .option('--retention-hours <n>', 'Horas ate apagar clips na devbox', '24')
  .action((opts) => {
    guard(() => {
      const result = install({
        host: opts.host,
        peer: opts.peer,
        alias: opts.alias,
        remoteUser: opts.remoteUser,
        remoteDir: opts.remoteDir,
        hotkey: opts.hotkey,
        retentionHours: Number(opts.retentionHours),
      })
      console.log('')
      console.log('Pronto! Fluxo: Win+Shift+S -> %s -> no Claude da devbox: /clip', result.hotkey)
      console.log('(ou cola Ctrl+V o caminho @%s/... e Enter)', result.remoteDir)
    })
  })

program
  .command('uninstall')
  .description('Remove hotkey e script local')
  .option('--alias <name>', 'Alias do Host no ~/.ssh/config', 'devbox')
  .option('--remote', 'Tambem remove /clip e cron na devbox', false)
  .action((opts) => {
    guard(() => uninstall({ alias: opts.alias, remote: opts.remote }))
  })

program
  .command('run')
  .description('Executa a acao agora (mesma coisa da hotkey) — util pra testar')
  .action(() => {
    guard(() => run())
  })

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  program.parse()
}
