import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createLogsTool } from '../../src/tools/logs'

let tmpDir: string
let logFile: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'autosupport-logs-'))
  logFile = path.join(tmpDir, 'server.log')
  const content = Array.from({ length: 200 }, (_, i) => `line ${i + 1} ${i % 3 === 0 ? 'ERROR' : 'info'}`).join('\n')
  await fs.writeFile(logFile, content)
})
afterAll(async () => fs.rm(tmpDir, { recursive: true, force: true }))

describe('createLogsTool', () => {
  it('read_logs retorna últimas N linhas', async () => {
    const t = createLogsTool({ logFilePath: logFile })
    const r = await t.execute('read_logs', { lines: 5 }) as any
    expect(r.logs.split('\n').filter(Boolean)).toHaveLength(5)
  })

  it('read_logs aplica filtro', async () => {
    const t = createLogsTool({ logFilePath: logFile })
    const r = await t.execute('read_logs', { lines: 50, filter: 'ERROR' }) as any
    expect(r.logs).toContain('ERROR')
    expect(r.logs).not.toContain('info')
  })

  it('read_logs caps em maxLines', async () => {
    const t = createLogsTool({ logFilePath: logFile, maxLines: 10 })
    const r = await t.execute('read_logs', { lines: 9999 }) as any
    expect(r.logs.split('\n').filter(Boolean).length).toBeLessThanOrEqual(10)
  })

  it('read_logs retorna mensagem graciosa se arquivo não existe', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const t = createLogsTool({ logFilePath: '/tmp/__definitely_does_not_exist__.log' })
      const r = await t.execute('read_logs', {}) as any
      expect(r.logs).toContain('não disponível')
    } finally {
      spy.mockRestore()
    }
  })

  it('logFilePath vazio lança', () => {
    expect(() => createLogsTool({ logFilePath: '' })).toThrow(/logFilePath/)
  })
})
