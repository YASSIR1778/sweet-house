import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Fingerprint, LogIn, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/primitives'
import { Dialog, Tooltip } from '@/shared/ui/overlay'
import { PushToggle } from '@/shared/ui/push-toggle'

type Mine = { open: { id: string; check_in: string } | null; today_minutes: number }

const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`

/** 38 · Clock in / out for the employee signed in with their PIN. */
export function AttendanceButton({ deviceId }: { deviceId: string }) {
  const { sb, me, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['my-attendance', me?.id], enabled: !!me, refetchInterval: 120_000, queryFn: async () => (await sb.rpc('my_attendance')).data as Mine })
  const inside = !!q.data?.open

  // First PIN login of the day: offer to clock in (once per employee and day).
  useEffect(() => {
    if (!q.data || !me || me.is_owner) return
    const key = `sh-att-ask-${me.id}-${format(new Date(), 'yyyyMMdd')}`
    if (!q.data.open && q.data.today_minutes === 0 && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1')
      setOpen(true)
    }
  }, [q.data, me])

  const clock = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('clock', { p_device: deviceId })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    const r = data as { state: 'in' | 'out' }
    toast.success(r.state === 'in' ? t(`مرحباً ${me?.full_name} 👋 تم تسجيل حضورك`, `Bonjour ${me?.full_name} 👋 entrée pointée`) : t('تم تسجيل خروجك، إلى اللقاء 👋', 'Sortie pointée, à bientôt 👋'))
    qc.invalidateQueries({ queryKey: ['my-attendance'] })
    setOpen(false)
  }

  if (!me) return null
  const since = q.data?.open ? new Date(q.data.open.check_in) : null
  return (
    <>
      <Tooltip content={inside ? t('حاضر — اضغط لتسجيل الخروج', 'Présent — pointer la sortie') : t('تسجيل الحضور', 'Pointer l’entrée')}>
        <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)}>
          <Fingerprint className={cn(inside ? 'text-success' : 'text-muted')} />
          <span className={cn('absolute end-1 top-1 size-2 rounded-full', inside ? 'bg-success' : 'bg-warning')} />
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen} size="sm" title={t('الحضور والانصراف', 'Pointage')} description={me.full_name}>
        <div className="space-y-4 text-center">
          <div className={cn('mx-auto flex size-20 items-center justify-center rounded-full', inside ? 'bg-success/10 text-success' : 'bg-brand-50 text-brand')}>
            <Fingerprint className="size-10" />
          </div>
          {since ? (
            <div className="text-sm text-muted">
              {t('حاضر منذ', 'Présent depuis')} <span className="num font-semibold text-text">{format(since, 'HH:mm')}</span>
            </div>
          ) : (
            <div className="text-sm text-muted">{t('لم تسجّل حضورك بعد', 'Entrée non pointée')}</div>
          )}
          {(q.data?.today_minutes ?? 0) > 0 && (
            <div className="num text-xs text-subtle">
              {t('مجموع اليوم', 'Total du jour')}: {hm(q.data!.today_minutes)}
            </div>
          )}
          <Button size="lg" variant={inside ? 'outline' : 'primary'} className="w-full" onClick={clock} loading={busy}>
            {inside ? <LogOut /> : <LogIn />}
            {inside ? t('تسجيل الخروج', 'Pointer la sortie') : t('تسجيل الحضور', 'Pointer l’entrée')}
          </Button>
          {(can('requests.manage') || can('orders.manage')) && <PushToggle sb={sb} app="pos" className="mt-2" />}
        </div>
      </Dialog>
    </>
  )
}
