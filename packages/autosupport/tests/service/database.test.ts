import { describe, expect, it, vi } from 'vitest'
import { bootstrapServiceSchema } from '../../src/service/database'

describe('bootstrapServiceSchema', () => {
  it('creates enums, tables, and lookup indexes idempotently', async () => {
    const unsafe = vi.fn().mockResolvedValue(undefined)
    await bootstrapServiceSchema({ unsafe } as any)

    expect(unsafe).toHaveBeenCalledTimes(1)
    const sql = unsafe.mock.calls[0][0] as string
    expect(sql).toContain('CREATE TYPE support_ticket_status')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS support_tickets')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS support_conversations')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS support_tickets_github_issue_idx')
  })
})
