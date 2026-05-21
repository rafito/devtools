import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createGitHubClient } from '../../src/clients/github'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => { mockFetch.mockReset() })

describe('createGitHubClient', () => {
  it('createIssue chama POST /issues com headers corretos', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 42, html_url: 'https://github.com/x/y/issues/42', title: 't' }),
    })
    const gh = createGitHubClient({ token: 'tok', repo: 'org/repo' })
    const issue = await gh.createIssue('t', 'b')
    expect(issue.number).toBe(42)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/org/repo/issues')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tok')
  })

  it('throw em repo inválido', () => {
    expect(() => createGitHubClient({ token: 't', repo: 'sem-barra' }))
      .toThrow(/owner\/repo/)
  })

  it('throw com token vazio', () => {
    expect(() => createGitHubClient({ token: '', repo: 'o/r' }))
      .toThrow(/GITHUB_TOKEN/)
  })

  it('createIssue propaga erro de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'bad' })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    await expect(gh.createIssue('t', 'b')).rejects.toThrow(/422/)
  })

  it('getPullRequest faz GET /pulls/{n}', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 7, title: 'p', body: '', head: { ref: 'br', sha: 's' }, labels: [], html_url: 'u' }),
    })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    const pr = await gh.getPullRequest(7)
    expect(pr.number).toBe(7)
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.github.com/repos/o/r/pulls/7')
  })

  it('createPullRequest manda head + base', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ number: 9, html_url: 'u', title: 't' }),
    })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    const pr = await gh.createPullRequest('t', 'b', 'feat/x')
    expect(pr.number).toBe(9)
    const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body)
    expect(body.head).toBe('feat/x')
    expect(body.base).toBe('main')
  })

  it('postIssueComment chama POST /issues/{n}/comments com body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 999 }),
    })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    const r = await gh.postIssueComment(42, 'Tier 3 falhou')
    expect(r.id).toBe(999)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.github.com/repos/o/r/issues/42/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body).body).toBe('Tier 3 falhou')
  })

  it('postIssueComment propaga erro de API', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    await expect(gh.postIssueComment(1, 'x')).rejects.toThrow(/404/)
  })

  it('mergePullRequest faz PUT /merge com squash', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ merged: true, sha: 'abc', message: 'ok' }),
    })
    const gh = createGitHubClient({ token: 't', repo: 'o/r' })
    const r = await gh.mergePullRequest(3)
    expect(r.merged).toBe(true)
    const init = mockFetch.mock.calls[0][1] as any
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body).merge_method).toBe('squash')
  })
})
