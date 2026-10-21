import { BellOff, BellRing } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { usePush } from '@/shared/lib/push'
import { cn } from '@/shared/lib/utils'
import { Spinner } from './primitives'

/** Row to switch browser notifications on/off for this device. */
export function PushToggle({ sb, app, className }: { sb: SupabaseClient; app: 'admin' | 'pos'; className?: string }) {
  const { t, lang } = useLang()
  const push = usePush(sb, app)
  if (push.state === 'unsupported')
    return <div className={cn('text-xs text-muted', className)}>{t('هذا المتصفح لا يدعم الإشعارات. على آيفون: أضف التطبيق إلى الشاشة الرئيسية أولاً.', 'Navigateur sans notifications. Sur iPhone : ajoutez l’app à l’écran d’accueil.')}</div>

  const on = push.state === 'on'
  const click = async () => {
    try {
      if (on) {
        await push.disable()
        toast.success(t('أُوقفت الإشعارات على هذا الجهاز', 'Notifications désactivées'))
      } else if (await push.enable()) {
        toast.success(t('تم تفعيل الإشعارات على هذا الجهاز 🔔', 'Notifications activées 🔔'))
      }
    } catch (e) {
      toast.error(errorMessage(e, lang))
    }
  }

  return (
    <button onClick={click} disabled={push.state === 'loading'} className={cn('flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start text-sm transition-colors', on ? 'border-success/40 bg-success/5' : 'border-border hover:bg-surface-2', className)}>
      {push.state === 'loading' ? <Spinner className="size-4" /> : on ? <BellRing className="size-4 text-success" /> : <BellOff className="size-4 text-muted" />}
      <span className="flex-1">
        <span className="block font-medium">{on ? t('إشعارات هذا الجهاز مفعّلة', 'Notifications actives sur cet appareil') : t('تفعيل الإشعارات على هذا الجهاز', 'Activer les notifications ici')}</span>
        <span className="block text-xs text-muted">
          {push.state === 'denied' ? t('الإشعارات ممنوعة في إعدادات المتصفح لهذا الموقع', 'Bloquées dans les réglages du navigateur') : t('طلب جديد، وثيقة، تحويل… حتى والتطبيق مغلق', 'Nouvelle demande, document, virement… même app fermée')}
        </span>
      </span>
    </button>
  )
}
