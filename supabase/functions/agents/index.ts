// Smart agents (one job each), run by pg_cron or by the owner ("run now").
// Each run reads the shop data through a service-role RPC, adds the agent's
// memory (the owner's past remarks), asks Claude for structured suggestions,
// and stores them in agent_suggestions + a notification (push to the owner).
// Nothing is changed in the shop: the owner decides on every suggestion.
// Secret: ANTHROPIC_API_KEY. Cron calls carry x-agent-key (table agent_secret).
import Anthropic from 'npm:@anthropic-ai/sdk'
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

type Agent = { key: string; name_ar: string; name_fr: string; enabled: boolean; model: string; monthly_runs: number }
type Item = { severity: 'info' | 'warning' | 'danger'; title: string; body: string; link: string; lines: Line[] }
type Line = { variant_id: string; name: string; qty: number; supplier: string; unit_cost_dh: number; why: string }

const COMMON = `أنت وكيل ذكي يعمل لمكتبة سويت هاوس في تطوان (مكتبة + خدمات + نقطة بيع + رياض/الشعبي كاش).
تكتب لمالك المحل بالعربية، بجمل قصيرة وواضحة، بدون مبالغة.
المبالغ في البيانات بالسنتيم: اقسم على 100 واكتبها بالدرهم (مثال: 125000 = 1 250 درهم).
لا تخترع أي رقم أو اسم غير موجود في البيانات.
«ملاحظات المالك» تعليمات منه سابقاً: احترمها دائماً ولا تكرر ما طلب عدم تكراره.`

