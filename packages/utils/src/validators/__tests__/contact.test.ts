import { describe, expect, it } from 'vitest'
import { isValidCEP, isValidEmail, isValidPhone } from '../contact'

describe('isValidEmail', () => {
  it('valida email simples', () => {
    expect(isValidEmail('user@example.com')).toBe(true)
  })
  it('valida email com subdomínio', () => {
    expect(isValidEmail('user@mail.example.com.br')).toBe(true)
  })
  it('rejeita sem @', () => {
    expect(isValidEmail('userexample.com')).toBe(false)
  })
  it('rejeita sem domínio', () => {
    expect(isValidEmail('user@')).toBe(false)
  })
  it('rejeita string vazia', () => {
    expect(isValidEmail('')).toBe(false)
  })
})

describe('isValidPhone', () => {
  it('valida celular com 11 dígitos', () => {
    expect(isValidPhone('51987654321')).toBe(true)
  })
  it('valida fixo com 10 dígitos', () => {
    expect(isValidPhone('5132345678')).toBe(true)
  })
  it('valida com máscara', () => {
    expect(isValidPhone('(51) 98765-4321')).toBe(true)
  })
  it('rejeita com menos de 10 dígitos', () => {
    expect(isValidPhone('519876543')).toBe(false)
  })
  it('rejeita com mais de 11 dígitos', () => {
    expect(isValidPhone('519876543210')).toBe(false)
  })
})

describe('isValidCEP', () => {
  it('valida CEP com 8 dígitos', () => {
    expect(isValidCEP('90010000')).toBe(true)
  })
  it('valida CEP com máscara', () => {
    expect(isValidCEP('90010-000')).toBe(true)
  })
  it('rejeita com 7 dígitos', () => {
    expect(isValidCEP('9001000')).toBe(false)
  })
})
