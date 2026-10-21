import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { AlarmClock, CheckCheck, ClipboardList, Globe2, Paperclip, Search, Sparkles } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { PAYMENT_STATUS, useRequestStatuses } from '@/shared/lib/online'
import { Badge, Input } from '@/shared/ui/primitives'
import { DataTable, EmptyState, PageHeader, Tabs, type Column } from '@/shared/ui/data'
import { RequestSheet, StatusBadge } from '@/shared/ui/request-sheet'
import { AssigneeBadge, type AssigneeMini } from '@/shared/ui/assignment'

export type RequestRow = {
  id: string
  number: string
  tracking_code: string
  service_name_ar: string
  service_name_fr: string
  customer_name: string
  phone: string
  status: string
  price: number
  payment_method: string
  payment_status: string
  notes: string | null
  created_at: string
  files_count: number
  deliverables_count: number
  downloaded: boolean
  new_docs: number
  late: boolean
  assignee: AssigneeMini
  due_at: string | null
  abroad: boolean
  country: string | null
}

export function useRequestsList(key: string, enabled = true) {
  const { sb } = useAuth()
  return useQuery({
    queryKey: [key],
    enabled,
    refetchInterval: 45_000,
    queryFn: async () => (await sb.rpc('requests_list', { p_limit: 1000 })).data as RequestRow[],
  })
}

export function RequestsPage() {
  const { sb, me } = useAuth()
  const { t, pick, lang } = useLang()
  const statuses = useRequestStatuses(sb)
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = useRequestsList('requests')
  const st = (k: string) => statuses.data?.find((s) => s.key === k)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list.data ?? []).filter((r) => {
      if (tab === 'open' && st(r.status)?.is_final) return false
      if (tab === 'docs' && !r.new_docs) return false
      if (tab === 'proof' && r.payment_status !== 'proof_uploaded') return false
      if (tab === 'received' && r.status !== 'received') return false
      if (tab === 'late' && !r.late) return false
      if (tab === 'mine' && r.assignee?.id !== me?.id) return false
      if (tab === 'free' && (r.assignee || st(r.status)?.is_final)) return false
      if (tab === 'abroad' && !r.abroad) return false
      return !s || r.number.toLowerCase().includes(s) || r.customer_name.toLowerCase().includes(s) || r.phone.includes(s) || r.service_name_ar.includes(s) || r.tracking_code.toLowerCase().includes(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, tab, q, statuses.data])
  const count = (fn: (r: RequestRow) => boolean) => (list.data ?? []).filter(fn).length

  const columns: Column<RequestRow>[] = [
    { key: 'n', header: t('الطلب', 'N°'), cell: (r) => <span className="num font-semibold">{r.number}</span> },
    {
      key: 's',
      header: t('الخدمة', 'Service'),
      cell: (r) => (
        <div className="max-w-64">
          <div className="flex items-center gap-1.5 font-medium">
            {r.service_name_ar.startsWith('لم تجد') && <Sparkles className="size-3.5 shrink-0 text-brand" />}
            {r.abroad && <Globe2 className="size-3.5 shrink-0 text-info" />}
            <span className="truncate">{pick(r, 'service_name')}</span>
          </div>
          {r.notes && <div className="truncate text-xs text-muted">{r.notes}</div>}
        </div>
      ),
    },
    { key: 'c', header: t('الزبون', 'Client'), cell: (r) => (<div><div>{r.customer_name}</div><div className="num text-xs text-muted" dir="ltr">+{r.phone}</div></div>) },
    {
      key: 'docs',
      header: t('الوثائق', 'Docs'),
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="num inline-flex items-center gap-1 text-sm text-muted">
            <Paperclip className="size-3.5" />
            {r.files_count}
          </span>
          {r.new_docs > 0 && <Badge tone="danger" className="animate-pulse">+{r.new_docs} {t('جديدة', 'nouv.')}</Badge>}
          {r.downloaded && <Badge tone="success"><CheckCheck />{t('حُمّلت', 'Téléchargé')}</Badge>}
        </div>
      ),
    },
    {
      key: 'st',
      header: t('الحالة', 'Statut'),
      cell: (r) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge s={st(r.status)} />
          {r.late && (
            <Badge tone="danger">
              <AlarmClock />
              {t('متأخر', 'En retard')}
            </Badge>
          )}
        </div>
      ),
    },
    { key: 'as', header: t('المسؤول', 'Responsable'), cell: (r) => (st(r.status)?.is_final && !r.assignee ? <span className="text-subtle">—</span> : <AssigneeBadge a={r.assignee} />) },
    { key: 'p', header: t('الأداء', 'Paiement'), cell: (r) => <Badge tone={PAYMENT_STATUS[r.payment_status].tone}>{t(PAYMENT_STATUS[r.payment_status].ar, PAYMENT_STATUS[r.payment_status].fr)}</Badge> },
    { key: 'd', header: t('منذ', 'Reçue'), sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-muted">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })}</span> },
  ]

  return (
    <>
      <PageHeader icon={<ClipboardList />} title={t('طلبات الخدمات', 'Demandes de services')} description={t('الطلبات الواردة من الموقع: التفاصيل، الوثائق، الحالة، الأداء، والتسليم', 'Demandes du site : détails, documents, statut, paiement')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: t('قيد الإنجاز', 'En cours'), count: count((r) => !st(r.status)?.is_final) },
            { value: 'mine', label: t('طلباتي', 'Mes demandes'), count: count((r) => r.assignee?.id === me?.id && !st(r.status)?.is_final) },
            { value: 'free', label: t('بدون مسؤول', 'Sans responsable'), count: count((r) => !r.assignee && !st(r.status)?.is_final) },
            { value: 'received', label: t('جديدة', 'Nouvelles'), count: count((r) => r.status === 'received') },
            { value: 'late', label: t('متأخرة', 'En retard'), count: count((r) => r.late) },
            { value: 'docs', label: t('وثائق جديدة', 'Nouveaux docs'), count: count((r) => r.new_docs > 0) },
            { value: 'proof', label: t('تحويلات للتأكيد', 'Virements'), count: count((r) => r.payment_status === 'proof_uploaded') },
            ...(count((r) => r.abroad) ? [{ value: 'abroad', label: t('🌍 من الخارج', '🌍 Étranger'), count: count((r) => r.abroad) }] : []),
            { value: 'all', label: t('الكل', 'Toutes') },
          ]}
        />
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('رقم، اسم، هاتف، خدمة…', 'N°, nom, téléphone…')} />
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => setOpen(r.id)} empty={<EmptyState icon={<ClipboardList />} title={t('لا توجد طلبات', 'Aucune demande')} />} />
      <RequestSheet id={open} onClose={() => setOpen(null)} />
    </>
  )
}
