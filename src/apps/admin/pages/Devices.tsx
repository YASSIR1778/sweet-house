import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { Banknote, Check, ExternalLink, Monitor, MonitorSmartphone, Pencil, Power, Trash, X } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn, past } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Card, Input } from '@/shared/ui/primitives'
import { useConfirm } from '@/shared/ui/overlay'
import { EmptyState, PageHeader } from '@/shared/ui/data'

type Device = {
  id: string
  name: string
  status: 'pending' | 'approved'
  is_active: boolean
  request_code: string | null
  device_info: string | null
  requested_at: string | null
  last_seen_at: string | null
  created_at: string
  online: boolean
  employee: { full_name: string; color: string } | null
  shift: { number: number; opened_at: string; employee: string } | null
}

/** POS devices: approve new ones with one click, see who is online now, rename. */
export function DevicesPage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [names, setNames] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)

  const devices = useQuery({
    queryKey: ['devices'],
    refetchInterval: 5_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('devices_overview')
      if (error) throw error
      return data as Device[]
    },
  })
  const refresh = () => (qc.invalidateQueries({ queryKey: ['devices'] }), qc.invalidateQueries({ queryKey: ['online-pending'] }))
  const pending = (devices.data ?? []).filter((d) => d.status === 'pending')
  const approved = (devices.data ?? []).filter((d) => d.status === 'approved')
  const ago = (d: string) => formatDistanceToNow(past(d), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })

  const decide = async (d: Device, ok: boolean) => {
    const { error } = await sb.rpc('approve_device', { p_id: d.id, p_name: names[d.id] ?? d.name, p_approve: ok })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(ok ? t('تمت الموافقة ✅ الجهاز جاهز الآن', 'Appareil approuvé ✅') : t('تم رفض الطلب', 'Demande refusée'))
    refresh()
  }
  const update = async (d: Device, patch: Record<string, unknown>) => {
    const { error } = await sb.from('devices').update(patch).eq('id', d.id)
    if (error) return toast.error(errorMessage(error, lang))
    refresh()
  }
  const rename = async (d: Device) => {
    const n = (names[d.id] ?? '').trim()
    setEditing(null)
    if (n && n !== d.name) await update(d, { name: n })
  }
  const remove = async (d: Device) => {
    if (!(await confirm({ title: t(`إزالة الجهاز «${d.name}»؟`, `Retirer « ${d.name} » ?`), description: t('سيحتاج إلى طلب اتصال جديد ليعمل مرة أخرى', 'Il devra refaire une demande'), danger: true }))) return
    update(d, { deleted_at: new Date().toISOString(), is_active: false })
  }

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<MonitorSmartphone />}
        title={t('أجهزة نقطة البيع', 'Appareils POS')}
        description={t('وافق على الأجهزة الجديدة بضغطة، وشاهد الأجهزة المتصلة الآن', 'Approuvez les nouveaux postes et voyez qui est connecté')}
        actions={
          <Button asChild variant="outline">
            <a href={import.meta.env.BASE_URL + 'pos/'} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('فتح نقطة البيع', 'Ouvrir le POS')}
            </a>
          </Button>
        }
      />

      {pending.length > 0 && (
        <div className="mb-6 space-y-3">
          <div className="text-sm font-semibold text-warning">{t('أجهزة تطلب الاتصال', 'Demandes de connexion')}</div>
          {pending.map((d) => (
            <motion.div key={d.id} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="flex flex-wrap items-center gap-4 border-2 border-warning/50 bg-warning/5 p-4">
                <div className="text-center">
                  <div className="text-[11px] text-muted">{t('الرمز', 'Code')}</div>
                  <div className="num text-3xl font-extrabold tracking-widest text-brand" dir="ltr">
                    {d.request_code}
                  </div>
                </div>
                <div className="min-w-48 flex-1 space-y-1">
                  <Input value={names[d.id] ?? d.name} onChange={(e) => setNames({ ...names, [d.id]: e.target.value })} placeholder={t('اسم الجهاز', 'Nom')} />
                  <div className="text-xs text-muted">
                    {d.device_info} · {d.requested_at && ago(d.requested_at)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="success" onClick={() => decide(d, true)}>
                    <Check />
                    {t('موافقة', 'Approuver')}
                  </Button>
                  <Button variant="ghost" onClick={() => decide(d, false)}>
                    <X />
                    {t('رفض', 'Refuser')}
                  </Button>
                </div>
                <p className="w-full text-xs text-muted">{t('تأكد أن نفس الرمز ظاهر على شاشة الجهاز قبل الموافقة.', 'Vérifiez que le même code s’affiche sur l’appareil.')}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {!devices.isLoading && !approved.length ? (
        <Card>
          <EmptyState icon={<Monitor />} title={t('لا توجد أجهزة بعد', 'Aucun appareil')} description={t('افتح نقطة البيع على الحاسوب واضغط «طلب الاتصال»، ثم وافق هنا.', 'Ouvrez le POS sur l’ordinateur, cliquez « Demander l’accès », puis approuvez ici.')} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {approved.map((d) => (
            <Card key={d.id} className={cn('p-5', !d.is_active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className={cn('relative flex size-11 items-center justify-center rounded-xl', d.online ? 'bg-success/10 text-success' : 'bg-surface-2 text-muted')}>
                  <Monitor className="size-5" />
                  <span className={cn('absolute -end-0.5 -top-0.5 size-3 rounded-full ring-2 ring-surface', d.online ? 'animate-pulse bg-success' : 'bg-subtle')} />
                </div>
                <div className="min-w-0 flex-1">
                  {editing === d.id ? (
                    <Input autoFocus value={names[d.id] ?? d.name} onChange={(e) => setNames({ ...names, [d.id]: e.target.value })} onBlur={() => rename(d)} onKeyDown={(e) => e.key === 'Enter' && rename(d)} />
                  ) : (
                    <button onClick={() => (setNames({ ...names, [d.id]: d.name }), setEditing(d.id))} className="group flex items-center gap-1.5 font-semibold">
                      {d.name}
                      <Pencil className="size-3.5 text-subtle opacity-0 group-hover:opacity-100" />
                    </button>
                  )}
                  <div className="text-xs text-muted">
                    {d.online ? <span className="font-medium text-success">{t('متصل الآن', 'En ligne')}</span> : d.last_seen_at ? t('آخر اتصال', 'Vu') + ' ' + ago(d.last_seen_at) : t('لم يُستعمل بعد', 'Jamais utilisé')}
                    {d.device_info && ` · ${d.device_info}`}
                  </div>
                </div>
                {!d.is_active && <Badge>{t('موقوف', 'Désactivé')}</Badge>}
              </div>
              {(d.employee || d.shift) && (
                <div className="mt-3 space-y-1.5 rounded-xl bg-surface-2 p-3 text-sm">
                  {d.employee && (
                    <div className="flex items-center gap-2">
                      <Avatar name={d.employee.full_name} color={d.employee.color} size={22} />
                      {d.employee.full_name}
                    </div>
                  )}
                  {d.shift && (
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Banknote className="size-3.5" />
                      {t('وردية مفتوحة', 'Caisse ouverte')} <span className="num">#{d.shift.number}</span> · {d.shift.employee} · {ago(d.shift.opened_at)}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => update(d, { is_active: !d.is_active })}>
                  <Power />
                  {d.is_active ? t('إيقاف مؤقت', 'Désactiver') : t('تفعيل', 'Activer')}
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
