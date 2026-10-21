import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { AlarmClock, Award, Layers } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Avatar, Badge, Card, CardHeader, Skeleton } from '@/shared/ui/primitives'

export const SECTIONS: Record<string, { ar: string; fr: string; color: string }> = {
  library: { ar: 'المكتبة (المنتجات)', fr: 'Librairie (produits)', color: '#FF6B35' },
  counter: { ar: 'الطباعة والنسخ', fr: 'Impression & copies', color: '#0F172A' },
  admin: { ar: 'الخدمات الإدارية', fr: 'Services administratifs', color: '#2563EB' },
  riyad: { ar: 'رياض (رسوم + عمولات)', fr: 'Riyad (frais + commissions)', color: '#16A34A' },
  shop: { ar: 'المتجر الأونلاين', fr: 'Boutique en ligne', color: '#7C3AED' },
  custom: { ar: 'مبيعات يدوية', fr: 'Articles libres', color: '#94A3B8' },
}

type Sections = {
  sections: { section: string; revenue: number; cost: number | null; profit: number | null }[]
  by_month: { month: string; sections: Record<string, number> }[]
}

type Range = { from: Date; to: Date }
const iso = (r: Range) => ({ p_from: r.from.toISOString(), p_to: r.to.toISOString() })

/** 31 · Revenue and profit of each business line. */
export function SectionsCard({ range }: { range: Range }) {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const profit = can('reports.profit')
  const q = useQuery({
    queryKey: ['report-sections', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => {
      const { data, error } = await sb.rpc('report_sections', iso(range))
      if (error) throw error
      return data as Sections
    },
  })
  const rows = q.data?.sections ?? []
  const total = rows.reduce((a, r) => a + r.revenue, 0)
  const months = q.data?.by_month ?? []
  const keys = Object.keys(SECTIONS).filter((k) => months.some((m) => m.sections[k]))

  return (
    <Card className="mt-4">
      <CardHeader title={t('ربحية كل قسم', 'Rentabilité par activité')} description={t('أين تربح أكثر: المكتبة، الخدمات، الطباعة، رياض، الأونلاين', 'Où vous gagnez le plus')} icon={<Layers />} />
      <div className="grid gap-5 p-5 xl:grid-cols-2">
        <div className="space-y-3">
          {q.isLoading && <Skeleton className="h-40" />}
          {!q.isLoading && !rows.length && <div className="py-8 text-center text-sm text-muted">{t('لا توجد مبيعات في هذه الفترة', 'Aucune vente sur la période')}</div>}
          {rows.map((r) => {
            const s = SECTIONS[r.section] ?? { ar: r.section, fr: r.section, color: '#475569' }
            const share = total > 0 ? (r.revenue / total) * 100 : 0
            const margin = r.revenue > 0 && r.profit !== null ? (r.profit / r.revenue) * 100 : null
            return (
              <div key={r.section}>
                <div className="mb-1 flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="flex-1 font-medium">{t(s.ar, s.fr)}</span>
                  <span className="num text-xs text-muted">{share.toFixed(0)}%</span>
                  <span className="num w-28 text-end font-semibold">{money(r.revenue)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(share, 1)}%`, background: s.color }} />
                </div>
                {profit && r.profit !== null && (
                  <div className="num mt-1 flex justify-end gap-3 text-xs text-muted">
                    {r.cost ? <span>{t('التكلفة', 'Coût')} {money(r.cost)}</span> : null}
                    <span className={cn('font-medium', r.profit < 0 ? 'text-danger' : 'text-success')}>
                      {t('الربح', 'Marge')} {money(r.profit)}
                      {margin !== null && ` · ${margin.toFixed(0)}%`}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
          {profit && rows.length > 0 && <p className="text-xs text-subtle">{t('الربح هنا قبل المصاريف العامة والرواتب. الخدمات بلا ثمن شراء فربحها يساوي مداخيلها.', 'Marge avant charges et salaires.')}</p>}
        </div>
        {months.length > 1 ? (
          <div className="h-72" dir="ltr">
            <ResponsiveContainer>
              <BarChart data={months.map((m) => ({ m: format(new Date(m.month), 'MM/yy'), ...Object.fromEntries(keys.map((k) => [k, (m.sections[k] ?? 0) / 100])) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="m" tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--muted)', fontSize: 12 }} axisLine={false} tickLine={false} width={56} />
                <RTooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }} formatter={(v, k) => [`${Number(v).toFixed(2)} DH`, t(SECTIONS[String(k)]?.ar ?? '', SECTIONS[String(k)]?.fr ?? '')]} />
                <Legend formatter={(k) => <span className="text-xs">{t(SECTIONS[k]?.ar ?? k, SECTIONS[k]?.fr ?? k)}</span>} />
                {keys.map((k) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={SECTIONS[k].color} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex items-center justify-center rounded-xl bg-surface-2 p-6 text-center text-sm text-muted">{t('اختر فترة أطول من شهر (مثلاً «هذه السنة») لترى الرسم الشهري لكل قسم.', 'Choisissez une période de plusieurs mois pour voir l’évolution.')}</div>
        )}
      </div>
    </Card>
  )
}

type Duration = { name_ar: string; name_fr: string; target_hours: number | null; count: number; done: number; avg_hours: number | null; late: number }

const hrs = (h: number | null, t: (a: string, f: string) => string) =>
  h === null ? '—' : h < 1 ? `${Math.round(h * 60)} ${t('د', 'min')}` : h < 48 ? `${h} ${t('س', 'h')}` : `${(h / 24).toFixed(1)} ${t('يوم', 'j')}`

/** 20 · How long each service really takes. */
export function DurationsCard({ range }: { range: Range }) {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const q = useQuery({
    queryKey: ['service-durations', range.from.toISOString(), range.to.toISOString()],
    queryFn: async () => (await sb.rpc('service_durations', iso(range))).data as Duration[],
  })
  if (!q.data?.length) return null
  return (
    <Card className="mt-4">
      <CardHeader title={t('مدة إنجاز الخدمات', 'Délais de traitement')} description={t('من وصول الطلب إلى أن يصبح جاهزاً', 'De la réception à « Prêt »')} icon={<AlarmClock />} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-5 py-2.5 text-start">{t('الخدمة', 'Service')}</th>
              <th className="px-3 py-2.5 text-end">{t('الطلبات', 'Demandes')}</th>
              <th className="px-3 py-2.5 text-end">{t('المستهدف', 'Cible')}</th>
              <th className="px-3 py-2.5 text-end">{t('المتوسط الفعلي', 'Moyenne réelle')}</th>
              <th className="px-5 py-2.5 text-end">{t('متأخرة', 'En retard')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((d, i) => {
              const slow = d.target_hours !== null && d.avg_hours !== null && d.avg_hours > d.target_hours
              return (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-5 py-2.5">{pick(d, 'name')}</td>
                  <td className="num px-3 py-2.5 text-end">
                    {d.done}/{d.count}
                  </td>
                  <td className="num px-3 py-2.5 text-end text-muted">{hrs(d.target_hours, t)}</td>
                  <td className={cn('num px-3 py-2.5 text-end font-semibold', slow && 'text-danger')}>{hrs(d.avg_hours, t)}</td>
                  <td className="px-5 py-2.5 text-end">{d.late > 0 ? <Badge tone="danger">{d.late}</Badge> : <span className="text-subtle">0</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

type Perf = {
  employee_id: string
  full_name: string
  color: string
  sales_count: number
  revenue: number
  discounts: number
  voids: number
  refunds: number
  custom_items: number
  requests_done: number
  requests_avg_hours: number | null
  shifts: number
  cash_difference: number
  cash_difference_abs: number
  hours: number
  days: number
}

/** 33 · Employee performance, to set bonuses fairly. */
export function PerformanceCard({ range }: { range: Range }) {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const q = useQuery({
    queryKey: ['employee-performance', range.from.toISOString(), range.to.toISOString()],
    enabled: can('reports.employees'),
    queryFn: async () => (await sb.rpc('employee_performance', iso(range))).data as Perf[],
  })
  if (!can('reports.employees') || !q.data?.length) return null
  const best = Math.max(...q.data.map((p) => p.revenue))
  return (
    <Card className="mt-4">
      <CardHeader title={t('أداء الموظفين', 'Performance des employés')} description={t('مبيعات، طلبات منجزة، دقة الصندوق، وساعات العمل — لحساب المكافآت بعدل', 'Ventes, demandes, caisse et heures — pour des primes justes')} icon={<Award />} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="px-5 py-2.5 text-start">{t('الموظف', 'Employé')}</th>
              <th className="px-3 py-2.5 text-end">{t('المبيعات', 'Ventes')}</th>
              <th className="px-3 py-2.5 text-end">{t('متوسط الوصل', 'Panier moyen')}</th>
              <th className="px-3 py-2.5 text-end">{t('طلبات منجزة', 'Demandes')}</th>
              <th className="px-3 py-2.5 text-end">{t('فرق الصندوق', 'Écart caisse')}</th>
              <th className="px-3 py-2.5 text-end">{t('إلغاء / إرجاع', 'Annul. / retours')}</th>
              <th className="px-3 py-2.5 text-end">{t('التخفيضات', 'Remises')}</th>
              <th className="px-5 py-2.5 text-end">{t('الحضور', 'Présence')}</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((p) => (
              <tr key={p.employee_id} className="border-b border-border last:border-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={p.full_name} color={p.color} size={30} />
                    <span className="font-medium">{p.full_name}</span>
                    {p.revenue === best && best > 0 && q.data.length > 1 && <Award className="size-4 text-brand" />}
                  </div>
                </td>
                <td className="px-3 py-3 text-end">
                  <div className="num font-semibold">{money(p.revenue)}</div>
                  <div className="num text-xs text-muted">{p.sales_count} {t('وصل', 'tickets')}</div>
                </td>
                <td className="num px-3 py-3 text-end">{p.sales_count ? money(Math.round(p.revenue / p.sales_count)) : '—'}</td>
                <td className="px-3 py-3 text-end">
                  <div className="num font-semibold">{p.requests_done}</div>
                  {p.requests_avg_hours !== null && <div className="num text-xs text-muted">≈ {hrs(p.requests_avg_hours, t)}</div>}
                </td>
                <td className="px-3 py-3 text-end">
                  <div className={cn('num font-semibold', p.cash_difference < 0 ? 'text-danger' : p.cash_difference > 0 ? 'text-warning' : 'text-success')}>{money(p.cash_difference)}</div>
                  <div className="num text-xs text-muted">
                    {p.shifts} {t('وردية', 'caisses')}
                  </div>
                </td>
                <td className="num px-3 py-3 text-end">
                  <span className={cn(p.voids > 0 && 'text-danger')}>{p.voids}</span> / <span className={cn(p.refunds > 0 && 'text-warning')}>{p.refunds}</span>
                </td>
                <td className="num px-3 py-3 text-end">{money(p.discounts)}</td>
                <td className="px-5 py-3 text-end">
                  <div className="num font-semibold">
                    {p.hours} {t('س', 'h')}
                  </div>
                  <div className="num text-xs text-muted">
                    {p.days} {t('يوم', 'j')}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-5 pb-4 text-xs text-subtle">{t('فرق الصندوق: موجب = زيادة في الدرج، سالب = نقص. الساعات تُحسب من تسجيل الحضور في نقطة البيع.', 'Écart : positif = excédent, négatif = manque. Heures issues du pointage POS.')}</p>
    </Card>
  )
}

type Blockers = { open: number; by_reason: Record<string, number>; by_service: { name_ar: string; name_fr: string; n: number }[] }
const REASONS: Record<string, [string, string]> = {
  portal_down: ['البوابة لا تعمل', 'Portail en panne'],
  missing_info: ['نقص من الزبون', 'Info manquante'],
  rejected: ['رفض الإدارة', 'Refus'],
  payment: ['مشكل أداء', 'Paiement'],
  dont_know: ['لا أعرف الطريقة', 'Ne sait pas'],
  other: ['أخرى', 'Autre'],
}

/** 6 · Where the team gets stuck, to improve the guides. */
export function BlockersCard({ range }: { range: Range }) {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const q = useQuery({ queryKey: ['blockers', range.from.toISOString(), range.to.toISOString()], queryFn: async () => (await sb.rpc('blockers_report', iso(range))).data as Blockers })
  const d = q.data
  if (!d || (!d.by_service.length && !d.open)) return null
  return (
    <Card className="mt-4">
      <CardHeader title={t('التعثّرات في إنجاز الطلبات', 'Blocages sur les demandes')} description={t('الخدمات التي تحتاج دليلاً أوضح أو حلاً', 'Services dont le guide est à améliorer')} icon={<AlarmClock />} />
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div className="space-y-1.5 text-sm">
          {d.by_service.map((s) => (
            <div key={s.name_ar} className="flex justify-between gap-3">
              <span className="truncate">{pick(s, 'name')}</span>
              <Badge tone="danger">{s.n}</Badge>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 text-sm">
          {Object.entries(d.by_reason).map(([k, n]) => (
            <div key={k} className="flex justify-between gap-3">
              <span className="text-muted">{t(...(REASONS[k] ?? [k, k]))}</span>
              <span className="num font-semibold">{n}</span>
            </div>
          ))}
          <div className="pt-2 text-xs text-muted">{t('متعثّرة الآن', 'Bloquées actuellement')}: <span className="num font-semibold text-danger">{d.open}</span></div>
        </div>
      </div>
    </Card>
  )
}
