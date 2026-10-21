import { Suspense, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ExternalLink, Lock, LogOut, Menu, MonitorPlay, Search, ShieldCheck, X } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { cn } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Spinner } from '@/shared/ui/primitives'
import { LangToggle, Logo, ThemeToggle } from '@/shared/ui/brand'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/shared/ui/overlay'
import { EmptyState } from '@/shared/ui/data'
import { NAV } from './nav'
import { NotificationsBell } from './Notifications'
import { CommandPalette } from './CommandPalette'
import { AssistantButton } from './Assistant'
import { AgentChime } from './MorningBrief'
import { SecurityDialog } from './Mfa'
import { useOnlinePending } from '@/shared/lib/online'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can, sb } = useAuth()
  const pending = useOnlinePending(sb, can('requests.manage') || can('orders.manage'))
  const helpCounts = useQuery({ queryKey: ['help-counts'], refetchInterval: 30_000, enabled: can('requests.manage'), queryFn: async () => (await sb.rpc('help_counts')).data as { new: number; late: number; mine: number } })
  const agentsNew = useQuery({ queryKey: ['agent-pending'], refetchInterval: 120_000, enabled: can('owner'), queryFn: async () => (await sb.rpc('agent_pending_count')).data as number })
  const badge: Record<string, number> = { '/agents': agentsNew.data ?? 0, '/requests': (pending.data?.requests_new ?? 0) + (pending.data?.requests_late ?? 0), '/orders': pending.data?.orders_new ?? 0, '/devices': pending.data?.devices_pending ?? 0, '/help': helpCounts.data?.new ?? 0 }
  const { t } = useLang()
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo subtitle={t('لوحة التحكم', 'Tableau de bord')} />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-6">
        {NAV.map((g) => {
          const items = g.items.filter((i) => !i.perm || can(i.perm))
          if (!items.length) return null
          return (
            <div key={g.fr}>
              <div className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-subtle uppercase">{t(g.ar, g.fr)}</div>
              <div className="space-y-0.5">
                {items.map((it) => (
                  <NavLink
                    key={it.path}
                    to={it.path}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive ? 'bg-brand-50 text-brand' : 'text-muted hover:bg-surface-2 hover:text-text',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 start-0 w-1 rounded-full bg-brand" />}
                        <it.icon className="size-[18px] shrink-0" />
                        <span className="flex-1 truncate">{t(it.ar, it.fr)}</span>
                        {badge[it.path] > 0 && <span className="num rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">{badge[it.path]}</span>}
                        {it.soon && (
                          <Badge tone="neutral" className="px-1.5 py-0 text-[10px]">
                            {t(`المرحلة ${it.soon}`, `Phase ${it.soon}`)}
                          </Badge>
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <a
          href={import.meta.env.BASE_URL + 'pos/'}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm font-medium text-white transition-transform hover:scale-[1.01] dark:bg-surface-2"
        >
          <MonitorPlay className="size-5 text-brand" />
          <span className="flex-1">{t('فتح نقطة البيع', 'Ouvrir le POS')}</span>
          <ExternalLink className="size-4 opacity-60" />
        </a>
      </div>
    </div>
  )
}

export function Layout() {
  const { me, can, signOut, sb } = useAuth()
  const qc = useQueryClient()
  const { t } = useLang()
  const loc = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [security, setSecurity] = useState(false)

  const current = NAV.flatMap((g) => g.items).find((i) => loc.pathname.startsWith(i.path))
  const allowed = !current?.perm || can(current.perm)

  // Opening a page = its notifications are seen
  useEffect(() => {
    if (!current) return
    sb.rpc('notifications_read_link', { p_link: current.path }).then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
  }, [current, sb, qc])

  useEffect(() => {
    if (current) document.title = `${t(current.ar, current.fr)} — Sweet House`
  }, [current, t])

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 border-e border-border bg-surface lg:block">
        <Sidebar />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-navy/40 backdrop-blur-[2px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 start-0 z-50 w-72 border-e border-border bg-surface lg:hidden"
              initial={{ x: document.dir === 'rtl' ? '100%' : '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: document.dir === 'rtl' ? '100%' : '-100%' }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0.1 }}
            >
              <button className="absolute end-3 top-5 rounded-lg p-1.5 text-muted hover:bg-surface-2" onClick={() => setMobileOpen(false)}>
                <X className="size-5" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <SecurityDialog open={security} onClose={() => setSecurity(false)} />
      <CommandPalette />
      <AgentChime />
      <div className="lg:ps-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-lg sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu />
          </Button>
          <div className="min-w-0 flex-1 truncate text-sm text-muted">
            {current && (
              <span className="flex items-center gap-2">
                <current.icon className="size-4" />
                {t(current.ar, current.fr)}
              </span>
            )}
          </div>
          <button onClick={() => window.dispatchEvent(new Event('open-palette'))} className="hidden items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-2 sm:flex" title="Ctrl+K">
            <Search className="size-4" />
            {t('بحث', 'Rechercher')}
            <kbd className="rounded bg-surface-2 px-1.5 text-[10px]" dir="ltr">Ctrl K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => window.dispatchEvent(new Event('open-palette'))}>
            <Search />
          </Button>
          <AssistantButton />
          <NotificationsBell />
          <LangToggle />
          <ThemeToggle />
          <Dropdown>
            <DropdownTrigger asChild>
              <button className="flex items-center gap-2.5 rounded-xl p-1 pe-3 transition-colors hover:bg-surface-2">
                <Avatar name={me?.full_name ?? '?'} color={me?.color} src={me?.avatar_url} size={34} />
                <div className="hidden text-start leading-tight sm:block">
                  <div className="text-sm font-semibold">{me?.full_name}</div>
                  <div className="text-[11px] text-muted">{me?.is_owner ? t('المالك', 'Propriétaire') : me?.role ? t(me.role.name_ar, me.role.name_fr) : ''}</div>
                </div>
              </button>
            </DropdownTrigger>
            <DropdownContent>
              <div className="px-2.5 py-2 text-xs text-muted">{me?.username}</div>
              <DropdownSeparator />
              <DropdownItem icon={<ShieldCheck />} onSelect={() => setSecurity(true)}>
                {t('أمان الحساب', 'Sécurité')}
              </DropdownItem>
              <DropdownItem icon={<LogOut />} danger onSelect={() => signOut()}>
                {t('تسجيل الخروج', 'Déconnexion')}
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={loc.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              {allowed ? (
                <Suspense fallback={<div className="flex justify-center py-24"><Spinner /></div>}>
                  <Outlet />
                </Suspense>
              ) : (
                <EmptyState icon={<Lock />} title={t('ليست لديك صلاحية', 'Accès refusé')} description={t('اطلب من المالك منحك الصلاحية لهذا القسم', 'Demandez au propriétaire de vous donner accès')} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