const PROMPTS: Record<string, string> = {
  monitor: `مهمتك: «مراقب المحل». راجع عمليات اليوم وابحث فقط عما يستحق انتباه المالك:
- تخفيضات كبيرة أو كثيرة لموظف معيّن، تغيير الأسعار يدوياً، بيع بأقل من التكلفة.
- إلغاءات وإرجاعات (خصوصاً بعد مدة طويلة من البيع أو بدون سبب واضح).
- فرق في الصندوق عند الإغلاق، تصحيحات الورديات، فرق رصيد رياض.
- ورديات مفتوحة منذ وقت طويل، موظفون نسوا تسجيل الخروج، خروج نقود كبير من الصندوق.
- يوم ضعيف جداً أو قوي جداً مقارنة بالمعدل.
لا تذكر ما هو عادي. إن كان اليوم عادياً تماماً أرجع items فارغة مع summary قصير يطمئن المالك.
severity: danger = يحتاج تدخلاً اليوم، warning = يستحق المراجعة، info = معلومة مفيدة.
link: الصفحة المعنية من: /sales /shifts /riyad /reports /employees /attendance.
lines: اتركها فارغة دائماً في هذا الوكيل.`,
  purchases: `مهمتك: «وكيل المشتريات». اقترح ماذا يشتري المالك هذا الأسبوع وكم.
- احسب من sold_30d و sold_7d سرعة البيع، ومن stock و days_of_cover كم يكفي المخزون.
- اقترح كمية تكفي حوالي 3 أسابيع إلى شهر، مدوّرة لعدد مناسب (علب، دزينة…)، ولا تقترح منتجاً ما زال يكفي أكثر من 3 أسابيع.
- انتبه للموسم حسب التاريخ: الدخول المدرسي (غشت–شتنبر)، رمضان، نهاية الدورات والامتحانات.
- جمّع الاقتراح: item واحد لكل مورد (العنوان: اسم المورد)، و item لمنتجات بدون مورد معروف.
- في كل line: variant_id كما في البيانات، الاسم، الكمية، المورد، تكلفة الوحدة بالدرهم (0 إن لم تُعرف)، وسبب قصير.
- body: مجموع التكلفة التقريبية وأهم ملاحظة. link: /purchases.
- إن لم يكن هناك ما يُشترى أرجع items فارغة.`,
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'items'],
  properties: {
    summary: { type: 'string', description: 'سطر أو سطران للمالك' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'body', 'link', 'lines'],
        properties: {
          severity: { type: 'string', enum: ['info', 'warning', 'danger'] },
          title: { type: 'string' },
          body: { type: 'string' },
          link: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['variant_id', 'name', 'qty', 'supplier', 'unit_cost_dh', 'why'],
              properties: {
                variant_id: { type: 'string' }, name: { type: 'string' }, qty: { type: 'number' },
                supplier: { type: 'string' }, unit_cost_dh: { type: 'number' }, why: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const admin = adminClient()
  let runId: string | null = null
  try {
    const body = await req.json().catch(() => ({}))
    const key = String(body?.agent ?? '')
    if (!PROMPTS[key]) return fail('invalid_agent')

    // Who is calling: the cron (shared secret) or the owner from the dashboard
    let trigger: 'schedule' | 'manual' = 'schedule'
    const given = req.headers.get('x-agent-key')
    if (given) {
      const { data } = await admin.from('agent_secret').select('secret').eq('id', 1).single()
      if (!data || data.secret !== given) return fail('forbidden', 403)
    } else {
      const { data: owner } = await callerClient(req).rpc('is_owner')
      if (owner !== true) return fail('forbidden', 403)
      trigger = 'manual'
    }

    const { data: agent } = await admin.from('agents').select('*').eq('key', key).single<Agent>()
    if (!agent) return fail('invalid_agent')
    if (!agent.enabled && trigger === 'schedule') return json({ skipped: 'disabled' })
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) return fail('ai_not_configured', 412)
    const ai = ((await admin.from('settings').select('value').eq('key', 'ai').single()).data?.value ?? {}) as { enabled?: boolean }
    if (ai.enabled === false) return fail('ai_disabled', 412)
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await admin.from('agent_runs').select('id', { count: 'exact', head: true }).eq('agent_key', key).gte('started_at', since).or('ok.is.null,ok.eq.true')
    if ((count ?? 0) >= agent.monthly_runs) return fail('ai_limit_reached', 429)

    const { data: run } = await admin.from('agent_runs').insert({ agent_key: key, trigger, model: agent.model }).select('id').single()
    runId = run?.id ?? null

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
    const { data, error } = key === 'monitor' ? await admin.rpc('agent_monitor_data', { p_day: today }) : await admin.rpc('agent_purchase_data')
    if (error) throw new Error(error.message)
    const { data: mem } = await admin.from('agent_memory').select('note').eq('agent_key', key).order('created_at')
    const notes = (mem ?? []).map((m: { note: string }) => `- ${m.note}`).join('\n') || '(لا توجد)'

    const client = new Anthropic({ apiKey })
    const res = await client.beta.messages.create({
      model: agent.model,
      max_tokens: 8000,
      system: [{ type: 'text', text: `${COMMON}\n\n${PROMPTS[key]}`, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `تاريخ اليوم: ${today}\n\nملاحظات المالك:\n${notes}\n\nالبيانات:\n${JSON.stringify(data).slice(0, 120000)}` }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      betas: ['server-side-fallback-2026-07-01'],
      ...({ fallbacks: 'default' } as Record<string, unknown>),
    } as Anthropic.Beta.MessageCreateParamsNonStreaming)

    const usage = { input_tokens: (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), output_tokens: res.usage.output_tokens ?? 0 }
    if (res.stop_reason === 'refusal') throw new Error('refusal')
    const text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('')
    const out = JSON.parse(text) as { summary: string; items: Item[] }

    if (out.items.length) {
      await admin.from('agent_suggestions').insert(out.items.map((i) => ({
        agent_key: key, run_id: runId, severity: i.severity, title: i.title.slice(0, 300), body: i.body, link: i.link?.startsWith('/') ? i.link : null,
        payload: i.lines?.length ? { lines: i.lines } : {},
      })))
    }
    const worst = out.items.some((i) => i.severity === 'danger') ? 'danger' : out.items.some((i) => i.severity === 'warning') ? 'warning' : 'info'
    await admin.rpc('notify', {
      p_type: `agent_${key}`, p_severity: worst,
      p_ar: `${agent.name_ar}: ${out.items.length ? `${out.items.length} اقتراح` : 'لا شيء يستدعي الانتباه'}`,
      p_fr: `${agent.name_fr} : ${out.items.length} suggestion(s)`,
      p_body: out.summary.slice(0, 400), p_link: '/agents',
    })
    await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: true, summary: out.summary, ...usage }).eq('id', runId)
    return json({ ok: true, summary: out.summary, count: out.items.length })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    const code = msg.includes('credit balance') ? 'ai_no_credit' : msg
    if (runId) await admin.from('agent_runs').update({ finished_at: new Date().toISOString(), ok: false, error: code.slice(0, 500) }).eq('id', runId)
    return fail(code, 500)
  }
})
