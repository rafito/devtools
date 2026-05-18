import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBreakpoint } from '../useBreakpoint'

describe('useBreakpoint', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1024 })
  })

  it('retorna "lg" para 1024px', () => {
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('lg')
  })

  it('retorna "xs" para 320px', () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 320 })
    const { result } = renderHook(() => useBreakpoint())
    expect(result.current).toBe('xs')
  })

  it('atualiza ao redimensionar a janela', () => {
    const { result } = renderHook(() => useBreakpoint())
    act(() => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 768 })
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current).toBe('md')
  })
})
