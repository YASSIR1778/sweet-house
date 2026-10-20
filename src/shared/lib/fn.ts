import type { SupabaseClient } from '@supabase/supabase-js'

/** Invoke an Edge Function and surface its `{error}` body as a thrown Error. */
export async function callFn<T = Record<string, unknown>>(sb: SupabaseClient, name: string, body: unknown): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body })
  if (error) {
    let msg = error.message
    try {
      const ctx = (error as { context?: Response }).context
      if (ctx) {
        const j = await ctx.json()
        msg = j.error ?? msg
      }
    } catch {
      /* keep original */
    }
    throw new Error(msg)
  }
  if (data && typeof data === 'object' && 'error' in data && data.error) throw new Error(String(data.error))
  return data as T
}

/** Throw on Supabase `{error}` results, return data otherwise. */
export function must<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}
