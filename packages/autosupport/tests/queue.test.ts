import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockBoss = {
  on: vi.fn(),
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  createQueue: vi.fn().mockResolvedValue(undefined),
  work: vi.fn().mockResolvedValue(undefined),
  send: vi.fn().mockResolvedValue('job-1'),
}

vi.mock('pg-boss', () => {
  return { PgBoss: vi.fn(() => mockBoss) }
})

import { createSupportQueue } from '../src/queue/index'

beforeEach(() => {
  vi.clearAllMocks()
  mockBoss.send.mockResolvedValue('job-1')
})

describe('createSupportQueue', () => {
  it('start cria as 3 filas support-* exatas', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    const created = mockBoss.createQueue.mock.calls.map((c: any) => c[0])
    expect(created.sort()).toEqual([
      'support-tier2-investigate',
      'support-tier3-fix',
      'support-tier4-review',
    ])
  })

  it('start registra work handlers para as 3 filas', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    const workNames = mockBoss.work.mock.calls.map((c: any) => c[0]).sort()
    expect(workNames).toEqual([
      'support-tier2-investigate',
      'support-tier3-fix',
      'support-tier4-review',
    ])
  })

  it('enqueueTier2 chama send com job correto', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    const jobId = await q.enqueueTier2('ticket-abc')
    expect(jobId).toBe('job-1')
    expect(mockBoss.send).toHaveBeenCalledWith(
      'support-tier2-investigate',
      { ticketId: 'ticket-abc' },
      expect.objectContaining({
        retryLimit: expect.any(Number),
        singletonKey: 'ticket-abc',
        id: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        ),
      })
    )
  })

  it('uses the same deterministic pg-boss job ID for concurrent Tier 2 enqueue attempts', async () => {
    mockBoss.send.mockResolvedValueOnce('job-1').mockResolvedValueOnce(null)
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })

    const results = await Promise.all([
      q.enqueueTier2('ticket-race'),
      q.enqueueTier2('ticket-race'),
    ])

    const firstOptions = mockBoss.send.mock.calls[0][2]
    const secondOptions = mockBoss.send.mock.calls[1][2]
    expect(firstOptions.id).toBe(secondOptions.id)
    expect(firstOptions.singletonKey).toBe('ticket-race')
    expect(secondOptions.singletonKey).toBe('ticket-race')
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('enqueueTier3 dispara fila support-tier3-fix', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    await q.enqueueTier3('ticket-xyz')
    expect(mockBoss.send).toHaveBeenCalledWith(
      'support-tier3-fix',
      { ticketId: 'ticket-xyz' },
      expect.any(Object)
    )
  })

  it('enqueueTier4 envia prNumber + ticketId', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    await q.enqueueTier4(42, 'tk1')
    expect(mockBoss.send).toHaveBeenCalledWith(
      'support-tier4-review',
      { prNumber: 42, ticketId: 'tk1' },
      expect.any(Object)
    )
  })

  it('uses configured nonnegative retry limits, including zero', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
      retries: { tier2: 0, tier3: 2, tier4: 4 },
    })

    await q.enqueueTier2('tk-2')
    await q.enqueueTier3('tk-3')
    await q.enqueueTier4(42, 'tk-4')

    expect(mockBoss.send).toHaveBeenNthCalledWith(
      1,
      'support-tier2-investigate',
      { ticketId: 'tk-2' },
      expect.objectContaining({ retryLimit: 0 })
    )
    expect(mockBoss.send).toHaveBeenNthCalledWith(
      2,
      'support-tier3-fix',
      { ticketId: 'tk-3' },
      expect.objectContaining({ retryLimit: 2 })
    )
    expect(mockBoss.send).toHaveBeenNthCalledWith(
      3,
      'support-tier4-review',
      { prNumber: 42, ticketId: 'tk-4' },
      expect.objectContaining({ retryLimit: 4 })
    )
  })

  it('start é idempotente — segunda chamada não recria filas', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    const firstCount = mockBoss.createQueue.mock.calls.length
    await q.start()
    expect(mockBoss.createQueue.mock.calls.length).toBe(firstCount)
  })

  it('enqueue antes de start chama start implicitamente', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.enqueueTier2('tk')
    expect(mockBoss.start).toHaveBeenCalledOnce()
    expect(mockBoss.send).toHaveBeenCalled()
  })

  it('stop limpa o estado interno e permite restart', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
    })
    await q.start()
    await q.stop()
    expect(mockBoss.stop).toHaveBeenCalledOnce()
    await q.start()
    // Após stop, segundo start deveria invocar createQueue novamente
    expect(mockBoss.createQueue.mock.calls.length).toBeGreaterThanOrEqual(6)
  })

  it('auto-fix disabled registers only Tier 2 and fail-closes Tier 3/4 enqueue', async () => {
    const q = createSupportQueue({
      connectionString: 'postgres://x',
      runners: { tier2: vi.fn(), tier3: vi.fn(), tier4: vi.fn() },
      autoFixEnabled: false,
    })

    await q.start()
    expect(mockBoss.createQueue.mock.calls.map((call: any) => call[0])).toEqual([
      'support-tier2-investigate',
    ])
    expect(mockBoss.work.mock.calls.map((call: any) => call[0])).toEqual([
      'support-tier2-investigate',
    ])

    await expect(q.enqueueTier3('ticket-3')).resolves.toBeNull()
    await expect(q.enqueueTier4(42, 'ticket-4')).resolves.toBeNull()
    expect(mockBoss.send).not.toHaveBeenCalled()
  })
})
