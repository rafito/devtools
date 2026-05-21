import { describe, it, expectTypeOf } from 'vitest'
import type {
  TicketStatus, TicketSource, SupportTicketRow, ToolDefinition,
  UserContext, AgentResult,
} from '../src/types'

describe('types', () => {
  it('TicketStatus enum values', () => {
    expectTypeOf<TicketStatus>().toEqualTypeOf<
      'open' | 'investigating' | 'fixing' | 'pr_review' | 'resolved'
    >()
  })
  it('TicketSource enum values', () => {
    expectTypeOf<TicketSource>().toEqualTypeOf<'chat' | 'sentry'>()
  })
})
