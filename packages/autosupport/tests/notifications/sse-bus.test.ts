import { describe, it, expect, vi } from 'vitest'
import { createSseBus } from '../../src/notifications/sse-bus'
import type { NotificationEvent } from '../../src/types'

const event: NotificationEvent = { type: 'ticket_resolved', ticketId: 'x', message: 'm' }

describe('createSseBus', () => {
  it('listener recebe eventos do próprio user', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    bus.subscribeUser('u1', cb)
    bus.notifyUser('u1', event)
    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith(event)
  })

  it('listener não recebe eventos de outro user', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    bus.subscribeUser('u1', cb)
    bus.notifyUser('u2', event)
    expect(cb).not.toHaveBeenCalled()
  })

  it('unsubscribe remove listener', () => {
    const bus = createSseBus()
    const cb = vi.fn()
    const off = bus.subscribeUser('u1', cb)
    off()
    bus.notifyUser('u1', event)
    expect(cb).not.toHaveBeenCalled()
    expect(bus.hasActiveListener('u1')).toBe(false)
  })

  it('múltiplos listeners no mesmo user todos recebem', () => {
    const bus = createSseBus()
    const a = vi.fn(), b = vi.fn()
    bus.subscribeUser('u1', a)
    bus.subscribeUser('u1', b)
    bus.notifyUser('u1', event)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('hasActiveListener retorna true só quando há listener vivo', () => {
    const bus = createSseBus()
    expect(bus.hasActiveListener('u1')).toBe(false)
    const off = bus.subscribeUser('u1', vi.fn())
    expect(bus.hasActiveListener('u1')).toBe(true)
    off()
    expect(bus.hasActiveListener('u1')).toBe(false)
  })

  it('listener que lança erro não derruba notifyUser', () => {
    const bus = createSseBus()
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    bus.subscribeUser('u1', () => { throw new Error('boom') })
    const ok = vi.fn()
    bus.subscribeUser('u1', ok)
    bus.notifyUser('u1', event)
    expect(ok).toHaveBeenCalledOnce()
    consoleErrSpy.mockRestore()
  })

  it('buses independentes não compartilham estado', () => {
    const a = createSseBus()
    const b = createSseBus()
    const cbA = vi.fn(), cbB = vi.fn()
    a.subscribeUser('u1', cbA)
    b.subscribeUser('u1', cbB)
    a.notifyUser('u1', event)
    expect(cbA).toHaveBeenCalledOnce()
    expect(cbB).not.toHaveBeenCalled()
  })
})
