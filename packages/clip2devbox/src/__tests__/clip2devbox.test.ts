import { describe, expect, it } from 'vitest'
import { buildCronLine, renderTemplate } from '../render'
import { hasSshHost, renderHostBlock, upsertSshHost } from '../ssh-config'
import { parseDevboxHost } from '../tailscale'

describe('renderTemplate', () => {
  it('substitui tokens', () => {
    expect(renderTemplate('a=@@X@@ b=@@Y@@', { X: '1', Y: '2' })).toBe('a=1 b=2')
  })
  it('substitui o mesmo token varias vezes', () => {
    expect(renderTemplate('@@D@@/x @@D@@/y', { D: '/clips' })).toBe('/clips/x /clips/y')
  })
  it('lanca se faltar variavel', () => {
    expect(() => renderTemplate('@@Z@@', {})).toThrow(/Z/)
  })
})

describe('buildCronLine', () => {
  it('24h -> +1440 minutos', () => {
    expect(buildCronLine('/home/rafito/clips', 24)).toBe(
      '0 * * * * find /home/rafito/clips -type f -mmin +1440 -delete # clip2devbox-cleanup'
    )
  })
  it('arredonda horas fracionarias', () => {
    expect(buildCronLine('/x', 0.5)).toContain('-mmin +30 ')
  })
})

describe('ssh-config', () => {
  const fields = {
    HostName: 'devbox.tail.ts.net',
    User: 'rafito',
    StrictHostKeyChecking: 'accept-new',
  }

  it('renderHostBlock formata com indentacao', () => {
    expect(renderHostBlock('devbox', fields)).toBe(
      'Host devbox\n    HostName devbox.tail.ts.net\n    User rafito\n    StrictHostKeyChecking accept-new'
    )
  })

  it('adiciona bloco em config vazio', () => {
    const out = upsertSshHost('', 'devbox', fields)
    expect(hasSshHost(out, 'devbox')).toBe(true)
    expect(out.endsWith('\n')).toBe(true)
  })

  it('e idempotente quando o host ja existe', () => {
    const existing = 'Host devbox\n    HostName old\n'
    expect(upsertSshHost(existing, 'devbox', fields)).toBe(existing)
  })

  it('preserva hosts existentes ao adicionar outro', () => {
    const existing = 'Host outro\n    HostName x\n'
    const out = upsertSshHost(existing, 'devbox', fields)
    expect(hasSshHost(out, 'outro')).toBe(true)
    expect(hasSshHost(out, 'devbox')).toBe(true)
  })
})

describe('parseDevboxHost', () => {
  const json = JSON.stringify({
    Peer: {
      key1: {
        HostName: 'devbox',
        DNSName: 'devbox.tail4932a9.ts.net.',
        TailscaleIPs: ['100.76.19.30', 'fd7a::1'],
      },
      key2: {
        HostName: 'laptop',
        DNSName: 'laptop.tail4932a9.ts.net.',
        TailscaleIPs: ['100.1.1.1'],
      },
    },
  })

  it('acha o peer e remove o ponto final', () => {
    expect(parseDevboxHost(json, 'devbox')).toEqual({
      host: 'devbox.tail4932a9.ts.net',
      ip: '100.76.19.30',
    })
  })

  it('e case-insensitive', () => {
    expect(parseDevboxHost(json, 'DEVBOX')?.host).toBe('devbox.tail4932a9.ts.net')
  })

  it('devolve null se nao achar', () => {
    expect(parseDevboxHost(json, 'inexistente')).toBeNull()
  })
})
