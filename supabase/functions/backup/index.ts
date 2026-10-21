// Nightly backup: every public table (except secrets) → gzip JSON in the
// private "backups" bucket. Keeps the last 14 files. Called by pg_cron with
// x-agent-key, or by the owner ("back up now"). A failure notifies the owner.
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

const KEEP = 14

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = adminClient()
  const given = req.headers.get('x-agent-key')
  if (given) {
    const { data } = await admin.from('agent_secret').select('secret').eq('id', 1).single()
    if (!data || data.secret !== given) return fail('forbidden', 403)
  } else {
    const { data: owner } = await callerClient(req).rpc('is_owner')
    if (owner !== true) return fail('forbidden', 403)
  }

  const { data: run } = await admin.from('backup_runs').insert({}).select('id').single()
  try {
    const { data, error } = await admin.rpc('system_backup')
    if (error) throw new Error(error.message)
    const raw = new TextEncoder().encode(JSON.stringify(data))
    const gz = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Africa/Casablanca' }).replace(' ', '_').replace(/:/g, '-').slice(0, 16)
    const path = `sweet-house-${stamp}.json.gz`
    const up = await admin.storage.from('backups').upload(path, gz, { contentType: 'application/gzip', upsert: true })
    if (up.error) throw new Error(up.error.message)

    // keep the newest KEEP files
    const { data: files } = await admin.storage.from('backups').list('', { limit: 200, sortBy: { column: 'name', order: 'desc' } })
    const old = (files ?? []).filter((f) => f.name.endsWith('.json.gz')).slice(KEEP).map((f) => f.name)
    if (old.length) await admin.storage.from('backups').remove(old)

    const tables = Object.keys(data as Record<string, unknown>).length - 2
    await admin.from('backup_runs').update({ ok: true, path, bytes: gz.byteLength, tables }).eq('id', run?.id)
    await admin.rpc('log_activity', { p_action: 'custom', p_entity: 'backup', p_entity_id: null, p_label: 'auto_backup', p_changes: { path, bytes: gz.byteLength } }).then(() => {}, () => {})
    return json({ ok: true, path, bytes: gz.byteLength, tables })
  } catch (e) {
    const msg = String((e as Error).message ?? e).slice(0, 500)
    await admin.from('backup_runs').update({ ok: false, error: msg }).eq('id', run?.id)
    await admin.rpc('notify', { p_type: 'backup_failed', p_severity: 'danger', p_ar: '⚠️ فشلت النسخة الاحتياطية التلقائية', p_fr: 'Échec de la sauvegarde', p_body: msg, p_link: '/settings?s=data' })
    return fail(msg, 500)
  }
})
