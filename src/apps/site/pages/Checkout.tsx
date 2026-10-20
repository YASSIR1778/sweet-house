import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Banknote, Building2, CheckCircle2, Copy, MessageCircle, Minus, Package, Plus, ShoppingBag, Store, Trash, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn, fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { Button, Card, Checkbox, Field, Input, Textarea } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { EmptyState } from '@/shared/ui/data'
import { useCart } from '../cart'
import { sb, trackUrl, useSite } from '../data'
import { useSeo } from '../Layout'

export function CartDrawer() {
  const { t, pick } = useLang()
  const cart = useCart()
  const nav = useNavigate()
  return (
    <Sheet open={cart.open} onOpenChange={cart.setOpen} title={t('سلة التسوق', 'Panier')} description={cart.count ? `${cart.count} ${t('منتج', 'articles')}` : undefined} width="max-w-md"
      footer={
        cart.items.length > 0 && (
          <div className="w-full space-y-3">
            <div className="flex justify-between text-lg font-bold">
              <span>{t('المجموع', 'Total')}</span>
              <span className="num">{money(cart.subtotal)}</span>
            </div>
            <Button size="lg" className="w-full" onClick={() => (cart.setOpen(false), nav('/checkout'))}>
              {t('إتمام الطلب', 'Commander')}
            </Button>
          </div>
        )
      }
    >
      {!cart.items.length ? (
        <EmptyState icon={<ShoppingBag />} title={t('سلتك فارغة', 'Panier vide')} action={<Button asChild onClick={() => cart.setOpen(false)}><Link to="/shop">{t('تصفّح المتجر', 'Voir la boutique')}</Link></Button>} />
      ) : (
        <div className="space-y-3">
          {cart.items.map((i) => (
            <div key={i.variant_id} className="flex gap-3 rounded-2xl border border-border bg-surface p-3">
              <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-surface-2">{i.image ? <img src={i.image} alt="" className="size-full object-cover" /> : <Package className="m-auto h-full size-8 text-subtle" />}</div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="line-clamp-2 text-sm font-medium">{pick(i, 'name')}</div>
                <div className="num mt-0.5 text-sm font-bold text-brand">{money(i.price)}</div>
                <div className="mt-auto flex items-center justify-between">
                  <div className="flex items-center rounded-lg border border-border" dir="ltr">
                    <button className="flex size-8 items-center justify-center" onClick={() => cart.setQty(i.variant_id, i.qty - 1)}>
                      <Minus className="size-3.5" />
                    </button>
                    <span className="num w-8 text-center text-sm">{i.qty}</span>
                    <button className="flex size-8 items-center justify-center" onClick={() => cart.setQty(i.variant_id, i.qty + 1)}>
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button onClick={() => cart.remove(i.variant_id)} className="text-subtle hover:text-danger">
                    <Trash className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  )
}

type Done = { number: string; tracking_code: string; total: number; phone: string; name: string; payment: string }

export function CheckoutPage() {
  const { t, lang } = useLang()
  const cart = useCart()
  const site = useSite()
  const [method, setMethod] = useState<'delivery' | 'pickup'>('delivery')
  const [pay, setPay] = useState<'cod' | 'in_store' | 'bank_transfer'>('cod')
  const [form, setForm] = useState({ name: '', phone: '', email: '', city: 'Tétouan', address: '', notes: '', website: '' })
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Done | null>(null)
  useSeo(t('إتمام الطلب', 'Commande'))

  const d = site.data?.delivery
  const pm = site.data?.payments
  const zone = d?.zones.find((z) => z.city.toLowerCase() === form.city.toLowerCase() || z.city_ar === form.city)
  const fee = useMemo(() => {
    if (method !== 'delivery' || !d) return 0
    if (d.free_above && cart.subtotal >= d.free_above) return 0
    return zone?.price ?? d.default_price ?? 0
  }, [method, d, zone, cart.subtotal])

  const methods = [
    ...(method === 'delivery' && pm?.cod !== false ? [{ v: 'cod' as const, ar: 'الأداء عند الاستلام', fr: 'Paiement à la livraison', icon: Banknote }] : []),
    ...(pm?.in_store !== false ? [{ v: 'in_store' as const, ar: 'الأداء في المحل', fr: 'Paiement en boutique', icon: Store }] : []),
    ...(pm?.bank_transfer !== false ? [{ v: 'bank_transfer' as const, ar: 'تحويل بنكي', fr: 'Virement bancaire', icon: Building2 }] : []),
  ]
  const payValue = methods.some((m) => m.v === pay) ? pay : (methods[0]?.v ?? 'in_store')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!consent) return toast.error(t('المرجو الموافقة على الشروط', 'Veuillez accepter les conditions'))
    setBusy(true)
    const { data, error } = await sb.rpc('submit_order', {
      p: { ...form, delivery_method: method, payment_method: payValue, consent, items: cart.items.map((i) => ({ variant_id: i.variant_id, qty: i.qty })) },
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setDone({ ...(data as Done), phone: form.phone, name: form.name, payment: payValue })
    cart.clear()
    window.scrollTo({ top: 0 })
  }

  if (done) return <OrderDone done={done} />
  if (!cart.items.length) return <EmptyState className="py-32" icon={<ShoppingBag />} title={t('سلتك فارغة', 'Panier vide')} action={<Button asChild><Link to="/shop">{t('تصفّح المتجر', 'Voir la boutique')}</Link></Button>} />

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-8 text-4xl font-extrabold">{t('إتمام الطلب', 'Finaliser la commande')}</h1>
      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card className="space-y-4 p-6">
            <h2 className="font-bold">{t('معلوماتك', 'Vos informations')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('الاسم الكامل', 'Nom complet')} required>
                <Input value={form.name} onChange={set('name')} required autoComplete="name" />
              </Field>
              <Field label={t('رقم الهاتف (واتساب)', 'Téléphone (WhatsApp)')} required>
                <Input value={form.phone} onChange={set('phone')} required dir="ltr" inputMode="tel" placeholder="06 XX XX XX XX" autoComplete="tel" />
              </Field>
              <Field label={t('البريد الإلكتروني (اختياري)', 'E-mail (optionnel)')} className="sm:col-span-2">
                <Input value={form.email} onChange={set('email')} type="email" dir="ltr" autoComplete="email" />
              </Field>
            </div>
            <input value={form.website} onChange={set('website')} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="font-bold">{t('طريقة الاستلام', 'Livraison')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {d?.enabled !== false && <Option active={method === 'delivery'} onClick={() => setMethod('delivery')} icon={<Truck />} title={t('التوصيل', 'Livraison')} text={t('لكل مدن المغرب', 'Partout au Maroc')} />}
              <Option active={method === 'pickup'} onClick={() => setMethod('pickup')} icon={<Store />} title={t('الاستلام من المحل', 'Retrait en boutique')} text={t('مجاناً بتطوان', 'Gratuit à Tétouan')} />
            </div>
            {method === 'delivery' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('المدينة', 'Ville')} required>
                  <Input value={form.city} onChange={set('city')} list="cities" required />
                  <datalist id="cities">
                    {d?.zones.map((z) => (
                      <option key={z.city} value={lang === 'ar' ? z.city_ar : z.city} />
                    ))}
                  </datalist>
                </Field>
                <Field label={t('العنوان الكامل', 'Adresse complète')} required>
                  <Input value={form.address} onChange={set('address')} required autoComplete="street-address" />
                </Field>
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6">
            <h2 className="font-bold">{t('طريقة الأداء', 'Paiement')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {methods.map((m) => (
                <Option key={m.v} active={payValue === m.v} onClick={() => setPay(m.v)} icon={<m.icon />} title={t(m.ar, m.fr)} />
              ))}
            </div>
            {payValue === 'bank_transfer' && pm && (
              <div className="rounded-2xl bg-info/5 p-4 text-sm">
                {t('بعد تأكيد الطلب سيظهر لك رقم الحساب البنكي، ويمكنك رفع صورة وصل التحويل من صفحة التتبّع.', 'Le RIB s’affichera après la commande ; envoyez le justificatif depuis la page de suivi.')}
              </div>
            )}
            <Field label={t('ملاحظات (اختياري)', 'Notes (optionnel)')}>
              <Textarea value={form.notes} onChange={set('notes')} />
            </Field>
          </Card>
        </div>

        <div className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-4 p-6">
            <h2 className="font-bold">{t('ملخص الطلب', 'Récapitulatif')}</h2>
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {cart.items.map((i) => (
                <div key={i.variant_id} className="flex items-center gap-3 text-sm">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                    {i.image && <img src={i.image} alt="" className="size-full object-cover" />}
                    <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-navy text-[10px] text-white">{i.qty}</span>
                  </div>
                  <span className="line-clamp-2 flex-1">{lang === 'ar' ? i.name_ar : i.name_fr}</span>
                  <span className="num font-semibold">{money(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">{t('المنتجات', 'Sous-total')}</span>
                <span className="num">{money(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">{t('التوصيل', 'Livraison')}</span>
                <span className="num">{method === 'pickup' ? t('مجاني', 'Gratuit') : fee === 0 ? t('مجاني', 'Gratuit') : money(fee)}</span>
              </div>
              {method === 'delivery' && d?.free_above && cart.subtotal < d.free_above && (
                <div className="rounded-lg bg-brand-50 p-2 text-xs text-brand">{t(`التوصيل مجاني ابتداءً من ${money(d.free_above)}`, `Livraison offerte dès ${money(d.free_above)}`)}</div>
              )}
              <div className="flex justify-between border-t border-border pt-3 text-lg font-extrabold">
                <span>{t('المجموع', 'Total')}</span>
                <span className="num">{money(cart.subtotal + fee)}</span>
              </div>
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 text-xs text-muted">
              <Checkbox checked={consent} onCheckedChange={setConsent} />
              <span>
                {t('أوافق على ', "J'accepte les ")}
                <Link to="/terms" target="_blank" className="text-brand underline">
                  {t('شروط الاستعمال', 'conditions')}
                </Link>{' '}
                {t('و', 'et la ')}
                <Link to="/privacy" target="_blank" className="text-brand underline">
                  {t('سياسة الخصوصية', 'politique de confidentialité')}
                </Link>
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!consent}>
              {t('تأكيد الطلب', 'Confirmer la commande')}
            </Button>
          </Card>
        </div>
      </form>
    </div>
  )
}

function Option({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text?: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-3 rounded-2xl border-2 p-4 text-start transition-all [&_svg]:size-5', active ? 'border-brand bg-brand-50' : 'border-border hover:border-brand/40')}>
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', active ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {text && <span className="block text-xs text-muted">{text}</span>}
      </span>
    </button>
  )
}

function OrderDone({ done }: { done: Done }) {
  const { t } = useLang()
  const site = useSite()
  const link = trackUrl(done.tracking_code)
  const wa = site.data?.store.whatsapp ?? ''
  const msg = fillTemplate(t('مرحباً، قمت بطلب رقم {number} بمبلغ {total}. رقم التتبّع: {code}', 'Bonjour, j’ai passé la commande {number} ({total}). Code : {code}'), { number: done.number, total: money(done.total), code: done.tracking_code })
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="size-14 text-success" />
      </motion.div>
      <h1 className="mt-6 text-3xl font-extrabold">{t('شكراً لك! تم استلام طلبك 🎉', 'Merci ! Commande reçue 🎉')}</h1>
      <p className="mt-2 text-muted">{t('سنتواصل معك على واتساب لتأكيد الطلب.', 'Nous vous contacterons sur WhatsApp pour confirmer.')}</p>
      <Card className="mt-8 space-y-3 p-6 text-start">
        <Row label={t('رقم الطلب', 'Commande')} value={done.number} />
        <Row label={t('رقم التتبّع', 'Code de suivi')} value={done.tracking_code} copy />
        <Row label={t('المجموع', 'Total')} value={money(done.total)} />
      </Card>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to={`/track/${done.tracking_code}?p=${encodeURIComponent(done.phone)}`}>{t('تتبّع الطلب', 'Suivre')}</Link>
        </Button>
        <Button asChild size="lg" variant="success">
          <a href={whatsappLink(wa, `${msg}\n${link}`)} target="_blank" rel="noreferrer">
            <MessageCircle />
            {t('أرسل لنا على واتساب', 'Envoyer sur WhatsApp')}
          </a>
        </Button>
      </div>
    </div>
  )
}

export function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  const { t } = useLang()
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="num font-bold tracking-wide" dir="ltr">
          {value}
        </span>
        {copy && (
          <button type="button" onClick={() => (navigator.clipboard.writeText(value), toast.success(t('تم النسخ', 'Copié')))} className="text-subtle hover:text-brand">
            <Copy className="size-4" />
          </button>
        )}
      </span>
    </div>
  )
}
