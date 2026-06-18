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
      expect.objectContaining({ retryLimit: expect.any(Number) })
    )
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
})
