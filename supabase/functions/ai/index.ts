// AI helpers for staff, powered by Claude with the owner's API key.
//   id_card      → read a Moroccan national ID card (CNIE) photo
//   riyad        → read totals from a photo of the Riyad / Chaabi Cash summary
//   write        → draft an administrative letter / request / complaint
//   service_docs → suggest required documents and form fields for a service
// Secret: ANTHROPIC_API_KEY. Inactive (412) until it is set.
// Images are processed in memory only and never stored.
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

type Cfg = { enabled?: boolean; model_fast?: string; model_smart?: string; monthly_limit?: number }

const PERMS: Record<string, string[]> = {
  id_card: ['requests.view_documents', 'pos.sell', 'customers.manage'],
  riyad: ['cash.shift', 'riyad.manage'],
  write: ['pos.sell', 'requests.manage'],
  service_docs: ['services.manage'],
  landing: ['products.manage'],
}

const ID_PROMPT = `هذه صورة بطاقة تعريف وطنية مغربية (CNIE) — الوجه أو الظهر.
استخرج المعلومات الظاهرة فقط، ولا تخمّن أي شيء غير مقروء (اتركه null).
أجب بـ JSON فقط بهذا الشكل:
{"side":"front|back|unknown","cin":"","last_name_fr":"","first_name_fr":"","last_name_ar":"","first_name_ar":"","birth_date":"YYYY-MM-DD","birth_place_fr":"","birth_place_ar":"","expiry_date":"YYYY-MM-DD","sex":"M|F","father_name":"","mother_name":"","address":"","civil_number":"","readable":true}
إن لم تكن الصورة بطاقة تعريف، أجب {"readable":false}.`

const RIYAD_PROMPT = `هذه صورة (أو لقطة شاشة) من منصة الوكيل "رياض" / الشعبي كاش أو كشف عمليات اليوم.
نريد ثلاثة أرقام بالدرهم المغربي:
- total_in: مجموع ما دخل نقداً للوكيل (إيداعات/دفعات الزبائن، Versements / Dépôts / Cash-in)
- total_out: مجموع ما خرج نقداً من الوكيل (سحوبات، Retraits / Paiements / Cash-out)
- balance: الرصيد الحالي في المنصة (Solde)
لا تخمّن: ما لم يكن ظاهراً بوضوح اجعله null، واذكر في notes ما رأيته.
أجب بـ JSON فقط: {"total_in":0,"total_out":0,"balance":0,"operations_count":null,"date":"YYYY-MM-DD أو null","notes":"","readable":true}`

const KINDS: Record<string, string> = {
  request: 'طلب خطي موجّه إلى إدارة',
  complaint: 'شكاية رسمية',
  letter: 'رسالة إدارية',
  honor: 'تصريح بالشرف',
  resignation: 'طلب استقالة',
  leave: 'طلب رخصة / إجازة',
  job: 'طلب عمل (رسالة تحفيزية)',
  other: 'وثيقة إدارية',
}

const SERVICE_PROMPT = (name: string) => `أنت خبير في الإجراءات الإدارية المغربية. الخدمة: "${name}".
اقترح ما يطلبه موظف مكتبة خدمات من الزبون لإنجاز هذه الخدمة عبر البوابات الرسمية المغربية.
أجب بـ JSON فقط:
{"required_documents":[{"name_ar":"","name_fr":"","required":true}],"fields":[{"key":"snake_case","label_ar":"","label_fr":"","type":"text|textarea|number|date|select","required":true,"options":[]}],"duration_ar":"","duration_fr":"","official_url":"" }
اختصر: من 1 إلى 6 وثائق، ومن 1 إلى 8 حقول. لا تضف رابطاً رسمياً إلا إذا كنت متأكداً منه.`

const LANDING_PROMPT = (name: string, desc: string, price: number) => `أنت كاتب إعلانات محترف لمتجر إلكتروني مغربي (الدفع عند الاستلام). اكتب محتوى صفحة هبوط لمنتج واحد.
المنتج: "${name}"
الوصف المتوفر: "${desc || '—'}"
الثمن العادي: ${price} درهم.
اكتب بالدارجة المغربية بحروف عربية، جمل قصيرة وواضحة، تتكلم على الفائدة والمشكل اللي كيحل، ماشي على المواصفات فقط.
قواعد صارمة: لا وعود كاذبة، لا ادعاءات طبية أو صحية، لا أرقام أو شهادات مخترعة، ولا آراء زبائن.
أجب بـ JSON فقط:
{"headline_ar":"عنوان قوي فيه الفائدة (أقل من 60 حرف)","sub_ar":"جملة أو جملتان","benefits":[{"text_ar":""}],"sections":[{"title_ar":"","text_ar":""}],"faq":[{"q_ar":"","a_ar":""}],"offers":[{"qty":1,"price_dh":0,"badge_ar":""}]}
- benefits: من 5 إلى 7.
- sections: 3 فقرات (المشكل، الحل، كيفاش كيتستعمل).
- faq: 5 أسئلة (التوصيل، الدفع عند الاستلام، الجودة، الاستعمال، الاستبدال). لا تذكر مدة توصيل أو ضمان محدد بالأرقام.
- offers: 3 عروض: 1 بالثمن العادي، 2 بخصم صغير، 3 بخصم أكبر (أثمنة تنتهي بـ 9)، وضع badge_ar «الأكثر طلباً» على عرض 2.`

