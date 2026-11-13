import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, Banknote, CreditCard, HandCoins, LayoutDashboard, Percent, Receipt, ShoppingBag, TrendingUp, Trophy, Truck, Wallet } from 'lucide-react'
import { addDays, format, startOfDay } from 'date-fns'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money, qty } from '@/shared/lib/money'
import { Avatar, Card, CardHeader, Skeleton } from '@/shared/ui/primitives'
import { TodayTasks } from '../TodayTasks'
import { LaunchChecklist } from '../LaunchChecklist'
import { MorningBrief } from '../MorningBrief'
import { SystemHealthCard } from '../SystemHealth'
import { DailyReportButton } from '../DailyReport'
import { EmptyState, PageHeader, StatCard, Tabs } from '@/shared/ui/data'

type Summary = {
  sales_count: number
  revenue: number
  cash: number
  card: number
  discounts: number
  tax: number
  avg_ticket: number
  gross_profit?: number
  by_day: { day: string; revenue: number; count: number }[]
  by_hour?: { hour: number; revenue: number; count: number }[]
  top_items: { name_ar: string; name_fr: string; qty: number; revenue: number }[]
  by_employee: { full_name: string; color: string; count: number; revenue: number }[]
  low_stock: { id: string; name_ar: string; name_fr: string; variant_ar: string | null; stock_qty: number; low_stock_alert: number }[]
}

const RANGES = { today: 1, week: 7, month: 30 } as const

