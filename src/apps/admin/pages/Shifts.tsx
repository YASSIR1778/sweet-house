import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, format, startOfDay } from 'date-fns'
import { AlertTriangle, Banknote, CheckCircle2, Clock, Download, Wallet } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import { cn } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Card, Spinner } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { DataTable, PageHeader, StatCard, Tabs, type Column } from '@/shared/ui/data'
import { SafeBalanceCard, ShiftCarryDetail } from './ShiftExtras'

type Row = {
  id: string
  number: number
  status: 'open' | 'closed'
  opened_at: string
  closed_at: string | null
  opening_float: number
  counted_cash: number | null
  expected_cash: number | null
  difference: number | null
  riyad_in: number
  riyad_out: number
  riyad_balance_reported: number | null
  riyad_balance_expected: number | null
  handed_over: number
  opening_safe?: number | null
  opening_riyad?: number | null
  closing_drawer?: number | null
  closing_safe?: number | null
  employees: { full_name: string; color: string } | null
}

const MV: Record<string, [string, string]> = {
  expense: ['مصروف', 'Dépense'],
  owner_withdrawal: ['سحب المالك', 'Retrait'],
  owner_deposit: ['إيداع', 'Dépôt'],
  debt_payment: ['تسديد دين', 'Dette encaissée'],
  riyad_credit: ['رياض بالدين', 'Riyad crédit'],
  refund: ['إرجاع', 'Retour'],
  supplier_payment: ['تسديد مورد', 'Fournisseur'],
  salary_advance: ['تسبيق راتب', 'Avance'],
  adjustment: ['تعديل', 'Ajustement'],
  online_payment: ['أداء طلب أونلاين', 'Paiement en ligne'],
}

