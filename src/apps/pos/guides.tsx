import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ArrowRight, BookOpen, ListChecks, MessageSquareText, Pencil, PlayCircle, Search, Send } from 'lucide-react'
import { format } from 'date-fns'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { cn, matchesSearch } from '@/shared/lib/utils'
import { Badge, Button, Input, Spinner } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { GuideView, hasGuide, useServiceGuides, type GuideService } from '@/shared/ui/guide'
import { GuideEditDialog } from '@/shared/ui/guide-editor'
import { GuideShareMenu, SendGuideDialog, SuggestGuideDialog } from '@/shared/ui/guide-share'

type Sent = { id: string; body: string | null; link: string | null; created_at: string; read_at: string | null }
const sentService = (n: Sent) => n.link?.match(/service=([\w-]{36})/)?.[1] ?? null

/** Guides the owner sent to the signed-in employee (newest first). */
export function useGuideInbox(sb: SupabaseClient, employeeId?: string) {
  return useQuery({
    queryKey: ['guide-inbox', employeeId],
    enabled: !!employeeId,
    refetchInterval: 60_000,
    queryFn: async () =>
      (await sb.from('notifications').select('id, body, link, created_at, read_at').eq('type', 'guide_shared').eq('target_employee', employeeId!).order('created_at', { ascending: false }).limit(15)).data as Sent[],
  })
}

/**
 * «دليل الخدمات» in the POS: every service's guide (portal steps, documents to ask for,
 * video), the ones sent to me, and sharing with a customer or a colleague.
 */
