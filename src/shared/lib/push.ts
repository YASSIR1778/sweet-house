import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

// Public half of the VAPID key pair (the private half is a Supabase secret).
const VAPID_PUBLIC_KEY = 'BNhjxjEBQs57J9OL5q4uMk34lpTCRz-bip_q6Y5mvxMc_npzGyTvihp7yNtkGjPpJ7LrVlT3XWodSp5jKIKIdGg'

const toBytes = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export type PushState = 'unsupported' | 'denied' | 'off' | 'on' | 'loading'

/** 37 · Browser notifications for this device (works with the app closed on Android / desktop). */
export function usePush(sb: SupabaseClient, app: 'admin' | 'pos') {
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  const [state, setState] = useState<PushState>(supported ? 'loading' : 'unsupported')

  const refresh = useCallback(async () => {
    if (!supported) return setState('unsupported')
    if (Notification.permission === 'denied') return setState('denied')
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    const sub = await reg?.pushManager.getSubscription()
    setState(sub ? 'on' : 'off')
  }, [supported])

  useEffect(() => {
    refresh()
  }, [refresh])

  const enable = async () => {
    if (!supported) return false
    setState('loading')
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') return (setState(perm === 'denied' ? 'denied' : 'off'), false)
      const reg = (await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)) ?? (await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL }))
      await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC_KEY) }))
      const { error } = await sb.rpc('push_subscribe', { p: { ...sub.toJSON(), app, user_agent: navigator.userAgent } })
      if (error) throw error
      setState('on')
      return true
    } catch (e) {
      await refresh()
      throw e
    }
  }

  const disable = async () => {
    const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    setState('off')
  }

  return { state, enable, disable }
}
