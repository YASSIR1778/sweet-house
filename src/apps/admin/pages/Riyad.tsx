import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, BadgePercent, Coins, PiggyBank, Plus, Scale, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card, CardHeader, Field, Input, Skeleton, SwitchRow } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, StatCard } from '@/shared/ui/data'
import { RiyadCorrections } from './ShiftExtras'
import { MoneyInput } from '@/shared/ui/pickers'

type Overview = {
  balance: number
  low_alert: number
  last_report: { reported: number; expected: number; at: string } | null
  month: { in: number; out: number; recharges: number; commissions: number }
  fees_month: number
  credit_open: number
  history: { day: string; balance: number }[]
  entries: { id: string; type: string; amount: number; effect: number; note: string | null; period: string | null; created_at: string; employee_name: string | null }[]
}

const TYPES: Record<string, { ar: string; fr: string; tone: 'success' | 'danger' | 'info' | 'warning' | 'brand' | 'neutral' }> = {
  opening: { ar: 'رصيد افتتاحي', fr: 'Solde initial', tone: 'neutral' },
  recharge: { ar: 'تعبئة', fr: 'Recharge', tone: 'success' },
  shift_in: { ar: 'دخل الصندوق (وردية)', fr: 'Entrées (caisse)', tone: 'danger' },
  shift_out: { ar: 'خرج من الصندوق (وردية)', fr: 'Sorties (caisse)', tone: 'info' },
  commission: { ar: 'عمولة شهرية', fr: 'Commission', tone: 'brand' },
  adjustment: { ar: 'تعديل', fr: 'Ajustement', tone: 'warning' },
  withdrawal: { ar: 'سحب من المنصة', fr: 'Retrait plateforme', tone: 'danger' },
}

