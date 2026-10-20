import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { AlertTriangle, Banknote, ClipboardList, Database, FileWarning, HandCoins, Package, PartyPopper, ShoppingCart, Wallet, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { Card } from '@/shared/ui/primitives'

type Tasks = {
  requests_new: number | null
  requests_docs: number | null
  requests_ready_unpaid: number | null
  proofs: number | null
  orders_new: number | null
  orders_open: number | null
  low_stock: number | null
  debts_overdue: number | null
  riyad_low: boolean | null
  backup_days: number | null
}

export function TodayTasks() {
  const { sb, can, me } = useAuth()
  const { t } = useLang()

  // Recurring expenses (rent, electricity…) are created when someone opens the dashboard.
  useEffect(() => {
    if (can('expenses.manage')) sb.rpc('generate_recurring_expenses').then(() => {})
  }, [sb, can])

  const q = useQuery({ queryKey: ['today-tasks'], refetchInterval: 60_000, queryFn: async () => (await sb.rpc('today_tasks')).data as Tasks })
  const d = q.data
  if (!d) return null

  const items: { n: number; ar: string; fr: string; to: string; icon: LucideIcon; tone: string }[] = [
    { n: d.requests_new ?? 0, ar: 'طلبات خدمات جديدة', fr: 'Nouvelles demandes', to: '/requests', icon: ClipboardList, tone: '#2563EB' },
    { n: d.requests_docs ?? 0, ar: 'طلبات فيها وثائق جديدة', fr: 'Nouveaux documents', to: '/requests', icon: FileWarning, tone: '#DC2626' },
    { n: d.proofs ?? 0, ar: 'وصولات تحويل للتأكيد', fr: 'Virements à confirmer', to: '/requests', icon: Banknote, tone: '#D97706' },
    { n: d.requests_ready_unpaid ?? 0, ar: 'وثائق جاهزة غير مدفوعة', fr: 'Prêtes non payées', to: '/requests', icon: HandCoins, tone: '#D97706' },
    { n: d.orders_new ?? 0, ar: 'طلبات متجر جديدة', fr: 'Nouvelles commandes', to: '/orders', icon: ShoppingCart, tone: '#7C3AED' },
    { n: d.orders_open ?? 0, ar: 'طلبات متجر قيد الإنجاز', fr: 'Commandes en cours', to: '/orders', icon: ShoppingCart, tone: '#0891B2' },
    { n: d.low_stock ?? 0, ar: 'منتجات قريبة من النفاد', fr: 'Stock faible', to: '/products', icon: Package, tone: '#D97706' },
    { n: d.debts_overdue ?? 0, ar: 'ديون متأخرة أكثر من 30 يوماً', fr: 'Crédits > 30 jours', to: '/customers', icon: AlertTriangle, tone: '#DC2626' },
    { n: d.riyad_low ? 1 : 0, ar: 'رصيد رياض منخفض', fr: 'Solde Riyad bas', to: '/riyad', icon: Wallet, tone: '#DC2626' },
    { n: d.backup_days === null && me?.is_owner ? 1 : (d.backup_days ?? 0) >= 7 ? d.backup_days ?? 0 : 0, ar: d.backup_days === null ? 'لم تحمّل أي نسخة احتياطية بعد' : `آخر نسخة احتياطية منذ ${d.backup_days} أيام`, fr: d.backup_days === null ? 'Aucune sauvegarde' : `Sauvegarde il y a ${d.backup_days} j`, to: '/settings', icon: Database, tone: '#475569' },
  ].filter((x) => x.n > 0)

  return (
    <Card className="mb-5 p-4">
      <div className="mb-3 text-sm font-semibold">{t('مهام اليوم', 'À faire aujourd’hui')}</div>
      {!items.length ? (
        <div className="flex items-center gap-2 text-sm text-success">
          <PartyPopper className="size-4" />
          {t('لا شيء ينتظرك الآن، كل شيء تحت السيطرة 👌', 'Rien en attente, tout est sous contrôle 👌')}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <motion.div key={it.ar} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}>
              <Link to={it.to} className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 text-sm transition-all hover:-translate-y-0.5 hover:shadow-card">
                <span className="flex size-7 items-center justify-center rounded-lg text-white" style={{ background: it.tone }}>
                  <it.icon className="size-4" />
                </span>
                {it.icon !== Database && it.icon !== Wallet && <span className="num font-bold">{it.n}</span>}
                <span className="text-muted">{t(it.ar, it.fr)}</span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </Card>
  )
}
