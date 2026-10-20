import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Sale } from '@/shared/lib/types'
import { storage } from '@/shared/lib/utils'

export type Queued = { id: string; payload: Record<string, unknown>; local: Sale; created_at: string; error?: string }

const queueStore = storage<Queued[]>('sh-pos-queue', [])

export function isNetworkError(e: unknown) {
  const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)
  return !navigator.onLine || /Failed to fetch|NetworkError|Load failed|network|fetch failed|ERR_INTERNET/i.test(m)
}

export function enqueue(q: Queued) {
  queueStore.set([...queueStore.get(), q])
  window.dispatchEvent(new Event('sh-queue'))
}

/** Pending offline sales + automatic sync when the connection comes back. */
export function useOfflineQueue(sb: SupabaseClient, onSynced?: () => void) {
  const [items, setItems] = useState<Queued[]>(queueStore.get)
  const [syncing, setSyncing] = useState(false)

  const sync = useCallback(async () => {
    if (!navigator.onLine) return
    const list = queueStore.get()
    if (!list.length) return
    setSyncing(true)
    let changed = false
    for (const q of list) {
      const { error } = await sb.rpc('create_sale', { p: q.payload })
      if (error && isNetworkError(error)) break
      const rest = queueStore.get().filter((x) => x.id !== q.id)
      queueStore.set(error ? [...rest, { ...q, error: error.message }] : rest)
      changed = true
    }
    setItems(queueStore.get())
    setSyncing(false)
    if (changed) onSynced?.()
  }, [sb, onSynced])

  useEffect(() => {
    const refresh = () => setItems(queueStore.get())
    window.addEventListener('sh-queue', refresh)
    window.addEventListener('online', sync)
    const i = setInterval(sync, 20_000)
    sync()
    return () => (window.removeEventListener('sh-queue', refresh), window.removeEventListener('online', sync), clearInterval(i))
  }, [sync])

  const discard = (id: string) => {
    queueStore.set(queueStore.get().filter((x) => x.id !== id))
    setItems(queueStore.get())
  }

  return { items, pending: items.filter((x) => !x.error).length, failed: items.filter((x) => x.error), syncing, sync, discard }
}
