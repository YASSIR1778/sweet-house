import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { format } from 'date-fns'
import { Building2, Check, Download, FileCheck2, Lock, Package, PackageSearch, Paperclip, Truck, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { trackPhone } from '@/shared/lib/online'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card, Input, Spinner } from '@/shared/ui/primitives'
import { sb, useSite } from '../data'
import { useSeo } from '../Layout'
import { ACCEPT, downloadPublicFile, uploadPublicFile } from '../upload'
import { Row } from './Checkout'

const CITY_AR: Record<string, string> = { 'Tétouan': 'تطوان', Martil: 'مرتيل', "M'diq": 'المضيق', Fnideq: 'الفنيدق', Tanger: 'طنجة', Casablanca: 'الدار البيضاء', Rabat: 'الرباط' }

type Status = { key: string; name_ar: string; name_fr: string; color: string; sort: number; is_final: boolean; is_cancel: boolean; allow_download: boolean }
type RequestTrack = {
  kind: 'request'
  number: string
  tracking_code: string
  service_name_ar: string
  service_name_fr: string
  customer_name: string
  status: Status
  statuses: Status[]
  price: number
  payment_method: 'in_store' | 'bank_transfer'
  payment_status: 'unpaid' | 'proof_uploaded' | 'paid'
  created_at: string
  history: { status: string; note: string | null; created_at: string }[]
  uploads: { id: string; name: string; kind: string }[]
  deliverables: { id: string; name: string; size: number | null }[]
  deliverables_locked: boolean
  bank: { bank_name: string; rib: string; holder: string } | null
}
type OrderTrack = {
  kind: 'order'
  number: string
  tracking_code: string
  status: string
  total: number
  delivery_fee: number
  delivery_method: 'delivery' | 'pickup'
  city: string | null
  payment_method: 'cod' | 'in_store' | 'bank_transfer'
  payment_status: 'unpaid' | 'proof_uploaded' | 'paid'
  created_at: string
  items: { name_ar: string; name_fr: string; qty: number; total: number; image: string | null }[]
  history: { status: string; created_at: string }[]
  uploads: { id: string; name: string; kind: string }[]
  bank: { bank_name: string; rib: string; holder: string } | null
}

const ORDER_STEPS: [string, string, string][] = [
  ['new', 'تم الاستلام', 'Reçue'],
  ['confirmed', 'مؤكد', 'Confirmée'],
  ['preparing', 'قيد التحضير', 'En préparation'],
  ['shipped', 'في الطريق', 'Expédiée'],
  ['delivered', 'تم التسليم', 'Livrée'],
]

