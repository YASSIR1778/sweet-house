import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { AlertTriangle, Bell, CheckCheck, Info } from 'lucide-react'
import { useNavigate } from 'react-router'
import * as Popover from '@radix-ui/react-popover'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { cn, past } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/primitives'
import { PushToggle } from '@/shared/ui/push-toggle'

type N = { id: string; type: string; severity: 'info' | 'success' | 'warning' | 'danger'; title_ar: string; title_fr: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

export function NotificationsBell() {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const nav = useNavigate()
  const list = useQuery({
    queryKey: ['notifications'],
    enabled: can('reports.sales'),
    refetchInterval: 60_000,
    queryFn: async () => (await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)).data as N[],
  })
  if (!can('reports.sales')) return null
  const unread = (list.data ?? []).filter((n) => !n.read_at).length

  const markAll = async () => {
    await sb.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }
  const open = async (n: N) => {
    if (!n.read_at) await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    qc.invalidateQueries({ queryKey: ['notifications'] })
    if (n.link) nav(n.link)
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell />
          {unread > 0 && <span className="num absolute end-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-surface">{unread}</span>}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-2xl border border-border bg-surface shadow-pop data-[state=open]:animate-[popIn_150ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="font-semibold">{t('الإشعارات', 'Notifications')}</div>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-brand hover:underline">
                <CheckCheck className="size-3.5" />
                {t('قراءة الكل', 'Tout lire')}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!list.data?.length ? (
              <div className="p-8 text-center text-sm text-muted">{t('لا توجد إشعارات 🎉', 'Aucune notification 🎉')}</div>
            ) : (
              list.data.map((n) => (
                <button key={n.id} onClick={() => open(n)} className={cn('flex w-full gap-3 border-b border-border px-4 py-3 text-start last:border-0 hover:bg-surface-2', !n.read_at && 'bg-brand-50/40')}>
                  <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', n.severity === 'danger' ? 'bg-danger/10 text-danger' : n.severity === 'warning' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info')}>
                    {n.severity === 'info' ? <Info className="size-4" /> : <AlertTriangle className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{pick(n, 'title')}</div>
                    {n.body && <div className="num line-clamp-4 text-xs whitespace-pre-line text-muted">{n.body}</div>}
                    <div className="mt-0.5 text-[11px] text-subtle">{formatDistanceToNow(past(n.created_at), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })}</div>
                  </div>
                  {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" />}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-border p-3">
            <PushToggle sb={sb} app="admin" />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
