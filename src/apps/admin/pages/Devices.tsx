import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { ExternalLink, Monitor, MonitorSmartphone, Power, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Badge, Button, Card } from '@/shared/ui/primitives'
import { useConfirm } from '@/shared/ui/overlay'
import { EmptyState, PageHeader } from '@/shared/ui/data'

type Device = { id: string; name: string; is_active: boolean; last_seen_at: string | null; created_at: string }

export function DevicesPage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()

  const devices = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const { data, error } = await sb.from('devices').select('id, name, is_active, last_seen_at, created_at').is('deleted_at', null).order('created_at')
      if (error) throw error
      return data as Device[]
    },
  })

  const update = async (d: Device, patch: Record<string, unknown>) => {
    const { error } = await sb.from('devices').update(patch).eq('id', d.id)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['devices'] })
  }

  const remove = async (d: Device) => {
    if (!(await confirm({ title: t(`إزالة الجهاز "${d.name}"؟`, `Retirer « ${d.name} » ?`), description: t('لن يستطيع الموظفون الدخول منه حتى يُسجّل من جديد', "Les employés ne pourront plus s'y connecter"), danger: true }))) return
    update(d, { deleted_at: new Date().toISOString() })
  }

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<MonitorSmartphone />}
        title={t('أجهزة نقطة البيع', 'Appareils POS')}
        description={t('الدخول بالرمز السري مسموح فقط من الأجهزة المسجلة هنا', 'La connexion par PIN n’est possible que depuis ces appareils')}
        actions={
          <Button asChild variant="navy">
            <a href={import.meta.env.BASE_URL + 'pos/'} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('تسجيل جهاز جديد', 'Enregistrer un appareil')}
            </a>
          </Button>
        }
      />
      <div className="mb-5 rounded-xl border border-info/20 bg-info/5 p-4 text-sm text-muted">
        {t('لتسجيل جهاز: افتح نقطة البيع على ذلك الجهاز، وادخل بحساب المالك مرة واحدة، ثم اختر اسماً للجهاز.', "Pour enregistrer : ouvrez le POS sur l'appareil, connectez-vous une fois avec le compte propriétaire, puis nommez l'appareil.")}
      </div>
      {!devices.isLoading && !devices.data?.length ? (
        <Card>
          <EmptyState icon={<Monitor />} title={t('لا توجد أجهزة مسجلة', 'Aucun appareil')} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.data?.map((d) => (
            <Card key={d.id} className="p-5">
              <div className="flex items-start gap-3">
                <div className={`flex size-11 items-center justify-center rounded-xl ${d.is_active ? 'bg-success/10 text-success' : 'bg-surface-2 text-muted'}`}>
                  <Monitor className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-xs text-muted">
                    {d.last_seen_at
                      ? t('آخر نشاط', 'Vu') + ' ' + formatDistanceToNow(new Date(d.last_seen_at), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })
                      : t('لم يُستعمل بعد', 'Jamais utilisé')}
                  </div>
                </div>
                <Badge tone={d.is_active ? 'success' : 'neutral'}>{d.is_active ? t('مفعّل', 'Actif') : t('معطّل', 'Inactif')}</Badge>
              </div>
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => update(d, { is_active: !d.is_active })}>
                  <Power />
                  {d.is_active ? t('تعطيل', 'Désactiver') : t('تفعيل', 'Activer')}
                </Button>
                <Button variant="danger-soft" size="sm" onClick={() => remove(d)}>
                  <Trash />
                  {t('إزالة', 'Retirer')}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
