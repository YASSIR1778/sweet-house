import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Bot, Brain, Check, Copy, Inbox, MessageCircle, Play, Plus, Trash, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, CardHeader, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'

type Line = { variant_id: string; name: string; qty: number; supplier: string; unit_cost_dh: number; why: string }
type Suggestion = { id: string; agent_key: string; severity: 'info' | 'warning' | 'danger'; title: string; body: string | null; link: string | null; payload: { lines?: Line[] }; status: 'new' | 'accepted' | 'rejected'; reason: string | null; created_at: string }
type AgentRow = {
  key: string; name_ar: string; name_fr: string; description_ar: string; enabled: boolean; model: string; monthly_runs: number; schedule_ar: string
  last_run: { at: string; ok: boolean | null; error: string | null; summary: string | null; trigger: string } | null
  month: { runs: number; tokens_in: number; tokens_out: number }
  suggestions: { total: number; accepted: number; rejected: number; new: number }
  memory: number
}

const MODELS: [string, string, number, number][] = [
  ['claude-sonnet-5-5', 'Sonnet 5.5 (متوازن — موصى به)', 2, 10],
  ['claude-haiku-5-5', 'Haiku 5.5 (الأرخص)', 0.1, 0.5],
  ['claude-opus-5-5', 'Opus 5.5 (الأذكى، أغلى)', 4, 20],
]
const TONE = { danger: 'danger', warning: 'warning', info: 'info' } as const
const dh = (n: number) => `${n.toLocaleString('fr-MA', { maximumFractionDigits: 2 })} DH`

