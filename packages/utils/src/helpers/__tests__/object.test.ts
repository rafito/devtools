import { describe, expect, it } from 'vitest'
import { deepMerge, omit, pick } from '../object'

describe('pick', () => {
  it('retorna apenas as chaves selecionadas', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })
  it('não inclui chaves ausentes', () => {
    const result = pick({ a: 1 }, ['a', 'b' as keyof { a: number }])
    expect(result).toEqual({ a: 1 })
  })
})

describe('omit', () => {
  it('remove as chaves listadas', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 })
  })
  it('retorna clone se nenhuma chave for removida', () => {
    const obj = { a: 1 }
    const result = omit(obj, [])
    expect(result).toEqual({ a: 1 })
    expect(result).not.toBe(obj)
  })
})

describe('deepMerge', () => {
  it('faz merge de objetos simples', () => {
    expect(deepMerge({ a: 1, b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 })
  })
  it('faz merge recursivo de objetos aninhados', () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 99 } })).toEqual({
      a: { x: 1, y: 99 },
    })
  })
  it('sobrescreve com array (não faz merge de arrays)', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })
})
