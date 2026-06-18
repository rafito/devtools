import { describe, expect, it, vi } from 'vitest'
import type { SentryClient } from '../../src/clients/sentry-api'
import { createSentryTool } from '../../src/tools/sentry-tools'

function mockClient(): SentryClient {
  return {
    getIssue: vi.fn().mockResolvedValue({
      title: 'T',
      culprit: 'c',
      occurrences: 5,
      usersAffected: 2,
      firstSeen: '',
      lastSeen: '',
      permalink: '',
      stackTrace: '',
    }),
    searchIssues: vi.fn().mockResolvedValue({ issues: [] }),
  } as any
}

describe('createSentryTool', () => {
  it('client null lança', () => {
    expect(() => createSentryTool(null as any)).toThrow(/client/)
  })

  it('definitions tem 1 ferramenta', () => {
    const t = createSentryTool(mockClient())
    expect(t.definitions.map((d) => d.name)).toEqual(['query_sentry'])
  })

  it('query_sentry com issueId chama getIssue', async () => {
    const c = mockClient()
    const t = createSentryTool(c)
    const r = (await t.execute('query_sentry', { issueId: 'abc' })) as any
    expect(c.getIssue).toHaveBeenCalledWith('abc')
    expect(r.title).toBe('T')
  })

  it('query_sentry com query chama searchIssues', async () => {
    const c = mockClient()
    const t = createSentryTool(c)
    const r = (await t.execute('query_sentry', { query: 'TypeError' })) as any
    expect(c.searchIssues).toHaveBeenCalledWith('TypeError')
  })

  it('query_sentry sem param retorna erro', async () => {
    const t = createSentryTool(mockClient())
    const r = (await t.execute('query_sentry', {})) as any
    expect(r.error).toContain('obrigatório')
  })

  it('ferramenta desconhecida retorna erro', async () => {
    const t = createSentryTool(mockClient())
    const r = (await t.execute('unknown', {})) as any
    expect(r.error).toContain('desconhecida')
  })

  it('erro inesperado do client retorna { error } sanitizado', async () => {
    const c = mockClient()
    c.getIssue = vi.fn().mockRejectedValue(new Error('Sentry SDK crashed'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = createSentryTool(c)
    const r = (await t.execute('query_sentry', { issueId: 'abc' })) as any
    expect(r.error).toContain('crashed')
    consoleSpy.mockRestore()
  })
})
