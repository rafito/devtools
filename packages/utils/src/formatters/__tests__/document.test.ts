import { describe, expect, it } from 'vitest'
import { formatCEP, formatCNPJ, formatCPF, formatPhone } from '../document'

describe('formatCPF', () => {
  it('formata CPF completo', () => {
    expect(formatCPF('12345678901')).toBe('123.456.789-01')
  })
  it('formata CPF já formatado (idempotente)', () => {
    expect(formatCPF('123.456.789-01')).toBe('123.456.789-01')
  })
  it('trunca na 11ª dígito', () => {
    expect(formatCPF('123456789012')).toBe('123.456.789-01')
  })
})

describe('formatCNPJ', () => {
  it('formata CNPJ completo', () => {
    expect(formatCNPJ('11222333000181')).toBe('11.222.333/0001-81')
  })
  it('formata CNPJ já formatado', () => {
    expect(formatCNPJ('11.222.333/0001-81')).toBe('11.222.333/0001-81')
  })
})

describe('formatPhone', () => {
  it('formata celular com 11 dígitos', () => {
    expect(formatPhone('51987654321')).toBe('(51) 98765-4321')
  })
  it('formata fixo com 10 dígitos', () => {
    expect(formatPhone('5132345678')).toBe('(51) 3234-5678')
  })
  it('formata celular com código de país +55 (13 dígitos)', () => {
    expect(formatPhone('5511987654321')).toBe('+55 (11) 98765-4321')
  })
  it('formata fixo com código de país +55 (12 dígitos)', () => {
    expect(formatPhone('551133334444')).toBe('+55 (11) 3333-4444')
  })
  it('aceita entrada já com símbolos', () => {
    expect(formatPhone('+55 (11) 98765-4321')).toBe('+55 (11) 98765-4321')
  })
  it('DDD 55 local (11 dígitos) não é confundido com código de país', () => {
    expect(formatPhone('55999887766')).toBe('(55) 99988-7766')
  })
})

describe('formatCEP', () => {
  it('formata CEP com 8 dígitos', () => {
    expect(formatCEP('90010000')).toBe('90010-000')
  })
  it('formata CEP já formatado', () => {
    expect(formatCEP('90010-000')).toBe('90010-000')
  })
})
