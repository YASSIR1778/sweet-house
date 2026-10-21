// Automatic WhatsApp messages through the WhatsApp Cloud API (Meta).
// Ready but inactive until the owner sets the secrets:
//   supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_ID=...
// and switches "mode" to "auto" in the website editor.
// Free-form text only reaches customers who wrote to you in the last 24h;
// otherwise an approved template (settings.whatsapp.template_name) is used.
import { callerClient, cors, fail, json } from '../_shared/common.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const caller = callerClient(req)
    const perms = await Promise.all(['requests.manage', 'orders.manage', 'debts.remind', 'broadcast.manage'].map((p) => caller.rpc('has_perm', { p })))
    if (!perms.some((r) => r.data === true)) return fail('forbidden', 403)

    const token = Deno.env.get('WHATSAPP_TOKEN')
    const phoneId = Deno.env.get('WHATSAPP_PHONE_ID')
    if (!token || !phoneId) return fail('whatsapp_not_configured', 412)

    const { to, text } = await req.json()
    const digits = String(to ?? '').replace(/\D/g, '')
    if (digits.length < 9 || !text) return fail('missing_fields')
    const phone = digits.length === 9 ? `212${digits}` : digits.startsWith('0') ? `212${digits.slice(1)}` : digits

    const { data: cfg } = await caller.from('settings').select('value').eq('key', 'whatsapp').single()
    const tpl = (cfg?.value as { template_name?: string; template_lang?: string } | null) ?? {}

    const body = tpl.template_name
      ? {
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: { name: tpl.template_name, language: { code: tpl.template_lang || 'ar' }, components: [{ type: 'body', parameters: [{ type: 'text', text: String(text).slice(0, 1000) }] }] },
        }
      : { messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: String(text).slice(0, 4000), preview_url: true } }

    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const out = await res.json()
    if (!res.ok) return fail(out?.error?.message ?? 'whatsapp_error', 502)
    return json({ ok: true, id: out?.messages?.[0]?.id })
  } catch (e) {
    return fail(String(e), 500)
  }
})
