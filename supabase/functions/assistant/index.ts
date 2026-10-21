// Smart assistant for the owner's dashboard, powered by Claude (owner's API key).
// Claude answers from the shop's real data through read-only tools that run
// with the caller's own session, so RLS and permissions apply. Changes are only
// proposed (propose_action); the dashboard executes them after the owner confirms.
// Secret: ANTHROPIC_API_KEY. Inactive (412) until it is set.
import Anthropic from 'npm:@anthropic-ai/sdk'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

type Cfg = { enabled?: boolean; model_smart?: string; model_assistant?: string; monthly_limit?: number }
type Msg = Anthropic.Beta.BetaMessageParam

const GUIDE_URL = 'https://raw.githubusercontent.com/YASSIR1778/sweet-house/main/docs/GUIDE.md'
let guideCache: { at: number; text: string } | null = null
async function guide() {
  if (guideCache && Date.now() - guideCache.at < 3_600_000) return guideCache.text
  try {
    const r = await fetch(GUIDE_URL)
    if (r.ok) guideCache = { at: Date.now(), text: await r.text() }
  } catch (_) { /* keep the previous copy */ }
  return guideCache?.text ?? ''
}

const SYSTEM = `أنت «مساعد سويت هاوس»، مساعد ذكي داخل لوحة تحكم مكتبة سويت هاوس في تطوان (مكتبة + خدمات إدارية وإلكترونية + نقطة بيع + رياض/الشعبي كاش).
تتحدث مع مالك المحل. أجب بلغة سؤاله (دارجة مغربية، عربية أو فرنسية)، باختصار ووضوح.

قواعد مهمة:
- لا تخمّن أي رقم. كل رقم عن المحل يجب أن يأتي من الأدوات. إن لم تجد المعلومة قل ذلك بصراحة.
- كل المبالغ في نتائج الأدوات بالسنتيم: اقسم على 100 واكتبها بالدرهم (مثال: 125000 = 1 250,00 درهم).
- التواريخ بتوقيت المغرب. «اليوم» و«هذا الأسبوع» تحسبها من تاريخ اليوم المعطى لك.
- عند المقارنة اذكر الفرق والنسبة.
- أضف في آخر الجواب رابطاً للصفحة المعنية بصيغة [اسم الصفحة](/path) من هذه المسارات فقط:
  /dashboard /sales /invoices /shifts /riyad /customers /products /categories /services /labels /stock /purchases /orders /requests /help /broadcasts /website /reports /expenses /employees /attendance /payroll /roles /devices /activity /trash /settings
- لا تنفّذ أي تعديل بنفسك. إن طلب المالك تسجيل مصروف أو تغيير سعر خدمة استعمل propose_action، وستظهر له بطاقة يؤكدها هو.
- لأسئلة «كيف أستعمل النظام» اعتمد على دليل الاستعمال أسفله، ولخطوات خدمة إدارية استعمل service_guide.
- لا تكتب جداول Markdown طويلة؛ استعمل نقاطاً قصيرة. الخط العريض **هكذا** مسموح.`

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'sales_report',
    description: 'تقرير كامل لفترة: رقم المعاملات، عدد المبيعات، الربح، طرق الأداء، أكثر المنتجات والخدمات مبيعاً، حسب الموظف، الأونلاين. استعمله لكل سؤال عن المبيعات أو المقارنة بين فترتين (نادِه مرتين).',
    input_schema: { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD (يوم شامل)' } }, required: ['from', 'to'] },
  },
  {
    name: 'sections_report',
    description: 'أرباح ومبيعات كل قسم (مكتبة، خدمات المحل، خدمات إدارية، رياض…) لفترة.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name: 'today_overview',
    description: 'وضع المحل الآن: مهام اليوم (طلبات جديدة/متأخرة، مخزون منخفض، ديون، نسخة احتياطية…) ومؤشرات سريعة (الديون، الموردون، رياض).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'riyad',
    description: 'رصيد منصة رياض المتوقع، حد التنبيه، تعبئات وعمولات الشهر، آخر العمليات وتطور الرصيد.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'service_requests',
    description: 'طلبات الخدمات الإدارية: المفتوحة/المتأخرة ومن المكلف بها. مع query تبحث برقم الطلب أو اسم الزبون أو الهاتف أو اسم الخدمة.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, only_open: { type: 'boolean' } } },
  },
  {
    name: 'products',
    description: 'البحث في المنتجات (الاسم، السعر، المخزون). low_stock=true يعطي المنتجات تحت حد التنبيه.',
    input_schema: { type: 'object', properties: { query: { type: 'string' }, low_stock: { type: 'boolean' } } },
  },
  {
    name: 'stale_products',
    description: 'المنتجات الراكدة: لم تُبع منذ عدد من الأيام، مع قيمة المخزون المجمّد.',
    input_schema: { type: 'object', properties: { days: { type: 'integer' } } },
  },
  {
    name: 'debts',
    description: 'الزبائن الذين عليهم دين، مرتبين من الأكبر.',
    input_schema: { type: 'object', properties: { min_dh: { type: 'number', description: 'أدنى مبلغ بالدرهم' } } },
  },
  {
    name: 'expenses',
    description: 'المصاريف في فترة مع الفئات، ومجموعها.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name: 'employees',
    description: 'أداء الموظفين (مبيعات، طلبات منجزة، سرعة) والحضور في فترة.',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] },
  },
  {
    name: 'service_guide',
    description: 'معلومات خدمة إدارية: السعر، المدة، الوثائق المطلوبة، الرابط الرسمي، وخطوات الإنجاز الداخلية.',
    input_schema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  },
  {
    name: 'propose_action',
    description: 'اقتراح تعديل يؤكده المالك بزر. type=expense: amount_dh, category (اسم الفئة), note, spent_on (YYYY-MM-DD), paid_from (bank|owner). type=service_price: service (اسم الخدمة), price_dh.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['expense', 'service_price'] },
        amount_dh: { type: 'number' }, category: { type: 'string' }, note: { type: 'string' }, spent_on: { type: 'string' },
        paid_from: { type: 'string', enum: ['bank', 'owner'] }, service: { type: 'string' }, price_dh: { type: 'number' },
      },
      required: ['type'],
    },
  },
]

