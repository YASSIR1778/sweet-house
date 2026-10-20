import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { Banknote, ClipboardList, Eye, MessageCircle, ShoppingCart, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { openStaffFile, ORDER_STATUSES, PAYMENT_STATUS, siteTrackUrl, uploadStaffFile, useRequestStatuses } from '@/shared/lib/online'
import { fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { EmptyState, Tabs } from '@/shared/ui/data'
import { MoneyInput } from '@/shared/ui/pickers'
import type { DeviceInfo } from './device'

type Req = { id: string; number: string; tracking_code: string; service_name_ar: string; service_name_fr: string; customer_name: string; phone: string; status: string; price: number; payment_status: string; created_at: string }
type Ord = { id: string; number: string; tracking_code: string; customer_name: string; phone: string; total: number; delivery_method: string; payment_method: string; payment_status: string; status: string; created_at: string }

export function OnlineSheet({ device, open, onClose }: { device: DeviceInfo; open: boolean; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const statuses = useRequestStatuses(sb)
  const [tab, setTab] = useState(can('requests.manage') ? 'requests' : 'orders')
  const [price, setPrice] = useState<Record<string, number | null>>({})

  const reqs = useQuery({
    queryKey: ['pos-requests'],
    enabled: open && can('requests.manage'),
    queryFn: async () => (await sb.from('service_requests').select('id, number, tracking_code, service_name_ar, service_name_fr, customer_name, phone, status, price, payment_status, created_at').order('created_at', { ascending: false }).limit(100)).data as Req[],
  })
  const ords = useQuery({
    queryKey: ['pos-orders'],
    enabled: open && can('orders.manage'),
    queryFn: async () => (await sb.from('online_orders').select('id, number, tracking_code, customer_name, phone, total, delivery_method, payment_method, payment_status, status, created_at').not('status', 'in', '(delivered,cancelled)').order('created_at', { ascending: false })).data as Ord[],
  })
  const st = (k: string) => statuses.data?.find((s) => s.key === k)
  const openReqs = (reqs.data ?? []).filter((r) => !st(r.status)?.is_final || r.payment_status !== 'paid')
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['pos-requests'] })
    qc.invalidateQueries({ queryKey: ['pos-orders'] })
    qc.invalidateQueries({ queryKey: ['shift', device.id] })
    qc.invalidateQueries({ queryKey: ['online-pending'] })
  }

  const cashReq = async (r: Req) => {
    const amount = price[r.id] ?? r.price
    if (!amount) return toast.error(t('حدد السعر أولاً', 'Indiquez le prix'))
    if (!(await confirm({ title: t('استلام الأداء نقداً؟', 'Encaisser en espèces ?'), description: `${r.number} · ${money(amount)}` }))) return
    const { error } = await sb.rpc('confirm_request_payment', { p_id: r.id, p_amount: amount, p_method: 'cash', p_device: device.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم الاستلام ودخل المبلغ الصندوق ✅', 'Encaissé ✅'))
    refresh()
  }
  const cashOrd = async (o: Ord) => {
    if (!(await confirm({ title: t('استلام الأداء نقداً؟', 'Encaisser en espèces ?'), description: `${o.number} · ${money(o.total)}` }))) return
    const { error } = await sb.rpc('confirm_order_payment', { p_id: o.id, p_method: 'cash', p_device: device.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم الاستلام ✅', 'Encaissé ✅'))
    refresh()
  }
  const setReq = async (r: Req, key: string) => {
    const { error } = await sb.rpc('set_request_status', { p_id: r.id, p_status: key, p_note: null })
    if (error) return toast.error(errorMessage(error, lang))
    refresh()
    const s = st(key)
    if (s?.template_ar) window.open(whatsappLink(r.phone, fillTemplate(s.template_ar, { name: r.customer_name, service: r.service_name_ar, number: r.number, link: siteTrackUrl(r.tracking_code) })), '_blank')
  }
  const upload = async (r: Req, files: FileList | null) => {
    if (!files?.length) return
    try {
      for (const f of Array.from(files)) await uploadStaffFile(sb, { request: r.id }, f, 'deliverable')
      toast.success(t('تم رفع الوثيقة', 'Document ajouté'))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    }
  }
  const viewFiles = async (r: Req) => {
    const { data } = await sb.from('request_files').select('path, name').eq('request_id', r.id).is('deleted_at', null)
    if (!data?.length) return toast.info(t('لا توجد ملفات', 'Aucun fichier'))
    for (const f of data) await openStaffFile(sb, f.path)
  }
  const ago = (d: string) => formatDistanceToNow(new Date(d), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={t('الطلبات الأونلاين', 'Commandes en ligne')} width="max-w-xl">
      {confirmNode}
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[...(can('requests.manage') ? [{ value: 'requests', label: t('الخدمات', 'Services'), count: openReqs.length }] : []), ...(can('orders.manage') ? [{ value: 'orders', label: t('المتجر', 'Boutique'), count: ords.data?.length }] : [])]} />
      {tab === 'requests' ? (
        !openReqs.length ? (
          <EmptyState icon={<ClipboardList />} title={t('لا توجد طلبات قيد الإنجاز', 'Aucune demande en cours')} />
        ) : (
          <div className="space-y-3">
            {openReqs.map((r) => {
              const s = st(r.status)
              return (
                <Card key={r.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold">{pick(r, 'service_name')}</div>
                      <div className="text-sm text-muted">
                        {r.customer_name} · <span className="num">{r.number}</span> · {ago(r.created_at)}
                      </div>
                    </div>
                    {s && <Badge style={{ background: `${s.color}1a`, color: s.color }}>{pick(s, 'name')}</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {statuses.data?.filter((x) => x.key !== r.status && !x.is_cancel).map((x) => (
                      <button key={x.key} onClick={() => setReq(r, x.key)} className="rounded-lg border px-2.5 py-1 text-xs font-medium" style={{ borderColor: `${x.color}55`, color: x.color }}>
                        → {pick(x, 'name')}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => viewFiles(r)}>
                      <Eye />
                    </Button>
                    <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] px-3 text-sm hover:bg-surface-2">
                      <Upload className="size-4" />
                      {t('الوثيقة الجاهزة', 'Livrable')}
                      <input type="file" hidden multiple onChange={(e) => (upload(r, e.target.files), (e.target.value = ''))} />
                    </label>
                    <Button asChild size="sm" variant="ghost">
                      <a href={whatsappLink(r.phone, '')} target="_blank" rel="noreferrer">
                        <MessageCircle className="text-success" />
                      </a>
                    </Button>
                    {r.payment_status !== 'paid' ? (
                      <div className="ms-auto flex items-center gap-2">
                        <MoneyInput className="w-28" value={price[r.id] ?? r.price} onChange={(v) => setPrice({ ...price, [r.id]: v })} />
                        <Button size="sm" onClick={() => cashReq(r)}>
                          <Banknote />
                          {t('استلام', 'Encaisser')}
                        </Button>
                      </div>
                    ) : (
                      <Badge tone="success" className="ms-auto">{t('مدفوع', 'Payé')}</Badge>
                    )}
                  </div>
                </Card>
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
                  <Badge style={{ background: `${ORDER_STATUSES[o.status].color}1a`, color: ORDER_STATUSES[o.status].color }}>{t(ORDER_STATUSES[o.status].ar, ORDER_STATUSES[o.status].fr)}</Badge>
                  <Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{t(PAYMENT_STATUS[o.payment_status].ar, PAYMENT_STATUS[o.payment_status].fr)}</Badge>
                  {ago(o.created_at)}
                </div>
              </div>
              <span className="num font-bold">{money(o.total)}</span>
              {o.payment_status !== 'paid' && (
                <Button size="sm" onClick={() => cashOrd(o)}>
                  <Banknote />
                  {t('استلام', 'Encaisser')}
                </Button>
              )}
            </Card>
          ))}
          <p className="text-center text-xs text-muted">{t('لتغيير حالة طلبات المتجر افتح لوحة التحكم ← طلبات المتجر', 'Gestion complète dans le tableau de bord')}</p>
        </div>
      )}
    </Sheet>
  )
}
