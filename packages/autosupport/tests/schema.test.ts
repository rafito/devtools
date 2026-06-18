import { describe, expect, it } from 'vitest'
import { createSupportSchema } from '../src/schema/index'

describe('createSupportSchema', () => {
  it('expõe tables e enums com nomes esperados', () => {
    const schema = createSupportSchema()
    expect(schema.supportTickets).toBeDefined()
    expect(schema.supportConversations).toBeDefined()
    expect(schema.supportTicketStatusEnum).toBeDefined()
    expect(schema.supportTicketSourceEnum).toBeDefined()
  })

  it('aceita prefixo customizado de tabela', () => {
    const schema = createSupportSchema({ tablePrefix: 'sup_' })
    expect(schema.supportTickets).toBeDefined()
  })
})
