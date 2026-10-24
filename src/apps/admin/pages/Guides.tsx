import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router'
import { format } from 'date-fns'
import { BookOpen, Eye, Link2, ListChecks, MessageSquareText, Pencil, PlayCircle, Search, Users } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { cn, matchesSearch } from '@/shared/lib/utils'
import { Badge, Button, Card, Input, Skeleton } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { GuideView, hasGuide, useServiceGuides, type GuideService } from '@/shared/ui/guide'
import { GuideEditDialog } from '@/shared/ui/guide-editor'
import { GuideLinksDialog, GuideShareMenu, SendGuideDialog } from '@/shared/ui/guide-share'

type Filter = 'all' | 'no_steps' | 'no_video' | 'suggestions'

/** Every service's staff guide: read, edit, send to an employee or share a read-only link. */
export function GuidesPage() {
  const { sb, can } = useAuth()
  const { t, pick } = useLang()
  const data = useServiceGuides(sb)
  const [params, setParams] = useSearchParams()
  const [kind, setKind] = useState<'admin' | 'counter'>('admin')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<GuideService | null>(null)
  const [sending, setSending] = useState<GuideService | null>(null)
  const [linksFor, setLinksFor] = useState<GuideService | null>(null)
  const canEdit = can('services.manage')
  const canSend = canEdit || can('requests.manage')

  const suggestions = useQuery({
    queryKey: ['guide-suggestion-counts'],
    enabled: canEdit,
    queryFn: async () => {
      const rows = (await sb.from('guide_suggestions').select('service_id').eq('status', 'pending')).data ?? []
      const m = new Map<string, number>()
      for (const r of rows as { service_id: string }[]) m.set(r.service_id, (m.get(r.service_id) ?? 0) + 1)
      return m
    },
  })

  const services = data.data?.services ?? []
  const guides = data.data?.guides
  const viewing = params.get('service')
  const viewed = viewing ? services.find((s) => s.id === viewing) : undefined
  const view = (id: string | null) => setParams(id ? { service: id } : {}, { replace: true })

  const list = useMemo(
    () =>
      services.filter((s) => {
        const g = guides?.get(s.id)
        if (s.kind !== kind || !matchesSearch(q, s.name_ar, s.name_fr, g?.tips_ar)) return false
        if (filter === 'no_steps') return !g?.steps?.length
        if (filter === 'no_video') return !g?.video_url
        if (filter === 'suggestions') return (suggestions.data?.get(s.id) ?? 0) > 0
        return true
      }),
    [services, guides, kind, q, filter, suggestions.data],
  )
  const groups = useMemo(() => {
    const cats = (data.data?.categories ?? []).filter((c) => c.kind === kind)
    const out = cats.map((c) => ({ c: c as (typeof cats)[number] | null, items: list.filter((s) => s.category_id === c.id) }))
    const orphan = list.filter((s) => !cats.some((c) => c.id === s.category_id))
    if (orphan.length) out.push({ c: null, items: orphan })
    return out.filter((g) => g.items.length)
  }, [data.data, list, kind])

  const ofKind = services.filter((s) => s.kind === kind)
  const stats = {
    ready: ofKind.filter((s) => guides?.get(s.id)?.steps?.length).length,
    noVideo: ofKind.filter((s) => !guides?.get(s.id)?.video_url).length,
    suggestions: [...(suggestions.data?.entries() ?? [])].filter(([id]) => ofKind.some((s) => s.id === id)).reduce((a, [, n]) => a + n, 0),
  }

  return (
    <div>
      <PageHeader
        icon={<BookOpen />}
        title={t('أدلة الخدمات', 'Guides des services')}
        description={t('كيف تُنجز كل خدمة. يظهر الدليل للموظف في نقطة البيع وداخل الطلبات، ويمكنك إرساله لموظفة أو مشاركته برابط مع شخص خارج المحل.', 'Comment traiter chaque service : visible au POS et dans les demandes, à envoyer à un employé ou à partager par lien.')}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onChange={(v) => (setKind(v as 'admin' | 'counter'), setFilter('all'))}
          items={[
            { value: 'admin', label: t('الخدمات الإدارية', 'Services administratifs'), count: services.filter((s) => s.kind === 'admin').length },
            { value: 'counter', label: t('خدمات المحل', 'Guichet'), count: services.filter((s) => s.kind === 'counter').length },
          ]}
        />
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث في الأدلة…', 'Rechercher…')} className="max-w-72" />
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['all', t('الكل', 'Tout'), ofKind.length],
            ['no_steps', t('بدون خطوات', 'Sans étapes'), ofKind.length - stats.ready],
            ['no_video', t('بدون فيديو', 'Sans vidéo'), stats.noVideo],
            ...(canEdit ? [['suggestions', t('فيها اقتراحات من الفريق', 'Suggestions de l’équipe'), stats.suggestions]] : []),
          ] as [Filter, string, number][]
        ).map(([v, label, n]) => (
          <button key={v} onClick={() => setFilter(v)} className={cn('flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm', filter === v ? 'border-transparent bg-navy text-white' : 'border-border bg-surface text-muted')}>
            {label}
            <span className={cn('num rounded-full px-1.5 text-xs', filter === v ? 'bg-white/20' : 'bg-surface-2')}>{n}</span>
          </button>
        ))}
      </div>

      {data.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : !groups.length ? (
        <EmptyState icon={<BookOpen />} title={t('لا توجد خدمات هنا', 'Aucun service')} />
      ) : (
        <div className="space-y-8">
          {groups.map((grp) => (
            <section key={grp.c?.id ?? 'none'}>
              <h2 className="mb-3 flex items-center gap-2 font-semibold">
                {grp.c && <DynamicIcon name={grp.c.icon} className="size-4.5 text-brand" />}
                {grp.c ? pick(grp.c, 'name') : t('بدون فئة', 'Sans catégorie')}
                <span className="num text-sm font-normal text-muted">({grp.items.length})</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grp.items.map((s) => {
                  const g = guides?.get(s.id)
                  const sugg = suggestions.data?.get(s.id) ?? 0
                  return (
                    <Card key={s.id} className="flex flex-col p-4">
                      <button onClick={() => view(s.id)} className="flex items-start gap-3 text-start">
                        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', hasGuide(g) ? 'bg-brand-50 text-brand' : 'bg-surface-2 text-subtle')}>
                          <DynamicIcon name={s.icon} className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 leading-snug font-medium">{pick(s, 'name')}</span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {g?.steps?.length ? (
                              <Badge tone="success">
                                <ListChecks />
                                {t(`${g.steps.length} خطوات`, `${g.steps.length} étapes`)}
                              </Badge>
                            ) : (
                              <Badge tone="warning">{t('بدون خطوات', 'Sans étapes')}</Badge>
                            )}
                            {g?.video_url ? (
                              <Badge tone="danger">
                                <PlayCircle />
                                {t('فيديو', 'Vidéo')}
                              </Badge>
                            ) : (
                              <Badge>{t('بدون فيديو', 'Sans vidéo')}</Badge>
                            )}
                            {sugg > 0 && (
                              <Badge tone="info">
                                <MessageSquareText />
                                {sugg}
                              </Badge>
                            )}
                            {s.kind === 'admin' && s.is_online === false && <Badge>{t('غير ظاهرة في الموقع', 'Hors ligne')}</Badge>}
                          </span>
                        </span>
                      </button>
                      <div className="mt-auto flex items-center gap-1 pt-3">
                        {g?.updated_at && (
                          <span className="num min-w-0 flex-1 truncate text-[11px] text-subtle">
                            {format(new Date(g.updated_at), 'dd/MM/yyyy')}
                            {g.employees?.full_name && ` · ${g.employees.full_name}`}
                          </span>
                        )}
                        <span className="ms-auto flex gap-1">
                          <Button size="icon-sm" variant="ghost" onClick={() => view(s.id)}>
                            <Eye />
                          </Button>
                          {canEdit && (
                            <Button size="icon-sm" variant="ghost" onClick={() => setEditing(s)}>
                              <Pencil />
                            </Button>
                          )}
                          {canSend && (
                            <Button size="icon-sm" variant="ghost" onClick={() => setSending(s)}>
                              <Users />
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="icon-sm" variant="ghost" onClick={() => setLinksFor(s)}>
                              <Link2 />
                            </Button>
                          )}
                        </span>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={!!viewed}
        onOpenChange={(o) => !o && view(null)}
        width="max-w-2xl"
        title={viewed ? pick(viewed, 'name') : ''}
        description={t('دليل الموظف', 'Guide de l’employé')}
        footer={
          viewed && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <GuideShareMenu service={viewed} guide={guides?.get(viewed.id)} onSendToEmployee={canSend ? () => setSending(viewed) : undefined} onLinks={canEdit ? () => setLinksFor(viewed) : undefined} />
              {canEdit && (
                <Button size="sm" className="ms-auto" onClick={() => setEditing(viewed)}>
                  <Pencil />
                  {t('تعديل الدليل', 'Modifier le guide')}
                </Button>
              )}
            </div>
          )
        }
      >
        {viewed && <GuideView service={viewed} guide={guides?.get(viewed.id)} />}
      </Sheet>
      <GuideEditDialog service={editing} onClose={() => (setEditing(null), suggestions.refetch())} />
      <SendGuideDialog service={sending} guide={sending ? guides?.get(sending.id) : null} onClose={() => setSending(null)} />
      <GuideLinksDialog service={linksFor} onClose={() => setLinksFor(null)} />
    </div>
  )
}