export function GuidesSheet({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: string | null }) {
  const { sb, me, can } = useAuth()
  const { t, pick } = useLang()
  const data = useServiceGuides(sb)
  const inbox = useGuideInbox(sb, me?.id)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | 'counter' | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<GuideService | null>(null)
  const [sending, setSending] = useState<GuideService | null>(null)
  const [suggestFor, setSuggestFor] = useState<string | null>(null)

  useEffect(() => {
    if (open) setSelected(initial ?? null)
  }, [open, initial])

  const services = useMemo(() => (data.data?.services ?? []).filter((s) => s.is_active !== false), [data.data])
  const cats = useMemo(() => (data.data?.categories ?? []).filter((c) => c.kind === 'admin' && services.some((s) => s.category_id === c.id)), [data.data, services])
  const shown = useMemo(
    () =>
      services.filter(
        (s) => (cat === null || (cat === 'counter' ? s.kind === 'counter' : s.category_id === cat)) && matchesSearch(q, s.name_ar, s.name_fr, s.description_ar, data.data?.guides.get(s.id)?.tips_ar),
      ),
    [services, cat, q, data.data],
  )
  const unread = (inbox.data ?? []).filter((n) => !n.read_at)
  const service = selected ? services.find((s) => s.id === selected) : undefined
  const guide = selected ? data.data?.guides.get(selected) : undefined

  const openSent = async (n: Sent) => {
    const id = sentService(n)
    if (id) setSelected(id)
    if (!n.read_at) {
      await sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
      inbox.refetch()
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-3xl"
      title={
        service ? (
          <span className="flex items-center gap-2">
            <button onClick={() => setSelected(null)} className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-text">
              <ArrowRight className="size-5 ltr:rotate-180" />
            </button>
            {pick(service, 'name')}
          </span>
        ) : (
          t('دليل الخدمات', 'Guides des services')
        )
      }
      description={service ? undefined : t('كيف تُنجز كل خدمة: الخطوات، الوثائق المطلوبة، الروابط والفيديو', 'Comment traiter chaque service : étapes, pièces, liens, vidéo')}
      footer={
        service ? (
          <div className="flex w-full flex-wrap items-center gap-2">
            <GuideShareMenu service={service} guide={guide} onSendToEmployee={can('services.manage') || can('requests.manage') ? () => setSending(service) : undefined} />
            <Button size="sm" variant="ghost" onClick={() => setSuggestFor(service.id)}>
              <MessageSquareText />
              {t('اقتراح تعديل', 'Suggérer')}
            </Button>
            {can('services.manage') && (
              <Button size="sm" variant="soft" className="ms-auto" onClick={() => setEditing(service)}>
                <Pencil />
                {t('تعديل الدليل', 'Modifier')}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {data.isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : service ? (
        <GuideView service={service} guide={guide} />
      ) : (
        <div className="space-y-4">
          {(inbox.data ?? []).length > 0 && (
            <div className="rounded-2xl border border-brand/30 bg-brand-50/40 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand">
                <Send className="size-4" />
                {t('أُرسل إليك', 'Envoyés pour vous')}
                {unread.length > 0 && <Badge tone="danger">{unread.length}</Badge>}
              </div>
              <div className="space-y-1.5">
                {(inbox.data ?? []).slice(0, 5).map((n) => {
                  const s = services.find((x) => x.id === sentService(n))
                  if (!s) return null
                  return (
                    <button key={n.id} onClick={() => openSent(n)} className={cn('flex w-full items-center gap-3 rounded-xl bg-surface p-2.5 text-start text-sm hover:bg-surface-2', !n.read_at && 'ring-1 ring-brand/40')}>
                      <BookOpen className="size-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate', !n.read_at && 'font-semibold')}>{pick(s, 'name')}</span>
                        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      </span>
                      <span className="num shrink-0 text-[11px] text-subtle">{format(new Date(n.created_at), 'dd/MM HH:mm')}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث: جواز السفر، السجل العدلي، طباعة…', 'Rechercher : passeport, casier, impression…')} autoFocus />
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            <Chip active={cat === null} onClick={() => setCat(null)} label={t('الكل', 'Tout')} />
            {cats.map((c) => (
              <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={pick(c, 'name')} icon={c.icon} />
            ))}
            {services.some((s) => s.kind === 'counter') && <Chip active={cat === 'counter'} onClick={() => setCat('counter')} label={t('خدمات المحل', 'Guichet')} icon="printer" />}
          </div>
          {!shown.length ? (
            <EmptyState icon={<BookOpen />} title={t('لا نتائج', 'Aucun résultat')} />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {shown.map((s) => {
                const g = data.data?.guides.get(s.id)
                const ready = hasGuide(g)
                return (
                  <button key={s.id} onClick={() => setSelected(s.id)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition-colors hover:border-brand/40">
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', ready ? 'bg-brand-50 text-brand' : 'bg-surface-2 text-subtle')}>
                      <DynamicIcon name={s.icon} className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm leading-snug font-medium">{pick(s, 'name')}</span>
                      <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                        {g?.steps?.length ? (
                          <span className="flex items-center gap-1">
                            <ListChecks className="size-3.5" />
                            {t(`${g.steps.length} خطوات`, `${g.steps.length} étapes`)}
                          </span>
                        ) : (
                          <span className="text-subtle">{t('بدون خطوات', 'Sans étapes')}</span>
                        )}
                        {g?.video_url && <PlayCircle className="size-3.5 text-danger" />}
                        {s.is_online === false && s.kind === 'admin' && <span className="text-subtle">{t('غير ظاهرة في الموقع', 'Hors ligne')}</span>}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      <GuideEditDialog service={editing} onClose={() => setEditing(null)} />
      <SendGuideDialog service={sending} guide={sending ? data.data?.guides.get(sending.id) : null} onClose={() => setSending(null)} />
      <SuggestGuideDialog serviceId={suggestFor} onClose={() => setSuggestFor(null)} />
    </Sheet>
  )
}

function Chip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: string | null }) {
  return (
    <button onClick={onClick} className={cn('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium', active ? 'border-transparent bg-navy text-white' : 'border-border bg-surface text-muted')}>
      {icon && <DynamicIcon name={icon} className="size-3.5" />}
      {label}
    </button>
  )
}
