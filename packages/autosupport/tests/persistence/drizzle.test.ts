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
    sentryIssueId: 'sentry-issue-id',
    source: 'source',
    createdAt: 'created-at',
  },
  supportConversations: {
    id: 'conversation-id',
    messages: 'conversation-messages',
  },
} as any

function createDb(
  rows: unknown[] = [],
  options: { selectRows?: unknown[][]; returningRows?: unknown[] } = {}
) {
  const selectRows = options.selectRows ? [...options.selectRows] : undefined
  const order: string[] = []
  const where = vi
    .fn()
    .mockImplementation(() => Promise.resolve(selectRows ? (selectRows.shift() ?? []) : rows))
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockImplementation(() => {
    order.push('select')
    return { from }
  })
  const updateWhere = vi.fn().mockResolvedValue(undefined)
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })
  const returning = vi.fn().mockResolvedValue(options.returningRows ?? rows)
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockImplementation(() => {
    order.push('insert')
    return { values }
  })
  const execute = vi.fn().mockImplementation(() => {
    order.push('lock')
    return Promise.resolve(undefined)
  })

  const db: any = {
    select,
    update,
    insert,
    execute,
    transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback(db)),
    _calls: { where, from, set, updateWhere, values, returning, execute, order },
  }

  return db
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

  it('atomically admits a new Sentry ticket inside an advisory-locked transaction', async () => {
    const ticket = { id: 'ticket-1', sentryIssueId: 'sentry-123' }
    const db = createDb([], { selectRows: [[]], returningRows: [ticket] })
    const repositories = createDrizzleRepositories(db, schema)
    const start = new Date('2026-08-25T00:00:00.000Z')
    const end = new Date('2026-08-26T00:00:00.000Z')

    await expect(
      repositories.tickets.admitSentryTicket({
        ticket: { description: 'bug', source: 'sentry', sentryIssueId: 'sentry-123' },
        dailyTicketLimit: 0,
        utcDayStart: start,
        utcDayEnd: end,
      })
    ).resolves.toEqual({ kind: 'created', ticket })
    expect(db.transaction).toHaveBeenCalledOnce()
    expect(db._calls.execute).toHaveBeenCalledOnce()
    expect(db._calls.order).toEqual(['lock', 'select', 'insert'])
    expect(db._calls.values).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'sentry', sentryIssueId: 'sentry-123' })
    )
  })

  it('returns the existing ticket from atomic Sentry admission', async () => {
    const ticket = { id: 'ticket-existing', sentryIssueId: 'sentry-123' }
    const db = createDb([], { selectRows: [[ticket]] })
    const repositories = createDrizzleRepositories(db, schema)

    await expect(
      repositories.tickets.admitSentryTicket({
        ticket: { description: 'bug', source: 'sentry', sentryIssueId: 'sentry-123' },
        dailyTicketLimit: 5,
        utcDayStart: new Date('2026-08-25T00:00:00.000Z'),
        utcDayEnd: new Date('2026-08-26T00:00:00.000Z'),
      })
    ).resolves.toEqual({ kind: 'duplicate', ticket })
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('returns daily_limit without inserting when atomic admission reaches the UTC cap', async () => {
    const db = createDb([], { selectRows: [[], [{ value: 5 }]] })
    const repositories = createDrizzleRepositories(db, schema)

    await expect(
      repositories.tickets.admitSentryTicket({
        ticket: { description: 'bug', source: 'sentry', sentryIssueId: 'sentry-456' },
        dailyTicketLimit: 5,
        utcDayStart: new Date('2026-08-25T00:00:00.000Z'),
        utcDayEnd: new Date('2026-08-26T00:00:00.000Z'),
      })
    ).resolves.toEqual({ kind: 'daily_limit', count: 5 })
    expect(db.insert).not.toHaveBeenCalled()
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
