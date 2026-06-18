import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolBundle } from '../../src/types'
import { makeLlm, makeTools } from './helpers'

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

const schema = {
  supportTickets: { id: 'col-id', githubPrId: 'col' },
} as any

// Mock execFile para testar cleanup sem rodar git de verdade.
const execFileMock = vi.fn((_cmd: string, _args: string[], _opts: any, cb: any) => {
  cb(null, { stdout: '', stderr: '' })
})
vi.mock('node:child_process', () => ({
  execFile: (cmd: string, args: string[], opts: any, cb: any) => execFileMock(cmd, args, opts, cb),
}))

import { cleanupTier3Failure, createTier3Agent } from '../../src/tiers/tier3'

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
    execFileMock.mockImplementation((_cmd, _args, _opts, cb) =>
      cb(null, { stdout: '', stderr: '' })
    )
  })

  it('ticket inexistente lança', async () => {
    const agent = createTier3Agent({
      llm: makeLlm(),
      db: makeDb(null),
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).rejects.toThrow(/não encontrado/)
  })

  it('idempotência: skip se já tem githubPrId', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: 55, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      llm: makeLlm(),
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
      llm: makeLlm(),
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
    const toolsWithPr: ToolBundle = {
      definitions: [
        { name: 'create_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValueOnce({ prNumber: 77 }).mockResolvedValue({}),
    }

    const llm = makeLlm(async (opts) => {
      const r = await opts.tools.execute('create_pr', {})
      opts.onToolResult?.('create_pr', {}, r)
      return { text: 'done', steps: 1, finishReason: 'stop' }
    })

    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      llm,
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
    const toolsWithPr: ToolBundle = {
      definitions: [
        { name: 'create_pr', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi.fn().mockResolvedValueOnce({ prNumber: 77 }).mockResolvedValue({}),
    }

    const llm = makeLlm(async (opts) => {
      const r = await opts.tools.execute('create_pr', {})
      opts.onToolResult?.('create_pr', {}, r)
      return { text: 'done', steps: 1, finishReason: 'stop' }
    })

    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 10, description: 'bug' })
    const agent = createTier3Agent({
      llm,
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
    // Simula uma branch criada + um write_file feito, sem nunca chamar create_pr.
    const tools: ToolBundle = {
      definitions: [
        { name: 'git_branch', description: 'd', input_schema: { type: 'object', properties: {} } },
        { name: 'write_file', description: 'd', input_schema: { type: 'object', properties: {} } },
      ],
      execute: vi
        .fn()
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValue({}),
    }

    const llm = makeLlm(async (opts) => {
      const r1 = await opts.tools.execute('git_branch', { name: 'support/fix-abc' })
      opts.onToolResult?.('git_branch', { name: 'support/fix-abc' }, r1)
      const r2 = await opts.tools.execute('write_file', { path: 'src/foo.ts' })
      opts.onToolResult?.('write_file', { path: 'src/foo.ts' }, r2)
      return { text: 'não consegui', steps: 2, finishReason: 'stop' }
    })

    const gh = makeGithubClientMock()
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 42, description: 'bug' })
    const agent = createTier3Agent({
      llm,
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
      llm: makeLlm(),
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
      llm: makeLlm(),
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
      llm: makeLlm(),
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
      llm: makeLlm(),
      branchPrefix: 'hotfix/',
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('abcdefgh-xyz')).resolves.toBeUndefined()
  })

  it('maxToolLoops customizado é aceito sem erros', async () => {
    const db = makeDb({ id: 'tk-1', githubPrId: null, githubIssueId: 5, description: 'b' })
    const llm = makeLlm()
    const agent = createTier3Agent({
      llm,
      maxToolLoops: 4,
      db,
      schema,
      tools: makeTools(),
    })
    await expect(agent.run('tk-1')).resolves.toBeUndefined()
    expect(llm.calls[0].maxToolLoops).toBe(4)
  })

  it('injeta a conversa do chat no contexto quando ticket tem conversationId', async () => {
    const ticket = {
      id: 'tk-1',
      githubPrId: null,
      githubIssueId: 10,
      description: 'bug',
      conversationId: 'conv-1',
    }
    const convMessages = [
      { role: 'user', content: 'o filtro de data quebra' },
      { role: 'assistant', content: 'qual intervalo você selecionou?' },
    ]
    let n = 0
    const db = {
      select: vi.fn().mockImplementation(() => {
        n++
        const rows = n === 1 ? [ticket] : [{ messages: convMessages }]
        return { from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(rows) }) }
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    }
    const schemaWithConv = {
      supportTickets: { id: 'c', githubPrId: 'c' },
      supportConversations: { id: 'c', messages: 'c' },
    } as any

    const llm = makeLlm()
    const agent = createTier3Agent({
      llm,
      db,
      schema: schemaWithConv,
      tools: makeTools(),
      maxToolLoops: 1,
    })
    await agent.run('tk-1')

    expect(llm.calls[0].messages[0].content).toMatch(/Conversa com o cliente/)
    expect(llm.calls[0].messages[0].content).toMatch(/\*\*Cliente:\*\* o filtro de data quebra/)
    expect(llm.calls[0].messages[0].content).toMatch(/\*\*Suporte:\*\* qual intervalo/)
  })
})