export function ShiftsPage() {
  const { sb } = useAuth()
  const { t } = useLang()
  const [range, setRange] = useState('30')
  const [open, setOpen] = useState<string | null>(null)
  const from = useMemo(() => addDays(startOfDay(new Date()), -Number(range)), [range])

  const shifts = useQuery({
    queryKey: ['shifts', range],
    queryFn: async () => {
      const { data, error } = await sb.from('shifts').select('*, employees!shifts_employee_id_fkey(full_name, color)').gte('opened_at', from.toISOString()).order('opened_at', { ascending: false })
      if (error) throw error
      return data as Row[]
    },
  })
  const detail = useQuery({
    queryKey: ['shift-report', open],
    enabled: !!open,
    queryFn: async () => (await sb.rpc('shift_report', { p_shift: open })).data as Row & {
      employee_name: string
      closed_by_name: string | null
      device_name: string | null
      notes: string | null
      totals: { sales_total: number; sales_cash: number; sales_card: number; sales_credit: number; riyad_fees: number; sales_count: number; discounts: number; voided: number; movements_total: number }
      movements: { type: string; amount: number; note: string | null; created_at: string; customer_name: string | null }[]
    },
  })

  const closed = (shifts.data ?? []).filter((s) => s.status === 'closed')
  const stats = {
    count: closed.length,
    diff: closed.reduce((a, s) => a + (s.difference ?? 0), 0),
    short: closed.filter((s) => (s.difference ?? 0) < 0).length,
    exact: closed.filter((s) => s.difference === 0).length,
  }

  const columns: Column<Row>[] = [
    { key: 'n', header: '#', sortValue: (s) => s.number, cell: (s) => <span className="num font-semibold">#{s.number}</span> },
    {
      key: 'emp',
      header: t('الموظف', 'Employé'),
      cell: (s) => (
        <span className="flex items-center gap-2">
          <Avatar name={s.employees?.full_name ?? '?'} color={s.employees?.color} size={28} />
          {s.employees?.full_name}
        </span>
      ),
    },
    {
      key: 'time',
      header: t('الوقت', 'Horaire'),
      sortValue: (s) => s.opened_at,
      cell: (s) => (
        <span className="num text-sm text-muted">
          {format(new Date(s.opened_at), 'dd/MM HH:mm')} → {s.closed_at ? format(new Date(s.closed_at), 'HH:mm') : '…'}
        </span>
      ),
    },
    { key: 'expected', header: t('المتوقع', 'Attendu'), cell: (s) => <span className="num">{s.expected_cash !== null ? money(s.expected_cash) : '—'}</span> },
    { key: 'counted', header: t('المعدود', 'Compté'), cell: (s) => <span className="num">{s.counted_cash !== null ? money(s.counted_cash) : '—'}</span> },
    {
      key: 'diff',
      header: t('الفرق', 'Écart'),
      sortValue: (s) => s.difference ?? 0,
      cell: (s) =>
        s.status === 'open' ? (
          <Badge tone="info">
            <Clock />
            {t('مفتوحة', 'Ouverte')}
          </Badge>
        ) : (
          <Badge tone={s.difference === 0 ? 'success' : (s.difference ?? 0) > 0 ? 'info' : 'danger'} className="num">
            {(s.difference ?? 0) > 0 ? '+' : ''}
            {money(s.difference)}
          </Badge>
        ),
    },
    {
      key: 'riyad',
      header: t('رياض', 'Riyad'),
      cell: (s) =>
        s.status === 'closed' ? (
          <span className="num text-xs text-muted">
            +{money(s.riyad_in, { currency: false })} / -{money(s.riyad_out, { currency: false })}
            {s.riyad_balance_reported !== null && s.riyad_balance_reported !== s.riyad_balance_expected && <AlertTriangle className="ms-1 inline size-3.5 text-warning" />}
          </span>
        ) : null,
    },
  ]

  const exportCsv = () =>
    downloadCsv(
      `shifts-${format(new Date(), 'yyyyMMdd')}`,
      ['#', 'Employé', 'Ouverture', 'Clôture', 'Fond', 'Attendu', 'Compté', 'Écart', 'Riyad entrées', 'Riyad sorties', 'Remis'],
      closed.map((s) => [s.number, s.employees?.full_name, format(new Date(s.opened_at), 'dd/MM/yyyy HH:mm'), s.closed_at ? format(new Date(s.closed_at), 'dd/MM/yyyy HH:mm') : '', csvMoney(s.opening_float), csvMoney(s.expected_cash), csvMoney(s.counted_cash), csvMoney(s.difference), csvMoney(s.riyad_in), csvMoney(s.riyad_out), csvMoney(s.handed_over)]),
    )

  const d = detail.data
  return (
    <>
      <PageHeader
        icon={<Banknote />}
        title={t('الورديات والصندوق', 'Caisses')}
        description={t('كل وردية: من فتحها، ما بيع فيها، المتوقع والمعدود والفرق', 'Chaque caisse : ventes, attendu, compté, écart')}
        actions={
          <>
            <Tabs value={range} onChange={setRange} items={[{ value: '7', label: t('7 أيام', '7 j') }, { value: '30', label: t('30 يوماً', '30 j') }, { value: '90', label: t('3 أشهر', '3 mois') }]} />
            <Button variant="outline" onClick={exportCsv}>
              <Download />
              Excel
            </Button>
          </>
        }
      />
      <SafeBalanceCard />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t('ورديات مغلقة', 'Caisses clôturées')} value={stats.count} icon={<Banknote />} loading={shifts.isLoading} />
        <StatCard index={1} tone={stats.diff < 0 ? 'danger' : 'success'} label={t('مجموع الفروقات', 'Total des écarts')} value={money(stats.diff)} icon={<AlertTriangle />} loading={shifts.isLoading} />
        <StatCard index={2} tone="success" label={t('ورديات مضبوطة', 'Caisses justes')} value={stats.exact} icon={<CheckCircle2 />} loading={shifts.isLoading} />
        <StatCard index={3} tone="warning" label={t('ورديات بنقص', 'Caisses en manque')} value={stats.short} icon={<Wallet />} loading={shifts.isLoading} />
      </div>
      <DataTable rows={shifts.data ?? []} columns={columns} rowKey={(s) => s.id} loading={shifts.isLoading} onRowClick={(s) => setOpen(s.id)} />

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)} size="lg" title={d ? `${t('وردية', 'Caisse')} #${d.number} · ${d.employee_name}` : ''} description={d?.device_name ?? undefined}>
        {!d ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            <ShiftCarryDetail shift={d} />
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                [t('المبيعات', 'Ventes'), d.totals.sales_total],
                [t('نقداً', 'Espèces'), d.totals.sales_cash],
                [t('بطاقة', 'Carte'), d.totals.sales_card],
                [t('بالدين', 'Crédit'), d.totals.sales_credit],
                [t('رسوم رياض', 'Frais Riyad'), d.totals.riyad_fees],
                [t('رياض داخل', 'Riyad entrées'), d.riyad_in],
                [t('رياض خارج', 'Riyad sorties'), d.riyad_out],
              ].map(([l, v]) => (
                <Card key={l as string} className="p-3">
                  <div className="text-xs text-muted">{l}</div>
                  <div className="num font-bold">{money(v as number)}</div>
                </Card>
              ))}
            </div>
            {d.status === 'closed' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-surface-2 p-4">
                  <div className="text-xs text-muted">{t('المتوقع', 'Attendu')}</div>
                  <div className="num text-xl font-bold">{money(d.expected_cash)}</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-4">
                  <div className="text-xs text-muted">{t('المعدود', 'Compté')}</div>
                  <div className="num text-xl font-bold">{money(d.counted_cash)}</div>
                </div>
                <div className={cn('rounded-xl p-4', d.difference === 0 ? 'bg-success/10' : (d.difference ?? 0) < 0 ? 'bg-danger/10' : 'bg-info/10')}>
                  <div className="text-xs text-muted">{t('الفرق', 'Écart')}</div>
                  <div className="num text-xl font-bold">{money(d.difference)}</div>
                </div>
              </div>
            )}
            {d.riyad_balance_reported !== null && (
              <div className="flex items-center justify-between rounded-xl border border-border p-3 text-sm">
                <span>{t('رصيد رياض: المُبلغ عنه / المتوقع', 'Solde Riyad : déclaré / attendu')}</span>
                <span className="num font-semibold">
                  {money(d.riyad_balance_reported)} / {money(d.riyad_balance_expected)}
                </span>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-semibold">{t('حركات الصندوق', 'Mouvements de caisse')}</div>
              {!d.movements.length ? (
                <div className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t('لا توجد حركات', 'Aucun mouvement')}</div>
              ) : (
                <div className="divide-y divide-border rounded-xl border border-border">
                  {d.movements.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <Badge>{t(...(MV[m.type] ?? [m.type, m.type]))}</Badge>
                      <span className="min-w-0 flex-1 truncate text-muted">{[m.customer_name, m.note].filter(Boolean).join(' · ')}</span>
                      <span className="num text-xs text-subtle">{format(new Date(m.created_at), 'HH:mm')}</span>
                      <span className={cn('num font-semibold', m.amount < 0 ? 'text-danger' : 'text-success')}>{money(m.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {d.notes && <div className="rounded-xl bg-warning/5 p-3 text-sm">{d.notes}</div>}
          </div>
        )}
      </Dialog>
    </>
  )
}
