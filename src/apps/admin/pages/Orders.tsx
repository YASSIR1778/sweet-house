import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { Eye, MapPin, MessageCircle, Package, Phone, Printer, Search, ShoppingCart, Store, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, qty } from '@/shared/lib/money'
import { openStaffFile, ORDER_STATUSES, PAYMENT_STATUS, siteTrackUrl } from '@/shared/lib/online'
import { fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/shared/ui/primitives'
import { sendWhatsApp } from '@/shared/lib/whatsapp'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, Tabs, type Column } from '@/shared/ui/data'
import { PrintArea } from '@/shared/ui/receipt'
import { AssigneeBadge, AssignmentCard, type AssigneeMini } from '@/shared/ui/assignment'

type Row = { assignee: AssigneeMini; id: string; number: string; tracking_code: string; customer_name: string; phone: string; city: string | null; delivery_method: 'delivery' | 'pickup'; total: number; payment_method: string; payment_status: string; status: string; created_at: string }
type Detail = Row & {
  email: string | null
  address: string | null
  subtotal: number
  delivery_fee: number
  notes: string | null
  internal_notes: string | null
  items: { id: string; name_ar: string; name_fr: string; qty: number; unit_price: number; total: number; image: string | null }[]
  history: { status: string; note: string | null; created_at: string; employee_name: string | null }[]
  files: { id: string; kind: string; name: string; path: string }[]
}

const PM: Record<string, [string, string]> = { cod: ['عند الاستلام', 'À la livraison'], in_store: ['في المحل', 'En boutique'], bank_transfer: ['تحويل بنكي', 'Virement'] }
const NEXT: Record<string, string[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'shipped', 'ready', 'cancelled'],
  preparing: ['shipped', 'ready', 'cancelled'],
  shipped: ['delivered', 'cancelled'],
  ready: ['delivered', 'cancelled'],
}

export function OStatus({ s }: { s: string }) {
  const { t } = useLang()
  const o = ORDER_STATUSES[s]
  return (
    <Badge style={{ background: `${o.color}1a`, color: o.color }}>
      <span className="size-1.5 rounded-full" style={{ background: o.color }} />
      {t(o.ar, o.fr)}
    </Badge>
  )
}

export function OrdersPage() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['orders'],
    refetchInterval: 60_000,
    queryFn: async () => (await sb.from('online_orders').select('id, number, tracking_code, customer_name, phone, city, delivery_method, total, payment_method, payment_status, status, created_at, assignee:employees!online_orders_assigned_to_fkey(id, full_name, color)').order('created_at', { ascending: false }).limit(1000)).data as unknown as Row[],
  })
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list.data ?? []).filter((o) => {
      if (tab === 'open' && ['delivered', 'cancelled'].includes(o.status)) return false
      if (tab === 'new' && o.status !== 'new') return false
      if (tab === 'mine' && o.assignee?.id !== me?.id) return false
      if (tab === 'free' && (o.assignee || ['delivered', 'cancelled'].includes(o.status))) return false
      if (tab === 'proof' && o.payment_status !== 'proof_uploaded') return false
      return !s || o.number.toLowerCase().includes(s) || o.customer_name.toLowerCase().includes(s) || o.phone.includes(s)
    })
  }, [list.data, tab, q])
  const count = (fn: (o: Row) => boolean) => (list.data ?? []).filter(fn).length

  const columns: Column<Row>[] = [
    { key: 'n', header: t('الطلب', 'N°'), cell: (o) => <span className="num font-semibold">{o.number}</span> },
    { key: 'c', header: t('الزبون', 'Client'), cell: (o) => (<div><div>{o.customer_name}</div><div className="num text-xs text-muted" dir="ltr">+{o.phone}</div></div>) },
    { key: 'd', header: t('الاستلام', 'Livraison'), cell: (o) => (o.delivery_method === 'delivery' ? <Badge tone="info"><Truck />{o.city}</Badge> : <Badge><Store />{t('المحل', 'Boutique')}</Badge>) },
    { key: 't', header: t('المجموع', 'Total'), sortValue: (o) => o.total, cell: (o) => <span className="num font-bold">{money(o.total)}</span> },
    { key: 'p', header: t('الأداء', 'Paiement'), cell: (o) => <div className="flex flex-col items-start gap-1"><Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{t(PAYMENT_STATUS[o.payment_status].ar, PAYMENT_STATUS[o.payment_status].fr)}</Badge><span className="text-[11px] text-muted">{t(...PM[o.payment_method])}</span></div> },
    { key: 's', header: t('الحالة', 'Statut'), cell: (o) => <OStatus s={o.status} /> },
    { key: 'as', header: t('المسؤول', 'Responsable'), cell: (o) => (['delivered', 'cancelled'].includes(o.status) && !o.assignee ? <span className="text-subtle">—</span> : <AssigneeBadge a={o.assignee} />) },
    { key: 'a', header: t('منذ', 'Reçue'), sortValue: (o) => o.created_at, cell: (o) => <span className="text-xs text-muted">{formatDistanceToNow(new Date(o.created_at), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })}</span> },
  ]

  return (
    <>
      <PageHeader icon={<ShoppingCart />} title={t('طلبات المتجر', 'Commandes')} description={t('الطلبات من الموقع: التأكيد يخصم المخزون، والإلغاء يُرجعه', 'Confirmer déduit le stock, annuler le restitue')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[
          { value: 'open', label: t('قيد الإنجاز', 'En cours'), count: count((o) => !['delivered', 'cancelled'].includes(o.status)) },
          { value: 'mine', label: t('طلبياتي', 'Mes commandes'), count: count((o) => o.assignee?.id === me?.id && !['delivered', 'cancelled'].includes(o.status)) },
          { value: 'free', label: t('بدون مسؤول', 'Sans responsable'), count: count((o) => !o.assignee && !['delivered', 'cancelled'].includes(o.status)) },
          { value: 'new', label: t('جديدة', 'Nouvelles'), count: count((o) => o.status === 'new') },
          { value: 'proof', label: t('تحويلات للتأكيد', 'Virements'), count: count((o) => o.payment_status === 'proof_uploaded') },
          { value: 'all', label: t('الكل', 'Toutes') },
        ]} />
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('رقم، اسم، هاتف…', 'N°, nom, téléphone…')} />
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(o) => o.id} loading={list.isLoading} onRowClick={(o) => setOpen(o.id)} empty={<EmptyState icon={<ShoppingCart />} title={t('لا توجد طلبات', 'Aucune commande')} />} />
      <OrderSheet id={open} onClose={() => setOpen(null)} />
    </>
  )
}

function OrderSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [note, setNote] = useState('')
  const [printing, setPrinting] = useState(false)
  const d = useQuery({ queryKey: ['order', id], enabled: !!id, queryFn: async () => (await sb.rpc('order_detail', { p_id: id })).data as Detail })
  const tpl = useQuery({ queryKey: ['settings', 'whatsapp'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'whatsapp').single()).data?.value as { templates?: Record<string, string> } })
  const store = useQuery({ queryKey: ['settings', 'store'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'store').single()).data?.value as { name_ar: string; phone: string } })
  const o = d.data
  const refresh = () => (qc.invalidateQueries({ queryKey: ['order', id] }), qc.invalidateQueries({ queryKey: ['orders'] }), qc.invalidateQueries({ queryKey: ['online-pending'] }), qc.invalidateQueries({ queryKey: ['products'] }))

  const wa = (key: string) => {
    if (!o) return ''
    const map: Record<string, string> = { new: 'order_received', confirmed: 'order_confirmed', preparing: 'order_confirmed', shipped: 'order_shipped', ready: 'order_ready', delivered: 'order_ready' }
    return fillTemplate(tpl.data?.templates?.[map[key] ?? 'order_received'] ?? '{name} — {number}\n{link}', { name: o.customer_name, number: o.number, total: money(o.total), link: siteTrackUrl(o.tracking_code) })
  }

  const setStatus = async (s: string) => {
    if (!o) return
    if (s === 'cancelled' && !(await confirm({ title: t('إلغاء الطلب؟', 'Annuler la commande ?'), description: t('سيُرجَع المخزون إن كان قد خُصم', 'Le stock sera restitué'), danger: true }))) return
    const { error } = await sb.rpc('set_order_status', { p_id: o.id, p_status: s, p_note: note || null })
    if (error) return toast.error(errorMessage(error, lang))
    setNote('')
    refresh()
    toast.success(t('تم تحديث الطلب', 'Commande mise à jour'), { action: { label: 'WhatsApp', onClick: () => sendWhatsApp(sb, o.phone, wa(s), lang) } })
  }
  const confirmPay = async (method: 'transfer' | 'card') => {
    if (!o) return
    const { error } = await sb.rpc('confirm_order_payment', { p_id: o.id, p_method: method, p_device: null })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تأكيد الأداء', 'Paiement confirmé'))
    refresh()
  }

  return (
    <Sheet open={!!id} onOpenChange={(v) => !v && onClose()} width="max-w-2xl" title={o ? `${t('طلب', 'Commande')} ${o.number}` : ''} description={o ? format(new Date(o.created_at), 'dd/MM/yyyy HH:mm') : undefined}>
      {confirmNode}
      {!o ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <AssignmentCard entity="order" id={o.id} />
          <div className="flex items-center justify-between">
            <OStatus s={o.status} />
            <Button variant="ghost" size="sm" onClick={() => setPrinting(true)}>
              <Printer />
              {t('طباعة بطاقة الطلب', 'Imprimer')}
            </Button>
          </div>
          <Card className="space-y-2 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{o.customer_name}</div>
                <div className="num text-sm text-muted" dir="ltr">+{o.phone}</div>
              </div>
              <Button asChild variant="outline" size="sm"><a href={`tel:+${o.phone}`}><Phone /></a></Button>
              <Button asChild variant="success" size="sm"><a href={whatsappLink(o.phone, wa(o.status))} target="_blank" rel="noreferrer"><MessageCircle />WhatsApp</a></Button>
            </div>
            {o.delivery_method === 'delivery' ? (
              <div className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                <MapPin className="mt-0.5 size-4 text-brand" />
                <span><b>{o.city}</b> — {o.address}</span>
              </div>
            ) : (
              <Badge><Store />{t('استلام من المحل', 'Retrait en boutique')}</Badge>
            )}
            {o.notes && <div className="rounded-lg bg-warning/5 p-2 text-sm">{o.notes}</div>}
          </Card>

          <Card className="divide-y divide-border">
            {o.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-3 text-sm">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">{i.image ? <img src={i.image} alt="" className="size-full object-cover" /> : <Package className="m-auto h-full size-5 text-subtle" />}</div>
                <span className="flex-1">{pick(i, 'name')}</span>
                <span className="num text-muted">{qty(i.qty)} × {money(i.unit_price)}</span>
                <span className="num w-24 text-end font-semibold">{money(i.total)}</span>
              </div>
            ))}
            <div className="space-y-1 p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted">{t('المنتجات', 'Sous-total')}</span><span className="num">{money(o.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted">{t('التوصيل', 'Livraison')}</span><span className="num">{money(o.delivery_fee)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>{t('المجموع', 'Total')}</span><span className="num">{money(o.total)}</span></div>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              {t('الأداء', 'Paiement')} · <span className="font-normal text-muted">{t(...PM[o.payment_method])}</span>
              <Badge tone={PAYMENT_STATUS[o.payment_status].tone}>{t(PAYMENT_STATUS[o.payment_status].ar, PAYMENT_STATUS[o.payment_status].fr)}</Badge>
            </div>
            {o.files.filter((f) => f.kind === 'payment_proof').map((f) => (
              <Button key={f.id} variant="outline" size="sm" onClick={() => openStaffFile(sb, f.path)}><Eye />{t('عرض وصل التحويل', 'Voir le justificatif')}</Button>
            ))}
            {o.payment_status !== 'paid' && can('payments.confirm_transfer') && (
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={() => confirmPay('transfer')}>{o.payment_method === 'cod' ? t('تأكيد استلام المبلغ من شركة التوصيل', 'Encaissement livreur confirmé') : t('تأكيد التحويل', 'Confirmer le virement')}</Button>
                <Button size="sm" variant="outline" onClick={() => confirmPay('card')}>{t('بطاقة', 'Carte')}</Button>
              </div>
            )}
          </Card>

          {can('orders.manage') && NEXT[o.status] && (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">{t('تحديث الحالة', 'Mettre à jour')}</div>
              <div className="flex flex-wrap gap-2">
                {NEXT[o.status].filter((s) => o.delivery_method === 'delivery' || s !== 'shipped').filter((s) => o.delivery_method === 'pickup' || s !== 'ready').map((s) => (
                  <Button key={s} size="sm" variant={s === 'cancelled' ? 'danger-soft' : 'outline'} onClick={() => setStatus(s)}>→ {t(ORDER_STATUSES[s].ar, ORDER_STATUSES[s].fr)}</Button>
                ))}
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ملاحظة (اختياري)', 'Note (optionnel)')} />
            </Card>
          )}

          <Field label={t('ملاحظات داخلية', 'Notes internes')}>
            <Textarea defaultValue={o.internal_notes ?? ''} onBlur={(e) => sb.from('online_orders').update({ internal_notes: e.target.value }).eq('id', o.id)} />
          </Field>

          <Card className="p-4">
            <div className="mb-2 text-sm font-semibold">{t('السجل', 'Historique')}</div>
            {o.history.map((h, i) => (
              <div key={i} className="flex items-center gap-3 py-1 text-sm">
                <span className="size-2 rounded-full" style={{ background: ORDER_STATUSES[h.status]?.color }} />
                <span>{h.note === 'payment_confirmed' ? t('تأكيد الأداء', 'Paiement confirmé') : t(ORDER_STATUSES[h.status]?.ar ?? h.status, ORDER_STATUSES[h.status]?.fr ?? h.status)}</span>
                <span className="num ms-auto text-xs text-subtle">{format(new Date(h.created_at), 'dd/MM HH:mm')} {h.employee_name && `· ${h.employee_name}`}</span>
              </div>
            ))}
          </Card>

          {printing && (
            <PrintArea onDone={() => setPrinting(false)}>
              <div style={{ width: '100%', fontSize: 12, color: '#000', direction: 'rtl' }}>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>{store.data?.name_ar}</div>
                <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 16, margin: '4px 0' }}>{o.number}</div>
                <div>{o.customer_name} — <span style={{ direction: 'ltr' }}>+{o.phone}</span></div>
                {o.delivery_method === 'delivery' && <div>{o.city} — {o.address}</div>}
                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                {o.items.map((i) => (
                  <div key={i.id} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{i.name_ar} × {qty(i.qty)}</span><span style={{ direction: 'ltr' }}>{money(i.total)}</span></div>
                ))}
                <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}><span>{o.payment_status === 'paid' ? 'مدفوع' : 'المبلغ للتحصيل'}</span><span style={{ direction: 'ltr' }}>{money(o.total)}</span></div>
              </div>
            </PrintArea>
          )}
        </div>
      )}
    </Sheet>
  )
}
