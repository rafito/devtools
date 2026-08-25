import { createHash } from 'node:crypto'
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
  autoFixEnabled?: boolean
}

function deterministicTier2JobId(ticketId: string): string {
  const hash = createHash('sha256').update(`autosupport:tier2:${ticketId}`).digest('hex')
  const variant = ((Number.parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${variant}${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}

export function createSupportQueue(opts: CreateQueueOptions) {
  let boss: PgBoss | null = null
  let startPromise: Promise<PgBoss> | null = null
  const autoFixEnabled = opts.autoFixEnabled !== false

  async function start(): Promise<PgBoss> {
    if (startPromise) return startPromise

    const instance = new PgBoss({ connectionString: opts.connectionString })
    boss = instance
    instance.on('error', (err: unknown) => console.error('[autosupport-queue]', err))
    startPromise = (async () => {
      await instance.start()

      await instance.createQueue('support-tier2-investigate')
      if (autoFixEnabled) {
        await instance.createQueue('support-tier3-fix')
        await instance.createQueue('support-tier4-review')
      }

      await instance.work(
        'support-tier2-investigate',
        async (jobs: Job<{ ticketId: string }>[]) => {
          for (const j of jobs) await opts.runners.tier2(j.data.ticketId)
        }
      )
      if (autoFixEnabled) {
        await instance.work('support-tier3-fix', async (jobs: Job<{ ticketId: string }>[]) => {
          for (const j of jobs) await opts.runners.tier3(j.data.ticketId)
        })
        await instance.work(
          'support-tier4-review',
          async (jobs: Job<{ prNumber: number; ticketId: string }>[]) => {
            for (const j of jobs) await opts.runners.tier4(j.data.prNumber, j.data.ticketId)
          }
        )
      }

      console.log(
        autoFixEnabled
          ? '[autosupport-queue] support tiers 2/3/4 workers started'
          : '[autosupport-queue] support tier 2 worker started; auto-fix workers disabled'
      )
      return instance
    })()

    try {
      return await startPromise
    } catch (error) {
      boss = null
      startPromise = null
      throw error
    }
  }

  async function stop(): Promise<void> {
    if (boss) {
      await boss.stop()
      boss = null
      startPromise = null
    }
  }

  async function enqueueTier2(ticketId: string): Promise<string | null> {
    const b = await start()
    return b.send(
      'support-tier2-investigate',
      { ticketId },
      {
        id: deterministicTier2JobId(ticketId),
        singletonKey: ticketId,
        retryLimit: opts.retries?.tier2 ?? 3,
        retryDelay: 60,
        retryBackoff: true,
      }
    )
  }

  async function enqueueTier3(ticketId: string): Promise<string | null> {
    if (!autoFixEnabled) return null
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
    if (!autoFixEnabled) return null
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
