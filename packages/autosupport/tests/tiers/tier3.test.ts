import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolBundle } from '../../src/types'

function makeDb(ticket: any) {
  const updateChain = {
    set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
  }
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(ticket ? [ticket] : []),
      }),
    }),
    update: vi.fn().mockReturnValue(updateChain),
    _updateChain: updateChain,
  }
}

function makeTools(): ToolBundle {
  return { definitions: [], execute: vi.fn().mockResolvedValue({}) }
}

const schema = {
  supportTickets: { id: 'col-id', githubPrId: 'col' },
} as any

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'done' }],
        }),
      },
    })),
  }
})

// Mock execFile para testar cleanup sem rodar git de verdade.
const execFileMock = vi.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
  cb(null, { stdout: '', stderr: '' })
})
vi.mock('node:child_process', () => ({
  execFile: (cmd: string, args: string[], opts: any, cb: any) => execFileMock(cmd, args, opts, cb),
}))

import { createTier3Agent, cleanupTier3Failure } from '../../src/tiers/tier3'

function makeGithubClientMock() {
  return {
    createIssue: vi.fn(),
    getPullRequest: vi.fn(),
    getPullRequestFiles: vi.fn(),
    approvePullRequest: vi.fn(),
    mergePullRequest: vi.fn(),
    postIssueComment: vi.fn().mockResolvedValue({ id: 123 }),
    postPullRequestComment: vi.fn(),
    createPullRequest: vi.fn(),
    addLabelsToPR: vi.fn(),
  } as any
}

describe('createTier3Agent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) => cb(null, { stdout: '', stderr: '' }))
  })

  it('apiKey vazia lança', () => {
    expect(() =>
      createTier3Agent({
        anthropicApiKey: '',
        db: {},
        schema,
        tools: makeTools(),
      }),
    ).toThrow(/anthropicApiKey/)
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db: makeDb(null),
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('idempotência: skip se já tem githubPrId', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: 55, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run('tk-1')
    expect(db.update).not.toHaveBeenCalled()
  })

  it('happy path sem PR criado: status volta para investigating', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
    })
    await agent.run('tk-1')
    expect(db.update).toHaveBeenCalled()
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('investigating')
  })

  it('happy path com PR criado: status muda para fixing', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'x1', name: 'create_pr', input: {} }],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'done' }],
          }),
      },
    }))

    const toolsWithPr: ToolBundle = {
      definitions: [
        { name: 'create_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValueOnce({ prNumber: 77 }).mockResolvedValue({}),
    }

    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: toolsWithPr,
      maxToolLoops: 2,
    })
    await agent.run('tk-1')
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('fixing')
    expect(setCall.githubPrId).toBe(77)
  })

  it('happy path com PR criado: NÃO posta comment de falha NEM faz cleanup', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 'x1', name: 'create_pr', input: {} }],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'done' }],
          }),
      },
    }))

    const toolsWithPr: ToolBundle = {
      definitions: [
        { name: 'create_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValueOnce({ prNumber: 77 }).mockResolvedValue({}),
    }

    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: toolsWithPr,
      maxToolLoops: 2,
      githubClient: gh,
      rootDir: '/tmp/repo',
    })
    await agent.run('tk-1')
    expect(gh.postIssueComment).not.toHaveBeenCalled()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('falha (sem PR) com githubClient + rootDir: posta comment e roda cleanup', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    // Simula uma branch criada + um write_file feito, sem nunca chamar create_pr.
    Anthropic.mockImplementation(() => ({
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'b1', name: 'git_branch', input: { name: 'support/fix-abc' } },
            ],
          })
          .mockResolvedValueOnce({
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 'w1', name: 'write_file', input: { path: 'src/foo.ts' } },
            ],
          })
          .mockResolvedValue({
            stop_reason: 'end_turn',
            content: [{ type: 'text', text: 'não consegui' }],
          }),
      },
    }))

    const tools: ToolBundle = {
      definitions: [
        { name: 'git_branch', description: 'd', input_schema: { type: 'object', properties: {} } },
        { name: 'write_file', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValue({}),
    }

    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 42, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools,
      maxToolLoops: 3,
      githubClient: gh,
      rootDir: '/tmp/repo',
    })
    await agent.run('tk-1')

    // Comment foi postado na issue.
    expect(gh.postIssueComment).toHaveBeenCalledTimes(1)
    const [issueNumber, body] = gh.postIssueComment.mock.calls[0]
    expect(issueNumber).toBe(42)
    expect(body).toMatch(/Tier 3 não conseguiu/)
    expect(body).toMatch(/src\/foo\.ts/)
    expect(body).toMatch(/support\/fix-abc/)

    // Cleanup: checkout main + branch -D + restore.
    const calls = execFileMock.mock.calls.map((c) => [c[0], c[1]])
    expect(calls).toEqual([
      ['git', ['checkout', 'main']],
      ['git', ['branch', '-D', 'support/fix-abc']],
      ['git', ['restore', '.']],
    ])

    // Status investigating.
    const setCall = db._updateChain.set.mock.calls[0][0]
    expect(setCall.status).toBe('investigating')
  })

  it('falha sem branch criada: cleanup pula branch -D', async () => {
    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 7, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      githubClient: gh,
      rootDir: '/tmp/repo',
      defaultBranch: 'develop',
    })
    await agent.run('tk-1')

    const calls = execFileMock.mock.calls.map((c) => [c[0], c[1]])
    expect(calls).toEqual([
      ['git', ['checkout', 'develop']],
      ['git', ['restore', '.']],
    ])
  })

  it('falha sem rootDir: pula cleanup mas ainda posta comment', async () => {
    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 9, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      githubClient: gh,
      // rootDir omitido propositalmente
    })
    await agent.run('tk-1')

    expect(gh.postIssueComment).toHaveBeenCalledTimes(1)
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('falha sem githubClient: cleanup roda mas comment é pulado', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 11, description: 'bug' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      db,
      schema,
      tools: makeTools(),
      rootDir: '/tmp/repo',
    })
    await agent.run('tk-1')

    expect(execFileMock).toHaveBeenCalled()
  })

  it('cleanup tolera falha em qualquer step (log + continua)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    execFileMock.mockImplementation((cmd, args, _opts, cb) => {
      if (args[0] === 'branch') return cb(new Error('branch not found'))
      cb(null, { stdout: '', stderr: '' })
    })
    await cleanupTier3Failure('/tmp/repo', 'support/fix-doesnt-exist', 'main')
    // Não lança. Os 3 comandos foram tentados.
    expect(execFileMock).toHaveBeenCalledTimes(3)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('custom branchPrefix é aceito', async () => {
    const db = makeDb({ id: 'abcdefgh-xyz', githubPrId: null, githubIssueId: 5, description: 'b' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      branchPrefix: 'hotfix/',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('abcdefgh-xyz')).resolves.toBeUndefined()
  })

  it('custom model e maxToolLoops são aceitos sem erros', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 5, description: 'b' })
    const agent = createTier3Agent({
      anthropicApiKey: 'k',
      model: 'claude-sonnet-4-6',
      maxToolLoops: 4,
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
  })
})
