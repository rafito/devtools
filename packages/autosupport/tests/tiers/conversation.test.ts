import { describe, expect, it, vi } from 'vitest'
import { loadConversationTranscript } from '../../src/tiers/conversation'

const schema = {
  supportConversations: { id: 'col-id', messages: 'col-messages' },
} as any

function makeDb(conv: any) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(conv === undefined ? [] : [conv]),
      }),
    }),
  }
}

describe('loadConversationTranscript', () => {
  it('retorna null sem conversationId (não toca no db)', async () => {
    const db = makeDb(undefined)
    expect(await loadConversationTranscript(db, schema, null)).toBeNull()
    expect(await loadConversationTranscript(db, schema, undefined)).toBeNull()
    expect(db.select).not.toHaveBeenCalled()
  })

  it('retorna null se a conversa não existe', async () => {
    const db = makeDb(undefined)
    expect(await loadConversationTranscript(db, schema, 'conv-1')).toBeNull()
  })

  it('retorna null se a conversa não tem mensagens', async () => {
    const db = makeDb({ messages: [] })
    expect(await loadConversationTranscript(db, schema, 'conv-1')).toBeNull()
  })

  it('formata o transcript com rótulos Cliente/Suporte', async () => {
    const db = makeDb({
      messages: [
        { role: 'user', content: 'meu gráfico não carrega', ts: '2026-06-18T10:00:00Z' },
        { role: 'assistant', content: 'pode mandar um print?', ts: '2026-06-18T10:01:00Z' },
        { role: 'user', content: 'mandei, dá erro 500' },
      ],
    })
    const out = await loadConversationTranscript(db, schema, 'conv-1')
    expect(out).toBe(
      '**Cliente:** meu gráfico não carrega\n' +
        '**Suporte:** pode mandar um print?\n' +
        '**Cliente:** mandei, dá erro 500'
    )
  })

  it('role desconhecido cai no próprio nome', async () => {
    const db = makeDb({ messages: [{ role: 'system', content: 'nota interna' }] })
    expect(await loadConversationTranscript(db, schema, 'conv-1')).toBe('**system:** nota interna')
  })
})
