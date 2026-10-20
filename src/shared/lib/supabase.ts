import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Each app keeps its own session so a cashier on the POS and the owner in
// the dashboard can be signed in on the same browser at the same time.
const clients: Record<string, SupabaseClient> = {}

export function getSupabase(app: 'admin' | 'pos' | 'site') {
  if (!clients[app]) {
    clients[app] = createClient(url ?? 'http://localhost', key ?? 'missing', {
      auth: {
        storageKey: `sh-${app}-auth`,
        persistSession: app !== 'site',
        autoRefreshToken: app !== 'site',
        detectSessionInUrl: false,
      },
    })
  }
  return clients[app]
}

export const STAFF_EMAIL_DOMAIN = 'staff.sweethouse.local'

/** "ahmed" → "ahmed@staff.sweethouse.local"; full e-mails stay unchanged. */
export function loginToEmail(login: string) {
  const l = login.trim().toLowerCase()
  return l.includes('@') ? l : `${l}@${STAFF_EMAIL_DOMAIN}`
}

export function publicUrl(sb: SupabaseClient, path: string | null | undefined) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl
}