export function RiyadPage() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [entry, setEntry] = useState<null | 'recharge' | 'commission' | 'adjustment' | 'opening' | 'withdrawal'>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [period, setPeriod] = useState(format(new Date(), 'yyyy-MM'))
  const [affects, setAffects] = useState(false)
  const [negative, setNegative] = useState(false)
  const [busy, setBusy] = useState(false)

  const ov = useQuery({
    queryKey: ['riyad'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('riyad_overview')
      if (error) throw error
      return data as Overview
    },
  })

  const submit = async () => {
    if (!entry || amount === null) return
    setBusy(true)
    const { error } = await sb.rpc('riyad_entry', {
      p_type: entry,
      p_amount: entry === 'adjustment' && negative ? -amount : amount,
      p_note: note || null,
      p_period: entry === 'commission' ? `${period}-01` : null,
      p_affects: affects,
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم التسجيل', 'Enregistré'))
    setEntry(null)
    setAmount(null)
    setNote('')
    qc.invalidateQueries({ queryKey: ['riyad'] })
  }

  const o = ov.data
  const low = o && o.balance < o.low_alert
  const empty = o && !o.entries.length

  return (
    <>
      <PageHeader
        icon={<Wallet />}
        title={t('رياض — الشعبي كاش', 'Riyad — Chaabi Cash')}
        description={t('رصيد المنصة، التعبئات، العمولات، وحركة كل وردية', 'Solde plateforme, recharges, commissions et caisses')}
        actions={
          can('riyad.manage') && (
            <>
              <Button variant="outline" onClick={() => setEntry('commission')}>
                <BadgePercent />
                {t('عمولة شهرية', 'Commission')}
              </Button>
              <Button onClick={() => setEntry('recharge')}>
                <Plus />
                {t('تعبئة الرصيد', 'Recharger')}
              </Button>
            </>
          )
        }
      />

      <RiyadCorrections />

      {empty && can('riyad.manage') && (
        <Card className="mb-5 flex flex-wrap items-center gap-4 border-brand/30 bg-brand-50/50 p-5">
          <PiggyBank className="size-8 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">{t('ابدأ بإدخال الرصيد الحالي للمنصة', 'Commencez par saisir le solde actuel')}</div>
            <div className="text-sm text-muted">{t('افتح رياض، انظر إلى رصيدك الآن، وأدخله هنا مرة واحدة. بعدها يحسب النظام كل شيء تلقائياً.', 'Saisissez une fois le solde affiché sur Riyad. Ensuite tout est calculé automatiquement.')}</div>
          </div>
          <Button onClick={() => setEntry('opening')}>{t('إدخال الرصيد الافتتاحي', 'Saisir le solde initial')}</Button>
        </Card>
      )}

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} tone={low ? 'danger' : 'success'} label={t('رصيد المنصة المتوقع', 'Solde plateforme attendu')} value={money(o?.balance)} icon={<Wallet />} loading={ov.isLoading} hint={low ? t('⚠️ أقل من حد التنبيه', '⚠️ Sous le seuil') : undefined} />
        <StatCard index={1} label={t('رسوم رياض هذا الشهر', 'Frais Riyad ce mois')} value={money(o?.fees_month)} icon={<Coins />} loading={ov.isLoading} />
        <StatCard index={2} tone="info" label={t('عمولات هذا الشهر', 'Commissions ce mois')} value={money(o?.month.commissions)} icon={<BadgePercent />} loading={ov.isLoading} />
        <StatCard index={3} tone="warning" label={t('ديون رياض على الزبائن', 'Crédits Riyad clients')} value={money(o?.credit_open)} icon={<AlertTriangle />} loading={ov.isLoading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('تطور الرصيد (30 يوماً)', 'Évolution du solde (30 j)')} icon={<Scale />} />
          <div className="h-64 p-4" dir="ltr">
            {ov.isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={(o?.history ?? []).map((h) => ({ day: format(new Date(h.day), 'dd/MM'), balance: h.balance / 100 }))}>
                  <defs>
                    <linearGradient id="rb" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16A34A" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#16A34A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                  <RTooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v) => [`${Number(v).toFixed(2)} DH`, t('الرصيد', 'Solde')]} />
                  <Area type="monotone" dataKey="balance" stroke="#16A34A" strokeWidth={2.5} fill="url(#rb)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('هذا الشهر', 'Ce mois-ci')} />
          <div className="space-y-3 p-5 text-sm">
            <Line icon={<ArrowDownCircle className="text-danger" />} label={t('دخل الصندوق من رياض', 'Encaissé pour Riyad')} value={o?.month.in} />
            <Line icon={<ArrowUpCircle className="text-info" />} label={t('خرج من الصندوق لرياض', 'Versé pour Riyad')} value={o?.month.out} />
            <Line icon={<Plus className="text-success" />} label={t('التعبئات', 'Recharges')} value={o?.month.recharges} />
            {o?.last_report && (
              <div className={cn('mt-4 rounded-xl p-3', o.last_report.reported === o.last_report.expected ? 'bg-success/10' : 'bg-warning/10')}>
                <div className="text-xs text-muted">
                  {t('آخر رصيد أبلغ عنه الموظف', 'Dernier solde déclaré')} · {format(new Date(o.last_report.at), 'dd/MM HH:mm')}
                </div>
                <div className="num mt-1 font-semibold">
                  {money(o.last_report.reported)} <span className="text-muted">/ {money(o.last_report.expected)}</span>
                </div>
              </div>
            )}
            {can('riyad.manage') && (
              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEntry('adjustment')}>
                  {t('تعديل الرصيد', 'Ajuster')}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEntry('withdrawal')}>
                  {t('سحب من المنصة', 'Retrait')}
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title={t('السجل', 'Historique')} />
        {!o?.entries.length ? (
          <EmptyState title={t('لا توجد حركات بعد', 'Aucun mouvement')} />
        ) : (
          <div className="divide-y divide-border">
            {o.entries.map((e) => {
              const ty = TYPES[e.type] ?? TYPES.adjustment
              return (
                <div key={e.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <Badge tone={ty.tone}>{t(ty.ar, ty.fr)}</Badge>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {e.period ? format(new Date(e.period), 'MM/yyyy') + ' · ' : ''}
                    {e.note ?? ''} {e.employee_name ? `· ${e.employee_name}` : ''}
                  </span>
                  <span className="num text-xs text-subtle">{format(new Date(e.created_at), 'dd/MM HH:mm')}</span>
                  <span className={cn('num w-28 text-end font-semibold', e.effect > 0 ? 'text-success' : e.effect < 0 ? 'text-danger' : 'text-muted')}>
                    {e.effect > 0 ? '+' : ''}
                    {money(e.effect || e.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Dialog
        open={!!entry}
        onOpenChange={(v) => !v && setEntry(null)}
        size="sm"
        title={entry ? t(TYPES[entry].ar, TYPES[entry].fr) : ''}
        description={
          entry === 'recharge'
            ? t('تحويل من تطبيق البنك إلى المنصة', 'Virement depuis l’application bancaire')
            : entry === 'opening'
              ? t('الرصيد الظاهر في رياض الآن', 'Solde affiché sur Riyad maintenant')
              : undefined
        }
      >
        <div className="space-y-4">
          <Field label={t('المبلغ', 'Montant')}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          {entry === 'adjustment' && <SwitchRow label={t('إنقاص من الرصيد', 'Diminuer le solde')} checked={negative} onCheckedChange={setNegative} />}
          {entry === 'commission' && (
            <>
              <Field label={t('الشهر', 'Mois')}>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} dir="ltr" />
              </Field>
              <SwitchRow label={t('أُضيفت العمولة إلى رصيد المنصة', 'Créditée sur le solde Riyad')} description={t('إن حوّلتها الشركة إلى البنك فاتركها معطلة', 'Laissez désactivé si versée en banque')} checked={affects} onCheckedChange={setAffects} />
            </>
          )}
          <Field label={t('ملاحظة', 'Note')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={!amount}>
            {t('تسجيل', 'Enregistrer')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

function Line({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="flex-1 text-muted">{label}</span>
      <span className="num font-semibold">{money(value)}</span>
    </div>
  )
}
