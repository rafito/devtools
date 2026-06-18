import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSentryClient } from '../../src/clients/sentry-api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)
beforeEach(() => mockFetch.mockReset())

describe('createSentryClient', () => {
  it('getIssue retorna metadados + stackTrace', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          title: 'T',
          culprit: 'c',
          count: '5',
          userCount: 2,
          firstSeen: '2026-05-20',
          lastSeen: '2026-05-20',
          permalink: 'p',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              type: 'exception',
              data: {
                values: [
                  { stacktrace: { frames: [{ filename: 'a.ts', lineno: 1, function: 'fn' }] } },
                ],
              },
            },
          ],
        }),
      })
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const issue = await c.getIssue('abc')
    expect((issue as any).title).toBe('T')
    expect((issue as any).occurrences).toBe(5)
    expect((issue as any).stackTrace).toContain('a.ts:1')
  })

  it('searchIssues retorna lista', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: '1',
          title: 'A',
          culprit: 'c',
          count: '1',
          userCount: 1,
          lastSeen: 'x',
          permalink: 'p',
        },
      ],
    })
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = await c.searchIssues('boom')
    expect((r as any).issues[0].title).toBe('A')
  })

  it('getIssue retorna { error } em falha de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) })
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = (await c.getIssue('x')) as any
    expect(r.error).toContain('403')
  })

  it('searchIssues retorna { error } em falha de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = (await c.searchIssues('boom')) as any
    expect(r.error).toContain('500')
  })

  it('getIssue captura exceções de rede', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'))
    const c = createSentryClient({ apiToken: 't', orgSlug: 'org', projectSlug: 'proj' })
    const r = (await c.getIssue('x')) as any
    expect(r.error).toContain('ECONNRESET')
  })
})
