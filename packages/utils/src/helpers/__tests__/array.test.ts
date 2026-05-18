import { describe, expect, it } from 'vitest'
import { chunk, groupBy } from '../array'

describe('groupBy', () => {
  it('agrupa por chave derivada', () => {
    const input = [
      { name: 'Alice', role: 'admin' },
      { name: 'Bob', role: 'user' },
      { name: 'Carol', role: 'admin' },
    ]
    expect(groupBy(input, (i) => i.role)).toEqual({
      admin: [
        { name: 'Alice', role: 'admin' },
        { name: 'Carol', role: 'admin' },
      ],
      user: [{ name: 'Bob', role: 'user' }],
    })
  })

  it('retorna objeto vazio para array vazio', () => {
    expect(groupBy([], (i: string) => i)).toEqual({})
  })
})

describe('chunk', () => {
  it('divide array em pedaços de tamanho fixo', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('retorna array com um grupo se size >= length', () => {
    expect(chunk([1, 2, 3], 5)).toEqual([[1, 2, 3]])
  })

  it('retorna array vazio para input vazio', () => {
    expect(chunk([], 2)).toEqual([])
  })
})
