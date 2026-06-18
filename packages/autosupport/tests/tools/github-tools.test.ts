import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GitHubClient } from '../../src/clients/github'
import { createGithubTools } from '../../src/tools/github-tools'

function makeMockClient(): GitHubClient {
  return {
    createIssue: vi.fn().mockResolvedValue({ number: 42, html_url: 'u', title: 't' }),
    createPullRequest: vi.fn().mockResolvedValue({ number: 7, html_url: 'p', title: 't' }),
    addLabelsToPR: vi.fn().mockResolvedValue([]),
    getPullRequest: vi.fn().mockResolvedValue({
      number: 7,
      title: 't',
      body: 'b',
      head: { ref: 'feat/x', sha: 's' },
      labels: [{ name: 'support-auto' }],
      html_url: 'u',
    }),
    getPullRequestFiles: vi
      .fn()
      .mockResolvedValue([
        { filename: 'a.ts', status: 'modified', additions: 5, deletions: 1, patch: 'diff' },
      ]),
    approvePullRequest: vi.fn().mockResolvedValue({ id: 99, state: 'APPROVED' }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, sha: 'abc', message: 'ok' }),
    postPullRequestComment: vi.fn().mockResolvedValue({ id: 100, state: 'COMMENTED' }),
  } as any
}

describe('createGithubTools', () => {
  it('client null lança', () => {
    expect(() => createGithubTools({ client: null as any })).toThrow(/client/)
  })

  it('definitions tem 7 ferramentas', () => {
    const t = createGithubTools({ client: makeMockClient() })
    expect(t.definitions.map((d) => d.name).sort()).toEqual([
      'approve_pr',
      'create_github_issue',
      'create_pr',
      'merge_pr',
      'post_review_comment',
      'read_pr',
      'read_pr_files',
    ])
  })

  it('create_github_issue chama client.createIssue', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    const r = (await t.execute('create_github_issue', { title: 'T', body: 'B' })) as any
    expect(c.createIssue).toHaveBeenCalledWith('T', 'B')
    expect(r.issueNumber).toBe(42)
  })

  it('create_pr aplica label support-auto', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    await t.execute('create_pr', { title: 'T', body: 'B', branch: 'feat/x' })
    expect(c.addLabelsToPR).toHaveBeenCalledWith(7, ['support-auto'])
  })

  it('create_pr usa autoLabel customizado se fornecido', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c, autoLabel: 'custom-label' })
    await t.execute('create_pr', { title: 'T', body: 'B', branch: 'feat/x' })
    expect(c.addLabelsToPR).toHaveBeenCalledWith(7, ['custom-label'])
  })

  it('read_pr retorna shape esperado', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    const r = (await t.execute('read_pr', { prNumber: 7 })) as any
    expect(r.number).toBe(7)
    expect(r.branch).toBe('feat/x')
    expect(r.labels).toEqual(['support-auto'])
  })

  it('read_pr_files trunca patch a 2000 chars', async () => {
    const c = makeMockClient()
    c.getPullRequestFiles = vi.fn().mockResolvedValue([
      {
        filename: 'a.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: 'x'.repeat(3000),
      },
    ])
    const t = createGithubTools({ client: c })
    const r = (await t.execute('read_pr_files', { prNumber: 7 })) as any
    expect(r.files[0].patch.length).toBe(2000)
  })

  it('approve_pr + merge_pr', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    const a = (await t.execute('approve_pr', { prNumber: 7, comment: 'lgtm' })) as any
    expect(a.approved).toBe(true)
    const m = (await t.execute('merge_pr', { prNumber: 7 })) as any
    expect(m.merged).toBe(true)
  })

  it('post_review_comment adiciona prefixo padrão', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    await t.execute('post_review_comment', { prNumber: 7, comment: 'porque sim' })
    expect(c.postPullRequestComment).toHaveBeenCalledWith(
      7,
      'Este PR requer revisão humana: porque sim'
    )
  })

  it('post_review_comment não duplica prefixo se já presente', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    await t.execute('post_review_comment', {
      prNumber: 7,
      comment: 'Este PR requer revisão humana: x',
    })
    expect(c.postPullRequestComment).toHaveBeenCalledWith(7, 'Este PR requer revisão humana: x')
  })

  it('erro do client retorna { error } sanitizado', async () => {
    const c = makeMockClient()
    c.createIssue = vi.fn().mockRejectedValue(new Error('GitHub API error 401'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const t = createGithubTools({ client: c })
    const r = (await t.execute('create_github_issue', { title: 'T', body: 'B' })) as any
    expect(r.error).toContain('401')
    consoleSpy.mockRestore()
  })

  it('ferramenta desconhecida retorna erro', async () => {
    const c = makeMockClient()
    const t = createGithubTools({ client: c })
    const r = (await t.execute('inexistente', {})) as any
    expect(r.error).toContain('desconhecida')
  })
})
