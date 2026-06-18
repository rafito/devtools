import type { NotificationEvent } from '../types.js'

export type SseListener = (event: NotificationEvent) => void

export function createSseBus() {
  const userSubscribers = new Map<string, Set<SseListener>>()

  function subscribeUser(userId: string, listener: SseListener): () => void {
    let set = userSubscribers.get(userId)
    if (!set) {
      set = new Set()
      userSubscribers.set(userId, set)
    }
    set.add(listener)
    return () => {
      const s = userSubscribers.get(userId)
      if (!s) return
      s.delete(listener)
      if (s.size === 0) userSubscribers.delete(userId)
    }
  }

  function notifyUser(userId: string, event: NotificationEvent): void {
    const set = userSubscribers.get(userId)
    if (!set) return
    for (const l of set) {
      try {
        l(event)
      } catch (err) {
        console.error('[autosupport-sse-bus]', err)
      }
    }
  }

  function hasActiveListener(userId: string): boolean {
    const set = userSubscribers.get(userId)
    return !!set && set.size > 0
  }

  return { subscribeUser, notifyUser, hasActiveListener }
}

export type SseBus = ReturnType<typeof createSseBus>
