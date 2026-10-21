import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { addDays, startOfMonth } from 'date-fns'
import { LifeBuoy, MessageCircle, PhoneCall, TrendingUp, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Card, CardHeader, Input, SwitchRow } from '@/shared/ui/primitives'
import { PageHeader, StatCard } from '@/shared/ui/data'
import { HelpDesk } from '@/shared/ui/help-desk'

type HelpReport = {
  whatsapp_clicks: number
  callbacks: number
  converted: number
  avg_response_min: number | null
  staff_created: number
  by_service: { name_ar: string; name_fr: string; total: number; whatsapp: number; callbacks: number }[]
  by_step: Record<string, number>
  by_employee: { full_name: string; color: string; handled: number; avg_min: number | null }[]
}
const STEP: Record<string, [string, string]> = {
  start: ['بداية الصفحة', 'Début'],
  contact: ['معلومات التواصل', 'Coordonnées'],
  info: ['معلومات الطلب', 'Informations'],
  documents: ['رفع الوثائق', 'Documents'],
  payment: ['الأداء', 'Paiement'],
}

/** Customers who asked for help on a service page. */
export function HelpPage() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const [cfg, setCfg] = useState<{ enabled: boolean; alert_minutes: number } | null>(null)
  const settings = useQuery({ queryKey: ['help-settings'], enabled: can('settings.manage'), queryFn: async () => (await sb.from('settings').select('value').eq('key', 'help').single()).data?.value as { enabled: boolean; alert_minutes: number } })
  useEffect(() => {
    if (settings.data) setCfg(settings.data)
  }, [settings.data])
  const save = async (next: { enabled: boolean; alert_minutes: number }) => {
    setCfg(next)
    const { error } = await sb.from('settings').update({ value: next }).eq('key', 'help')
    if (error) toast.error(errorMessage(error, lang))
  }

  return (
    <>
      <PageHeader icon={<LifeBuoy />} title={t('طلبات المساعدة', 'Demandes d’aide')} description={t('زبائن لم يفهموا طريقة الطلب في الموقع وطلبوا أن نتصل بهم', 'Clients qui demandent de l’aide pour faire leur demande')} />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <HelpDesk />
        <div className="space-y-4">
          <HelpReportCard />
          {cfg && (
            <Card>
              <CardHeader title={t('الإعدادات', 'Paramètres')} />
              <div className="space-y-3 p-4">
                <SwitchRow label={t('إظهار شريط المساعدة في صفحات الخدمات', 'Afficher la barre d’aide')} checked={cfg.enabled} onCheckedChange={(enabled) => save({ ...cfg, enabled })} />
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex-1 text-muted">{t('تنبيه إن لم يُرد على الزبون خلال (دقيقة)', 'Alerte sans réponse après (min)')}</span>
                  <Input type="number" min={5} value={cfg.alert_minutes} onChange={(e) => setCfg({ ...cfg, alert_minutes: Number(e.target.value) })} onBlur={() => save(cfg)} className="num w-20" />
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

export function HelpReportCard({ from, to }: { from?: Date; to?: Date }) {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const f = from ?? startOfMonth(new Date())
  const tt = to ?? addDays(new Date(), 1)
  const q = useQuery({ queryKey: ['help-report', f.toISOString(), tt.toISOString()], queryFn: async () => (await sb.rpc('help_report', { p_from: f.toISOString(), p_to: tt.toISOString() })).data as HelpReport })
  const d = q.data
  if (!d) return null
  const asked = d.whatsapp_clicks + d.callbacks
  const steps = Object.entries(d.by_step).sort((a, b) => b[1] - a[1])
  return (
    <Card>
      <CardHeader title={t('المساعدة هذا الشهر', 'Aide ce mois-ci')} icon={<TrendingUp />} />
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCard index={0} label={t('طلبوا المساعدة', 'Ont demandé')} value={asked} icon={<LifeBuoy />} hint={`${d.whatsapp_clicks} ${t('واتساب', 'WhatsApp')} · ${d.callbacks} ${t('اتصال', 'rappel')}`} />
          <StatCard index={1} tone="success" label={t('أكملوا الطلب', 'Ont finalisé')} value={d.converted} icon={<UserCheck />} hint={d.callbacks ? `${Math.round((d.converted / d.callbacks) * 100)}% ${t('من الاتصالات', 'des rappels')}` : undefined} />
        </div>
        <div className="text-sm text-muted">
          {t('متوسط وقت الرد', 'Délai moyen de réponse')}: <span className="num font-semibold text-text">{d.avg_response_min ?? '—'} {t('دقيقة', 'min')}</span> · {t('طلبات أنشأها الموظفون', 'Créées par l’équipe')}: <span className="num font-semibold text-text">{d.staff_created}</span>
        </div>
        {d.by_service.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-semibold text-muted">{t('الخدمات التي يُسأل عنها أكثر (تحتاج شرحاً أوضح)', 'Services qui posent le plus de questions')}</div>
            {d.by_service.slice(0, 6).map((s) => (
              <div key={s.name_ar} className="flex items-center gap-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate">{pick(s, 'name')}</span>
                <span className="num flex items-center gap-1 text-xs text-muted">
                  <MessageCircle className="size-3" />
                  {s.whatsapp}
                  <PhoneCall className="ms-1 size-3" />
                  {s.callbacks}
                </span>
              </div>
            ))}
          </div>
        )}
        {steps.length > 0 && (
          <div className="text-xs text-muted">
            {t('أين يتوقفون:', 'Où ils bloquent :')} {steps.map(([k, n]) => `${t(...(STEP[k] ?? [k, k]))} (${n})`).join(' · ')}
          </div>
        )}
        {d.by_employee.length > 0 && (
          <div className="text-xs text-muted">
            {d.by_employee.map((e) => `${e.full_name}: ${e.handled} · ≈${e.avg_min ?? '—'} ${t('د', 'min')}`).join(' | ')}
          </div>
        )}
      </div>
    </Card>
  )
}
