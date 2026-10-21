import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { AlarmClock, Banknote, CheckCheck, Globe2, ClipboardList, FileCheck2, Paperclip, ShoppingCart } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { ORDER_STATUSES, PAYMENT_STATUS, useRequestStatuses } from '@/shared/lib/online'
import { RequestSheet } from '@/shared/ui/request-sheet'
import { useRequestsList } from '../admin/pages/Requests'
import { Badge, Button, Card } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { EmptyState, Tabs } from '@/shared/ui/data'
import type { DeviceInfo } from './device'
import { AssigneeBadge, AssignmentCard, type AssigneeMini } from '@/shared/ui/assignment'
import { HelpDesk, useHelpList } from '@/shared/ui/help-desk'

type Ord = { assignee: AssigneeMini; id: string; number: string; tracking_code: string; customer_name: string; phone: string; total: number; delivery_method: string; payment_method: string; payment_status: string; status: string; created_at: string }

export function OnlineSheet({ device, open, onClose }: { device: DeviceInfo; open: boolean; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const statuses = useRequestStatuses(sb)
  const [tab, setTab] = useState(can('requests.manage') ? 'requests' : 'orders')

  const reqs = useRequestsList('pos-requests', open && can('requests.manage'))
  const help = useHelpList(open && can('requests.manage'))
  const [openReq, setOpenReq] = useState<string | null>(null)
  const [openOrd, setOpenOrd] = useState<string | null>(null)
  const ords = useQuery({
    queryKey: ['pos-orders'],
    enabled: open && can('orders.manage'),
    queryFn: async () => (await sb.from('online_orders').select('id, number, tracking_code, customer_name, phone, total, delivery_method, payment_method, payment_status, status, created_at, assignee:employees!online_orders_assigned_to_fkey(id, full_name, color)').not('status', 'in', '(delivered,cancelled)').order('created_at', { ascending: false })).data as unknown as Ord[],
  })
  const st = (k: string) => statuses.data?.find((s) => s.key === k)
  const openReqs = (reqs.data ?? []).filter((r) => !st(r.status)?.is_final || r.payment_status !== 'paid').sort((a, b) => Number(b.late) - Number(a.late))
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pos-requests'] })
    qc.invalidateQueries({ queryKey: ['pos-orders'] })
    qc.invalidateQueries({ queryKey: ['shift', device.id] })
    qc.invalidateQueries({ queryKey: ['online-pending'] })
  }

  const cashOrd = async (o: Ord) => {
    if (!(await confirm({ title: t('استلام الأداء نقداً؟', 'Encaisser en espèces ?'), description: `${o.number} · ${money(o.total)}` }))) return
    const { error } = await sb.rpc('confirm_order_payment', { p_id: o.id, p_method: 'cash', p_device: device.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم الاستلام ✅', 'Encaissé ✅'))
    refresh()
  }
  const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={t('الطلبات الأونلاين', 'Commandes en ligne')} width="max-w-xl">
      {confirmNode}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[...(can('requests.manage') ? [{ value: 'help', label: t('المساعدة', 'Aide'), count: (help.data ?? []).filter((h) => ['new', 'in_progress'].includes(h.status)).length }] : []), ...(can('requests.manage') ? [{ value: 'requests', label: t('الخدمات', 'Services'), count: openReqs.length }] : []), ...(can('orders.manage') ? [{ value: 'orders', label: t('المتجر', 'Boutique'), count: ords.data?.length }] : [])]} />
      {tab === 'help' ? (
        <HelpDesk compact />
      ) : tab === 'requests' ? (
        !openReqs.length ? (
          <EmptyState icon={<ClipboardList />} title={t('لا توجد طلبات قيد الإنجاز', 'Aucune demande en cours')} />
        ) : (
          <div className="space-y-3">
            {openReqs.map((r) => {
              const s = st(r.status)
              return (
                <button key={r.id} onClick={() => setOpenReq(r.id)} className="block w-full text-start">
                  <Card className="space-y-2 p-4 transition-all hover:border-brand/40 hover:shadow-pop">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold">{pick(r, 'service_name')}</div>
                        <div className="text-sm text-muted">
                          {r.customer_name} · <span className="num">{r.number}</span> · {ago(r.created_at)}
                        </div>
                      </div>
                      {s && <Badge style={{ background: `${s.color}1a`, color: s.color }}>{pick(s, 'name')}</Badge>}
                    </div>
                    {r.notes && <div className="line-clamp-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">{r.notes}</div>}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge><Paperclip />{r.files_count} {t('وثيقة', 'docs')}</Badge>
                      {r.new_docs > 0 && <Badge tone="danger">+{r.new_docs} {t('جديدة', 'nouv.')}</Badge>}
                      {!st(r.status)?.is_final && <AssigneeBadge a={r.assignee} />}
                      {r.late && <Badge tone="danger"><AlarmClock />{t('متأخر', 'En retard')}</Badge>}
                      {r.abroad && <Badge tone="info"><Globe2 />{r.country ?? t('من الخارج', 'Étranger')}</Badge>}
                      {r.deliverables_count > 0 && <Badge tone="success"><FileCheck2 />{t('الوثيقة الجاهزة مرفوعة', 'Livrable prêt')}</Badge>}
                      {r.downloaded && <Badge tone="success"><CheckCheck />{t('حمّلها الزبون', 'Téléchargé')}</Badge>}
                      <Badge tone={PAYMENT_STATUS[r.payment_status].tone} className="ms-auto">{t(PAYMENT_STATUS[r.payment_status].ar, PAYMENT_STATUS[r.payment_status].fr)}{r.price ? ` · ${money(r.price)}` : ''}</Badge>
                    </div>
                  </Card>
                </button>
              )
            })}
          </div>
        )
      ) : !ords.data?.length ? (
        <EmptyState icon={<ShoppingCart />} title={t('لا توجد طلبات', 'Aucune commande')} />
      ) : (
        <div className="space-y-3">
          {ords.data.map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  <span className="num">{o.number}</span> · {o.customer_name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <AssigneeBadge a={o.assignee} />
                  <Badge style={{ background: `${ORDER_STATUSES[o.status].color}1a`, color: ORDER_STATUSES[o.status].color }}>{t(ORDER_STATUSES[o.status].ar, ORDER_STATUSES[o.status].fr)}</Badge>
                  <Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{t(PAYMENT_STATUS[o.payment_status].ar, PAYMENT_STATUS[o.payment_status].fr)}</Badge>
                  {ago(o.created_at)}
                </div>
              </div>
              <span className="num font-bold">{money(o.total)}</span>
              <Button size="sm" variant="ghost" onClick={() => setOpenOrd(openOrd === o.id ? null : o.id)}>
                {t('المسؤول', 'Responsable')}
              </Button>
              {o.payment_status !== 'paid' && (
                <Button size="sm" onClick={() => cashOrd(o)}>
                  <Banknote />
                  {t('استلام', 'Encaisser')}
                </Button>
              )}
              {openOrd === o.id && (
                <div className="w-full">
                  <AssignmentCard entity="order" id={o.id} />
                </div>
              )}
            </Card>
          ))}
          <p className="text-center text-xs text-muted">{t('لتغيير حالة طلبات المتجر افتح لوحة التحكم ← طلبات المتجر', 'Gestion complète dans le tableau de bord')}</p>
        </div>
      )}
      <RequestSheet id={openReq} onClose={() => (setOpenReq(null), refresh())} deviceId={device.id} />
    </Sheet>
  )
}
