import { describe, expect, it } from 'vitest'
import { formatDate } from '../date'

describe('formatDate', () => {
  it('formata com o padrão dd/MM/yyyy', () => {
    expect(formatDate(new Date(2024, 0, 5))).toBe('05/01/2024')
  })

  it('formata com formato customizado', () => {
    expect(formatDate(new Date(2024, 11, 25), 'yyyy-MM-dd')).toBe('2024-12-25')
  })

  it('aceita string como input', () => {
    expect(formatDate('2024-06-15T03:00:00.000Z')).toMatch(/15\/06\/2024/)
  })

  it('aceita timestamp como input', () => {
    const ts = new Date(2024, 2, 1).getTime()
    expect(formatDate(ts)).toBe('01/03/2024')
  })

  it('formata com hora', () => {
    expect(formatDate(new Date(2024, 0, 5, 14, 30, 0), 'dd/MM/yyyy HH:mm')).toBe('05/01/2024 14:30')
  })
})
