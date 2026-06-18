import { type Job, PgBoss } from 'pg-boss'

export type SupportQueueRunners = {
  tier2: (ticketId: string) => Promise<void>
  tier3: (ticketId: string) => Promise<void>
  tier4: (prNumber: number, ticketId: string) => Promise<void>
}

export type CreateQueueOptions = {
  connectionString: string
  runners: SupportQueueRunners
  retries?: { tier2?: number; tier3?: number; tier4?: number }
}

export function createSupportQueue(opts: CreateQueueOptions) {
  let boss: PgBoss | null = null

  async function start(): Promise<PgBoss> {
    if (boss) return boss
    boss = new PgBoss({ connectionString: opts.connectionString })
    boss.on('error', (err: unknown) => console.error('[autosupport-queue]', err))
    await boss.start()

    await boss.createQueue('support-tier2-investigate')
    await boss.createQueue('support-tier3-fix')
    await boss.createQueue('support-tier4-review')

    await boss.work('support-tier2-investigate', async (jobs: Job<{ ticketId: string }>[]) => {
      for (const j of jobs) await opts.runners.tier2(j.data.ticketId)
    })
    await boss.work('support-tier3-fix', async (jobs: Job<{ ticketId: string }>[]) => {
      for (const j of jobs) await opts.runners.tier3(j.data.ticketId)
    })
    await boss.work(
      'support-tier4-review',
      async (jobs: Job<{ prNumber: number; ticketId: string }>[]) => {
        for (const j of jobs) await opts.runners.tier4(j.data.prNumber, j.data.ticketId)
      }
    )

    console.log('[autosupport-queue] support tiers 2/3/4 workers started')
    return boss
  }

  async function stop(): Promise<void> {
    if (boss) {
      await boss.stop()
      boss = null
    }
  }

  async function enqueueTier2(ticketId: string): Promise<string | null> {
    const b = await start()
    return b.send(
      'support-tier2-investigate',
      { ticketId },
      {
        retryLimit: opts.retries?.tier2 ?? 3,
        retryDelay: 60,
        retryBackoff: true,
      }
    )
  }

  async function enqueueTier3(ticketId: string): Promise<string | null> {
    const b = await start()
    return b.send(
      'support-tier3-fix',
      { ticketId },
      {
        retryLimit: opts.retries?.tier3 ?? 1,
        retryDelay: 30,
      }
    )
  }

  async function enqueueTier4(prNumber: number, ticketId: string): Promise<string | null> {
    const b = await start()
    return b.send(
      'support-tier4-review',
      { prNumber, ticketId },
      {
        retryLimit: opts.retries?.tier4 ?? 1,
        retryDelay: 30,
      }
    )
  }

  return { start, stop, enqueueTier2, enqueueTier3, enqueueTier4 }
}

export type SupportQueue = ReturnType<typeof createSupportQueue>
