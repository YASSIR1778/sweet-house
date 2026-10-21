// Public helper on the website's service pages ("مرشد سويت هاوس"): answers
// visitors from the public service info (price, duration, documents, FAQ).
// Cheap model, daily cap, per-visitor limit. When unsure it says so and the
// page offers the existing "we call you back" help request.
// Secret: ANTHROPIC_API_KEY.
import Anthropic from 'npm:@anthropic-ai/sdk'
import { adminClient, cors, fail, json } from '../_shared/common.ts'

type Helpers = { site_enabled?: boolean; site_daily_limit?: number; site_name?: string; model_fast?: string }
type Turn = { role: 'user' | 'assistant'; text: string }

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['answer', 'escalate'],
  properties: { answer: { type: 'string' }, escalate: { type: 'boolean', description: 'true إن لم تعرف الجواب أو احتاج الزبون موظفاً' } },
}

async function sha(s: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json().catch(() => ({}))
    const question = String(body?.question ?? '').trim().slice(0, 600)
    const history = (Array.isArray(body?.history) ? body.history : []).slice(-6) as Turn[]
    const serviceId = body?.service_id ? String(body.service_id) : null
    if (question.length < 2) return fail('invalid_messages')

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return fail('ai_not_configured', 412)
    const admin = adminClient()
    const cfg = ((await admin.from('settings').select('value').eq('key', 'helpers').single()).data?.value ?? {}) as Helpers
    if (cfg.site_enabled === false) return fail('ai_disabled', 412)

    const ip = await sha((req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() + 'sweet')
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
    const hourAgo = new Date(Date.now() - 3600_000).toISOString()
    const [{ count: today }, { count: mine }] = await Promise.all([
      admin.from('helper_usage').select('id', { count: 'exact', head: true }).eq('channel', 'site').gte('created_at', dayStart),
      admin.from('helper_usage').select('id', { count: 'exact', head: true }).eq('channel', 'site').eq('ip_hash', ip).gte('created_at', hourAgo),
    ])
    if ((today ?? 0) >= (cfg.site_daily_limit ?? 150)) return fail('helper_busy', 429)
    if ((mine ?? 0) >= 15) return fail('too_many_requests', 429)

    const [{ data: store }, { data: svc }, { data: list }] = await Promise.all([
      admin.from('settings').select('value').eq('key', 'store').single(),
      serviceId
        ? admin.from('services').select('name_ar, name_fr, description_ar, price, pricing_mode, duration_ar, required_documents, faq, abroad, is_online').eq('id', serviceId).eq('is_online', true).eq('is_active', true).is('deleted_at', null).maybeSingle()
        : Promise.resolve({ data: null }),
      admin.from('services').select('name_ar, price, duration_ar').eq('kind', 'admin').eq('is_online', true).eq('is_active', true).is('deleted_at', null).order('sort').limit(60),
    ])
    const st = (store?.value ?? {}) as Record<string, unknown>
    const name = cfg.site_name || 'مرشد سويت هاوس'

    const system = `أنت «${name}» 🧭، مساعد زوار موقع مكتبة سويت هاوس في تطوان (خدمات إدارية وإلكترونية مغربية + مكتبة).
- أجب بلغة الزائر (دارجة، عربية أو فرنسية)، بلطف وباختصار (3 إلى 5 أسطر).
- اعتمد فقط على المعلومات أسفله. لا تخترع سعراً أو وثيقة أو مدة أو خطوة غير مكتوبة.
- إن لم تجد الجواب، أو كان السؤال عن حالة طلب معيّن أو معطيات شخصية، قل ذلك بلطف وضع escalate=true (ستظهر للزائر وسيلة ليتصل به موظف).
- لا تطلب من الزائر أي معطيات شخصية (رقم البطاقة، صور…) في المحادثة؛ ذلك يكون في استمارة الطلب فقط.
- لا تجب عن مواضيع لا علاقة لها بالمكتبة وخدماتها.
- المبالغ بالسنتيم: اقسم على 100 واكتبها بالدرهم. السعر 0 يعني «يُحدَّد حسب الحالة».

المحل: ${JSON.stringify({ phone: st.phone, whatsapp: st.whatsapp, address: st.address_ar, hours: st.hours })}
${svc ? `الخدمة التي يتصفحها الزائر:\n${JSON.stringify(svc)}` : ''}
قائمة الخدمات المتاحة أونلاين:\n${JSON.stringify(list ?? [])}`

    const client = new Anthropic({ apiKey: key })
    const res = await client.messages.create({
      model: cfg.model_fast || 'claude-haiku-5-5',
      max_tokens: 1500,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [
        ...history.filter((t) => t?.text).map((t) => ({ role: t.role === 'assistant' ? 'assistant' as const : 'user' as const, content: String(t.text).slice(0, 1500) })),
        { role: 'user', content: question },
      ],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    } as Anthropic.MessageCreateParamsNonStreaming)
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    const out = res.stop_reason === 'refusal' ? { answer: 'عذراً، لا أستطيع الإجابة عن هذا. يمكنك طلب مساعدة موظف.', escalate: true } : JSON.parse(text)
    await admin.from('helper_usage').insert({
      channel: 'site', ip_hash: ip, service_id: serviceId, question: question.slice(0, 300), escalated: !!out.escalate,
      input_tokens: (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0), output_tokens: res.usage.output_tokens ?? 0,
    })
    return json(out)
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    return fail(msg.includes('credit balance') ? 'ai_no_credit' : 'helper_error', 500)
  }
})
