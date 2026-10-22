import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { AlarmClock, CheckCircle2, ClipboardPlus, LifeBuoy, MessageCircle, Phone, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn, past, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card } from './primitives'
import { EmptyState, Tabs } from './data'
import { AssigneeBadge, AssignmentCard, type AssigneeMini } from './assignment'
import { StaffRequestSheet, type StaffRequestPrefill } from './staff-request'

export type HelpRow = {
  id: string
  service_id: string | null
  service_name_ar: string | null
  service_name_fr: string | null
  name: string | null
  phone: string
  question: string | null
  step: string | null
  status: 'new' | 'in_progress' | 'done' | 'cancelled'
  created_at: string
  first_response_at: string | null
  assignee: AssigneeMini
  late: boolean
  request_number: string | null
  request_code: string | null
}

const STEP: Record<string, [string, string]> = {
  start: ['بداية الصفحة', 'Début'],
  contact: ['معلومات التواصل', 'Coordonnées'],
  info: ['معلومات الطلب', 'Informations'],
  documents: ['رفع الوثائق', 'Documents'],
  payment: ['الأداء', 'Paiement'],
}
const STATUS: Record<HelpRow['status'], [string, string, 'warning' | 'info' | 'success' | 'neutral']> = {
  new: ['ينتظر الرد', 'En attente', 'warning'],
  in_progress: ['قيد المساعدة', 'En cours', 'info'],
  done: ['تمت المساعدة', 'Traité', 'success'],
  cancelled: ['أُلغي', 'Annulé', 'neutral'],
}

export function useHelpList(enabled = true) {
  const { sb } = useAuth()
  return useQuery({ queryKey: ['help'], enabled, refetchInterval: 30_000, queryFn: async () => (await sb.rpc('help_list')).data as HelpRow[] })
}

/** 2 · Help requests desk (dashboard page and POS tab). */
export function HelpDesk({ compact }: { compact?: boolean }) {
  const { sb, me } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const list = useHelpList()
  const [tab, setTab] = useState('open')
  const [openId, setOpenId] = useState<string | null>(null)
  const [fill, setFill] = useState<StaffRequestPrefill | null>(null)
  const rows = (list.data ?? []).filter((h) =>
    tab === 'open' ? ['new', 'in_progress'].includes(h.status) : tab === 'mine' ? h.assignee?.id === me?.id && ['new', 'in_progress'].includes(h.status) : tab === 'done' ? ['done', 'cancelled'].includes(h.status) : true,
  )
  const count = (fn: (h: HelpRow) => boolean) => (list.data ?? []).filter(fn).length
  const refresh = () => (qc.invalidateQueries({ queryKey: ['help'] }), qc.invalidateQueries({ queryKey: ['help-counts'] }))
  const ago = (d: string) => formatDistanceToNow(past(d), { addSuffix: true, locale: lang === 'fr' ? frLocale : arLocale })

  const contacted = async (h: HelpRow) => {
    const { error } = await sb.rpc('help_contacted', { p_id: h.id })
    if (error) toast.error(errorMessage(error, lang))
    refresh()
  }
  const setStatus = async (h: HelpRow, s: HelpRow['status']) => {
    const { error } = await sb.rpc('help_set_status', { p_id: h.id, p_status: s })
    if (error) return toast.error(errorMessage(error, lang))
    refresh()
  }
  const waMsg = (h: HelpRow) => `مرحباً ${h.name ?? ''} 👋\nمعكم مكتبة سويت هاوس، بخصوص طلب المساعدة${h.service_name_ar ? ` في «${h.service_name_ar}»` : ''}. كيف يمكننا مساعدتكم؟`

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'open', label: t('قيد الانتظار', 'En attente'), count: count((h) => ['new', 'in_progress'].includes(h.status)) },
          { value: 'mine', label: t('عندي', 'Les miens'), count: count((h) => h.assignee?.id === me?.id && ['new', 'in_progress'].includes(h.status)) },
          { value: 'done', label: t('المنتهية', 'Traités') },
          ...(compact ? [] : [{ value: 'all', label: t('الكل', 'Tous') }]),
        ]}
      />
      {!rows.length ? (
        <EmptyState icon={<LifeBuoy />} title={t('لا أحد ينتظر المساعدة الآن 👌', 'Personne n’attend 👌')} />
      ) : (
        <div className="space-y-3">
          {rows.map((h) => (
            <Card key={h.id} className={cn('space-y-3 p-4', h.late && 'border-2 border-danger/50 bg-danger/5')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {h.name || t('زبون', 'Client')} <span className="num text-sm font-normal text-muted" dir="ltr">+{h.phone}</span>
                  </div>
                  <div className="text-sm text-muted">
                    {h.service_name_ar ? pick(h, 'service_name') : t('بدون خدمة محددة', 'Sans service')}
                    {h.step && ` · ${t('توقف عند:', 'Bloqué à :')} ${t(...(STEP[h.step] ?? [h.step, h.step]))}`} · {ago(h.created_at)}
                  </div>
                  {h.question && <div className="mt-1.5 rounded-lg bg-surface-2 p-2 text-sm">«{h.question}»</div>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={STATUS[h.status][2]}>{t(STATUS[h.status][0], STATUS[h.status][1])}</Badge>
                  {h.late && (
                    <Badge tone="danger">
                      <AlarmClock />
                      {t('ينتظر طويلاً', 'Attente longue')}
                    </Badge>
                  )}
                  {['new', 'in_progress'].includes(h.status) && <AssigneeBadge a={h.assignee} />}
                  {h.request_number && <Badge tone="success">{t('طلب', 'Demande')} {h.request_number}</Badge>}
                </div>
              </div>
              {['new', 'in_progress'].includes(h.status) && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" asChild onClick={() => contacted(h)}>
                    <a href={`tel:+${h.phone}`}>
                      <Phone />
                      {t('اتصال', 'Appeler')}
                    </a>
                  </Button>
                  <Button size="sm" variant="success" asChild onClick={() => contacted(h)}>
                    <a href={whatsappLink(h.phone, waMsg(h))} target="_blank" rel="noreferrer">
                      <MessageCircle />
                      WhatsApp
                    </a>
                  </Button>
                  <Button size="sm" onClick={() => setFill({ service_id: h.service_id, name: h.name, phone: h.phone, help_id: h.id, question: h.question })}>
                    <ClipboardPlus />
                    {t('نكمل الطلب عنه', 'Créer sa demande')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(h, 'done')}>
                    <CheckCircle2 />
                    {t('تمت المساعدة', 'Traité')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setStatus(h, 'cancelled')}>
                    <X />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpenId(openId === h.id ? null : h.id)}>
                    {t('المسؤول', 'Responsable')}
                  </Button>
                </div>
              )}
              {openId === h.id && <AssignmentCard entity="help" id={h.id} />}
            </Card>
          ))}
        </div>
      )}
      <StaffRequestSheet open={!!fill} onClose={() => (setFill(null), refresh())} prefill={fill ?? undefined} />
    </div>
  )
}
