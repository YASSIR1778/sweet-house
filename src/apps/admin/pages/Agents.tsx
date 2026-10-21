import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { BellOff, Bot, Megaphone, Brain, Copy, HelpCircle, Inbox, MessageCircle, Play, Plus, Save, Send, Settings2, Sparkles, Trash, Trophy, UserCheck, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, CardHeader, Field, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'
import { MarketingTab, OfferCard, PlanView, PostCard } from './Marketing'

type Line = { variant_id: string; name: string; qty: number; supplier: string; unit_cost_dh: number; why: string }
type Msg = { to: 'customer' | 'staff'; name: string; phone: string; employee_id: string; text: string }
type Payload = {
  lines?: Line[]; messages?: Msg[]; assign_to?: string; descriptions?: { product_id: string; name: string; desc_ar: string; desc_fr: string }[]
  posts?: Parameters<typeof PostCard>[0]['post'][]; offers?: Parameters<typeof OfferCard>[0]['offer'][]; plan?: Parameters<typeof PlanView>[0]['plan']
}
type Turn = { role: 'owner' | 'agent'; text: string; at: string }
export type Suggestion = {
  id: string; agent_key: string; severity: 'info' | 'warning' | 'danger'; title: string; body: string | null; link: string | null; payload: Payload
  status: 'new' | 'accepted' | 'rejected'; feedback: 'up' | 'meh' | 'down' | null; reason: string | null; snooze_until: string | null; thread: Turn[]; ref_id: string | null; created_at: string
}
export type AgentRow = {
  key: string; name_ar: string; name_fr: string; description_ar: string; enabled: boolean; model: string; monthly_runs: number; schedule_ar: string
  persona_name: string; avatar: string; personality: string; color: string; tone_hz: number
  last_run: { at: string; ok: boolean | null; error: string | null; summary: string | null; trigger: string } | null
  month: { runs: number; tokens_in: number; tokens_out: number }
  suggestions: { total: number; accepted: number; rejected: number; new: number }
  memory: number
}
type Prefs = { call_me: string; language: 'darija' | 'ar' | 'fr'; detail: 'short' | 'long'; quiet_from: string; quiet_to: string; quiet_days: number[]; sounds: boolean }
type Helpers = { site_enabled: boolean; site_daily_limit: number; site_name: string; site_avatar: string; pos_enabled: boolean; pos_name: string; model_fast: string }
type ReportRow = { key: string; persona_name: string; avatar: string; color: string; model: string; cur: { total: number; up: number; meh: number; down: number; danger: number }; prev: { total: number; up: number; down: number }; learned: string[]; runs: { count: number; tokens_in: number; tokens_out: number } }

const MODELS: [string, string, number, number][] = [
  ['claude-sonnet-5-5', 'Sonnet 5.5 (متوازن — موصى به)', 2, 10],
  ['claude-haiku-5-5', 'Haiku 5.5 (الأرخص)', 0.1, 0.5],
  ['claude-opus-5-5', 'Opus 5.5 (الأذكى، أغلى)', 4, 20],
]
const costDh = (model: string, tin: number, tout: number) => {
  const p = MODELS.find((m) => m[0] === model) ?? MODELS[0]
  return ((tin * p[2] + tout * p[3]) / 1e6) * 10
}
const dh = (n: number) => `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} DH`
const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function useAgents() {
  const { sb, can } = useAuth()
  return useQuery({ queryKey: ['agents'], enabled: can('owner'), queryFn: async () => ((await sb.rpc('agents_overview')).data ?? []) as AgentRow[] })
}

function Avatar({ a, size = 40 }: { a?: Pick<AgentRow, 'avatar' | 'color'>; size?: number }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-2xl" style={{ width: size, height: size, background: `${a?.color ?? '#E8590C'}22`, fontSize: size * 0.55 }}>
      {a?.avatar ?? '🤖'}
    </div>
  )
}

