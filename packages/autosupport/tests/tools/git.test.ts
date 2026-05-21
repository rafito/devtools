import { describe, it, expect, vi } from 'vitest'
import { createGitTools } from '../../src/tools/git'

describe('createGitTools', () => {
  it('token vazio lança', () => {
    expect(() => createGitTools({ token: '', repo: 'o/r', rootDir: '/tmp' })).toThrow(/token/)
  })
  it('repo vazio lança', () => {
    expect(() => createGitTools({ token: 't', repo: '', rootDir: '/tmp' })).toThrow(/repo/)
  })
  it('rootDir vazio lança', () => {
    expect(() => createGitTools({ token: 't', repo: 'o/r', rootDir: '' })).toThrow(/rootDir/)
  })
  it('definitions tem 2 ferramentas', () => {
    const t = createGitTools({ token: 't', repo: 'o/r', rootDir: '/tmp' })
    expect(t.definitions.map((d) => d.name).sort()).toEqual(['git_branch', 'git_commit_push'])
  })
  it('unknown tool retorna erro', async () => {
    const t = createGitTools({ token: 't', repo: 'o/r', rootDir: '/tmp' })
    const r = await t.execute('inexistente', {}) as any
    expect(r.error).toContain('desconhecida')
  })

  it('sanitiza token no erro', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const t = createGitTools({ token: 'secret-tok', repo: 'o/r', rootDir: '/tmp/nonexistent-xyz' })
      const r = await t.execute('git_branch', { name: 'feat/x' }) as any
      expect(r.error).toBeDefined()
      expect(r.error).not.toContain('secret-tok')
    } finally {
      spy.mockRestore()
    }
  })

  it('sanitiza token mesmo se a mensagem o contiver', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const t = createGitTools({ token: 'secret-tok', repo: 'o/r', rootDir: '/' })
      const r = await t.execute('git_commit_push', {
        files: ['nonexistent'], message: 'x', branch: 'main',
      }) as any
      if (r.error) expect(r.error).not.toContain('secret-tok')
    } finally {
      spy.mockRestore()
    }
  })
})
