import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, format } from 'date-fns'
import { BadgePercent, CheckCircle2, Gift, HandCoins, Plus, Trash, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { Avatar, Badge, Button, Card, CardHeader, Field, Input, Skeleton } from '@/shared/ui/primitives'
import { Dialog, useConfirm } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { MoneyInput } from '@/shared/ui/pickers'

type Row = { employee_id: string; full_name: string; color: string; base_salary: number; sales: number; commissions: number; bonuses: number; advances: number; paid: { net: number; paid_at: string } | null }
type Rule = { id: string; employee_id: string | null; scope: 'all' | 'category' | 'product' | 'service'; category_id: string | null; product_id: string | null; service_id: string | null; kind: 'percent' | 'per_unit'; value: number; is_active: boolean; note: string | null }

export function PayrollPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [tab, setTab] = useState('month')
  const [dlg, setDlg] = useState<null | { kind: 'advance' | 'bonus'; employee_id: string | null }>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [from, setFrom] = useState<'bank' | 'owner'>('owner')
  const [rule, setRule] = useState<Partial<Rule> | null>(null)

  const rows = useQuery({ queryKey: ['payroll', month], queryFn: async () => (await sb.rpc('payroll_preview', { p_month: `${month}-01` })).data as Row[] })
  const employees = useQuery({ queryKey: ['employees-lite'], queryFn: async () => (await sb.from('employees').select('id, full_name').is('deleted_at', null).eq('is_owner', false)).data ?? [] })
  const rules = useQuery({ queryKey: ['commission-rules'], queryFn: async () => (await sb.from('commission_rules').select('*').order('created_at')).data as Rule[] })
  const cats = useQuery({ queryKey: ['categories-lite'], queryFn: async () => (await sb.from('categories').select('id, name_ar, name_fr').is('deleted_at', null)).data ?? [] })
  const prods = useQuery({ queryKey: ['products-lite'], queryFn: async () => (await sb.from('products').select('id, name_ar, name_fr').is('deleted_at', null).order('name_ar')).data ?? [] })
  const svcs = useQuery({ queryKey: ['services-lite'], queryFn: async () => (await sb.from('services').select('id, name_ar, name_fr').is('deleted_at', null).order('name_ar')).data ?? [] })

  const attendance = useQuery({
    queryKey: ['attendance', month],
    queryFn: async () => {
      const from = new Date(`${month}-01T00:00:00`)
      return (await sb.rpc('attendance_report', { p_from: from.toISOString(), p_to: addMonths(from, 1).toISOString() })).data as { employees: { employee_id: string; days: number; hours: number }[] }
    },
  })
  const att = (id: string) => attendance.data?.employees.find((e) => e.employee_id === id)
  const refresh = () => qc.invalidateQueries({ queryKey: ['payroll'] })
  const net = (r: Row) => r.base_salary + r.commissions + r.bonuses - r.advances

  const pay = async (r: Row) => {
    if (!(await confirm({ title: t(`تأكيد أداء راتب ${r.full_name}`, `Payer ${r.full_name}`), description: `${t('الصافي', 'Net')}: ${money(net(r))}` }))) return
    const { error } = await sb.rpc('pay_payroll', { p_employee: r.employee_id, p_month: `${month}-01`, p_from: 'bank' })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تسجيل أداء الراتب', 'Salaire enregistré'))
    refresh()
  }

  const submit = async () => {
    if (!dlg?.employee_id || !amount) return
    const { error } =
      dlg.kind === 'advance'
        ? await sb.rpc('give_advance', { p_employee: dlg.employee_id, p_amount: amount, p_from: from, p_device: null, p_note: note || null })
        : await sb.from('bonuses').insert({ employee_id: dlg.employee_id, amount, month: `${month}-01`, note: note || null })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم التسجيل', 'Enregistré'))
    setDlg(null)
    setAmount(null)
    setNote('')
    refresh()
  }

  const saveRule = async () => {
    if (!rule?.scope || !rule.kind || rule.value === undefined) return
    const row = { employee_id: rule.employee_id ?? null, scope: rule.scope, category_id: rule.scope === 'category' ? rule.category_id : null, product_id: rule.scope === 'product' ? rule.product_id : null, service_id: rule.scope === 'service' ? rule.service_id : null, kind: rule.kind, value: rule.value, is_active: true, note: rule.note ?? null }
    const { error } = rule.id ? await sb.from('commission_rules').update(row).eq('id', rule.id) : await sb.from('commission_rules').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    setRule(null)
    qc.invalidateQueries({ queryKey: ['commission-rules'] })
    refresh()
  }

  const ruleLabel = (r: Rule) => {
    const who = r.employee_id ? employees.data?.find((e) => e.id === r.employee_id)?.full_name : t('كل الموظفين', 'Tous')
    const what =
      r.scope === 'all'
        ? t('كل المبيعات', 'Toutes les ventes')
        : r.scope === 'category'
          ? pick(cats.data?.find((c) => c.id === r.category_id), 'name')
          : r.scope === 'product'
            ? pick(prods.data?.find((c) => c.id === r.product_id), 'name')
            : pick(svcs.data?.find((c) => c.id === r.service_id), 'name')
    const val = r.kind === 'percent' ? `${r.value}%` : `${money(Number(r.value))} / ${t('وحدة', 'unité')}`
    return { who, what, val }
  }

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<Wallet />}
        title={t('الرواتب والعمولات', 'Salaires & commissions')}
        description={t('الراتب + العمولات + المكافآت − التسبيقات = الصافي', 'Salaire + commissions + primes − avances = net')}
        actions={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="num w-44" dir="ltr" />}
      />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: 'month', label: t('كشف الشهر', 'Fiche du mois') }, { value: 'rules', label: t('قواعد العمولة', 'Règles de commission'), count: rules.data?.length }]} />

      {tab === 'month' ? (
        rows.isLoading ? (
          <Skeleton className="h-64" />
        ) : !rows.data?.length ? (
          <Card>
            <EmptyState title={t('لا يوجد موظفون', 'Aucun employé')} />
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {rows.data.map((r) => (
              <Card key={r.employee_id} className="p-5">
                <div className="flex items-center gap-3">
                  <Avatar name={r.full_name} color={r.color} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{r.full_name}</div>
                    <div className="num text-xs text-muted">
                      {t('مبيعات الشهر', 'Ventes du mois')}: {money(r.sales)}
                      {att(r.employee_id) && ` · ${att(r.employee_id)!.days} ${t('يوم حضور', 'j de présence')} · ${att(r.employee_id)!.hours} ${t('س', 'h')}`}
                    </div>
                  </div>
                  {r.paid ? (
                    <Badge tone="success">
                      <CheckCircle2 />
                      {t('مدفوع', 'Payé')}
                    </Badge>
                  ) : (
                    <Badge tone="warning">{t('غير مدفوع', 'À payer')}</Badge>
                  )}
                </div>
                <div className="mt-4 space-y-1.5 text-sm">
                  <L label={t('الراتب الثابت', 'Salaire fixe')} v={r.base_salary} />
                  <L label={t('العمولات', 'Commissions')} v={r.commissions} plus />
                  <L label={t('المكافآت', 'Primes')} v={r.bonuses} plus />
                  <L label={t('التسبيقات', 'Avances')} v={-r.advances} />
                  <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                    <span>{t('الصافي', 'Net')}</span>
                    <span className="num">{money(r.paid?.net ?? net(r))}</span>
                  </div>
                </div>
                {!r.paid && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'advance', employee_id: r.employee_id })}>
                      <HandCoins />
                      {t('تسبيق', 'Avance')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setDlg({ kind: 'bonus', employee_id: r.employee_id })}>
                      <Gift />
                      {t('مكافأة', 'Prime')}
                    </Button>
                    <Button size="sm" className="ms-auto" onClick={() => pay(r)}>
                      {t('تسجيل الأداء', 'Marquer payé')}
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )
      ) : (
        <Card>
          <CardHeader
            title={t('قواعد العمولة والمكافأة', 'Règles de commission')}
            description={t('نسبة من المبيعات أو مبلغ عن كل وحدة، للجميع أو لموظف معين', 'Pourcentage ou montant par unité')}
            icon={<BadgePercent />}
            action={
              <Button size="sm" onClick={() => setRule({ scope: 'all', kind: 'percent', value: 1 })}>
                <Plus />
                {t('قاعدة جديدة', 'Nouvelle règle')}
              </Button>
            }
          />
          {!rules.data?.length ? (
            <EmptyState title={t('لا توجد قواعد', 'Aucune règle')} />
          ) : (
            <div className="divide-y divide-border">
              {rules.data.map((r) => {
                const l = ruleLabel(r)
                return (
                  <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <Badge tone="brand" className="num">
                      {l.val}
                    </Badge>
                    <span className="flex-1">
                      <span className="font-medium">{l.what}</span> <span className="text-muted">· {l.who}</span>
                    </span>
                    <Button variant="ghost" size="icon-sm" onClick={async () => (await sb.from('commission_rules').delete().eq('id', r.id), qc.invalidateQueries({ queryKey: ['commission-rules'] }), refresh())}>
                      <Trash className="text-danger" />
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <Dialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)} size="sm" title={dlg?.kind === 'advance' ? t('تسبيق على الراتب', 'Avance sur salaire') : t('مكافأة', 'Prime')}>
        <div className="space-y-4">
          <Field label={t('المبلغ', 'Montant')}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          {dlg?.kind === 'advance' && (
            <>
              <Field label={t('دُفع من', 'Payé par')}>
                <Select value={from} onValueChange={(v) => setFrom((v ?? 'owner') as 'bank' | 'owner')} options={[{ value: 'owner', label: t('المالك', 'Propriétaire') }, { value: 'bank', label: t('البنك', 'Banque') }]} />
              </Field>
              <p className="text-xs text-muted">{t('التسبيق من الدرج يُسجَّل من نقطة البيع أثناء الوردية.', 'Une avance depuis la caisse se fait au POS.')}</p>
            </>
          )}
          <Field label={t('ملاحظة', 'Note')}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={submit} disabled={!amount}>
            {t('تسجيل', 'Enregistrer')}
          </Button>
        </div>
      </Dialog>

      <Dialog open={!!rule} onOpenChange={(o) => !o && setRule(null)} size="md" title={t('قاعدة عمولة', 'Règle de commission')}>
        {rule && (
          <div className="space-y-4">
            <Field label={t('لمن؟', 'Pour qui ?')}>
              <Select value={rule.employee_id ?? null} onValueChange={(employee_id) => setRule({ ...rule, employee_id })} allowEmpty emptyLabel={t('كل الموظفين', 'Tous les employés')} options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.full_name }))} />
            </Field>
            <Field label={t('على ماذا؟', 'Sur quoi ?')}>
              <Select
                value={rule.scope ?? 'all'}
                onValueChange={(v) => setRule({ ...rule, scope: (v ?? 'all') as Rule['scope'] })}
                options={[
                  { value: 'all', label: t('كل المبيعات', 'Toutes les ventes') },
                  { value: 'category', label: t('فئة معينة', 'Une catégorie') },
                  { value: 'product', label: t('منتج معين', 'Un produit') },
                  { value: 'service', label: t('خدمة معينة', 'Un service') },
                ]}
              />
            </Field>
            {rule.scope === 'category' && <Select value={rule.category_id ?? null} onValueChange={(category_id) => setRule({ ...rule, category_id })} options={(cats.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} placeholder={t('اختر الفئة', 'Catégorie')} />}
            {rule.scope === 'product' && <Select value={rule.product_id ?? null} onValueChange={(product_id) => setRule({ ...rule, product_id })} options={(prods.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} placeholder={t('اختر المنتج', 'Produit')} />}
            {rule.scope === 'service' && <Select value={rule.service_id ?? null} onValueChange={(service_id) => setRule({ ...rule, service_id })} options={(svcs.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} placeholder={t('اختر الخدمة', 'Service')} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('النوع', 'Type')}>
                <Select value={rule.kind ?? 'percent'} onValueChange={(v) => setRule({ ...rule, kind: (v ?? 'percent') as Rule['kind'] })} options={[{ value: 'percent', label: t('نسبة %', 'Pourcentage') }, { value: 'per_unit', label: t('مبلغ لكل وحدة', 'Par unité') }]} />
              </Field>
              <Field label={rule.kind === 'per_unit' ? t('المبلغ', 'Montant') : t('النسبة', 'Taux')}>
                {rule.kind === 'per_unit' ? <MoneyInput value={rule.value ?? 0} onChange={(v) => setRule({ ...rule, value: v ?? 0 })} /> : <Input type="number" min={0} step="0.1" value={rule.value ?? 0} onChange={(e) => setRule({ ...rule, value: Number(e.target.value) })} className="num" />}
              </Field>
            </div>
            <Button className="w-full" onClick={saveRule}>
              {t('حفظ القاعدة', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}

function L({ label, v, plus }: { label: string; v: number; plus?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`num ${v < 0 ? 'text-danger' : plus && v > 0 ? 'text-success' : ''}`}>
        {plus && v > 0 ? '+' : ''}
        {money(v)}
      </span>
    </div>
  )
}
