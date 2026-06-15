import { readFileSync } from 'node:fs'
import path from 'node:path'
import { execaSync } from 'execa'
import { assetsDir } from './paths'
import { buildCronLine, renderTemplate } from './render'

/** Executa um script bash na devbox passando-o como base64 (sem dor de quoting). */
function runRemoteBash(alias: string, script: string): void {
  const b64 = Buffer.from(script, 'utf8').toString('base64')
  execaSync(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', alias, `echo ${b64} | base64 -d | bash`],
    { stdio: 'inherit' }
  )
}

/** Confirma conectividade e devolve o usuario remoto (seeda known_hosts). */
export function verifyRemote(alias: string): string {
  const { stdout } = execaSync(
    'ssh',
    ['-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', alias, 'whoami'],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  )
  return stdout.trim()
}

/**
 * Provisiona o lado remoto: cria o diretorio de clips, instala o slash command
 * `/clip` em ~/.claude/commands e agenda a limpeza por crontab.
 */
export function setupRemote(alias: string, remoteDir: string, retentionHours: number): void {
  const clipTmpl = readFileSync(path.join(assetsDir(), 'clip.md'), 'utf8')
  const clipMd = renderTemplate(clipTmpl, { CLIPS: remoteDir })
  const clipB64 = Buffer.from(clipMd, 'utf8').toString('base64')
  const cron = buildCronLine(remoteDir, retentionHours)

  const script = [
    'set -e',
    `mkdir -p '${remoteDir}'`,
    'mkdir -p ~/.claude/commands',
    `echo '${clipB64}' | base64 -d > ~/.claude/commands/clip.md`,
    "crontab -l 2>/dev/null | grep -v 'clip2devbox-cleanup' > /tmp/c2d.crontab || true",
    `printf '%s\\n' '${cron}' >> /tmp/c2d.crontab`,
    'crontab /tmp/c2d.crontab',
    'rm -f /tmp/c2d.crontab',
    'echo "clip2devbox: lado remoto OK"',
  ].join('\n')

  runRemoteBash(alias, script)
}

/** Remove o slash command e a linha de cron na devbox. */
export function teardownRemote(alias: string): void {
  const script = [
    'rm -f ~/.claude/commands/clip.md',
    "crontab -l 2>/dev/null | grep -v 'clip2devbox-cleanup' > /tmp/c2d.crontab || true",
    'crontab /tmp/c2d.crontab 2>/dev/null || true',
    'rm -f /tmp/c2d.crontab',
    'echo "clip2devbox: lado remoto removido (clips preservados)"',
  ].join('\n')
  runRemoteBash(alias, script)
}
