import { fireEvent, render, screen } from '@testing-library/react'
import React, { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useClickOutside } from '../useClickOutside'

function TestComponent({ onClickOutside }: { onClickOutside: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useClickOutside(ref, onClickOutside)
  return (
    <div>
      <div ref={ref} data-testid="inside">inside</div>
      <div data-testid="outside">outside</div>
    </div>
  )
}

describe('useClickOutside', () => {
  it('não dispara o handler ao clicar dentro', () => {
    const handler = vi.fn()
    render(<TestComponent onClickOutside={handler} />)
    fireEvent.mouseDown(screen.getByTestId('inside'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('dispara o handler ao clicar fora', () => {
    const handler = vi.fn()
    render(<TestComponent onClickOutside={handler} />)
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