export function DashboardPage() {
  const { sb, me, can } = useAuth()
  const { t, pick } = useLang()
  const [range, setRange] = useState<keyof typeof RANGES>('today')

  const { from, to, prevFrom } = useMemo(() => {
    const days = RANGES[range]
    const to = addDays(startOfDay(new Date()), 1)
    const from = addDays(to, -days)
    return { from, to, prevFrom: addDays(from, -days) }
  }, [range])

  const load = (f: Date, tt: () => Date) => async () => {
    const { data, error } = await sb.rpc('dashboard_summary', { p_from: f.toISOString(), p_to: tt().toISOString() })
    if (error) throw error
    return data as Summary
  }

  const canSales = can('reports.sales')
  const today = range === 'today'
  const cur = useQuery({ queryKey: ['dash', range], queryFn: load(from, () => to), enabled: canSales, refetchInterval: 60_000 })
  // «اليوم» is weighed against yesterday until the same time, not against the whole of yesterday
  const prev = useQuery({ queryKey: ['dash-prev', range], queryFn: load(prevFrom, () => (today ? addDays(new Date(), -1) : from)), enabled: canSales, refetchInterval: today ? 60_000 : false })

  const extras = useQuery({
    queryKey: ['dash-extras'],
    refetchInterval: 60_000,
    queryFn: async () =>
      (await sb.rpc('dashboard_extras')).data as {
        debts_total: number
        debtors: number
        suppliers_total: number | null
        riyad_balance: number | null
        riyad_low: number
        open_shifts: { id: string; employee_name: string; color: string; opened_at: string; device_name: string | null; drawer: number | null }[]
      },
  })
  const x = extras.data

  const delta = (a?: number, b?: number) => (a === undefined || !b ? null : ((a - b) / b) * 100)
  const s = cur.data

  const hour = new Date().getHours()
  const greet = hour < 12 ? t('صباح الخير', 'Bonjour') : hour < 18 ? t('مساء الخير', 'Bon après-midi') : t('مساء النور', 'Bonsoir')

  if (!canSales)
    return (
      <>
        <PageHeader icon={<LayoutDashboard />} title={`${greet}، ${me?.full_name ?? ''}`} />
        <TodayTasks />
        <EmptyState title={t('مرحباً بك', 'Bienvenue')} description={t('استعمل القائمة للوصول إلى الأقسام المسموح لك بها', 'Utilisez le menu pour accéder à vos sections')} />
      </>
    )

  return (
    <>
      <PageHeader
        icon={<LayoutDashboard />}
        title={`${greet}، ${me?.full_name.split(' ')[0] ?? ''} 👋`}
        description={t('هذه نظرة سريعة على نشاط المكتبة', 'Voici un aperçu de l’activité')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <DailyReportButton />
          <Tabs
            value={range}
            onChange={(v) => setRange(v as keyof typeof RANGES)}
            items={[
              { value: 'today', label: t('اليوم', "Aujourd'hui") },
              { value: 'week', label: t('7 أيام', '7 jours') },
              { value: 'month', label: t('30 يوماً', '30 jours') },
            ]}
          />
          </div>
        }
      />

      <MorningBrief />
      <SystemHealthCard />
      <LaunchChecklist />
      <TodayTasks />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} loading={cur.isLoading} label={t('رقم المعاملات', "Chiffre d'affaires")} value={money(s?.revenue)} icon={<TrendingUp />} delta={delta(s?.revenue, prev.data?.revenue)} hint={today ? t('مقارنة بأمس في نفس الوقت', 'vs hier à la même heure') : t('مقارنة بالفترة السابقة', 'vs période précédente')} />
        <StatCard index={1} loading={cur.isLoading} tone="navy" label={t('عدد المبيعات', 'Nombre de ventes')} value={s?.sales_count ?? 0} icon={<Receipt />} delta={delta(s?.sales_count, prev.data?.sales_count)} />
        <StatCard index={2} loading={cur.isLoading} tone="info" label={t('متوسط السلة', 'Panier moyen')} value={money(s?.avg_ticket)} icon={<ShoppingBag />} />
        {can('reports.profit') ? (
          <StatCard index={3} loading={cur.isLoading} tone="success" label={t('الربح الإجمالي', 'Marge brute')} value={money(s?.gross_profit)} icon={<Percent />} delta={delta(s?.gross_profit, prev.data?.gross_profit)} />
        ) : (
          <StatCard index={3} loading={cur.isLoading} tone="warning" label={t('التخفيضات', 'Remises')} value={money(s?.discounts)} icon={<Percent />} />
        )}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={4} tone="danger" label={t('ديون الزبائن', 'Crédits clients')} value={money(x?.debts_total)} icon={<HandCoins />} loading={extras.isLoading} hint={x ? `${x.debtors} ${t('زبون', 'clients')}` : undefined} />
        {x?.riyad_balance !== null && x?.riyad_balance !== undefined ? (
          <StatCard index={5} tone={x.riyad_balance < x.riyad_low ? 'danger' : 'success'} label={t('رصيد رياض', 'Solde Riyad')} value={money(x.riyad_balance)} icon={<Wallet />} hint={x.riyad_balance < x.riyad_low ? t('⚠️ منخفض', '⚠️ Bas') : undefined} />
        ) : (
          <StatCard index={5} tone="info" label={t('بطاقة بنكية', 'Carte')} value={money(s?.card)} icon={<CreditCard />} loading={cur.isLoading} />
        )}
        {x?.suppliers_total !== null && x?.suppliers_total !== undefined ? (
          <StatCard index={6} tone="warning" label={t('ما عليك للموردين', 'Dû fournisseurs')} value={money(x.suppliers_total)} icon={<Truck />} />
        ) : (
          <StatCard index={6} tone="warning" label={t('التخفيضات', 'Remises')} value={money(s?.discounts)} icon={<Percent />} loading={cur.isLoading} />
        )}
        <Card className="p-5">
          <div className="text-sm text-muted">{t('الورديات المفتوحة الآن', 'Caisses ouvertes')}</div>
          {!x?.open_shifts.length ? (
            <div className="mt-3 text-sm text-subtle">{t('لا توجد وردية مفتوحة', 'Aucune caisse ouverte')}</div>
          ) : (
            <div className="mt-2 space-y-2">
              {x.open_shifts.map((o) => (
                <div key={o.id} className="flex items-center gap-2 text-sm">
                  <span className="relative flex size-2.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
                    <span className="relative inline-flex size-2.5 rounded-full bg-success" />
                  </span>
                  <span className="flex-1 truncate font-medium">{o.employee_name}</span>
                  {o.drawer !== null && <span className="num text-xs font-semibold">{money(o.drawer)}</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SalesTrendCard range={range} cur={s} prev={prev.data} loading={cur.isLoading} to={to} />

        <Card>
          <CardHeader title={t('طرق الأداء', 'Modes de paiement')} icon={<Banknote />} />
          <div className="space-y-4 p-5">
            {[
              { label: t('نقداً', 'Espèces'), value: s?.cash ?? 0, icon: <Banknote className="size-4" />, color: '#16A34A' },
              { label: t('بطاقة بنكية', 'Carte bancaire'), value: s?.card ?? 0, icon: <CreditCard className="size-4" />, color: '#2563EB' },
            ].map((m) => {
              const pct = s?.revenue ? (m.value / s.revenue) * 100 : 0
              return (
                <div key={m.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted">
                      <span style={{ color: m.color }}>{m.icon}</span>
                      {m.label}
                    </span>
                    <span className="num font-semibold">{money(m.value)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: m.color }} />
                  </div>
                </div>
              )
            })}
            <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
              <div>
                <div className="text-muted">{t('الضريبة المحصلة', 'TVA collectée')}</div>
                <div className="num mt-0.5 font-semibold">{money(s?.tax)}</div>
              </div>
              <div>
                <div className="text-muted">{t('التخفيضات', 'Remises')}</div>
                <div className="num mt-0.5 font-semibold">{money(s?.discounts)}</div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('الأكثر مبيعاً', 'Meilleures ventes')} icon={<Trophy />} />
          <div className="divide-y divide-border">
            {(s?.top_items ?? []).length === 0 && !cur.isLoading && <EmptyState className="py-8" title={t('لا مبيعات بعد', 'Aucune vente')} />}
            {(s?.top_items ?? []).map((it, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="num flex size-7 items-center justify-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{pick(it, 'name')}</div>
                  <div className="num text-xs text-muted">× {qty(it.qty)}</div>
                </div>
                <div className="num text-sm font-semibold">{money(it.revenue)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('أداء الموظفين', 'Performance des employés')} icon={<Trophy />} />
          <div className="divide-y divide-border">
            {(s?.by_employee ?? []).length === 0 && !cur.isLoading && <EmptyState className="py-8" title={t('لا مبيعات بعد', 'Aucune vente')} />}
            {(s?.by_employee ?? []).map((e) => (
              <div key={e.full_name} className="flex items-center gap-3 px-5 py-3">
                <Avatar name={e.full_name} color={e.color} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{e.full_name}</div>
                  <div className="num text-xs text-muted">
                    {e.count} {t('بيع', 'ventes')}
                  </div>
                </div>
                <div className="num text-sm font-semibold">{money(e.revenue)}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={t('قريب من النفاد', 'Stock faible')} icon={<AlertTriangle />} />
          <div className="divide-y divide-border">
            {(s?.low_stock ?? []).length === 0 && !cur.isLoading && <EmptyState className="py-8" title={t('المخزون جيد 👌', 'Stock OK 👌')} />}
            {(s?.low_stock ?? []).map((p, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {pick(p, 'name')}
                    {p.variant_ar ? ` — ${p.variant_ar}` : ''}
                  </div>
                  <div className="num text-xs text-muted">
                    {t('حد التنبيه', 'Seuil')}: {qty(p.low_stock_alert)}
                  </div>
                </div>
                <span className={`num rounded-full px-2.5 py-0.5 text-xs font-bold ${p.stock_qty <= 0 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>{qty(p.stock_qty)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}

/** Sales of the period: «اليوم» hour by hour, otherwise day by day, with the same slots of the period before as a dashed line. */
export function SalesTrendCard({ range, cur, prev, loading, to }: { range: keyof typeof RANGES; cur?: Summary; prev?: Summary; loading: boolean; to: Date }) {
  const { t } = useLang()
  const today = range === 'today'
  const chart = useMemo(() => {
    if (today) {
      const curBy = new Map((cur?.by_hour ?? []).map((h) => [h.hour, h]))
      const prevBy = new Map((prev?.by_hour ?? []).map((h) => [h.hour, h]))
      const seen = [...curBy.keys(), ...prevBy.keys()]
      // the shop's usual hours, widened to any hour with sales and to the current hour
      const first = Math.min(9, ...seen)
      const last = Math.max(17, new Date().getHours(), ...seen)
      return Array.from({ length: last - first + 1 }, (_, i) => {
        const h = first + i
        return { label: `${String(h).padStart(2, '0')}:00`, revenue: (curBy.get(h)?.revenue ?? 0) / 100, count: curBy.get(h)?.count ?? 0, prev: (prevBy.get(h)?.revenue ?? 0) / 100 }
      })
    }
    const days = RANGES[range]
    const curBy = new Map((cur?.by_day ?? []).map((d) => [d.day, d]))
    const prevBy = new Map((prev?.by_day ?? []).map((d) => [d.day, d]))
    return Array.from({ length: days }, (_, i) => {
      const d = addDays(to, i - days)
      const c = curBy.get(format(d, 'yyyy-MM-dd'))
      return { label: format(d, 'dd/MM'), revenue: (c?.revenue ?? 0) / 100, count: c?.count ?? 0, prev: (prevBy.get(format(addDays(d, -days), 'yyyy-MM-dd'))?.revenue ?? 0) / 100 }
    })
  }, [cur, prev, range, today, to])
  const peak = chart.reduce<(typeof chart)[number] | null>((a, c) => (c.revenue > (a?.revenue ?? 0) ? c : a), null)
  // round y ticks: steps of 1, 2 or 5 × 10ⁿ, at most five above zero; thousands as «K» on the whole axis once it reaches 10 000
  const top = Math.max(100, ...chart.flatMap((c) => [c.revenue, c.prev]))
  const unit = 10 ** Math.floor(Math.log10(top / 5))
  const step = [1, 2, 5, 10].map((m) => m * unit).find((st) => top / st <= 5)!
  const ticks = Array.from({ length: Math.ceil(top / step) + 1 }, (_, i) => i * step)
  const compact = ticks[ticks.length - 1] >= 10_000
  const curName = today ? t('اليوم', "Aujourd'hui") : t('هذه الفترة', 'Cette période')
  const prevName = today ? t('أمس', 'Hier') : t('الفترة السابقة', 'Période précédente')

  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title={today ? t('مبيعات اليوم ساعة بساعة', 'Ventes du jour, heure par heure') : t('تطور المبيعات', 'Évolution des ventes')}
        description={today ? t('بالدرهم، مقارنة بأمس في نفس الساعات', 'En DH, comparé à hier aux mêmes heures') : t('رقم المعاملات اليومي بالدرهم، مقارنة بالفترة السابقة', 'CA journalier (DH), comparé à la période précédente')}
        icon={<TrendingUp />}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={today ? 'size-2.5 rounded-sm bg-[#FF6B35]' : 'w-4 border-t-2 border-[#FF6B35]'} />
          {curName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-[#64748b]" />
          {prevName}
        </span>
        {peak && (
          <span className="ms-auto">
            {today ? t('أنشط ساعة', 'Heure la plus active') : t('أفضل يوم', 'Meilleur jour')}: <b className="num text-text">{peak.label}</b> · <span className="num">{money(Math.round(peak.revenue * 100))}</span> ({peak.count} {t('بيع', 'ventes')})
          </span>
        )}
      </div>
      <div className="h-72 p-4" dir="ltr">
        {loading ? (
          <Skeleton className="size-full" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#FF6B35" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} domain={[0, ticks[ticks.length - 1]]} ticks={ticks} tickFormatter={(v: number) => (compact && v ? `${v / 1000}K` : String(v))} />
              <RTooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' }}
                labelStyle={{ color: 'var(--muted)' }}
                itemStyle={{ color: 'var(--text)' }}
                itemSorter={(item) => (item.dataKey === 'revenue' ? 0 : 1)}
                formatter={(v, name) => [money(Math.round(Number(v) * 100)), name]}
              />
              {today ? (
                <Bar dataKey="revenue" name={curName} fill="#FF6B35" maxBarSize={24} radius={[4, 4, 0, 0]} animationDuration={900} />
              ) : (
                <Area type="monotone" dataKey="revenue" name={curName} stroke="#FF6B35" strokeWidth={2} fill="url(#rev)" animationDuration={900} />
              )}
              <Line type="monotone" dataKey="prev" name={prevName} stroke="#64748b" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" dot={false} activeDot={{ r: 4 }} animationDuration={900} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