function parseJson(text: string) {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('ai_bad_answer')
  return JSON.parse(m[0])
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    if (!PERMS[action]) return fail('invalid_action')

    const caller = callerClient(req)
    const checks = await Promise.all(PERMS[action].map((p) => caller.rpc('has_perm', { p })))
    if (!checks.some((r) => r.data === true)) return fail('forbidden', 403)
    const { data: me } = await caller.rpc('current_employee_id')

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return fail('ai_not_configured', 412)
    const admin = adminClient()
    const { data: cfgRow } = await admin.from('settings').select('value').eq('key', 'ai').single()
    const cfg = (cfgRow?.value ?? {}) as Cfg
    if (cfg.enabled === false) return fail('ai_disabled', 412)
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', since)
    if ((count ?? 0) >= (cfg.monthly_limit ?? 500)) return fail('ai_limit_reached', 429)

    let model = cfg.model_fast || 'claude-haiku-5-5'
    let maxTokens = 1024
    let system = 'You are a precise assistant for a stationery and administrative-services shop in Morocco. Follow the requested output format exactly.'
    let content: unknown[]

    if (action === 'id_card' || action === 'riyad') {
      const img = String(body.image ?? '')
      const mime = String(body.mime ?? 'image/jpeg')
      if (!img || img.length > 7_000_000 || !/^image\/(jpeg|png|webp|gif)$/.test(mime)) return fail('image_invalid')
      content = [
        { type: 'image', source: { type: 'base64', media_type: mime, data: img } },
        { type: 'text', text: action === 'id_card' ? ID_PROMPT : RIYAD_PROMPT },
      ]
    } else if (action === 'write') {
      model = cfg.model_smart || 'claude-sonnet-5-5'
      maxTokens = 2000
      const lang = body.lang === 'fr' ? 'fr' : 'ar'
      const kind = KINDS[String(body.kind)] ?? KINDS.other
      system = `أنت كاتب عمومي محترف في المغرب. تكتب ${kind} ${lang === 'fr' ? 'بالفرنسية الإدارية السليمة' : 'بالعربية الإدارية الفصحى السليمة'} بالصيغة المعتمدة في المغرب: المرسِل وعنوانه، التاريخ والمدينة، المرسَل إليه، الموضوع، المراجع إن وُجدت، صيغة التحية، العرض المختصر الواضح، الطلب، صيغة الختام، التوقيع.
لا تخترع معلومات شخصية غير معطاة: ضع مكانها نقاطاً (.........) ليملأها الزبون. أعد نص الوثيقة فقط دون أي شرح أو تعليق، ودون Markdown.`
      const f = (k: string) => String(body[k] ?? '').slice(0, 1500).trim()
      content = [{
        type: 'text',
        text: [
          `نوع الوثيقة: ${kind}`,
          f('sender') && `المرسِل: ${f('sender')}`,
          f('recipient') && `المرسَل إليه: ${f('recipient')}`,
          f('subject') && `الموضوع: ${f('subject')}`,
          f('city') && `المدينة: ${f('city')}`,
          `التاريخ: ${new Date().toLocaleDateString(lang === 'fr' ? 'fr-MA' : 'ar-MA', { timeZone: 'Africa/Casablanca' })}`,
          `التفاصيل التي قدّمها الزبون: ${f('details') || '—'}`,
          f('tone') && `الأسلوب: ${f('tone')}`,
        ].filter(Boolean).join('\n'),
      }]
    } else if (action === 'landing') {
      model = cfg.model_smart || 'claude-sonnet-5-5'
      maxTokens = 3000
      content = [{ type: 'text', text: LANDING_PROMPT(String(body.name ?? '').slice(0, 200), String(body.description ?? '').slice(0, 1500), Number(body.price) || 0) }]
    } else {
      maxTokens = 1500
      content = [{ type: 'text', text: SERVICE_PROMPT(String(body.name ?? '').slice(0, 200)) }]
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
    })
    const out = await res.json()
    await admin.from('ai_usage').insert({
      employee_id: me ?? null, action, model, ok: res.ok,
      input_tokens: out?.usage?.input_tokens ?? null, output_tokens: out?.usage?.output_tokens ?? null,
    })
    if (!res.ok) return fail(String(out?.error?.message ?? '').includes('credit balance') ? 'ai_no_credit' : out?.error?.message ?? 'ai_error', 502)
    const text = (out.content ?? []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n').trim()

    if (action === 'write') return json({ text })
    if (action === 'landing') {
      const l = parseJson(text)
      l.offers = (l.offers ?? []).map((o: { qty: number; price_dh: number; badge_ar?: string }) => ({ qty: o.qty, price: Math.round(Number(o.price_dh) * 100), badge_ar: o.badge_ar || undefined }))
      return json(l)
    }
    return json(parseJson(text))
  } catch (e) {
    return fail(String((e as Error).message ?? e), 500)
  }
})
