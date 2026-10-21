// Sends a new dashboard notification as a Web Push to the staff concerned,
// and the daily report by WhatsApp to the owner when the Cloud API is set.
// Called by a database trigger (pg_net) with {id}. Safe to expose: each
// notification is "claimed" once in the database, so repeating a call sends nothing.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (+ optional WHATSAPP_TOKEN, WHATSAPP_PHONE_ID).
import webpush from 'npm:web-push@3.6.7'
import { adminClient, cors, fail, json } from '../_shared/common.ts'

type Claim = {
  notification: { id: string; type: string; severity: string; title_ar: string; body: string | null; link: string | null }
  report_phone: string | null
  subs: { id: string; endpoint: string; p256dh: string; auth: string; app: 'admin' | 'pos' }[]
} | null

const BASE = 'https://yassir1778.github.io/sweet-house'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { id } = await req.json()
    if (!id) return fail('missing_fields')
    const admin = adminClient()
    const { data, error } = await admin.rpc('push_claim', { p_id: id })
    if (error) return fail(error.message, 500)
    const c = data as Claim
    if (!c) return json({ ok: true, skipped: true })
    const n = c.notification

    let sent = 0
    const pub = Deno.env.get('VAPID_PUBLIC_KEY')
    const priv = Deno.env.get('VAPID_PRIVATE_KEY')
    if (pub && priv && c.subs.length) {
      webpush.setVapidDetails(`${BASE}/`, pub, priv)
      const body = n.type === 'daily_report' ? (n.body ?? '').split('\n').filter(Boolean).slice(1, 6).join('\n') : (n.body ?? '')
      await Promise.all(
        c.subs.map(async (s) => {
          const url = s.app === 'pos' ? `${BASE}/pos/` : `${BASE}/admin/#${n.link ?? '/dashboard'}`
          const payload = JSON.stringify({ title: n.title_ar, body: body.slice(0, 300), url, tag: n.type === 'daily_report' ? 'daily-report' : n.id })
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 * 12, urgency: n.severity === 'danger' ? 'high' : 'normal' })
            sent++
            await admin.from('push_subscriptions').update({ last_ok_at: new Date().toISOString() }).eq('id', s.id)
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode
            if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('id', s.id)
          }
        }),
      )
    }

    // Daily report → owner's WhatsApp when the Cloud API is configured
    let whatsapp = false
    const token = Deno.env.get('WHATSAPP_TOKEN')
    const phoneId = Deno.env.get('WHATSAPP_PHONE_ID')
    if (n.type === 'daily_report' && c.report_phone && token && phoneId) {
      const digits = c.report_phone.replace(/\D/g, '')
      const to = digits.length === 9 ? `212${digits}` : digits.startsWith('0') ? `212${digits.slice(1)}` : digits
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: (n.body ?? '').slice(0, 4000) } }),
      })
      whatsapp = res.ok
    }
    return json({ ok: true, sent, whatsapp })
  } catch (e) {
    return fail(String(e), 500)
  }
})
