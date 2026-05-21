import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import { createFilesystemTools } from '../../src/tools/filesystem'

let tmpRoot: string

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'autosupport-fs-'))
  await fs.writeFile(path.join(tmpRoot, 'hello.ts'), 'export const x = 1\n')
  await fs.mkdir(path.join(tmpRoot, 'server'), { recursive: true })
  await fs.writeFile(path.join(tmpRoot, 'server', 'foo.ts'), 'function findMe() {}\n')
})
afterAll(async () => fs.rm(tmpRoot, { recursive: true, force: true }))

describe('createFilesystemTools', () => {
  it('read_file lê arquivo dentro do rootDir', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('read_file', { path: 'hello.ts' }) as any
    expect(r.content).toContain('export const x')
  })

  it('read_file rejeita path fora do rootDir', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const t = createFilesystemTools({ rootDir: tmpRoot })
      const r = await t.execute('read_file', { path: '../etc/passwd' }) as any
      expect(r.error).toBeDefined()
    } finally {
      spy.mockRestore()
    }
  })

  it('search_code encontra match', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('search_code', { query: 'findMe', directory: 'server' }) as any
    expect(r.matches).toContain('findMe')
  })

  it('write_file rejeita arquivo protegido', async () => {
    const t = createFilesystemTools({
      rootDir: tmpRoot,
      protectedPatterns: [/^\.env/],
    })
    const r = await t.execute('write_file', { path: '.env', content: 'x' }) as any
    expect(r.error).toContain('protegido')
  })

  it('write_file grava arquivo (e cria diretório intermediário)', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('write_file', { path: 'a/b.ts', content: 'ok' }) as any
    expect(r.success).toBe(true)
    const written = await fs.readFile(path.join(tmpRoot, 'a/b.ts'), 'utf8')
    expect(written).toBe('ok')
  })

  it('execute com nome desconhecido retorna erro', async () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    const r = await t.execute('inexistente', {}) as any
    expect(r.error).toContain('desconhecida')
  })

  it('definitions tem 3 ferramentas', () => {
    const t = createFilesystemTools({ rootDir: tmpRoot })
    expect(t.definitions.map((d) => d.name).sort()).toEqual(['read_file', 'search_code', 'write_file'])
  })

  it('rootDir vazio lança erro', () => {
    expect(() => createFilesystemTools({ rootDir: '' })).toThrow(/rootDir/)
  })
})
