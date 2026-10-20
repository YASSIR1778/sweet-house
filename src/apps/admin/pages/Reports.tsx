import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { addDays, endOfMonth, format, startOfDay, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { BarChart3, Download, FileText, HandCoins, Percent, Receipt, TrendingDown, TrendingUp, Truck, Wallet } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money, qty } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Input, Skeleton } from '@/shared/ui/primitives'
import { PageHeader, StatCard, Tabs } from '@/shared/ui/data'

type Report = {
  revenue: number
  refunds: number
  net_revenue: number
  sales_count: number
  payments: { cash: number; card: number; credit: number }
  tax: number
  discounts: number
  by_day: { day: string; revenue: number; count: number }[]
  by_hour: { hour: number; revenue: number }[]
  by_category: { name_ar: string; name_fr: string; color: string; revenue: number; qty: number }[]
  top_items: { name_ar: string; name_fr: string; qty: number; revenue: number; profit: number | null }[]
  by_employee: { full_name: string; color: string; count: number; revenue: number }[]
  riyad_fees: number
  shifts: { count: number; difference: number }
  cogs?: number
  gross_profit?: number
  expenses?: number
  salaries?: number
  riyad_commissions?: number
  net_profit?: number
  expenses_by_category?: { name_ar: string; name_fr: string; color: string; amount: number }[]
  debts_total: number
  suppliers_total: number
  riyad_balance: number | null
  online_revenue: number
  online_cogs: number
}

