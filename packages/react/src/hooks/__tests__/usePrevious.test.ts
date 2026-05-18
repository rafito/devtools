import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePrevious } from '../usePrevious'

describe('usePrevious', () => {
  it('retorna undefined no primeiro render', () => {
    const { result } = renderHook(() => usePrevious('initial'))
    expect(result.current).toBeUndefined()
  })

  it('retorna o valor anterior após re-render', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => usePrevious(value),
      { initialProps: { value: 'first' } },
    )
    rerender({ value: 'second' })
    expect(result.current).toBe('first')
  })

  it('rastreia múltiplas atualizações', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: number }) => usePrevious(value),
      { initialProps: { value: 1 } },
    )
    rerender({ value: 2 })
    expect(result.current).toBe(1)
    rerender({ value: 3 })
    expect(result.current).toBe(2)
  })
})
