import { existsSync } from 'node:fs'
import { execaSync } from 'execa'

export interface PeerHost {
  host: string
  ip: string
}

const TAILSCALE_CANDIDATES = [
  'tailscale',
  'C:\\Program Files\\Tailscale\\tailscale.exe',
  'C:\\Program Files (x86)\\Tailscale\\tailscale.exe',
]

/** Localiza o binario do Tailscale (PATH ou caminhos padrao do Windows). */
export function findTailscale(): string | null {
  for (const candidate of TAILSCALE_CANDIDATES) {
    try {
      if (candidate.includes('\\')) {
        if (existsSync(candidate)) return candidate
      } else {
        execaSync(candidate, ['version'])
        return candidate
      }
    } catch {
      // tenta o proximo
    }
  }
  return null
}

/**
 * Acha o peer com o HostName dado no JSON de `tailscale status --json`.
 * Funcao pura para facilitar teste. Remove o ponto final do MagicDNS.
 */
export function parseDevboxHost(statusJson: string, peerName: string): PeerHost | null {
  const data = JSON.parse(statusJson) as { Peer?: Record<string, unknown> }
  const peers = data.Peer ?? {}
  for (const key of Object.keys(peers)) {
    const p = peers[key] as { HostName?: string; DNSName?: string; TailscaleIPs?: string[] }
    if (p?.HostName?.toLowerCase() === peerName.toLowerCase()) {
      const host = String(p.DNSName ?? '').replace(/\.$/, '')
      const ip = Array.isArray(p.TailscaleIPs) ? (p.TailscaleIPs[0] ?? '') : ''
      if (host) return { host, ip }
    }
  }
  return null
}

/** Detecta o host MagicDNS do peer (default `devbox`) via Tailscale CLI. */
export function detectDevboxHost(peerName: string): PeerHost | null {
  const bin = findTailscale()
  if (!bin) return null
  const { stdout } = execaSync(bin, ['status', '--json'])
  return parseDevboxHost(stdout, peerName)
}