function SuggestionCard({ s, agentName }: { s: Suggestion; agentName: string }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const lines = s.payload?.lines ?? []
  const total = lines.reduce((a, l) => a + l.qty * (l.unit_cost_dh || 0), 0)
  const listText = `${s.title}\n` + lines.map((l) => `- ${l.name}: ${l.qty}`).join('\n')

  const decide = async (status: 'accepted' | 'rejected' | 'new') => {
    setBusy(true)
    const { error } = await sb.rpc('agent_decide', { p_id: s.id, p_status: status, p_reason: status === 'rejected' ? reason : null, p_remember: status === 'rejected' && remember })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setRejecting(false)
    for (const k of [['agent-suggestions'], ['agents'], ['agent-pending'], ['agent-memory']]) qc.invalidateQueries({ queryKey: k })
  }

  return (
    <Card className={cn('p-4', s.status !== 'new' && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone={TONE[s.severity]}>{s.severity === 'danger' ? t('مهم', 'Important') : s.severity === 'warning' ? t('للمراجعة', 'À vérifier') : t('معلومة', 'Info')}</Badge>
        <span>{agentName}</span>
        <span className="num">{format(new Date(s.created_at), 'dd/MM HH:mm')}</span>
        {s.status === 'accepted' && <Badge tone="success">{t('مقبول', 'Accepté')}</Badge>}
        {s.status === 'rejected' && <Badge tone="neutral">{t('مرفوض', 'Refusé')}</Badge>}
      </div>
      <div className="mt-2 font-semibold">{s.title}</div>
      {s.body && <p className="mt-1 text-sm whitespace-pre-wrap text-muted">{s.body}</p>}
      {lines.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-1.5 text-start">{t('المنتج', 'Produit')}</th>
                <th className="px-2 py-1.5 text-start">{t('الكمية', 'Qté')}</th>
                <th className="px-2 py-1.5 text-start">{t('التكلفة', 'Coût')}</th>
                <th className="px-2 py-1.5 text-start">{t('السبب', 'Pourquoi')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5">{l.name}</td>
                  <td className="num px-2 py-1.5 font-semibold">{l.qty}</td>
                  <td className="num px-2 py-1.5">{l.unit_cost_dh ? dh(l.qty * l.unit_cost_dh) : '—'}</td>
                  <td className="px-2 py-1.5 text-xs text-muted">{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > 0 && (
            <div className="border-t border-border px-3 py-1.5 text-sm">
              {t('المجموع التقريبي:', 'Total estimé :')} <span className="num font-bold">{dh(total)}</span>
            </div>
          )}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {s.status === 'new' ? (
          <>
            <Button size="sm" onClick={() => decide('accepted')} loading={busy}>
              <Check />
              {lines.length ? t('موافق، سأطلبها', 'OK, je commande') : t('تمّت المراجعة', 'Vu')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRejecting(true)}>
              <X />
              {t('غير مفيد', 'Pas utile')}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => decide('new')} loading={busy}>
            {t('إعادة إلى الجديد', 'Remettre en nouveau')}
          </Button>
        )}
        {lines.length > 0 && (
          <>
            <Button size="sm" variant="ghost" onClick={() => (navigator.clipboard.writeText(listText), toast.success(t('تم النسخ', 'Copié')))}>
              <Copy />
              {t('نسخ القائمة', 'Copier')}
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <a href={whatsappLink('', `السلام عليكم، المرجو تجهيز هذه الطلبية لمكتبة سويت هاوس:\n${lines.map((l) => `- ${l.name}: ${l.qty}`).join('\n')}\nشكراً`)} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t('إرسال للمورد', 'Envoyer au fournisseur')}
              </a>
            </Button>
          </>
        )}
        {s.link && (
          <Button size="sm" variant="ghost" asChild>
            <Link to={s.link}>{t('فتح الصفحة', 'Ouvrir')}</Link>
          </Button>
        )}
      </div>
      {s.reason && <div className="mt-2 text-xs text-muted">{t('ملاحظتك:', 'Votre remarque :')} {s.reason}</div>}

      <Dialog open={rejecting} onOpenChange={setRejecting} size="sm" title={t('لماذا هذا غير مفيد؟', 'Pourquoi ?')} description={t('اكتب السبب ليتجنبه الوكيل في المرات القادمة', 'L’agent en tiendra compte')}>
        <div className="space-y-3">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('مثلاً: التخفيض لهذا الزبون عادي، هو زبون دائم', 'ex. Remise normale, client fidèle')} autoFocus />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            {t('تذكّر هذه الملاحظة (يقرؤها الوكيل في كل مرة)', 'Mémoriser cette remarque')}
          </label>
          <Button className="w-full" onClick={() => decide('rejected')} loading={busy}>
            {t('رفض', 'Refuser')}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}

function AgentCard({ a }: { a: AgentRow }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [running, setRunning] = useState(false)
  const price = MODELS.find((m) => m[0] === a.model) ?? MODELS[0]
  const cost = ((a.month.tokens_in * price[2] + a.month.tokens_out * price[3]) / 1e6) * 10
  const decided = a.suggestions.accepted + a.suggestions.rejected
  const update = async (patch: Partial<AgentRow>) => {
    const { error } = await sb.from('agents').update(patch).eq('key', a.key)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['agents'] })
  }
  const runNow = async () => {
    setRunning(true)
    try {
      const r = await callFn<{ summary: string; count: number }>(sb, 'agents', { agent: a.key })
      toast.success(`${a.name_ar}: ${r.count} ${t('اقتراح', 'suggestion(s)')}`)
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setRunning(false)
      for (const k of [['agent-suggestions'], ['agents'], ['agent-pending']]) qc.invalidateQueries({ queryKey: k })
    }
  }
  return (
    <Card>
      <CardHeader title={t(a.name_ar, a.name_fr)} description={a.description_ar} icon={<Bot />} />
      <div className="space-y-4 p-5 pt-0">
        <SwitchRow label={t(`يعمل تلقائياً: ${a.schedule_ar}`, 'Exécution automatique')} checked={a.enabled} onCheckedChange={(enabled) => update({ enabled })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted">{t('النموذج', 'Modèle')}</span>
            <select value={a.model} onChange={(e) => update({ model: e.target.value })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
              {MODELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted">{t('أقصى عدد مرات في الشهر', 'Exécutions max / mois')}</span>
            <Input type="number" min={0} defaultValue={a.monthly_runs} onBlur={(e) => Number(e.target.value) !== a.monthly_runs && update({ monthly_runs: Number(e.target.value) })} className="num" />
          </label>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-sm">
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">{a.month.runs}</div>
            <div className="text-xs text-muted">{t('مرة هذا الشهر', 'exécutions')}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">{decided ? `${Math.round((a.suggestions.accepted / decided) * 100)}%` : '—'}</div>
            <div className="text-xs text-muted">{t('نسبة القبول', 'acceptés')}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="num text-lg font-bold">≈ {cost.toFixed(1)}</div>
            <div className="text-xs text-muted">{t('درهم هذا الشهر', 'DH ce mois')}</div>
          </div>
        </div>
        {a.last_run && (
          <div className={cn('rounded-xl p-3 text-sm', a.last_run.ok === false ? 'bg-danger/10 text-danger' : 'bg-surface-2')}>
            <div className="num text-xs text-muted">
              {t('آخر تشغيل:', 'Dernière exécution :')} {format(new Date(a.last_run.at), 'dd/MM HH:mm')}
            </div>
            {a.last_run.ok === false ? errorMessage(a.last_run.error ?? '', lang) : a.last_run.summary}
          </div>
        )}
        <Button variant="outline" onClick={runNow} loading={running}>
          <Play />
          {t('شغّله الآن', 'Lancer maintenant')}
        </Button>
      </div>
    </Card>
  )
}

function MemoryTab({ agents }: { agents: AgentRow[] }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [agent, setAgent] = useState(agents[0]?.key ?? 'monitor')
  const [note, setNote] = useState('')
  const mem = useQuery({ queryKey: ['agent-memory', agent], queryFn: async () => ((await sb.from('agent_memory').select('id, note, created_at').eq('agent_key', agent).order('created_at')).data ?? []) as { id: string; note: string; created_at: string }[] })
  const add = async () => {
    const { error } = await sb.from('agent_memory').insert({ agent_key: agent, note: note.trim() })
    if (error) return toast.error(errorMessage(error, lang))
    setNote('')
    qc.invalidateQueries({ queryKey: ['agent-memory'] })
    qc.invalidateQueries({ queryKey: ['agents'] })
  }
  const del = async (id: string) => {
    await sb.from('agent_memory').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['agent-memory'] })
    qc.invalidateQueries({ queryKey: ['agents'] })
  }
  return (
    <Card>
      <CardHeader title={t('ذاكرة الوكلاء', 'Mémoire des agents')} description={t('ملاحظاتك التي يقرؤها الوكيل في كل مرة. احذف أي ملاحظة لم تعد صحيحة.', 'Vos remarques, lues à chaque exécution.')} icon={<Brain />} />
      <div className="space-y-4 p-5 pt-0">
        <Tabs value={agent} onChange={setAgent} items={agents.map((a) => ({ value: a.key, label: a.name_ar }))} />
        <div className="space-y-2">
          {(mem.data ?? []).map((m) => (
            <div key={m.id} className="flex items-start gap-2 rounded-xl bg-surface-2 p-3 text-sm">
              <span className="flex-1">{m.note}</span>
              <Button size="icon-sm" variant="ghost" onClick={() => del(m.id)}>
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
            {t('إضافة', 'Ajouter')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export function AgentsPage() {
  const { sb } = useAuth()
  const { t } = useLang()
  const [tab, setTab] = useState<'inbox' | 'agents' | 'memory'>('inbox')
  const [showAll, setShowAll] = useState(false)
  const agents = useQuery({ queryKey: ['agents'], queryFn: async () => ((await sb.rpc('agents_overview')).data ?? []) as AgentRow[] })
  const sugg = useQuery({
    queryKey: ['agent-suggestions', showAll],
    queryFn: async () => {
      let q = sb.from('agent_suggestions').select('*').order('created_at', { ascending: false }).limit(100)
      if (!showAll) q = q.eq('status', 'new')
      return ((await q).data ?? []) as Suggestion[]
    },
  })
  const name = (k: string) => agents.data?.find((a) => a.key === k)?.name_ar ?? k
  const pending = agents.data?.reduce((n, a) => n + a.suggestions.new, 0) ?? 0

  return (
    <>
      <PageHeader icon={<Bot />} title={t('الوكلاء الذكيون', 'Agents intelligents')} description={t('كل وكيل يقوم بمهمة واحدة ويترك لك اقتراحات. لا يُنفَّذ أي شيء دون موافقتك.', 'Chaque agent a une mission et vous laisse des suggestions.')} />
      <Tabs
        className="mb-5"
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        items={[
          { value: 'inbox', label: `${t('الاقتراحات', 'Suggestions')}${pending ? ` (${pending})` : ''}` },
          { value: 'agents', label: t('الوكلاء', 'Agents') },
          { value: 'memory', label: t('الذاكرة', 'Mémoire') },
        ]}
      />
      {tab === 'inbox' && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            {t('عرض المقبول والمرفوض أيضاً', 'Afficher aussi les traités')}
          </label>
          {sugg.isLoading ? (
            <Skeleton className="h-40" />
          ) : !sugg.data?.length ? (
            <EmptyState icon={<Inbox />} title={t('لا اقتراحات جديدة', 'Aucune suggestion')} description={t('سيضع الوكلاء اقتراحاتهم هنا بعد كل تشغيل، ويصلك تنبيه.', 'Les agents déposeront leurs suggestions ici.')} />
          ) : (
            sugg.data.map((s) => <SuggestionCard key={s.id} s={s} agentName={name(s.agent_key)} />)
          )}
        </div>
      )}
      {tab === 'agents' && <div className="grid gap-4 xl:grid-cols-2">{agents.isLoading ? <Skeleton className="h-80" /> : agents.data?.map((a) => <AgentCard key={a.key} a={a} />)}</div>}
      {tab === 'memory' && agents.data && <MemoryTab agents={agents.data} />}
    </>
  )
}