export function TrackPage() {
  const { code: codeParam } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { t, lang } = useLang()
  const [code, setCode] = useState(codeParam ?? '')
  // old links carried ?p=phone: still accepted, then removed from the address bar
  const [phone, setPhone] = useState(params.get('p') ?? trackPhone.get())
  const [data, setData] = useState<RequestTrack | OrderTrack | null>(null)
  const [busy, setBusy] = useState(false)
  useSeo(t('تتبّع الطلب', 'Suivi'))

  const load = async (c = code, p = phone) => {
    if (!c.trim() || !p.trim()) return
    setBusy(true)
    const { data: res, error } = await sb.rpc('track', { p_code: c.trim(), p_phone: p.trim() })
    setBusy(false)
    if (error) {
      setData(null)
      return toast.error(error.message.includes('not_found') ? t('لم نجد طلباً بهذا الرقم وهذا الهاتف', 'Aucune demande avec ce code et ce téléphone') : errorMessage(error, lang))
    }
    setData(res as RequestTrack | OrderTrack)
    trackPhone.set(p)
    if (codeParam !== c.trim().toUpperCase() || params.has('p')) nav(`/track/${c.trim().toUpperCase()}`, { replace: true })
  }

  useEffect(() => {
    if (codeParam && phone) load(codeParam, phone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand">
          <PackageSearch className="size-8" />
        </div>
        <h1 className="mt-4 text-3xl font-extrabold">{t('تتبّع طلبك', 'Suivre ma demande')}</h1>
        <p className="mt-2 text-muted">{t('أدخل رقم التتبّع ورقم الهاتف الذي استعملته في الطلب', 'Code de suivi et téléphone utilisés')}</p>
      </div>
      <Card className="mt-8 p-4">
        <form onSubmit={(e) => (e.preventDefault(), load())} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={t('رقم التتبّع', 'Code de suivi')} dir="ltr" className="num h-12 tracking-widest" />
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('رقم الهاتف', 'Téléphone')} dir="ltr" inputMode="tel" className="h-12" />
          <Button type="submit" size="lg" loading={busy}>
            {t('تتبّع', 'Suivre')}
          </Button>
        </form>
      </Card>
      {data && (data.kind === 'request' ? <RequestView d={data} phone={phone} reload={() => load()} /> : <OrderView d={data} phone={phone} reload={() => load()} />)}
    </div>
  )
}

/** ⭐ After a successful service: invite the customer to review us on Google. */
function ReviewCta() {
  const { t } = useLang()
  const site = useSite()
  const url = site.data?.store.google_review_url
  if (!url) return null
  return (
    <Card className="flex flex-wrap items-center gap-4 border-warning/30 bg-warning/5 p-5">
      <div className="text-3xl">⭐</div>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{t('أعجبتك خدمتنا؟', 'Satisfait de notre service ?')}</div>
        <div className="text-sm text-muted">{t('تقييمك على Google يساعد جيرانك في تطوان يلقاونا. كياخد دقيقة وحدة 🙏', 'Votre avis Google aide d’autres personnes à nous trouver. 1 minute 🙏')}</div>
      </div>
      <Button asChild>
        <a href={url} target="_blank" rel="noreferrer">
          {t('قيّمنا على Google', 'Laisser un avis')}
        </a>
      </Button>
    </Card>
  )
}

function RequestView({ d, phone, reload }: { d: RequestTrack; phone: string; reload: () => void }) {
  const { t, pick } = useLang()
  const cancelled = d.status.is_cancel
  const current = d.statuses.findIndex((s) => s.key === d.status.key)
  const at = (key: string) => d.history.filter((h) => h.status === key).at(0)?.created_at

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-5">
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted">{t('الطلب', 'Demande')} <span className="num">{d.number}</span></div>
            <h2 className="mt-1 text-xl font-bold">{pick(d, 'service_name')}</h2>
          </div>
          <Badge style={{ background: `${d.status.color}1a`, color: d.status.color }} className="px-3 py-1 text-sm">
            {pick(d.status, 'name')}
          </Badge>
        </div>
        {!cancelled && (
          <ol className="mt-8 space-y-0">
            {d.statuses.map((s, i) => {
              if (i < current && !at(s.key)) return null
              const doneStep = i <= current
              return (
                <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < d.statuses.length - 1 && <span className={cn('absolute start-[15px] top-8 h-[calc(100%-24px)] w-0.5', i < current ? 'bg-success' : 'bg-border')} />}
                  <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ delay: i * 0.08 }} className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2', doneStep ? 'border-success bg-success text-white' : 'border-border bg-surface text-subtle', i === current && 'ring-4 ring-success/20')}>
                    {doneStep ? <Check className="size-4" /> : <span className="num text-xs">{d.statuses.slice(0, i + 1).filter((x, k) => !(k < current && !at(x.key))).length}</span>}
                  </motion.span>
                  <div className="pt-1">
                    <div className={cn('font-medium', !doneStep && 'text-muted')}>{pick(s, 'name')}</div>
                    {at(s.key) && <div className="num text-xs text-muted">{format(new Date(at(s.key)!), 'dd/MM/yyyy HH:mm')}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>

      {d.deliverables.length > 0 && (
        <Card className="border-success/30 bg-success/5 p-6">
          <div className="mb-4 flex items-center gap-2 font-bold text-success">
            <FileCheck2 className="size-5" />
            {t('وثيقتك جاهزة للتحميل', 'Votre document est prêt')}
          </div>
          <div className="space-y-2">
            {d.deliverables.map((f) => (
              <Button key={f.id} variant="success" className="w-full justify-between" onClick={() => downloadPublicFile(d.tracking_code, phone, f.id).catch((e) => toast.error(String(e.message ?? e)))}>
                <span className="truncate">{f.name}</span>
                <Download />
              </Button>
            ))}
          </div>
        </Card>
      )}
      {d.deliverables_locked && (
        <Card className="flex items-center gap-3 border-warning/30 bg-warning/5 p-5 text-sm">
          <Lock className="size-5 shrink-0 text-warning" />
          {t('وثيقتك جاهزة. ستُتاح للتحميل بعد تأكيد الأداء.', 'Document prêt. Disponible après confirmation du paiement.')}
        </Card>
      )}

      <Payment kind="request" code={d.tracking_code} phone={phone} amount={d.price} method={d.payment_method} status={d.payment_status} bank={d.bank} reload={reload} />
      {!d.status.is_final && <Uploader code={d.tracking_code} phone={phone} kind="upload" title={t('إضافة وثائق', 'Ajouter des documents')} existing={d.uploads.filter((u) => u.kind === 'upload')} reload={reload} />}
      {d.status.allow_download && !cancelled && <ReviewCta />}
    </motion.div>
  )
}

function OrderView({ d, phone, reload }: { d: OrderTrack; phone: string; reload: () => void }) {
  const { t, pick, lang } = useLang()
  const steps = ORDER_STEPS.filter(([k]) => d.delivery_method === 'delivery' || k !== 'shipped').map((s) => (s[0] === 'delivered' && d.delivery_method === 'pickup' ? ['delivered', 'تم الاستلام من المحل', 'Retirée'] : s))
  const order = ['new', 'confirmed', 'preparing', 'shipped', 'ready', 'delivered']
  const cur = order.indexOf(d.status)
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-8 space-y-5">
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted">{t('الطلب', 'Commande')}</div>
            <div className="num text-xl font-bold">{d.number}</div>
          </div>
          {d.status === 'cancelled' ? <Badge tone="danger">{t('ملغى', 'Annulée')}</Badge> : <Badge tone="brand">{d.delivery_method === 'delivery' ? <Truck /> : <Package />}{d.delivery_method === 'delivery' ? (lang === 'ar' ? (CITY_AR[d.city ?? ''] ?? d.city) : d.city) : t('استلام من المحل', 'Retrait')}</Badge>}
        </div>
        {d.status !== 'cancelled' && (
          <div className="mt-8 flex items-start" dir="ltr">
            {steps.map(([k, ar, fr], i) => {
              const done = order.indexOf(k) <= cur
              return (
                <div key={k} className="relative flex flex-1 flex-col items-center text-center">
                  {i > 0 && <span className={cn('absolute end-1/2 top-4 h-0.5 w-full', done ? 'bg-success' : 'bg-border')} />}
                  <span className={cn('relative z-10 flex size-8 items-center justify-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-border bg-surface')}>{done && <Check className="size-4" />}</span>
                  <span className={cn('mt-2 text-xs', done ? 'font-medium' : 'text-muted')} dir="auto">
                    {t(ar, fr)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      <Card className="divide-y divide-border">
        {d.items.map((i, k) => (
          <div key={k} className="flex items-center gap-3 p-4 text-sm">
            <div className="size-12 overflow-hidden rounded-lg bg-surface-2">{i.image && <img src={i.image} alt="" className="size-full object-cover" />}</div>
            <span className="flex-1">
              {pick(i, 'name')} <span className="num text-muted">× {i.qty}</span>
            </span>
            <span className="num font-semibold">{money(i.total)}</span>
          </div>
        ))}
        <div className="space-y-1.5 p-4 text-sm">
          {d.delivery_fee > 0 && <Row label={t('التوصيل', 'Livraison')} value={money(d.delivery_fee)} />}
          <Row label={t('المجموع', 'Total')} value={money(d.total)} />
        </div>
      </Card>
      <Payment kind="order" code={d.tracking_code} phone={phone} amount={d.total} method={d.payment_method} status={d.payment_status} bank={d.bank} reload={reload} />
    </motion.div>
  )
}

function Payment({ code, phone, amount, method, status, bank, reload }: { kind: 'request' | 'order'; code: string; phone: string; amount: number; method: string; status: string; bank: RequestTrack['bank']; reload: () => void }) {
  const { t } = useLang()
  if (status === 'paid')
    return (
      <Card className="flex items-center gap-3 p-5 text-sm">
        <Check className="size-5 text-success" />
        {t('تم تأكيد الأداء. شكراً لك 🌟', 'Paiement confirmé. Merci 🌟')}
      </Card>
    )
  if (method !== 'bank_transfer')
    return (
      <Card className="p-5 text-sm text-muted">
        {method === 'cod' ? t('الأداء عند الاستلام', 'Paiement à la livraison') : t('الأداء في المحل', 'Paiement en boutique')}
        {amount > 0 && <span className="num ms-2 font-bold text-text">{money(amount)}</span>}
      </Card>
    )
  return (
    <Card className="space-y-4 p-6">
      <div className="flex items-center gap-2 font-bold">
        <Building2 className="size-5 text-info" />
        {t('الأداء بالتحويل البنكي', 'Paiement par virement')}
      </div>
      {amount > 0 && <Row label={t('المبلغ', 'Montant')} value={money(amount)} />}
      {bank?.rib ? (
        <div className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm">
          {bank.bank_name && <Row label={t('البنك', 'Banque')} value={bank.bank_name} />}
          {bank.holder && <Row label={t('صاحب الحساب', 'Titulaire')} value={bank.holder} />}
          <Row label="RIB" value={bank.rib} copy />
        </div>
      ) : (
        <div className="text-sm text-muted">{t('سنرسل لك معلومات الحساب على واتساب.', 'Nous vous enverrons le RIB sur WhatsApp.')}</div>
      )}
      {status === 'proof_uploaded' ? (
        <Badge tone="warning">{t('توصلنا بوصل التحويل، في انتظار التأكيد', 'Justificatif reçu, en attente de confirmation')}</Badge>
      ) : (
        <Uploader code={code} phone={phone} kind="payment_proof" title={t('رفع صورة وصل التحويل', 'Envoyer le justificatif')} existing={[]} reload={reload} compact />
      )}
    </Card>
  )
}

function Uploader({ code, phone, kind, title, existing, reload, compact }: { code: string; phone: string; kind: 'upload' | 'payment_proof'; title: string; existing: { id: string; name: string }[]; reload: () => void; compact?: boolean }) {
  const { t } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const send = async (list: FileList | null) => {
    if (!list?.length) return
    setBusy(true)
    try {
      for (const f of Array.from(list)) await uploadPublicFile(code, phone, f, kind)
      toast.success(t('تم الرفع ✅', 'Envoyé ✅'))
      reload()
    } catch (e) {
      toast.error(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const body = (
    <>
      {existing.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {existing.map((f) => (
            <div key={f.id} className="flex items-center gap-2 text-sm text-muted">
              <Paperclip className="size-4" />
              {f.name}
            </div>
          ))}
        </div>
      )}
      <Button variant="outline" className="w-full" onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <Spinner className="size-4" /> : <Upload />}
        {title}
      </Button>
      <input ref={ref} type="file" hidden multiple={kind === 'upload'} accept={ACCEPT} onChange={(e) => (send(e.target.files), (e.target.value = ''))} />
    </>
  )
  return compact ? body : <Card className="p-6">{body}</Card>
}
