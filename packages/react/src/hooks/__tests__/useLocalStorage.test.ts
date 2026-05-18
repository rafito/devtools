import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  afterEach(() => localStorage.clear())

  it('retorna o valor inicial quando não há nada no storage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('persiste o valor no localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    act(() => {
      result.current[1]('novo valor')
    })
    expect(result.current[0]).toBe('novo valor')
    expect(localStorage.getItem('key')).toBe('"novo valor"')
  })

  it('recupera o valor existente do localStorage', () => {
    localStorage.setItem('key', JSON.stringify('salvo'))
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('salvo')
  })

  it('aceita função updater', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0))
    act(() => {
      result.current[1]((prev) => prev + 1)
    })
    expect(result.current[0]).toBe(1)
  })

  it('funciona com objetos', () => {
    const { result } = renderHook(() => useLocalStorage<{ name: string }>('user', { name: '' }))
    act(() => {
      result.current[1]({ name: 'Alice' })
    })
    expect(result.current[0]).toEqual({ name: 'Alice' })
  })
})
