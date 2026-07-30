import { describe, expect, it, vi } from 'vitest'
import {
  createDrizzleRepositories,
  resolveSupportRepositories,
} from '../../src/persistence/drizzle'

const schema = {
  supportTickets: {
    id: 'ticket-id',
    githubIssueId: 'github-issue-id',
    githubPrId: 'github-pr-id',
  },
  supportConversations: {
    id: 'conversation-id',
    messages: 'conversation-messages',
  },
} as any

function createDb(rows: unknown[] = []) {
  const where = vi.fn().mockResolvedValue(rows)
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })
  const returning = vi.fn().mockResolvedValue(rows)
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })

  return {
    select,
    update,
    insert,
    _calls: { where, from, set, updateWhere, values, returning },
  }
}

describe('createDrizzleRepositories', () => {
  it('finds tickets through the injected Drizzle database', async () => {
    const ticket = { id: 'ticket-1', description: 'bug' }
    const db = createDb([ticket])
    const repositories = createDrizzleRepositories(db, schema)

    await expect(repositories.tickets.findById('ticket-1')).resolves.toBe(ticket)
    expect(db.select).toHaveBeenCalled()
    expect(db._calls.from).toHaveBeenCalledWith(schema.supportTickets)
  })

  it('returns null when a ticket does not exist', async () => {
    const repositories = createDrizzleRepositories(createDb([]), schema)
    await expect(repositories.tickets.findByGithubIssueId(42)).resolves.toBeNull()
  })

  it('creates and updates tickets', async () => {
    const ticket = { id: 'ticket-1', description: 'bug' }
    const db = createDb([ticket])
    const repositories = createDrizzleRepositories(db, schema)

    await expect(repositories.tickets.create({ description: 'bug', source: 'chat' })).resolves.toBe(
      ticket
    )
    expect(db._calls.values).toHaveBeenCalledWith({ description: 'bug', source: 'chat' })

    await repositories.tickets.update('ticket-1', { status: 'investigating' })
    expect(db.update).toHaveBeenCalledWith(schema.supportTickets)
    expect(db._calls.set).toHaveBeenCalledWith({ status: 'investigating' })
  })

  it('loads and appends conversation messages', async () => {
    const first = { role: 'user' as const, content: 'oi', ts: '2026-07-30T00:00:00.000Z' }
    const db = createDb([{ messages: [first] }])
    const repositories = createDrizzleRepositories(db, schema)

    await expect(repositories.conversations.findMessages('conv-1')).resolves.toEqual([first])
    await repositories.conversations.appendMessage('conv-1', {
      role: 'assistant',
      content: 'olá',
      ts: '2026-07-30T00:00:01.000Z',
    })

    expect(db._calls.set).toHaveBeenCalledWith({
      messages: [first, { role: 'assistant', content: 'olá', ts: '2026-07-30T00:00:01.000Z' }],
      updatedAt: expect.any(Date),
    })
  })
})

describe('resolveSupportRepositories', () => {
  it('returns explicitly injected repositories', () => {
    const repositories = {
      tickets: {} as any,
      conversations: {} as any,
    }
    expect(resolveSupportRepositories({ repositories })).toBe(repositories)
  })

  it('builds the legacy Drizzle adapter from db and schema', () => {
    const repositories = resolveSupportRepositories({ db: createDb(), schema })
    expect(repositories.tickets.findById).toBeTypeOf('function')
  })

  it('rejects incomplete persistence configuration', () => {
    expect(() => resolveSupportRepositories({} as any)).toThrow(/repositories|db/)
  })
})
