// Weekly retention run (pg_cron → pg_net): deletes customers' personal
// documents of requests finished more than N months ago, as configured in
// settings.retention. Safe to call: it only removes what the rule allows.
import { adminClient, cors, fail, json } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = adminClient()
    const { data, error } = await admin.rpc('retention_due', { p_days_ahead: 0 })
    if (error) return fail(error.message, 500)
    const rows = (data ?? []) as { id: string; path: string }[]
    let done = 0
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100)
      const rm = await admin.storage.from('customer-docs').remove(chunk.map((r) => r.path))
      if (rm.error) return fail(rm.error.message, 500)
      const { data: n } = await admin.rpc('retention_mark_deleted', { p_ids: chunk.map((r) => r.id) })
      done += (n as number) ?? 0
    }
    return json({ ok: true, deleted: done })
  } catch (e) {
    return fail(String(e), 500)
  }
})
