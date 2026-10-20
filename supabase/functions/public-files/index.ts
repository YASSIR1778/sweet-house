// Public file access for customers, authorised by tracking code + phone.
//   upload   → returns a signed upload URL for a new document / payment proof
//   register → records the uploaded file (and flags payment proofs)
//   download → returns a short-lived signed URL for a ready deliverable
import { adminClient, cors, fail, json } from '../_shared/common.ts'

const BUCKET = 'customer-docs'
const MAX_FILES = 15
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']

type Resolved = { kind: 'request' | 'order'; id: string; files: number; can_download: boolean } | null

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const { action, code, phone } = body ?? {}
    if (!action || !code || !phone) return fail('missing_fields')

    const admin = adminClient()
    const { data: target, error: rErr } = await admin.rpc('resolve_tracking', { p_code: String(code), p_phone: String(phone) })
    if (rErr) return fail(rErr.message, 500)
    const t = target as Resolved
    if (!t) return fail('not_found', 404)
    const folder = `${t.kind}s/${t.id}/`

    if (action === 'upload') {
      const { name, size, mime, kind } = body
      if (!['upload', 'payment_proof'].includes(kind)) return fail('invalid_kind')
      if (t.files >= MAX_FILES) return fail('too_many_files')
      if (!ALLOWED.includes(mime) || Number(size) > MAX_SIZE) return fail('file_not_allowed')
      const ext = String(name).split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
      const path = `${folder}${kind}-${crypto.randomUUID()}.${ext}`
      const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path)
      if (error) return fail(error.message, 500)
      return json({ path, token: data.token })
    }

    if (action === 'register') {
      const { path, name, size, mime, kind } = body
      if (!String(path).startsWith(folder)) return fail('forbidden', 403)
      if (!['upload', 'payment_proof'].includes(kind)) return fail('invalid_kind')
      const { data: listed } = await admin.storage.from(BUCKET).list(folder, { search: String(path).slice(folder.length) })
      if (!listed?.length) return fail('upload_missing')
      const row = { kind, path, name: String(name).slice(0, 200), size: Number(size) || null, mime, [t.kind === 'request' ? 'request_id' : 'order_id']: t.id }
      const { error } = await admin.from('request_files').insert(row)
      if (error) return fail(error.message, 500)

      const table = t.kind === 'request' ? 'service_requests' : 'online_orders'
      const { data: rec } = await admin.from(table).select('number, payment_status').eq('id', t.id).single()
      if (kind === 'payment_proof' && rec?.payment_status === 'unpaid') {
        await admin.from(table).update({ payment_status: 'proof_uploaded' }).eq('id', t.id)
      }
      await admin.from('notifications').insert({
        type: kind === 'payment_proof' ? 'payment_proof' : 'new_document',
        severity: kind === 'payment_proof' ? 'warning' : 'info',
        title_ar: kind === 'payment_proof' ? 'وصل تحويل جديد للتأكيد' : 'وثيقة جديدة من زبون',
        title_fr: kind === 'payment_proof' ? 'Nouveau justificatif de virement' : 'Nouveau document client',
        body: rec?.number ?? null,
        link: t.kind === 'request' ? '/requests' : '/orders',
      })
      return json({ ok: true })
    }

    if (action === 'download') {
      if (t.kind !== 'request' || !t.can_download) return fail('not_ready', 403)
      const { data: file } = await admin.from('request_files').select('id, path, name').eq('id', body.file_id).eq('request_id', t.id).eq('kind', 'deliverable').is('deleted_at', null).single()
      if (!file) return fail('not_found', 404)
      const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(file.path, 120, { download: file.name })
      if (error) return fail(error.message, 500)
      await admin.rpc('record_download', { p_file: body.file_id })
      return json({ url: data.signedUrl })
    }

    return fail('invalid_action')
  } catch (e) {
    return fail(String(e), 500)
  }
})
