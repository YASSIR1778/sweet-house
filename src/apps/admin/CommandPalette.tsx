import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Search, UserRound } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { cn } from '@/shared/lib/utils'
import { Dialog } from '@/shared/ui/overlay'
import { Input } from '@/shared/ui/primitives'
import { RequestSheet } from '@/shared/ui/request-sheet'
import { CustomerFileSheet } from '@/shared/ui/customer-file'
import { NAV } from './nav'

type Hit = { id: string; number: string; customer_name: string; phone: string; service_name_ar: string }
type Item = { key: string; icon: React.ReactNode; label: string; sub?: string; extra?: React.ReactNode; run: () => void }

/** Ctrl+K: jump to any page, find a request (number, name, phone, portal ref) or open a customer file. */
export function CommandPalette() {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const [req, setReq] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [dq, setDq] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setDq(q.trim()), 250)
    return () => clearTimeout(id)
  }, [q])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-palette', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-palette', onOpen)
    }
  }, [])
  useEffect(() => {
    if (open) setQ('')
  }, [open])

  const canReq = can('requests.manage') || can('requests.view_documents')
  const hits = useQuery({
    queryKey: ['palette', dq],
    enabled: open && canReq && dq.length >= 2,
    queryFn: async () => ((await sb.rpc('requests_search', { p_q: dq, p_limit: 8 })).data ?? []) as Hit[],
  })

  const items = useMemo<Item[]>(() => {
    const s = q.trim().toLowerCase()
    const pages: Item[] = NAV.flatMap((g) => g.items)
      .filter((i) => !i.perm || can(i.perm))
      .filter((i) => !s || i.ar.includes(q.trim()) || i.fr.toLowerCase().includes(s) || i.path.includes(s))
      .slice(0, s ? 6 : 30)
      .map((i) => ({ key: i.path, icon: <i.icon />, label: t(i.ar, i.fr), run: () => nav(i.path) }))
    const digits = q.replace(/\D/g, '')
    const file: Item[] = canReq && digits.length >= 9 ? [{ key: 'file', icon: <UserRound />, label: t('ملف الزبون', 'Dossier client'), sub: q.trim(), run: () => setPhone(q.trim()) }] : []
    const reqs: Item[] = (hits.data ?? []).map((h) => ({
      key: h.id,
      icon: <ClipboardList />,
      label: `${h.number} · ${h.customer_name}`,
      sub: h.service_name_ar,
      run: () => setReq(h.id),
    }))
    return [...file, ...reqs, ...pages]
  }, [q, hits.data, can, canReq, t, nav])

  useEffect(() => setSel(0), [items.length])
  const go = (it?: Item) => {
    if (!it) return
    setOpen(false)
    it.run()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen} title={t('بحث سريع', 'Recherche rapide')} description={t('صفحة، رقم طلب، اسم زبون أو هاتف', 'Page, n° de demande, client ou téléphone')}>
        <div className="space-y-3">
          <Input
            autoFocus
            icon={<Search />}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('اكتب للبحث…', 'Tapez pour chercher…')}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setSel((x) => Math.min(x + 1, items.length - 1)))
              if (e.key === 'ArrowUp') (e.preventDefault(), setSel((x) => Math.max(x - 1, 0)))
              if (e.key === 'Enter') go(items[sel])
            }}
          />
          <div className="max-h-[55vh] space-y-0.5 overflow-y-auto">
            {items.map((it, i) => (
              <button
                key={it.key}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(it)}
                className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted', i === sel && 'bg-brand-50')}
              >
                {it.icon}
                <span className="min-w-0 flex-1 truncate">
                  {it.label}
                  {it.sub && <span className="ms-2 text-xs text-muted">{it.sub}</span>}
                </span>
                {it.extra}
              </button>
            ))}
            {!items.length && <div className="py-6 text-center text-sm text-muted">{hits.isFetching ? '…' : t('لا نتائج', 'Aucun résultat')}</div>}
          </div>
          <div className="text-xs text-subtle">↑ ↓ · Enter · Ctrl+K</div>
        </div>
      </Dialog>
      <RequestSheet id={req} onClose={() => setReq(null)} />
      <CustomerFileSheet open={!!phone} onClose={() => setPhone(null)} phone={phone} />
    </>
  )
}
