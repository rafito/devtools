import { describe, expect, it } from 'vitest'
import { formatCurrency } from '../currency'

describe('formatCurrency', () => {
  it('formata em BRL por padrão', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
  })

  it('formata em USD', () => {
    expect(formatCurrency(1234.56, 'USD')).toContain('1,234.56')
  })

  it('formata zero', () => {
    expect(formatCurrency(0)).toBe('R$ 0,00')
  })

  it('formata valor negativo', () => {
    expect(formatCurrency(-500)).toContain('500')
  })

  it('esconde centavos com fraction digits 0', () => {
    expect(formatCurrency(189, 'BRL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })).toBe(
      'R$ 189'
    )
  })

  it('respeita casas decimais customizadas', () => {
    expect(
      formatCurrency(5340, 'BRL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    ).toBe('R$ 5.340')
  })

  it('default permanece em 2 casas', () => {
    expect(formatCurrency(189)).toBe('R$ 189,00')
  })
})
