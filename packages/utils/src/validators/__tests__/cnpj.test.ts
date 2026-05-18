import { describe, expect, it } from 'vitest'
import { isValidCNPJ } from '../cnpj'

describe('isValidCNPJ', () => {
  it('valida CNPJ correto sem máscara', () => {
    expect(isValidCNPJ('11222333000181')).toBe(true)
  })
  it('valida CNPJ correto com máscara', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true)
  })
  it('rejeita CNPJ com dígito verificador errado', () => {
    expect(isValidCNPJ('11222333000182')).toBe(false)
  })
  it('rejeita CNPJ com todos os dígitos iguais', () => {
    expect(isValidCNPJ('00000000000000')).toBe(false)
  })
  it('rejeita tamanho incorreto', () => {
    expect(isValidCNPJ('1122233300018')).toBe(false)
  })
})
