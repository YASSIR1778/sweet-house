import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { Me } from './types'

type AuthCtx = {
  sb: SupabaseClient
  session: Session | null
  me: Me | null
  loading: boolean
  can: (perm: string) => boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ sb, children }: { sb: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMe = useCallback(
    async (s: Session | null) => {
      if (!s) {
        setMe(null)
        return
      }
      setLoading(true)
      const cacheKey = `sh-me-${s.user.id}`
      const { data, error } = await sb.rpc('me')
      if (error && !navigator.onLine) {
        // Offline: keep working with the last known profile of this user.
        try {
          setMe(JSON.parse(localStorage.getItem(cacheKey) ?? 'null'))
        } catch {
          setMe(null)
        }
      } else {
        setMe((data as Me | null) ?? null)
        try {
          if (data) localStorage.setItem(cacheKey, JSON.stringify(data))
        } catch {
          /* storage unavailable */
        }
      }
      setLoading(false)
    },
    [sb],
  )

  useEffect(() => {
    let alive = true
    sb.auth.getSession().then(async ({ data }) => {
      if (!alive) return
      setSession(data.session)
      await loadMe(data.session)
      if (alive) setLoading(false)
    })
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        if (s) setLoading(true)
        // Defer: calling Supabase inside the callback can deadlock the auth lock.
        setTimeout(() => loadMe(s), 0)
      }
    })
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [sb, loadMe])

  const value: AuthCtx = {
    sb,
    session,
    me,
    loading,
    can: (perm) => !!me && (me.is_owner || me.permissions.includes(perm)),
    refresh: () => loadMe(session),
    signOut: async () => {
      await sb.auth.signOut()
      setMe(null)
    },
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth outside AuthProvider')
  return c
}
