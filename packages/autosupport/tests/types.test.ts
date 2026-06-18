import { describe, expectTypeOf, it } from 'vitest'
import type {
  AgentResult,
  SupportTicketRow,
  TicketSource,
  TicketStatus,
  ToolDefinition,
  UserContext,
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