function useInvalidate() {
  const qc = useQueryClient()
  return () => ['agent-suggestions', 'agents', 'agent-pending', 'agent-memory', 'agent-card', 'agent-room'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

function PayloadView({ s }: { s: Suggestion }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const p = s.payload ?? {}
  const emps = useQuery({ queryKey: ['emp-names'], enabled: !!p.assign_to, queryFn: async () => ((await sb.from('employees').select('id, full_name')).data ?? []) as { id: string; full_name: string }[] })
  const [applied, setApplied] = useState<Record<string, boolean>>({})
  const total = (p.lines ?? []).reduce((a, l) => a + l.qty * (l.unit_cost_dh || 0), 0)
  const copy = (txt: string) => (navigator.clipboard.writeText(txt), toast.success(t('تم النسخ', 'Copié')))
  const run = async (k: string, f: () => PromiseLike<{ error: unknown }>, ok: string) => {
    const { error } = await f()
    if (error) return toast.error(errorMessage(error, lang))
    setApplied((x) => ({ ...x, [k]: true }))
    toast.success(ok)
  }
  return (
    <div className="mt-3 space-y-3">
      {!!p.lines?.length && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {p.lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="num px-2 py-1.5 font-semibold">×{l.qty}</td>
                  <td className="num px-2 py-1.5">{l.unit_cost_dh ? dh(l.qty * l.unit_cost_dh) : '—'}</td>
                  <td className="px-2 py-1.5 text-xs text-muted">{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-sm">
            {total > 0 && (
              <span>
                {t('المجموع التقريبي:', 'Total :')} <b className="num">{dh(total)}</b>
              </span>
            )}
            <Button size="sm" variant="ghost" className="ms-auto" onClick={() => copy(`${s.title}\n${p.lines!.map((l) => `- ${l.name}: ${l.qty}`).join('\n')}`)}>
              <Copy />
              {t('نسخ', 'Copier')}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={whatsappLink('', `السلام عليكم، المرجو تجهيز هذه الطلبية لمكتبة سويت هاوس:\n${p.lines.map((l) => `- ${l.name}: ${l.qty}`).join('\n')}\nشكراً`)} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t('للمورد', 'Fournisseur')}
              </a>
            </Button>
          </div>
        </div>
      )}
      {p.messages?.map((m, i) => (
        <div key={i} className="rounded-xl border border-border p-3 text-sm">
          <div className="mb-1 text-xs text-muted">
            {m.to === 'customer' ? t('رسالة للزبون', 'Message client') : t('تذكير للموظف', 'Rappel employé')}: <b>{m.name}</b>
          </div>
          <div className="whitespace-pre-wrap">{m.text}</div>
          <div className="mt-2 flex gap-2">
            {m.to === 'customer' && m.phone ? (
              <Button size="sm" variant="success" asChild>
                <a href={whatsappLink(m.phone, m.text)} target="_blank" rel="noreferrer" onClick={() => s.agent_key === 'reviews' && sb.rpc('review_mark_asked', { p_phone: m.phone, p_name: m.name, p_source: 'agent' }).then(() => {})}>
                  <MessageCircle />
                  {t('إرسال على واتساب', 'WhatsApp')}
                </a>
              </Button>
            ) : m.to === 'staff' && m.employee_id ? (
              <Button size="sm" disabled={applied[`m${i}`]} onClick={() => run(`m${i}`, () => sb.rpc('agent_ping_staff', { p_employee: m.employee_id, p_text: m.text }), t('وصل التذكير للموظف ✅', 'Rappel envoyé ✅'))}>
                <Send />
                {applied[`m${i}`] ? t('أُرسل', 'Envoyé') : t('أرسل له تنبيهاً', 'Notifier')}
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => copy(m.text)}>
              <Copy />
            </Button>
          </div>
        </div>
      ))}
      {p.assign_to && s.ref_id && (
        <Button size="sm" variant="outline" disabled={applied.assign} onClick={() => run('assign', () => sb.rpc('assign_task', { p_entity: 'request', p_id: s.ref_id, p_action: 'assign', p_to: p.assign_to }), t('تم التكليف ✅', 'Assigné ✅'))}>
          <UserCheck />
          {applied.assign ? t('تم التكليف', 'Assigné') : `${t('كلّف', 'Assigner à')} ${emps.data?.find((e) => e.id === p.assign_to)?.full_name ?? '…'}`}
        </Button>
      )}
      {p.descriptions?.map((d, i) => (
        <div key={i} className="rounded-xl border border-border p-3 text-sm">
          <div className="font-semibold">{d.name}</div>
          <p className="mt-1 whitespace-pre-wrap">{d.desc_ar}</p>
          <p className="mt-1 text-muted" dir="ltr">
            {d.desc_fr}
          </p>
          <Button size="sm" className="mt-2" disabled={applied[`d${i}`]} onClick={() => run(`d${i}`, () => sb.rpc('agent_apply_description', { p_product: d.product_id, p_ar: d.desc_ar, p_fr: d.desc_fr }), t('أُضيف الوصف للمنتج ✅', 'Description ajoutée ✅'))}>
            {applied[`d${i}`] ? t('أُضيف', 'Ajouté') : t('أضف هذا الوصف للمنتج', 'Utiliser')}
          </Button>
        </div>
      ))}
      {p.posts?.map((x, i) => <PostCard key={i} post={x} />)}
      {p.offers?.map((o, i) => <OfferCard key={i} offer={o} suggestionId={s.id} />)}
      {!!p.plan?.length && <PlanView plan={p.plan} />}
    </div>
  )
}

function Thread({ s, agent }: { s: Suggestion; agent?: AgentRow }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const inv = useInvalidate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async (msg: string) => {
    if (!msg.trim() || busy) return
    setBusy(true)
    try {
      const r = await callFn<{ reply: string; revised: boolean }>(sb, 'agents', { action: 'reply', suggestion_id: s.id, message: msg })
      if (r.revised) toast.success(t('عدّل الوكيل اقتراحه ✏️', 'Suggestion modifiée ✏️'))
      setText('')
      inv()
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {s.thread?.map((m, i) => (
        <div key={i} className={cn('flex gap-2', m.role === 'owner' ? 'justify-start' : 'justify-end')}>
          {m.role === 'agent' && <Avatar a={agent} size={26} />}
          <div className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap', m.role === 'owner' ? 'bg-brand text-white' : 'bg-surface-2')}>{m.text}</div>
        </div>
      ))}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send(text)} placeholder={t(`ردّ على ${agent?.persona_name ?? 'الوكيل'}… (علاش؟ نقص الكمية…)`, 'Répondre…')} disabled={busy} />
        <Button size="icon" onClick={() => send(text)} loading={busy} disabled={!text.trim()}>
          <Send />
        </Button>
        <Button size="icon" variant="ghost" title={t('ما فهمتش', 'Pas compris')} onClick={() => send('ما فهمتش، شرح ليا بطريقة أبسط')} disabled={busy}>
          <HelpCircle />
        </Button>
      </div>
    </div>
  )
}

export function SuggestionCard({ s, agent, compact }: { s: Suggestion; agent?: AgentRow; compact?: boolean }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const inv = useInvalidate()
  const [down, setDown] = useState(false)
  const [reason, setReason] = useState('')
  const [remember, setRemember] = useState(true)
  const [talk, setTalk] = useState(!!s.thread?.length)
  const react = async (fb: 'up' | 'meh' | 'down' | 'snooze' | 'reset', why?: string) => {
    const { error } = await sb.rpc('agent_react', { p_id: s.id, p_feedback: fb, p_reason: why ?? null, p_remember: fb === 'down' && remember })
    if (error) return toast.error(errorMessage(error, lang))
    setDown(false)
    if (fb === 'up') toast.success(t(`${agent?.avatar ?? ''} شكراً! سأقترح أكثر من هذا`, 'Merci !'))
    if (fb === 'snooze') toast(t('⏰ سأذكّرك غداً صباحاً', '⏰ Demain matin'))
    inv()
  }
  const snoozed = s.snooze_until && new Date(s.snooze_until) > new Date()
  return (
    <Card className={cn('p-4', s.status !== 'new' && 'opacity-75')} style={{ borderInlineStartWidth: 4, borderInlineStartColor: agent?.color }}>
      <div className="flex gap-3">
        <Avatar a={agent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <b className="text-text">{agent?.persona_name ?? s.agent_key}</b>
            {s.severity === 'danger' && <Badge tone="danger">{t('مهم', 'Important')}</Badge>}
            {s.severity === 'warning' && <Badge tone="warning">{t('للمراجعة', 'À vérifier')}</Badge>}
            <span className="num">{format(new Date(s.created_at), 'dd/MM HH:mm')}</span>
            {snoozed && <Badge tone="neutral">⏰ {t('مؤجل', 'Reporté')}</Badge>}
            {s.feedback && <span>{s.feedback === 'up' ? '👍' : s.feedback === 'meh' ? '🤷' : '👎'}</span>}
          </div>
          <div className="mt-1 font-semibold">{s.title}</div>
          {s.body && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{s.body}</p>}
          {!compact && <PayloadView s={s} />}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {s.status === 'new' ? (
              <>
                <Button size="sm" variant="outline" onClick={() => react('up')}>👍 {t('مزيان', 'Utile')}</Button>
                <Button size="sm" variant="outline" onClick={() => react('meh')}>🤷 {t('عادي', 'Bof')}</Button>
                <Button size="sm" variant="outline" onClick={() => setDown(true)}>👎 {t('ماشي مهم', 'Pas utile')}</Button>
                {!snoozed && <Button size="sm" variant="ghost" onClick={() => react('snooze')}>⏰ {t('غداً', 'Demain')}</Button>}
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => react('reset')}>
                {t('إعادة', 'Rouvrir')}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setTalk((x) => !x)}>
              <MessageCircle />
              {s.thread?.length ? `${t('المحادثة', 'Discussion')} (${s.thread.length / 2})` : t('ردّ', 'Répondre')}
            </Button>
            {s.link && (
              <Button size="sm" variant="ghost" asChild>
                <Link to={s.link}>{t('فتح الصفحة', 'Ouvrir')}</Link>
              </Button>
            )}
          </div>
          {s.reason && <div className="mt-2 text-xs text-muted">{t('ملاحظتك:', 'Votre remarque :')} {s.reason}</div>}
          {talk && <Thread s={s} agent={agent} />}
        </div>
      </div>
      <Dialog open={down} onOpenChange={setDown} size="sm" title={`👎 ${t('علاش ماشي مهم؟', 'Pourquoi ?')}`} description={t(`سطر واحد يكفي، و${agent?.persona_name ?? 'الوكيل'} غادي يتفكرو`, 'Une ligne suffit')}>
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('مثلاً: التخفيض لهذا الزبون عادي، هو زبون دائم', 'ex. Remise normale, client fidèle')} autoFocus />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('تذكّر هذه الملاحظة دائماً', 'Mémoriser')}
          </label>
          <Button className="w-full" onClick={() => react('down', reason)}>
            {t('إرسال', 'Envoyer')}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

type Schedule = { hour?: number; minute?: number; days?: number[] }
type AgentFull = AgentRow & { schedule: Schedule; thresholds: Record<string, number | string[]>; notify_mode: 'push' | 'brief' | 'none'; is_custom: boolean; custom_job: string | null; sources: string[] }

const TH_FIELDS: Record<string, [string, string, string][]> = {
  monitor: [
    ['discount_pct', 'نبّهني إذا تجاوز التخفيض (%)', '%'],
    ['discount_dh', 'أو تجاوز مبلغ التخفيض', 'درهم'],
    ['cash_diff_dh', 'تجاهل فرق الصندوق الأقل من', 'درهم'],
    ['open_shift_hours', 'وردية مفتوحة أكثر من', 'ساعة'],
  ],
  purchases: [
    ['cover_weeks', 'المخزون يكفي', 'أسابيع'],
    ['budget_dh', 'أقصى ميزانية للطلبية (0 = بدون حد)', 'درهم'],
  ],
  followup: [
    ['debt_days', 'ذكّر بالدين بعد', 'يوم'],
    ['debt_min_dh', 'تجاهل الديون الأقل من', 'درهم'],
    ['ready_days', 'ذكّر بالوثيقة غير المستلمة بعد', 'أيام'],
  ],
  content: [['descriptions', 'عدد أوصاف المنتجات كل مرة', '']],
  facebook: [['posts', 'عدد المنشورات كل مرة', '']],
  instagram: [['posts', 'عدد المنشورات كل مرة', '']],
  tiktok: [['posts', 'عدد السيناريوهات كل مرة', '']],
  whatsapp: [['posts', 'عدد الرسائل كل مرة', '']],
  offers: [['max_discount_pct', 'أقصى تخفيض مسموح في العروض', '%']],
}
const SOURCES: [string, string][] = [
  ['sales', 'المبيعات (30 يوماً)'],
  ['stock', 'المخزون وسرعة البيع'],
  ['expenses', 'المصاريف (60 يوماً)'],
  ['requests', 'طلبات الخدمات'],
  ['riyad', 'رياض'],
  ['debts', 'ديون الزبائن'],
  ['attendance', 'الحضور'],
  ['shifts', 'الورديات والصندوق'],
  ['online', 'طلبيات المتجر والمساعدة'],
]
const SHORT_DAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت']
const scheduleText = (s: Schedule) => {
  if (s.hour === undefined) return 'عند كل طلب جديد'
  const time = `${String(s.hour).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`
  const d = s.days ?? [0, 1, 2, 3, 4, 5, 6]
  return d.length === 7 ? `كل يوم ${time}` : `${d.map((x) => SHORT_DAYS[x]).join('، ')} ${time}`
}

function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const days = value.days ?? [0, 1, 2, 3, 4, 5, 6]
  const time = `${String(value.hour ?? 8).padStart(2, '0')}:${String(value.minute ?? 0).padStart(2, '0')}`
  return (
    <div className="space-y-2">
      <Input type="time" step={900} value={time} onChange={(e) => onChange({ ...value, hour: Number(e.target.value.slice(0, 2)), minute: Math.floor(Number(e.target.value.slice(3, 5)) / 15) * 15 })} className="num w-32" />
      <div className="flex flex-wrap gap-1">
        {SHORT_DAYS.map((d, i) => (
          <button key={d} type="button" onClick={() => onChange({ ...value, days: days.includes(i) ? days.filter((x) => x !== i) : [...days, i].sort() })} className={cn('rounded-lg border px-2 py-1 text-xs', days.includes(i) ? 'border-brand bg-brand-50 text-brand' : 'border-border text-muted')}>
            {d}
          </button>
        ))}
      </div>
    </div>
  )
}

function TestResult({ r, agent, onClose }: { r: { summary?: string; items?: Suggestion[]; brief?: { text: string; points: { avatar: string; text: string }[] } } | null; agent: AgentRow; onClose: () => void }) {
  const { t } = useLang()
  return (
    <Dialog open={!!r} onOpenChange={(o) => !o && onClose()} title={`🧪 ${t('نتيجة التجربة', 'Résultat du test')} — ${agent.persona_name}`} description={t('لم يُحفظ شيء ولم يُرسل أي إشعار', 'Rien n’a été enregistré')}>
      {r && (
        <div className="max-h-[65vh] space-y-3 overflow-y-auto">
          <div className="rounded-xl bg-surface-2 p-3 text-sm">{r.summary}</div>
          {r.brief?.points.map((p, i) => (
            <div key={i} className="text-sm">
              {p.avatar} {p.text}
            </div>
          ))}
          {r.items?.map((s, i) => (
            <SuggestionCard key={i} s={{ ...s, id: `test-${i}`, agent_key: agent.key, status: 'accepted', feedback: null, reason: null, snooze_until: null, thread: [], ref_id: null, created_at: new Date().toISOString(), payload: s.payload ?? (s as unknown as Payload) }} agent={agent} compact />
          ))}
          {!r.items?.length && !r.brief && <div className="text-sm text-muted">{t('لا اقتراحات: كل شيء عادي حسب هذه الإعدادات.', 'Aucune suggestion.')}</div>}
        </div>
      )}
    </Dialog>
  )
}

function AgentSettings({ a, services }: { a: AgentFull; services: { id: string; name_ar: string }[] }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const inv = useInvalidate()
  const [running, setRunning] = useState<'run' | 'test' | null>(null)
  const [test, setTest] = useState<Parameters<typeof TestResult>[0]['r']>(null)
  const [p, setP] = useState({ persona_name: a.persona_name, avatar: a.avatar, personality: a.personality, color: a.color, custom_job: a.custom_job ?? '', sources: a.sources ?? [], thresholds: a.thresholds ?? {}, schedule: a.schedule ?? {} })
  const dirty = JSON.stringify(p) !== JSON.stringify({ persona_name: a.persona_name, avatar: a.avatar, personality: a.personality, color: a.color, custom_job: a.custom_job ?? '', sources: a.sources ?? [], thresholds: a.thresholds ?? {}, schedule: a.schedule ?? {} })
  const cost = costDh(a.model, a.month.tokens_in, a.month.tokens_out)
  const decided = a.suggestions.accepted + a.suggestions.rejected
  const fields = TH_FIELDS[a.key] ?? []
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await sb.from('agents').update(patch).eq('key', a.key)
    if (error) return toast.error(errorMessage(error, lang))
    inv()
  }
  const save = () => update({ ...p, schedule_ar: scheduleText(p.schedule), description_ar: a.is_custom ? p.custom_job.slice(0, 160) : a.description_ar }).then(() => toast.success(t('حُفظ ✅', 'Enregistré ✅')))
  const call = async (mode: 'run' | 'test') => {
    setRunning(mode)
    try {
      if (mode === 'test') {
        const r = await callFn<{ summary: string; items?: Suggestion[]; brief?: { text: string; points: { avatar: string; text: string }[] } }>(sb, 'agents', { action: 'test', agent: a.key, override: p })
        setTest(r)
      } else {
        const r = await callFn<{ summary: string; count: number }>(sb, 'agents', { agent: a.key })
        toast.success(`${a.avatar} ${a.persona_name}: ${r.summary ?? r.count}`)
      }
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setRunning(null)
      inv()
    }
  }
  const del = async () => {
    if (!confirm(t(`حذف ${a.persona_name} نهائياً؟`, 'Supprimer cet agent ?'))) return
    const { error } = await sb.from('agents').delete().eq('key', a.key)
    if (error) return toast.error(errorMessage(error, lang))
    inv()
  }
  return (
    <Card style={{ borderTopWidth: 4, borderTopColor: a.color }}>
      <div className="flex items-start gap-3 p-5">
        <Avatar a={a} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-lg font-bold">
            {a.persona_name}
            {a.is_custom && <Badge tone="info">{t('من صنعك', 'Personnalisé')}</Badge>}
          </div>
          <div className="text-xs text-muted">
            {t(a.name_ar, a.name_fr)} · {a.schedule_ar}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted">{a.description_ar}</p>
        </div>
      </div>
      <div className="space-y-4 px-5 pb-5">
        <SwitchRow label={t('يعمل تلقائياً', 'Automatique')} checked={a.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">{a.month.runs}</div>
            <div className="text-xs text-muted">{t('مرة هذا الشهر', 'exécutions')}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">{decided ? `${Math.round((a.suggestions.accepted / decided) * 100)}%` : '—'}</div>
            <div className="text-xs text-muted">{t('مفيد', 'utile')}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">≈ {cost.toFixed(1)}</div>
            <div className="text-xs text-muted">{t('درهم/شهر', 'DH/mois')}</div>
          </div>
        </div>
        {a.last_run && (
          <div className={cn('rounded-xl p-3 text-sm', a.last_run.ok === false ? 'bg-danger/10 text-danger' : 'bg-surface-2')}>
            <div className="num text-xs text-muted">{format(new Date(a.last_run.at), 'dd/MM HH:mm')}</div>
            {a.last_run.ok === false ? errorMessage(a.last_run.error ?? '', lang) : a.last_run.summary}
          </div>
        )}

        <div className="space-y-1.5 text-sm">
          <div className="font-medium">🔔 {t('كيف يصلك؟', 'Notification')}</div>
          <Tabs value={a.notify_mode} onChange={(notify_mode) => update({ notify_mode })} items={[{ value: 'push', label: t('إشعار', 'Notification') }, { value: 'brief', label: t('في قهوة الصباح', 'Café du matin') }, { value: 'none', label: t('بدون تنبيه', 'Silencieux') }]} />
        </div>

        <details className="rounded-xl border border-border p-3 text-sm" open={a.is_custom && !a.custom_job}>
          <summary className="cursor-pointer font-medium">⚙️ {t('الإعدادات: الوقت، الحدود، الشخصية', 'Réglages')}</summary>
          <div className="mt-3 space-y-4">
            <div className="space-y-1.5">
              <div className="font-medium">⏰ {t('وقت العمل', 'Horaire')}</div>
              {a.key === 'requests' ? (
                <div className="space-y-2">
                  <p className="text-muted">{t('يعمل عند كل طلب جديد من الموقع. اختر الخدمات التي يراجعها (بدون اختيار = كل الخدمات):', 'À chaque nouvelle demande. Services à vérifier (aucun = tous) :')}</p>
                  <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                    {services.map((sv) => {
                      const list = (p.thresholds.services as string[]) ?? []
                      const on = list.includes(sv.id)
                      return (
                        <button key={sv.id} type="button" onClick={() => setP({ ...p, thresholds: { ...p.thresholds, services: on ? list.filter((x) => x !== sv.id) : [...list, sv.id] } })} className={cn('rounded-lg border px-2 py-1 text-xs', on ? 'border-brand bg-brand-50 text-brand' : 'border-border text-muted')}>
                          {sv.name_ar}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <ScheduleEditor value={p.schedule} onChange={(schedule) => setP({ ...p, schedule })} />
              )}
            </div>

            {fields.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium">🎚️ {t('حدود التنبيه', 'Seuils')}</div>
                {fields.map(([k, label, unit]) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="flex-1 text-muted">{label}</span>
                    <Input type="number" min={0} value={String(p.thresholds[k] ?? '')} onChange={(e) => setP({ ...p, thresholds: { ...p.thresholds, [k]: Number(e.target.value) } })} className="num w-24" />
                    <span className="w-14 text-xs text-muted">{unit}</span>
                  </label>
                ))}
              </div>
            )}

            {a.is_custom && (
              <div className="space-y-2">
                <Field label={t('المهمة (اكتبها بكلامك)', 'Mission')}>
                  <Textarea value={p.custom_job} onChange={(e) => setP({ ...p, custom_job: e.target.value })} rows={4} placeholder={t('مثلاً: كل جمعة راجع المصاريف وقل لي فين نقدر نوفر', 'ex. Chaque vendredi, analyse les dépenses')} />
                </Field>
                <div className="font-medium">{t('البيانات التي يقرؤها', 'Données lues')}</div>
                <div className="flex flex-wrap gap-1">
                  {SOURCES.map(([k, l]) => (
                    <button key={k} type="button" onClick={() => setP({ ...p, sources: p.sources.includes(k) ? p.sources.filter((x) => x !== k) : [...p.sources, k] })} className={cn('rounded-lg border px-2 py-1 text-xs', p.sources.includes(k) ? 'border-brand bg-brand-50 text-brand' : 'border-border text-muted')}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-[1fr_5rem_5rem]">
              <Field label={t('الاسم', 'Nom')}>
                <Input value={p.persona_name} onChange={(e) => setP({ ...p, persona_name: e.target.value })} />
              </Field>
              <Field label={t('الصورة', 'Avatar')}>
                <Input value={p.avatar} onChange={(e) => setP({ ...p, avatar: e.target.value })} className="text-center text-xl" />
              </Field>
              <Field label={t('اللون', 'Couleur')}>
                <input type="color" value={p.color} onChange={(e) => setP({ ...p, color: e.target.value })} className="h-10 w-full rounded-[10px] border border-border" />
              </Field>
            </div>
            <Field label={t('طريقة كلامه وشخصيته', 'Personnalité')}>
              <Textarea value={p.personality} onChange={(e) => setP({ ...p, personality: e.target.value })} rows={2} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-muted">{t('النموذج', 'Modèle')}</span>
                <select value={a.model} onChange={(e) => update({ model: e.target.value })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
                  {MODELS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-muted">{t('أقصى عدد مرات في الشهر', 'Max / mois')}</span>
                <Input type="number" min={0} defaultValue={a.monthly_runs} onBlur={(e) => Number(e.target.value) !== a.monthly_runs && update({ monthly_runs: Number(e.target.value) })} className="num" />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => call('test')} loading={running === 'test'}>
                🧪 {t('جرّب قبل الحفظ', 'Tester')}
              </Button>
              <Button size="sm" onClick={save} disabled={!dirty}>
                <Save />
                {t('حفظ', 'Enregistrer')}
              </Button>
              {a.is_custom && (
                <Button size="sm" variant="ghost" className="ms-auto text-danger" onClick={del}>
                  <Trash />
                  {t('حذف الوكيل', 'Supprimer')}
                </Button>
              )}
            </div>
          </div>
        </details>
        <Button variant="outline" onClick={() => call('run')} loading={running === 'run'}>
          <Play />
          {t('شغّله الآن', 'Lancer maintenant')}
        </Button>
      </div>
      <TestResult r={test} agent={a} onClose={() => setTest(null)} />
    </Card>
  )
}

function NewAgentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const inv = useInvalidate()
  const [f, setF] = useState({ persona_name: '', avatar: '🧑‍💼', color: '#7C3AED', custom_job: '', sources: ['sales'] as string[], schedule: { hour: 9, minute: 0, days: [5] } as Schedule, model: 'claude-sonnet-5-5' })
  const create = async () => {
    const { error } = await sb.from('agents').insert({
      key: `c_${Date.now().toString(36)}`, name_ar: f.persona_name, name_fr: f.persona_name, persona_name: f.persona_name, avatar: f.avatar, color: f.color,
      personality: 'واضح ومختصر وعملي.', description_ar: f.custom_job.slice(0, 160), custom_job: f.custom_job, sources: f.sources, schedule: f.schedule,
      schedule_ar: scheduleText(f.schedule), model: f.model, monthly_runs: 20, is_custom: true, sort: 50, tone_hz: 740,
    })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`${f.avatar} مرحباً بـ ${f.persona_name} في الفريق!`, 'Agent créé !'))
    inv()
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`➕ ${t('وكيل جديد', 'Nouvel agent')}`} description={t('اكتب مهمته بكلامك واختر ما يقرؤه ومتى يعمل', 'Décrivez sa mission')}>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto">
        <div className="grid gap-3 sm:grid-cols-[1fr_5rem_5rem]">
          <Field label={t('الاسم', 'Nom')} required>
            <Input value={f.persona_name} onChange={(e) => setF({ ...f, persona_name: e.target.value })} placeholder={t('مثلاً: سي الحسّاب', 'ex. Le comptable')} autoFocus />
          </Field>
          <Field label={t('الصورة', 'Avatar')}>
            <Input value={f.avatar} onChange={(e) => setF({ ...f, avatar: e.target.value })} className="text-center text-xl" />
          </Field>
          <Field label={t('اللون', 'Couleur')}>
            <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-10 w-full rounded-[10px] border border-border" />
          </Field>
        </div>
        <Field label={t('مهمته', 'Mission')} required>
          <Textarea value={f.custom_job} onChange={(e) => setF({ ...f, custom_job: e.target.value })} rows={4} placeholder={t('مثلاً: كل جمعة راجع المصاريف ديال الشهر، قارنها بالمبيعات، وقل لي فين نقدر نوفر', 'ex. Analyse les dépenses et dis-moi où économiser')} />
        </Field>
        <div className="space-y-1.5 text-sm">
          <div className="font-medium">{t('البيانات التي يقرؤها', 'Données lues')}</div>
          <div className="flex flex-wrap gap-1">
            {SOURCES.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setF({ ...f, sources: f.sources.includes(k) ? f.sources.filter((x) => x !== k) : [...f.sources, k] })} className={cn('rounded-lg border px-2 py-1 text-xs', f.sources.includes(k) ? 'border-brand bg-brand-50 text-brand' : 'border-border text-muted')}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="font-medium">⏰ {t('متى يعمل', 'Quand')}</div>
          <ScheduleEditor value={f.schedule} onChange={(schedule) => setF({ ...f, schedule })} />
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">{t('النموذج', 'Modèle')}</span>
          <select value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
            {MODELS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted">{t('بعد الإنشاء: افتح إعداداته واضغط «🧪 جرّب» لترى ماذا سيقول قبل أن يعمل وحده.', 'Ensuite, utilisez « Tester ».')}</p>
        <Button className="w-full" onClick={create} disabled={f.persona_name.trim().length < 2 || f.custom_job.trim().length < 10 || !f.sources.length}>
          <Plus />
          {t('أضفه للفريق', 'Ajouter à l’équipe')}
        </Button>
      </div>
    </Dialog>
  )
}

/** 💰 budget bar + ⏸️ pause for the whole team */
function TeamBar() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [pausing, setPausing] = useState(false)
  const q = useQuery({ queryKey: ['agent-team'], queryFn: async () => (await sb.rpc('agent_team_spend')).data as { agents: number; assistants: number; site: number; budget: number; paused_until: string | null } })
  const d = q.data
  if (!d) return null
  const spent = Number(d.agents) + Number(d.assistants) + Number(d.site)
  const pct = d.budget ? Math.min(100, (spent / d.budget) * 100) : 0
  const paused = d.paused_until && new Date(d.paused_until) > new Date()
  const setPause = async (days: number | null) => {
    const cur = (await sb.from('settings').select('value').eq('key', 'agent_team').single()).data?.value ?? {}
    const until = days === null ? null : new Date(Date.now() + days * 86400_000).toISOString()
    const { error } = await sb.from('settings').update({ value: { ...cur, paused_until: until } }).eq('key', 'agent_team')
    if (error) return toast.error(errorMessage(error, lang))
    setPausing(false)
    toast.success(until ? t('⏸️ الفريق في عطلة', '⏸️ Équipe en pause') : t('▶️ الفريق رجع للخدمة', '▶️ Équipe de retour'))
    qc.invalidateQueries({ queryKey: ['agent-team'] })
  }
  return (
    <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
      <div className="min-w-56 flex-1">
        <div className="flex items-center justify-between text-sm">
          <span>💰 {t('ميزانية الفريق هذا الشهر', 'Budget du mois')}</span>
          <span className="num font-semibold">
            {spent.toFixed(1)} / {d.budget || '∞'} {t('درهم', 'DH')}
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
          <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success')} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-muted">
          {t('الوكلاء', 'Agents')} {Number(d.agents).toFixed(1)} · {t('المساعدات', 'Assistants')} {Number(d.assistants).toFixed(1)} · {t('مرشد الموقع', 'Site')} {Number(d.site).toFixed(1)}
        </div>
      </div>
      {paused ? (
        <div className="flex items-center gap-2">
          <Badge tone="warning">⏸️ {t('في عطلة حتى', 'En pause jusqu’au')} {format(new Date(d.paused_until!), 'dd/MM HH:mm')}</Badge>
          <Button size="sm" onClick={() => setPause(null)}>
            ▶️ {t('استئناف', 'Reprendre')}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setPausing(true)}>
          ⏸️ {t('أوقف الفريق مؤقتاً', 'Mettre en pause')}
        </Button>
      )}
      <Dialog open={pausing} onOpenChange={setPausing} size="sm" title={`⏸️ ${t('عطلة للفريق', 'Pause de l’équipe')}`} description={t('لن يعمل أي وكيل تلقائياً خلال هذه المدة. المساعدات تبقى تعمل.', 'Aucun agent automatique pendant cette période.')}>
        <div className="grid grid-cols-2 gap-2">
          {[[1, 'يوم'], [3, '3 أيام'], [7, 'أسبوع'], [14, 'أسبوعان']].map(([n, l]) => (
            <Button key={n} variant="outline" onClick={() => setPause(Number(n))}>
              {l}
            </Button>
          ))}
        </div>
      </Dialog>
    </Card>
  )
}

function MemoryTab({ agents }: { agents: AgentRow[] }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const inv = useInvalidate()
  const [agent, setAgent] = useState(agents.find((a) => a.key !== 'brief')?.key ?? 'monitor')
  const [note, setNote] = useState('')
  const mem = useQuery({ queryKey: ['agent-memory', agent], queryFn: async () => ((await sb.from('agent_memory').select('id, note, created_at').eq('agent_key', agent).order('created_at')).data ?? []) as { id: string; note: string; created_at: string }[] })
  const a = agents.find((x) => x.key === agent)
  const add = async () => {
    const { error } = await sb.from('agent_memory').insert({ agent_key: agent, note: note.trim() })
    if (error) return toast.error(errorMessage(error, lang))
    setNote('')
    inv()
  }
  return (
    <Card>
      <CardHeader title={t('ذاكرة الفريق', 'Mémoire de l’équipe')} description={t('ما تعلّمه كل وكيل منك. يقرؤه في كل مرة. احذف ما لم يعد صحيحاً.', 'Ce que chaque agent a appris de vous.')} icon={<Brain />} />
      <div className="space-y-4 p-5 pt-0">
        <div className="flex flex-wrap gap-2">
          {agents.map((x) => (
            <button key={x.key} onClick={() => setAgent(x.key)} className={cn('flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm', agent === x.key ? 'border-brand bg-brand-50' : 'border-border')}>
              <span>{x.avatar}</span>
              {x.persona_name}
              {x.memory > 0 && <span className="num text-xs text-muted">{x.memory}</span>}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {(mem.data ?? []).map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
              <span>{a?.avatar}</span>
              <span className="flex-1">{m.note}</span>
              <Button size="icon-sm" variant="ghost" onClick={async () => (await sb.from('agent_memory').delete().eq('id', m.id), inv())}>
                <Trash className="text-danger" />
              </Button>
            </div>
          ))}
          {!mem.data?.length && <div className="text-sm text-muted">{t('لا توجد ملاحظات بعد.', 'Aucune remarque.')}</div>}
        </div>
        <div className="flex gap-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('مثلاً: لا تنبّهني عن فرق الصندوق أقل من 10 دراهم', 'ex. Ignore les écarts < 10 DH')} />
          <Button onClick={add} disabled={note.trim().length < 2}>
            <Plus />
            {t('علّمه', 'Ajouter')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function RoomTab({ agents }: { agents: AgentRow[] }) {
  const { sb } = useAuth()
  const { t } = useLang()
  const room = useQuery({
    queryKey: ['agent-room'],
    queryFn: async () => {
      const [s, b] = await Promise.all([
        sb.from('agent_suggestions').select('*').order('created_at', { ascending: false }).limit(60),
        sb.from('agent_briefs').select('*').order('day', { ascending: false }).limit(14),
      ])
      const items = [
        ...((s.data ?? []) as Suggestion[]).map((x) => ({ at: x.created_at, kind: 's' as const, s: x })),
        ...((b.data ?? []) as { day: string; text: string; points: { avatar: string; text: string }[]; created_at: string }[]).map((x) => ({ at: x.created_at, kind: 'b' as const, b: x })),
      ]
      return items.sort((x, y) => (x.at < y.at ? -1 : 1))
    },
  })
  const by = (k: string) => agents.find((a) => a.key === k)
  if (room.isLoading) return <Skeleton className="h-64" />
  if (!room.data?.length) return <EmptyState icon={<Users />} title={t('الغرفة هادئة', 'Salle calme')} description={t('هنا تظهر كل رسائل الفريق كمحادثة جماعية.', 'Tous les messages de l’équipe, comme un groupe.')} />
  return (
    <Card className="space-y-3 bg-surface-2/40 p-4">
      {room.data.map((it, i) => {
        const a = it.kind === 's' ? by(it.s.agent_key) : by('brief')
        const text = it.kind === 's' ? `${it.s.title}${it.s.body ? `\n${it.s.body}` : ''}` : `${it.b.text}\n${it.b.points.map((p) => `${p.avatar} ${p.text}`).join('\n')}`
        return (
          <div key={i} className="flex gap-2">
            <Avatar a={a} size={34} />
            <div className="max-w-[85%]">
              <div className="text-xs" style={{ color: a?.color }}>
                <b>{a?.persona_name}</b> <span className="num text-muted">{format(new Date(it.at), 'dd/MM HH:mm')}</span>
              </div>
              <div className="mt-0.5 rounded-2xl rounded-ss-sm bg-surface px-3 py-2 text-sm whitespace-pre-wrap shadow-sm">{text}</div>
              {it.kind === 's' &&
                it.s.thread?.map((m, j) => (
                  <div key={j} className={cn('mt-1 rounded-2xl px-3 py-1.5 text-sm whitespace-pre-wrap', m.role === 'owner' ? 'bg-brand text-white' : 'bg-surface')}>
                    {m.text}
                  </div>
                ))}
            </div>
          </div>
        )
      })}
    </Card>
  )
}

function ReportCard() {
  const { sb } = useAuth()
  const { t } = useLang()
  const q = useQuery({ queryKey: ['agent-card'], queryFn: async () => ((await sb.rpc('agents_report_card')).data ?? []) as ReportRow[] })
  if (q.isLoading) return <Skeleton className="h-64" />
  const rate = (c: { up: number; down: number }) => (c.up + c.down ? Math.round((c.up / (c.up + c.down)) * 100) : null)
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(q.data ?? []).map((c) => {
        const now = rate(c.cur)
        const before = rate(c.prev)
        return (
          <Card key={c.key} className="p-5" style={{ borderTopWidth: 4, borderTopColor: c.color }}>
            <div className="flex items-center gap-3">
              <Avatar a={c} size={44} />
              <div className="flex-1">
                <div className="font-bold">{c.persona_name}</div>
                <div className="text-xs text-muted">{t('هذا الشهر', 'Ce mois-ci')}</div>
              </div>
              <div className="text-end">
                <div className="num text-2xl font-extrabold">{now === null ? '—' : `${now}%`}</div>
                <div className="text-xs text-muted">
                  {t('مفيد', 'utile')}
                  {now !== null && before !== null && (
                    <span className={cn('ms-1 font-semibold', now >= before ? 'text-success' : 'text-danger')}>
                      {now >= before ? '▲' : '▼'} {Math.abs(now - before)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg bg-surface-2 p-2"><div className="num text-base font-bold">{c.cur.total}</div>{t('اقتراح', 'sugg.')}</div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="num text-base font-bold">{c.cur.up}</div>👍</div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="num text-base font-bold">{c.cur.danger}</div>{t('مهم', 'urgent')}</div>
              <div className="rounded-lg bg-surface-2 p-2"><div className="num text-base font-bold">{costDh(c.model, c.runs.tokens_in, c.runs.tokens_out).toFixed(1)}</div>{t('درهم', 'DH')}</div>
            </div>
            {c.learned.length > 0 && (
              <div className="mt-4 text-sm">
                <div className="mb-1 font-semibold">🧠 {t('ما تعلّمه هذا الشهر', 'Appris ce mois')}</div>
                <ul className="list-disc space-y-0.5 ps-5 text-muted">
                  {c.learned.slice(0, 4).map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function BudgetCard() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['agent-team-cfg'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'agent_team').single()).data?.value as { monthly_budget_dh: number } })
  if (!q.data) return null
  const save = async (v: number) => {
    const cur = (await sb.from('settings').select('value').eq('key', 'agent_team').single()).data?.value ?? {}
    const { error } = await sb.from('settings').update({ value: { ...cur, monthly_budget_dh: v } }).eq('key', 'agent_team')
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظت الميزانية ✅', 'Budget enregistré ✅'))
    qc.invalidateQueries({ queryKey: ['agent-team'] })
    qc.invalidateQueries({ queryKey: ['agent-team-cfg'] })
  }
  return (
    <Card>
      <CardHeader title={`💰 ${t('ميزانية الفريق الشهرية', 'Budget mensuel')}`} description={t('تشمل الوكلاء والمساعدات ومرشد الموقع. تنبيه عند 80%، وتوقف تلقائي عند 100% حتى الشهر القادم. 0 = بدون حد.', 'Alerte à 80 %, arrêt à 100 %.')} />
      <div className="flex items-center gap-2 p-5 pt-0">
        <Input type="number" min={0} defaultValue={q.data.monthly_budget_dh} onBlur={(e) => Number(e.target.value) !== q.data.monthly_budget_dh && save(Number(e.target.value))} className="num w-32" />
        <span className="text-sm text-muted">{t('درهم في الشهر', 'DH / mois')}</span>
      </div>
    </Card>
  )
}

function PrefsTab() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['agent-prefs'],
    queryFn: async () => {
      const { data } = await sb.from('settings').select('key, value').in('key', ['agent_prefs', 'helpers'])
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      return { prefs: m.agent_prefs as Prefs, helpers: m.helpers as Helpers }
    },
  })
  const [p, setP] = useState<Prefs | null>(null)
  const [h, setH] = useState<Helpers | null>(null)
  useEffect(() => {
    if (q.data) (setP(q.data.prefs), setH(q.data.helpers))
  }, [q.data])
  if (!p || !h) return <Skeleton className="h-64" />
  const save = async () => {
    const r1 = await sb.from('settings').update({ value: p }).eq('key', 'agent_prefs')
    const r2 = await sb.from('settings').update({ value: h }).eq('key', 'helpers')
    if (r1.error || r2.error) return toast.error(errorMessage(r1.error ?? r2.error, lang))
    toast.success(t('حُفظت تفضيلاتك ✅ الفريق غادي يتكلم معاك هكا', 'Préférences enregistrées ✅'))
    qc.invalidateQueries({ queryKey: ['agent-prefs'] })
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title={t('كيف يكلّمك الفريق', 'Comment l’équipe vous parle')} icon={<Settings2 />} />
        <div className="space-y-4 p-5 pt-0">
          <Field label={t('كيف ينادونك؟', 'Comment vous appeler ?')}>
            <Input value={p.call_me} onChange={(e) => setP({ ...p, call_me: e.target.value })} placeholder="سي ياسر" />
          </Field>
          <Field label={t('لغة الكلام', 'Langue')}>
            <Tabs value={p.language} onChange={(v) => setP({ ...p, language: v as Prefs['language'] })} items={[{ value: 'darija', label: 'الدارجة' }, { value: 'ar', label: 'العربية' }, { value: 'fr', label: 'Français' }]} />
          </Field>
          <Field label={t('التفاصيل', 'Détails')}>
            <Tabs value={p.detail} onChange={(v) => setP({ ...p, detail: v as Prefs['detail'] })} items={[{ value: 'short', label: t('باختصار', 'Court') }, { value: 'long', label: t('بالتفصيل', 'Détaillé') }]} />
          </Field>
          <SwitchRow label={t('صوت مختلف لكل وكيل عند وصول اقتراح', 'Son par agent')} checked={p.sounds} onCheckedChange={(sounds) => setP({ ...p, sounds })} />
        </div>
      </Card>
      <Card>
        <CardHeader title={t('أوقات الهدوء', 'Heures calmes')} description={t('لا إشعارات في هذه الأوقات إلا للأمور الخطيرة', 'Pas de notifications sauf urgence')} icon={<BellOff />} />
        <div className="space-y-4 p-5 pt-0">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('من', 'De')}>
              <Input type="time" value={p.quiet_from} onChange={(e) => setP({ ...p, quiet_from: e.target.value })} className="num" />
            </Field>
            <Field label={t('إلى', 'À')}>
              <Input type="time" value={p.quiet_to} onChange={(e) => setP({ ...p, quiet_to: e.target.value })} className="num" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => (
              <button key={d} onClick={() => setP({ ...p, quiet_days: p.quiet_days.includes(i) ? p.quiet_days.filter((x) => x !== i) : [...p.quiet_days, i] })} className={cn('rounded-lg border px-2.5 py-1 text-sm', p.quiet_days.includes(i) ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{t('الأيام المختارة: يوم راحة كامل بدون إشعارات.', 'Jours sélectionnés : repos complet.')}</p>
        </div>
      </Card>
      <Card>
        <CardHeader title={`${h.site_avatar} ${t('مساعد زوار الموقع', 'Assistant du site')}`} description={t('يجيب زوار صفحات الخدمات 24/24 من المعلومات المنشورة فقط', 'Répond aux visiteurs 24/7')} icon={<Sparkles />} />
        <div className="space-y-4 p-5 pt-0">
          <SwitchRow label={t('مفعّل', 'Activé')} checked={h.site_enabled} onCheckedChange={(site_enabled) => setH({ ...h, site_enabled })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('اسمه', 'Nom')}>
              <Input value={h.site_name} onChange={(e) => setH({ ...h, site_name: e.target.value })} />
            </Field>
            <Field label={t('أقصى عدد أسئلة في اليوم', 'Questions max / jour')}>
              <Input type="number" value={h.site_daily_limit} onChange={(e) => setH({ ...h, site_daily_limit: Number(e.target.value) })} className="num" />
            </Field>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title={`✨ ${t('مساعدة الموظفين في نقطة البيع', 'Assistante POS')}`} description={t('تجيب الموظفة عن المنتجات وخطوات الخدمات بسرعة', 'Aide rapide pour le personnel')} icon={<Sparkles />} />
        <div className="space-y-4 p-5 pt-0">
          <SwitchRow label={t('مفعّلة', 'Activée')} checked={h.pos_enabled} onCheckedChange={(pos_enabled) => setH({ ...h, pos_enabled })} />
          <Field label={t('اسمها', 'Nom')}>
            <Input value={h.pos_name} onChange={(e) => setH({ ...h, pos_name: e.target.value })} />
          </Field>
        </div>
      </Card>
      <BudgetCard />
      <div className="xl:col-span-2">
        <Button onClick={save}>
          <Save />
          {t('حفظ التفضيلات', 'Enregistrer')}
        </Button>
      </div>
    </div>
  )
}

export function AgentsPage() {
  const { sb } = useAuth()
  const { t } = useLang()
  const [tab, setTab] = useState('inbox')
  const [showAll, setShowAll] = useState(false)
  const [newAgent, setNewAgent] = useState(false)
  const agents = useAgents()
  const services = useQuery({ queryKey: ['svc-names'], enabled: tab === 'agents', queryFn: async () => ((await sb.from('services').select('id, name_ar').eq('kind', 'admin').eq('is_online', true).is('deleted_at', null).order('sort')).data ?? []) as { id: string; name_ar: string }[] })
  const sugg = useQuery({
    queryKey: ['agent-suggestions', showAll],
    queryFn: async () => {
      let q = sb.from('agent_suggestions').select('*').order('created_at', { ascending: false }).limit(100)
      if (!showAll) q = q.eq('status', 'new')
      return ((await q).data ?? []) as Suggestion[]
    },
  })
  const by = (k: string) => agents.data?.find((a) => a.key === k)
  const list = useMemo(() => {
    const now = Date.now()
    const all = sugg.data ?? []
    // snoozed ones go to the end until their time comes
    return [...all].sort((a, b) => Number(!!a.snooze_until && +new Date(a.snooze_until) > now) - Number(!!b.snooze_until && +new Date(b.snooze_until) > now))
  }, [sugg.data])
  const pending = list.filter((s) => s.status === 'new' && !(s.snooze_until && new Date(s.snooze_until) > new Date())).length

  return (
    <>
      <PageHeader icon={<Bot />} title={t('فريقك الذكي', 'Votre équipe IA')} description={t('كل واحد عنده مهمة، كيخلّي ليك اقتراحات، ونتا اللي كتقرر.', 'Chacun a sa mission ; vous décidez.')} />
      <TeamBar />
      <div className="mb-4 flex flex-wrap gap-2">
        {agents.data?.map((a) => (
          <div key={a.key} className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-1.5 text-sm" title={a.description_ar}>
            <span className="text-lg">{a.avatar}</span>
            <span className="font-medium">{a.persona_name}</span>
            <span className={cn('size-2 rounded-full', a.enabled ? 'bg-success' : 'bg-subtle')} />
          </div>
        ))}
      </div>
      <Tabs
        className="mb-5 flex-wrap"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'inbox', label: <span className="flex items-center gap-1.5"><Inbox className="size-4" />{t('الاقتراحات', 'Suggestions')}{pending ? ` (${pending})` : ''}</span> },
          { value: 'room', label: <span className="flex items-center gap-1.5"><Users className="size-4" />{t('غرفة الفريق', 'Salle')}</span> },
          { value: 'marketing', label: <span className="flex items-center gap-1.5"><Megaphone className="size-4" />{t('التسويق', 'Marketing')}</span> },
          { value: 'card', label: <span className="flex items-center gap-1.5"><Trophy className="size-4" />{t('بطاقة الفريق', 'Bilan')}</span> },
          { value: 'agents', label: <span className="flex items-center gap-1.5"><Bot className="size-4" />{t('الوكلاء', 'Agents')}</span> },
          { value: 'memory', label: <span className="flex items-center gap-1.5"><Brain className="size-4" />{t('الذاكرة', 'Mémoire')}</span> },
          { value: 'prefs', label: <span className="flex items-center gap-1.5"><Settings2 className="size-4" />{t('تفضيلاتي', 'Préférences')}</span> },
        ]}
      />
      {tab === 'inbox' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            {t('عرض ما تم الرد عليه أيضاً', 'Afficher aussi les traités')}
          </label>
          {sugg.isLoading ? (
            <Skeleton className="h-40" />
          ) : !list.length ? (
            <EmptyState icon={<Inbox />} title={t('ما كاين حتى اقتراح جديد 🎉', 'Rien de nouveau 🎉')} description={t('غادي يوصلك إشعار ملي يكون شي جديد.', 'Vous serez notifié.')} />
          ) : (
            list.map((s) => <SuggestionCard key={s.id} s={s} agent={by(s.agent_key)} />)
          )}
        </div>
      )}
      {tab === 'room' && agents.data && <RoomTab agents={agents.data} />}
      {tab === 'card' && <ReportCard />}
      {tab === 'marketing' && <MarketingTab />}
      {tab === 'agents' && (
        <>
          <Button className="mb-4" onClick={() => setNewAgent(true)}>
            <Plus />
            {t('وكيل جديد', 'Nouvel agent')}
          </Button>
          <div className="grid gap-4 xl:grid-cols-2">{agents.isLoading ? <Skeleton className="h-80" /> : agents.data?.map((a) => <AgentSettings key={a.key} a={a as AgentFull} services={services.data ?? []} />)}</div>
          <NewAgentDialog open={newAgent} onClose={() => setNewAgent(false)} />
        </>
      )}
      {tab === 'memory' && agents.data && <MemoryTab agents={agents.data} />}
      {tab === 'prefs' && <PrefsTab />}
    </>
  )
}