const day = (d: string, end = false) => {
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00+01:00`)
  if (end) x.setDate(x.getDate() + 1)
  return x.toISOString()
}
const safe = (v: unknown) => String(v ?? '').replace(/[,()%*\\]/g, ' ').trim().slice(0, 60)
const clip = (v: unknown) => {
  const s = JSON.stringify(v ?? null)
  return s.length > 14000 ? s.slice(0, 14000) + '…(مقتطع)' : s
}
async function rpc(sb: SupabaseClient, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

type Proposal = Record<string, unknown> & { id: string; type: string }

async function runTool(sb: SupabaseClient, name: string, i: Record<string, unknown>, proposals: Proposal[]) {
  switch (name) {
    case 'sales_report':
      return rpc(sb, 'report_full', { p_from: day(String(i.from)), p_to: day(String(i.to), true) })
    case 'sections_report':
      return rpc(sb, 'report_sections', { p_from: day(String(i.from)), p_to: day(String(i.to), true) })
    case 'today_overview':
      return { tasks: await rpc(sb, 'today_tasks'), extras: await rpc(sb, 'dashboard_extras') }
    case 'riyad': {
      const o = (await rpc(sb, 'riyad_overview')) as Record<string, unknown> & { entries?: unknown[]; history?: unknown[] }
      return { ...o, entries: (o.entries ?? []).slice(0, 15), history: (o.history ?? []).slice(-10) }
    }
    case 'service_requests': {
      const q = String(i.query ?? '').trim()
      const list = (q ? await rpc(sb, 'requests_search', { p_q: q, p_limit: 20 }) : await rpc(sb, 'requests_list', { p_limit: 200 })) as Record<string, unknown>[]
      const slim = (list ?? []).map((r) => ({
        number: r.number, customer: r.customer_name, service: r.service_name_ar, status: r.status, created_at: r.created_at,
        due_at: r.due_at, late: r.late, assignee: (r.assignee as { full_name?: string } | null)?.full_name ?? null,
        steps: r.steps_total ? `${r.steps_done}/${r.steps_total}` : null, blocked: r.blocked_reason ?? null,
      }))
      if (!i.only_open) return slim
      const { data: finals } = await sb.from('request_statuses').select('key').eq('is_final', true)
      const closed = new Set((finals ?? []).map((f: { key: string }) => f.key))
      return slim.filter((r) => !closed.has(String(r.status)))
    }
    case 'products': {
      let qb = sb.from('product_variants').select('name_ar, price, stock_qty, barcode, products!inner(name_ar, name_fr, low_stock_alert, deleted_at)').is('deleted_at', null).is('products.deleted_at', null).limit(40)
      const q = safe(i.query)
      if (q) qb = qb.or(`name_ar.ilike.%${q}%,name_fr.ilike.%${q}%`, { referencedTable: 'products' })
      const { data, error } = await qb
      if (error) throw new Error(error.message)
      const rows = (data ?? []).map((v: Record<string, unknown>) => {
        const p = v.products as Record<string, unknown>
        return { product: p.name_ar, variant: v.name_ar, price: v.price, stock: v.stock_qty, alert: p.low_stock_alert }
      })
      return i.low_stock ? rows.filter((r) => Number(r.stock) <= Number(r.alert ?? 0)) : rows
    }
    case 'stale_products':
      return ((await rpc(sb, 'stale_products', { p_days: Number(i.days ?? 90) })) as unknown[] ?? []).slice(0, 40)
    case 'debts': {
      const { data, error } = await sb.from('customer_balances').select('full_name, balance, last_charge_at').gt('balance', Math.round(Number(i.min_dh ?? 0) * 100)).order('balance', { ascending: false }).limit(40)
      if (error) throw new Error(error.message)
      return data
    }
    case 'expenses': {
      const { data, error } = await sb.from('expenses').select('amount, spent_on, paid_from, note, expense_categories(name_ar)').is('deleted_at', null).gte('spent_on', String(i.from).slice(0, 10)).lte('spent_on', String(i.to).slice(0, 10)).order('spent_on').limit(300)
      if (error) throw new Error(error.message)
      const total = (data ?? []).reduce((s: number, e: { amount: number }) => s + e.amount, 0)
      return { total, count: data?.length ?? 0, items: data }
    }
    case 'employees':
      return {
        performance: await rpc(sb, 'employee_performance', { p_from: day(String(i.from)), p_to: day(String(i.to), true) }),
        attendance: await rpc(sb, 'attendance_report', { p_from: day(String(i.from)), p_to: day(String(i.to), true) }),
      }
    case 'service_guide': {
      const n = safe(i.name)
      const { data, error } = await sb.from('services').select('id, name_ar, name_fr, price, pricing_mode, duration_ar, target_hours, official_url, required_documents, is_online, service_guides(steps_ar, steps, tips_ar)').eq('kind', 'admin').is('deleted_at', null).or(`name_ar.ilike.%${n}%,name_fr.ilike.%${n}%`).limit(3)
      if (error) throw new Error(error.message)
      return data
    }
    case 'propose_action': {
      const p: Proposal = { ...i, id: crypto.randomUUID(), type: String(i.type) }
      if (p.type === 'service_price') {
        const { data } = await sb.from('services').select('id, name_ar, price').is('deleted_at', null).ilike('name_ar', `%${safe(i.service)}%`).limit(1).maybeSingle()
        if (!data) return { error: 'لم أجد هذه الخدمة' }
        Object.assign(p, { service_id: data.id, service: data.name_ar, old_price: data.price })
      }
      if (p.type === 'expense') {
        const { data } = await sb.from('expense_categories').select('id, name_ar').ilike('name_ar', `%${safe(i.category)}%`).limit(1).maybeSingle()
        Object.assign(p, { category_id: data?.id ?? null, category: data?.name_ar ?? i.category ?? null })
      }
      proposals.push(p)
      return { shown: true, note: 'ظهرت للمالك بطاقة للتأكيد. لا تقل إنه تم التنفيذ.' }
    }
  }
  return { error: 'unknown_tool' }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const body = await req.json()
    const history = (Array.isArray(body?.messages) ? body.messages : []) as Msg[]
    if (!history.length || history.length > 80) return fail('invalid_messages')

    const caller = callerClient(req)
    const { data: owner } = await caller.rpc('is_owner')
    if (owner !== true) return fail('forbidden', 403)
    const { data: me } = await caller.rpc('current_employee_id')

    const key = Deno.env.get('ANTHROPIC_API_KEY')
    if (!key) return fail('ai_not_configured', 412)
    const admin = adminClient()
    const cfg = ((await admin.from('settings').select('value').eq('key', 'ai').single()).data?.value ?? {}) as Cfg
    if (cfg.enabled === false) return fail('ai_disabled', 412)
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const { count } = await admin.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', since)
    if ((count ?? 0) >= (cfg.monthly_limit ?? 500)) return fail('ai_limit_reached', 429)

    const model = cfg.model_assistant || cfg.model_smart || 'claude-sonnet-5-5'
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
    const weekday = new Date().toLocaleDateString('ar-MA', { timeZone: 'Africa/Casablanca', weekday: 'long' })
    const system: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: `${SYSTEM}\n\n# دليل الاستعمال\n${await guide()}`, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `تاريخ اليوم: ${today} (${weekday}).` },
    ]

    const client = new Anthropic({ apiKey: key })
    const added: Msg[] = []
    const proposals: Proposal[] = []
    let tin = 0
    let tout = 0
    let text = ''
    let stop = ''

    for (let turn = 0; turn < 8; turn++) {
      const res = await client.beta.messages.create({
        model,
        max_tokens: 8000,
        system,
        tools: TOOLS,
        messages: [...history, ...added],
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        betas: ['server-side-fallback-2026-07-01'],
        ...({ fallbacks: 'default' } as Record<string, unknown>),
      } as Anthropic.Beta.MessageCreateParamsNonStreaming)
      tin += (res.usage.input_tokens ?? 0) + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0)
      tout += res.usage.output_tokens ?? 0
      added.push({ role: 'assistant', content: res.content as Anthropic.Beta.BetaContentBlockParam[] })
      stop = res.stop_reason ?? ''
      if (stop === 'refusal') {
        text = 'عذراً، لا أستطيع الإجابة عن هذا الطلب.'
        break
      }
      if (stop !== 'tool_use') {
        text = res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim()
        break
      }
      const calls = res.content.filter((b) => b.type === 'tool_use') as Anthropic.Beta.BetaToolUseBlock[]
      const results = await Promise.all(
        calls.map(async (c) => {
          try {
            return { type: 'tool_result' as const, tool_use_id: c.id, content: clip(await runTool(caller, c.name, (c.input ?? {}) as Record<string, unknown>, proposals)) }
          } catch (e) {
            return { type: 'tool_result' as const, tool_use_id: c.id, content: String((e as Error).message ?? e), is_error: true }
          }
        }),
      )
      added.push({ role: 'user', content: results })
    }

    await admin.from('ai_usage').insert({ employee_id: me ?? null, action: 'assistant', model, ok: !!text, input_tokens: tin, output_tokens: tout })
    if (!text) text = 'لم أتمكن من إكمال الجواب، حاول صياغة السؤال بشكل أبسط.'
    return json({ messages: added, text, proposals })
  } catch (e) {
    const err = e as { status?: number; message?: string }
    return fail(String(err.message ?? e), err.status === 429 ? 429 : 500)
  }
})
