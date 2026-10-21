import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, Circle, Rocket } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { Card, CardHeader } from '@/shared/ui/primitives'

type Item = { key: string; ok: boolean; count?: number; to: string }

const LABELS: Record<string, { ar: string; fr: string; to?: string }> = {
  store: { ar: 'هاتف وعنوان المحل', fr: 'Téléphone et adresse', to: '/settings?s=store' },
  legal: { ar: 'المعلومات القانونية (ICE و IF)', fr: 'ICE et IF', to: '/settings?s=legal' },
  bank: { ar: 'رقم الحساب البنكي RIB', fr: 'RIB bancaire', to: '/settings?s=bank' },
  prices: { ar: 'أسعار الخدمات (خدمات بدون سعر)', fr: 'Prix des services' },
  products: { ar: 'إضافة المنتجات (10 على الأقل)', fr: 'Ajouter les produits (≥ 10)' },
  pins: { ar: 'رمز PIN لكل موظف', fr: 'PIN de chaque employé' },
  device: { ar: 'جهاز نقطة بيع موافق عليه', fr: 'Un appareil POS approuvé' },
  riyad: { ar: 'الرصيد الافتتاحي لرياض', fr: 'Solde initial Riyad' },
  privacy: { ar: 'نص سياسة الخصوصية في الموقع', fr: 'Politique de confidentialité' },
  push: { ar: 'تفعيل الإشعارات على هاتفك', fr: 'Notifications sur votre téléphone' },
  backup: { ar: 'أول نسخة احتياطية', fr: 'Première sauvegarde', to: '/settings?s=data' },
  test_data: { ar: 'حذف بيانات التجربة («بدء العمل الحقيقي»)', fr: 'Effacer les données de test', to: '/settings?s=data' },
}

/** Owner only: what is still missing before going live. Hidden once everything is ready. */
export function LaunchChecklist() {
  const { sb, me } = useAuth()
  const { t } = useLang()
  const q = useQuery({ queryKey: ['launch-checklist'], enabled: !!me?.is_owner, queryFn: async () => (await sb.rpc('launch_checklist')).data as { items: Item[] } | null })
  const items = q.data?.items ?? []
  const done = items.filter((i) => i.ok).length
  if (!items.length || done === items.length) return null
  return (
    <Card className="mb-5">
      <CardHeader title={t('جاهزية الإطلاق', 'Prêt pour le lancement')} description={t(`${done} من ${items.length} جاهزة`, `${done}/${items.length} prêts`)} icon={<Rocket />} />
      <div className="px-5 pb-2">
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      <div className="grid gap-1 p-3 sm:grid-cols-2">
        {items.map((i) => {
          const l = LABELS[i.key] ?? { ar: i.key, fr: i.key }
          return (
            <Link key={i.key} to={l.to ?? i.to} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
              {i.ok ? <CheckCircle2 className="size-5 shrink-0 text-success" /> : <Circle className="size-5 shrink-0 text-subtle" />}
              <span className={i.ok ? 'text-muted line-through' : 'font-medium'}>{t(l.ar, l.fr)}</span>
              {!i.ok && i.count !== undefined && <span className="num ms-auto text-xs text-muted">{i.count}</span>}
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