export function ReportsPage() {
  const { sb, can } = useAuth()
  const { t, pick } = useLang()
  const [preset, setPreset] = useState('month')
  const [custom, setCustom] = useState({ from: format(startOfMonth(new Date()), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') })

  const { from, to } = useMemo(() => {
    const today = startOfDay(new Date())
    switch (preset) {
      case 'today':
        return { from: today, to: addDays(today, 1) }
      case 'week':
        return { from: addDays(today, -6), to: addDays(today, 1) }
      case 'month':
        return { from: startOfMonth(today), to: addDays(today, 1) }
      case 'last':
        return { from: startOfMonth(subMonths(today, 1)), to: addDays(endOfMonth(subMonths(today, 1)), 1) }
      case 'year':
        return { from: startOfYear(today), to: addDays(today, 1) }
      default:
        return { from: new Date(`${custom.from}T00:00:00`), to: addDays(new Date(`${custom.to}T00:00:00`), 1) }
    }
  }, [preset, custom])

  const r = useQuery({
    queryKey: ['report', from.toISOString(), to.toISOString()],
    queryFn: async () => {
      const { data, error } = await sb.rpc('report_full', { p_from: from.toISOString(), p_to: to.toISOString() })
      if (error) throw error
      return data as Report
    },
  })
  const online = useQuery({
    queryKey: ['online-summary', from.toISOString(), to.toISOString()],
    queryFn: async () => (await sb.rpc('online_summary', { p_from: from.toISOString(), p_to: to.toISOString() })).data as { orders_count: number; orders_paid: number; requests_count: number; requests_paid: number; by_service: { name_ar: string; name_fr: string; count: number; paid: number }[] },
  })
  const handItems = useQuery({
    queryKey: ['custom-items', from.toISOString(), to.toISOString()],
    queryFn: async () => (await sb.rpc('custom_items_report', { p_from: from.toISOString(), p_to: to.toISOString() })).data as { name: string; count: number; qty: number; revenue: number; avg_price: number }[],
  })
  const d = r.data
  const profit = can('reports.profit')

  const exportCsv = () => {
    if (!d) return
    const period = `${format(from, 'dd/MM/yyyy')} - ${format(addDays(to, -1), 'dd/MM/yyyy')}`
    const rows: (string | number | null)[][] = [
      ['Période', period],
      ["Chiffre d'affaires", csvMoney(d.revenue)],
      ['Retours', csvMoney(d.refunds)],
      ['CA net', csvMoney(d.net_revenue)],
      ['Nombre de ventes', d.sales_count],
      ['Espèces', csvMoney(d.payments.cash)],
      ['Carte', csvMoney(d.payments.card)],
      ['Crédit', csvMoney(d.payments.credit)],
      ['TVA', csvMoney(d.tax)],
      ['Remises', csvMoney(d.discounts)],
      ['Frais Riyad', csvMoney(d.riyad_fees)],
    ]
    if (profit) rows.push(['Coût des ventes', csvMoney(d.cogs)], ['Marge brute', csvMoney(d.gross_profit)], ['Dépenses', csvMoney(d.expenses)], ['Salaires', csvMoney(d.salaries)], ['Commissions Riyad', csvMoney(d.riyad_commissions)], ['Bénéfice net', csvMoney(d.net_profit)])
    rows.push([], ['Article', 'Qté', 'CA', 'Marge'], ...d.top_items.map((i) => [i.name_fr, i.qty, csvMoney(i.revenue), i.profit === null ? '' : csvMoney(i.profit)]))
    rows.push([], ['Jour', 'CA', 'Ventes'], ...d.by_day.map((x) => [x.day, csvMoney(x.revenue), x.count]))
    downloadCsv(`rapport-${format(from, 'yyyyMMdd')}`, ['Sweet House', 'Rapport'], rows)
  }

  return (
    <>
      <PageHeader
        icon={<BarChart3 />}
        title={t('التقارير', 'Rapports')}
        description={t('المبيعات والأرباح والمصاريف لأي فترة', 'Ventes, bénéfices et dépenses par période')}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!d}>
            <Download />
            {t('تصدير Excel', 'Exporter Excel')}
          </Button>
        }
      />
      <Card className="mb-5 flex flex-wrap items-center gap-3 p-3">
        <Tabs
          value={preset}
          onChange={setPreset}
          items={[
            { value: 'today', label: t('اليوم', "Aujourd'hui") },
            { value: 'week', label: t('7 أيام', '7 j') },
            { value: 'month', label: t('هذا الشهر', 'Ce mois') },
            { value: 'last', label: t('الشهر الماضي', 'Mois dernier') },
            { value: 'year', label: t('هذه السنة', 'Cette année') },
            { value: 'custom', label: t('مخصص', 'Personnalisé') },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2" dir="ltr">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className="num w-40" />
            <span>→</span>
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className="num w-40" />
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t('رقم المعاملات الصافي', 'CA net')} value={money(d?.net_revenue)} icon={<TrendingUp />} loading={r.isLoading} hint={d?.refunds ? `${t('إرجاعات', 'Retours')}: ${money(d.refunds)}` : undefined} />
        <StatCard index={1} tone="navy" label={t('عدد المبيعات', 'Ventes')} value={d?.sales_count ?? 0} icon={<Receipt />} loading={r.isLoading} />
        {profit ? (
          <>
            <StatCard index={2} tone="success" label={t('الربح الإجمالي', 'Marge brute')} value={money(d?.gross_profit)} icon={<Percent />} loading={r.isLoading} hint={d?.net_revenue ? `${(((d.gross_profit ?? 0) / d.net_revenue) * 100).toFixed(1)}%` : undefined} />
            <StatCard index={3} tone={(d?.net_profit ?? 0) >= 0 ? 'success' : 'danger'} label={t('الربح الصافي', 'Bénéfice net')} value={money(d?.net_profit)} icon={(d?.net_profit ?? 0) >= 0 ? <TrendingUp /> : <TrendingDown />} loading={r.isLoading} />
          </>
        ) : (
          <>
            <StatCard index={2} tone="info" label={t('الضريبة', 'TVA')} value={money(d?.tax)} icon={<Percent />} loading={r.isLoading} />
            <StatCard index={3} tone="warning" label={t('رسوم رياض', 'Frais Riyad')} value={money(d?.riyad_fees)} icon={<Wallet />} loading={r.isLoading} />
          </>
        )}
      </div>

      {profit && d && (
        <Card className="mt-4">
          <CardHeader title={t('حساب النتيجة', 'Compte de résultat')} icon={<FileText />} />
          <div className="grid gap-x-10 gap-y-2 p-5 text-sm md:grid-cols-2">
            <PL label={t('رقم المعاملات', "Chiffre d'affaires")} v={d.revenue} />
            <PL label={t('− الإرجاعات', '− Retours')} v={-d.refunds} />
            <PL label={t('+ مبيعات الأونلاين المدفوعة (متجر وخدمات)', '+ Ventes en ligne payées')} v={d.online_revenue ?? 0} />
            <PL label={t('− ثمن شراء السلع المبيعة', '− Coût des ventes')} v={-((d.cogs ?? 0) + (d.online_cogs ?? 0))} />
            <PL label={t('= الربح الإجمالي', '= Marge brute')} v={d.gross_profit ?? 0} bold />
            <PL label={t('− المصاريف', '− Dépenses')} v={-(d.expenses ?? 0)} />
            <PL label={t('− الرواتب المدفوعة', '− Salaires payés')} v={-(d.salaries ?? 0)} />
            <PL label={t('+ عمولات رياض', '+ Commissions Riyad')} v={d.riyad_commissions ?? 0} />
            <PL label={t('= الربح الصافي', '= Bénéfice net')} v={d.net_profit ?? 0} bold big />
          </div>
        </Card>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('المبيعات اليومية', 'Ventes par jour')} />
          <div className="h-64 p-4" dir="ltr">
            {r.isLoading ? (
              <Skeleton className="size-full" />
            ) : (
              <ResponsiveContainer>
                <BarChart data={(d?.by_day ?? []).map((x) => ({ day: format(new Date(x.day), 'dd/MM'), revenue: x.revenue / 100 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                  <RTooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v) => [`${Number(v).toFixed(2)} DH`, t('المبيعات', 'Ventes')]} />
                  <Bar dataKey="revenue" fill="#FF6B35" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title={t('حسب الفئة', 'Par catégorie')} />
          <div className="p-4">
            <div className="mx-auto size-40" dir="ltr">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={d?.by_category ?? []} dataKey="revenue" innerRadius={44} outerRadius={72} paddingAngle={2}>
                    {(d?.by_category ?? []).map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-1.5">
              {(d?.by_category ?? []).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="flex-1 truncate">{pick(c, 'name')}</span>
                  <span className="num font-semibold">{money(c.revenue)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={t('الأكثر مبيعاً', 'Meilleures ventes')} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted">
                  <th className="px-5 py-2.5 text-start">{t('المنتج / الخدمة', 'Article')}</th>
                  <th className="px-3 py-2.5 text-end">{t('الكمية', 'Qté')}</th>
                  <th className="px-3 py-2.5 text-end">{t('المبيعات', 'CA')}</th>
                  {profit && <th className="px-5 py-2.5 text-end">{t('الربح', 'Marge')}</th>}
                </tr>
              </thead>
              <tbody>
                {(d?.top_items ?? []).map((i, k) => (
                  <tr key={k} className="border-b border-border last:border-0">
                    <td className="px-5 py-2.5">{pick(i, 'name')}</td>
                    <td className="num px-3 py-2.5 text-end">{qty(i.qty)}</td>
                    <td className="num px-3 py-2.5 text-end font-semibold">{money(i.revenue)}</td>
                    {profit && <td className={cn('num px-5 py-2.5 text-end', (i.profit ?? 0) < 0 && 'text-danger')}>{money(i.profit)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('طرق الأداء', 'Paiements')} />
            <div className="space-y-2 p-5 text-sm">
              <PL label={t('نقداً', 'Espèces')} v={d?.payments.cash ?? 0} />
              <PL label={t('بطاقة', 'Carte')} v={d?.payments.card ?? 0} />
              <PL label={t('بالدين', 'Crédit')} v={d?.payments.credit ?? 0} />
              <PL label={t('التخفيضات', 'Remises')} v={d?.discounts ?? 0} />
              <PL label={t('الضريبة المحصلة', 'TVA collectée')} v={d?.tax ?? 0} />
            </div>
          </Card>
          <Card>
            <CardHeader title={t('الوضعية الحالية', 'Situation actuelle')} />
            <div className="space-y-2 p-5 text-sm">
              <Row icon={<HandCoins className="text-danger" />} label={t('ديون الزبائن', 'Crédits clients')} v={d?.debts_total} />
              <Row icon={<Truck className="text-warning" />} label={t('ما عليك للموردين', 'Dû fournisseurs')} v={d?.suppliers_total} />
              {d?.riyad_balance !== null && <Row icon={<Wallet className="text-success" />} label={t('رصيد رياض', 'Solde Riyad')} v={d?.riyad_balance ?? 0} />}
              <Row icon={<Receipt className="text-info" />} label={t('فروقات الصندوق', 'Écarts de caisse')} v={d?.shifts.difference} />
            </div>
          </Card>
        </div>
      </div>

      {(handItems.data?.length ?? 0) > 0 && (
        <Card className="mt-4">
          <CardHeader title={t('مبيعات يدوية (غير موجودة في القائمة)', 'Articles vendus hors catalogue')} description={t('ما يتكرر هنا أضفه إلى المنتجات أو الخدمات ليصبح البيع أسرع وتُحسب أرباحه', 'Ajoutez au catalogue ce qui revient souvent')} />
          <div className="divide-y divide-border">
            {handItems.data!.slice(0, 15).map((c) => (
              <div key={c.name} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                <span className="num text-muted">× {qty(c.qty)}</span>
                <span className="num text-xs text-muted">{t('متوسط', 'moy.')} {money(c.avg_price)}</span>
                <span className="num w-28 text-end font-semibold">{money(c.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader title={t('الأونلاين', 'En ligne')} description={t('المبالغ المدفوعة من طلبات الموقع خلال الفترة', 'Montants payés via le site')} />
        <div className="grid gap-4 p-5 md:grid-cols-[1fr_1fr_2fr]">
          <div className="rounded-xl bg-surface-2 p-4">
            <div className="text-xs text-muted">{t('طلبات المتجر', 'Commandes')} · <span className="num">{online.data?.orders_count ?? 0}</span></div>
            <div className="num mt-1 text-xl font-bold">{money(online.data?.orders_paid)}</div>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <div className="text-xs text-muted">{t('طلبات الخدمات', 'Demandes')} · <span className="num">{online.data?.requests_count ?? 0}</span></div>
            <div className="num mt-1 text-xl font-bold">{money(online.data?.requests_paid)}</div>
          </div>
          <div className="space-y-1.5 text-sm">
            {(online.data?.by_service ?? []).slice(0, 6).map((x, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="truncate">{pick(x, 'name')} <span className="num text-muted">× {x.count}</span></span>
                <span className="num font-semibold">{money(x.paid)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title={t('حسب الموظف', 'Par employé')} />
          <div className="divide-y divide-border">
            {(d?.by_employee ?? []).map((e) => (
              <div key={e.full_name} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: e.color }} />
                <span className="flex-1">{e.full_name}</span>
                <span className="num text-muted">{e.count}</span>
                <span className="num w-28 text-end font-semibold">{money(e.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
        {profit && (
          <Card>
            <CardHeader title={t('المصاريف حسب الفئة', 'Dépenses par catégorie')} />
            <div className="divide-y divide-border">
              {(d?.expenses_by_category ?? []).map((e, i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: e.color }} />
                  <span className="flex-1">{pick(e, 'name')}</span>
                  <span className="num font-semibold">{money(e.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}

function PL({ label, v, bold, big }: { label: string; v: number; bold?: boolean; big?: boolean }) {
  return (
    <div className={cn('flex justify-between', bold && 'border-t border-border pt-2 font-bold', big && 'text-lg')}>
      <span className={bold ? '' : 'text-muted'}>{label}</span>
      <span className={cn('num', v < 0 && 'text-danger', big && v > 0 && 'text-success')}>{money(v)}</span>
    </div>
  )
}

function Row({ icon, label, v }: { icon: React.ReactNode; label: string; v?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="[&_svg]:size-4">{icon}</span>
      <span className="flex-1 text-muted">{label}</span>
      <span className="num font-semibold">{money(v)}</span>
    </div>
  )
}
