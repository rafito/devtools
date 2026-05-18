import { describe, expect, it } from 'vitest'
import { isValidCPF } from '../cpf'

describe('isValidCPF', () => {
  it('valida CPF correto sem máscara', () => {
    expect(isValidCPF('11144477735')).toBe(true)
  })
  it('valida CPF correto com máscara', () => {
    expect(isValidCPF('111.444.777-35')).toBe(true)
  })
  it('rejeita CPF com dígito verificador errado', () => {
    expect(isValidCPF('11144477736')).toBe(false)
  })
  it('rejeita CPF com todos os dígitos iguais', () => {
    expect(isValidCPF('11111111111')).toBe(false)
  })
  it('rejeita string vazia', () => {
    expect(isValidCPF('')).toBe(false)
  })
  it('rejeita CPF com tamanho incorreto', () => {
    expect(isValidCPF('1234567890')).toBe(false)
  })
})
