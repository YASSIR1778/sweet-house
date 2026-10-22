import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { BadgeCheck, Check, ChevronDown, CircleCheckBig, MessageCircle, Minus, Package, PackageSearch, Plus, RotateCcw, ShieldCheck, ShoppingBag, Star, Truck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { trackPhone } from '@/shared/lib/online'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { ME } from '@/shared/lib/brand'
import { Badge, Button, Input, Skeleton } from '@/shared/ui/primitives'
import { LogoMark } from '@/shared/ui/brand'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { attributeOnline, inStock, sb, useShop, useSite, type ShopProduct } from '../data'
import { useCart } from '../cart'
import { useSeo } from '../Layout'
import { ProductCard } from '../components'
import { pixel } from '../pixels'

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} dir="ltr">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn('size-4', i <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-border')} />
      ))}
    </span>
  )
}

function Video({ url }: { url: string }) {
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{6,})/)
  if (yt) return <iframe className="aspect-[9/16] w-full max-w-sm rounded-3xl md:aspect-video md:max-w-none" src={`https://www.youtube.com/embed/${yt[1]}`} allow="autoplay; encrypted-media" allowFullScreen />
  if (/\.(mp4|webm)(\?|$)/i.test(url)) return <video className="w-full max-w-sm rounded-3xl" src={url} controls playsInline muted autoPlay loop />
  return null
}

/**
 * Product page = ad landing page. Everything needed to decide and order on
 * one screen: media, promise, price/offers, trust, quick COD order form.
 * `focus` hides the site menu (the URL /p/:id used in ads).
 */
export function ProductLanding({ focus = false }: { focus?: boolean }) {
  const { id } = useParams()
  const { t, pick, lang } = useLang()
  const shop = useShop()
  const site = useSite()
  const cart = useCart()
  const p = shop.data?.products.find((x) => x.id === id)
  const L = p?.landing ?? {}
  const [vid, setVid] = useState<string | null>(null)
  const [img, setImg] = useState(0)
  const [offer, setOffer] = useState(0)
  const [qty, setQty] = useState(1)
  const [faq, setFaq] = useState<number | null>(0)
  const [f, setF] = useState({ name: '', phone: '', city: '', address: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [otherCity, setOtherCity] = useState(false)
  const [done, setDone] = useState<{ number: string; tracking_code: string; total: number } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)
  useSeo(p ? (lang === 'fr' ? L.headline_fr : L.headline_ar) || pick(p, 'name') : undefined)

  const v = p ? (p.product_variants.find((x) => x.id === vid) ?? p.product_variants[0]) : null
  const offers = (L.offers ?? []).filter((o) => o.qty > 0 && o.price > 0).sort((a, b) => a.qty - b.qty)
  const chosen = offers[offer]
  const units = chosen ? chosen.qty : qty
  const subtotal = v ? (chosen ? chosen.price : v.price * qty) : 0
  const zones = site.data?.delivery?.zones ?? []
  const zone = zones.find((z) => z.city === f.city || z.city_ar === f.city)
  const freeAbove = site.data?.delivery?.free_above
  const [formSeen, setFormSeen] = useState(false)
  useEffect(() => {
    const el = formRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setFormSeen(e.isIntersecting), { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  })
  const fee = L.free_delivery || (freeAbove && subtotal >= freeAbove) ? 0 : (zone?.price ?? site.data?.delivery?.default_price ?? 0)
  const images = p ? ([...p.images, ...p.product_variants.map((x) => x.image_url).filter(Boolean)] as string[]) : []
  const available = p && v ? inStock(p, v) : false
  const stockLeft = p?.track_stock && v ? Number(v.stock_qty) : null
  const reviews = L.reviews ?? []
  const rating = reviews.length ? reviews.reduce((a, r) => a + (r.rating ?? 5), 0) / reviews.length : 0
  const related = useMemo(() => (shop.data?.products ?? []).filter((x) => x.category_id === p?.category_id && x.id !== p?.id).slice(0, 4), [shop.data, p])
  const wa = site.data?.store.whatsapp ?? ''

  useEffect(() => {
    if (p && v) pixel('ViewContent', { value: v.price, content_id: p.id, content_name: p.name_ar })
  }, [p?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (shop.isLoading) return <div className="mx-auto max-w-6xl px-4 py-10"><Skeleton className="h-[520px]" /></div>
  if (!p || !v) return <EmptyState className="py-32" icon={<Package />} title={t('المنتج غير موجود', 'Produit introuvable')} action={<Button asChild><Link to="/shop">{t('العودة للمتجر', 'Retour')}</Link></Button>} />

  const headline = (lang === 'fr' ? L.headline_fr : L.headline_ar) || pick(p, 'name')
  const sub = (lang === 'fr' ? L.sub_fr : L.sub_ar) || pick(p, 'description')
  const discount = v.compare_at_price && v.compare_at_price > v.price ? Math.round(((v.compare_at_price - v.price) / v.compare_at_price) * 100) : 0
  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    pixel('InitiateCheckout', { value: subtotal, content_id: p.id })
  }

  const order = async (e: React.FormEvent) => {
    e.preventDefault()
    if (f.name.trim().length < 2) return toast.error(t('اكتب اسمك', 'Votre nom'))
    if (f.phone.replace(/\D/g, '').length < 9) return toast.error(t('رقم الهاتف غير صحيح', 'Téléphone invalide'))
    if (!f.city.trim()) return toast.error(t('اختر مدينتك', 'Votre ville'))
    if (f.address.trim().length < 5) return toast.error(t('اكتب العنوان', 'Votre adresse'))
    setBusy(true)
    const { data, error } = await sb.rpc('submit_order', {
      p: {
        name: f.name, phone: f.phone, city: f.city, address: f.address, website: f.website,
        delivery_method: 'delivery', payment_method: 'cod', consent: true, notes: chosen ? `عرض: ${chosen.qty} × ${money(chosen.price)}` : null,
        items: [{ variant_id: v.id, qty: units, ...(chosen ? { offer_qty: chosen.qty } : {}) }],
      },
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    const r = data as { number: string; tracking_code: string; total: number }
    attributeOnline(r.tracking_code)
    pixel('Purchase', { value: r.total, content_id: p.id, content_name: p.name_ar })
    setDone(r)
    requestAnimationFrame(() => window.scrollTo({ top: 0 }))
  }

  if (done)
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-success/10">
          <CircleCheckBig className="size-14 text-success" />
        </motion.div>
        <h1 className="mt-6 text-3xl font-extrabold">{t(`شكراً ${f.name.split(' ')[0]}! وصلتنا طلبيتك 🎉`, `Merci ${f.name.split(' ')[0]} ! Commande reçue 🎉`)}</h1>
        <p className="mt-3 text-muted">{t('غادي نتواصلو معاك فواتساب ولا بالتيليفون باش نأكدو الطلبية قبل ما نصيفطوها.', 'Nous vous contactons sur WhatsApp pour confirmer avant l’envoi.')}</p>
        <div className="mt-6 rounded-2xl border border-border bg-surface p-5 text-start">
          <div className="flex justify-between text-sm"><span className="text-muted">{t('رقم الطلبية', 'Commande')}</span><b className="num">{done.number}</b></div>
          <div className="mt-2 flex justify-between text-sm"><span className="text-muted">{t('المجموع عند الاستلام', 'À payer à la livraison')}</span><b className="num text-brand">{money(done.total)}</b></div>
        </div>
        <div className="mt-6 grid gap-2">
          <Button asChild size="lg">
            <Link to={`/track/${done.tracking_code}`} onClick={() => trackPhone.set(f.phone)}>
              <PackageSearch />
              {t('تتبّع طلبيتك', 'Suivre ma commande')}
            </Link>
          </Button>
          {!focus && (
            <Button asChild variant="ghost">
              <Link to="/shop">{t('كمّل التسوق', 'Continuer mes achats')}</Link>
            </Button>
          )}
        </div>
      </div>
    )

  const trust = [
    { icon: Truck, ar: L.free_delivery ? 'التوصيل مجاني' : 'توصيل لجميع المدن', fr: L.free_delivery ? 'Livraison gratuite' : 'Livraison partout' },
    { icon: Wallet, ar: 'الدفع عند الاستلام', fr: 'Paiement à la livraison' },
    { icon: RotateCcw, ar: L.guarantee_ar || 'استبدال سهل', fr: L.guarantee_fr || 'Échange facile' },
  ]

  return (
    <div className={cn('pb-28 md:pb-10', focus && 'bg-bg')}>
      {focus && (
        <div className="sticky top-0 z-40 border-b border-border/70 bg-bg/90 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
            <LogoMark size={30} color={ME.color} />
            <span className="font-latin font-extrabold">Sweet House <span className="text-brand">Store</span></span>
            <a href={whatsappLink(wa, t(`سلام، عندي سؤال على: ${p.name_ar}`, `Bonjour, une question sur : ${p.name_fr}`))} target="_blank" rel="noreferrer" className="ms-auto flex items-center gap-1.5 rounded-full bg-[#25D366]/10 px-3 py-1.5 text-sm font-medium text-[#128C4B]">
              <MessageCircle className="size-4" />
              {t('سؤال؟', 'Question ?')}
            </a>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------- above the fold */}
      <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-5 md:grid-cols-2 md:gap-12 md:pt-10">
        <div className="md:sticky md:top-24 md:self-start">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-2">
            <AnimatePresence mode="wait">
              <motion.div key={img} initial={{ opacity: 0.3, scale: 1.02 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0.3 }} transition={{ duration: 0.25 }} className="aspect-square">
                {images[img] ? <img src={images[img]} alt={headline} className="size-full object-cover" /> : <Package className="m-auto size-24 h-full text-subtle/40" />}
              </motion.div>
            </AnimatePresence>
            {discount > 0 && <div className="num absolute start-4 top-4 rounded-full bg-danger px-3 py-1 text-sm font-bold text-white shadow-lg">-{discount}%</div>}
            {L.free_delivery && <div className="absolute end-4 top-4 rounded-full bg-success px-3 py-1 text-xs font-bold text-white shadow-lg">🚚 {t('توصيل مجاني', 'Livraison offerte')}</div>}
          </div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((src, i) => (
                <button key={src + i} onClick={() => setImg(i)} className={cn('size-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all md:size-20', i === img ? 'border-brand' : 'border-transparent opacity-60 hover:opacity-100')}>
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!focus && (
            <nav className="mb-3 text-sm text-muted">
              <Link to="/shop" className="hover:text-brand">{t('المتجر', 'Boutique')}</Link>
            </nav>
          )}
          {reviews.length > 0 && (
            <a href="#reviews" className="mb-2 inline-flex items-center gap-2 text-sm text-muted">
              <Stars value={rating} />
              <span className="num">{rating.toFixed(1)}</span>· {reviews.length} {t('رأي', 'avis')}
            </a>
          )}
          <h1 className="text-3xl leading-tight font-extrabold tracking-tight md:text-4xl">{headline}</h1>
          {sub && <p className="mt-3 text-lg leading-relaxed whitespace-pre-line text-muted">{sub}</p>}

          {/* price */}
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <span className="num text-4xl font-black text-brand">{money(chosen ? chosen.price : v.price)}</span>
            {!chosen && v.compare_at_price && v.compare_at_price > v.price && <span className="num pb-1 text-xl text-subtle line-through">{money(v.compare_at_price)}</span>}
            {available ? (
              stockLeft !== null && stockLeft <= 10 && L.urgency ? (
                <Badge tone="warning" className="mb-1.5">🔥 {t(`باقي غير ${stockLeft} فالمخزون`, `Plus que ${stockLeft} en stock`)}</Badge>
              ) : (
                <Badge tone="success" className="mb-1.5">{t('متوفر', 'En stock')}</Badge>
              )
            ) : (
              <Badge tone="danger" className="mb-1.5">{t('غير متوفر حالياً', 'Indisponible')}</Badge>
            )}
          </div>

          {/* benefits (short) */}
          {!!L.benefits?.length && (
            <ul className="mt-5 space-y-2">
              {L.benefits.slice(0, 5).map((b, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success/15 text-success">
                    <Check className="size-3.5" />
                  </span>
                  <span>{lang === 'fr' && b.text_fr ? b.text_fr : b.text_ar}</span>
                </li>
              ))}
            </ul>
          )}

          {/* variants */}
          {p.product_variants.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold">{t('اختر', 'Choisir')}</div>
              <div className="flex flex-wrap gap-2">
                {p.product_variants.map((x) => (
                  <button key={x.id} onClick={() => setVid(x.id)} disabled={!inStock(p, x)} className={cn('rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all disabled:opacity-40', x.id === v.id ? 'border-brand bg-brand-50 text-brand' : 'border-border hover:border-brand/40')}>
                    {pick(x, 'name') || '—'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* quantity offers */}
          {offers.length > 0 ? (
            <div className="mt-6 space-y-2">
              <div className="text-sm font-semibold">{t('اختر العرض', 'Choisissez votre offre')}</div>
              {offers.map((o, i) => {
                const full = v.price * o.qty
                return (
                  <button key={i} onClick={() => setOffer(i)} className={cn('relative flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start transition-all', offer === i ? 'border-brand bg-brand-50 shadow-md shadow-brand/10' : 'border-border hover:border-brand/40')}>
                    <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border-2', offer === i ? 'border-brand bg-brand' : 'border-subtle')}>{offer === i && <Check className="size-3 text-white" />}</span>
                    <span className="flex-1">
                      <span className="block font-bold">{(lang === 'fr' ? o.label_fr : o.label_ar) || t(`${o.qty} ${o.qty === 1 ? 'قطعة' : 'قطع'}`, `${o.qty} pièce(s)`)}</span>
                      {full > o.price && <span className="num text-xs text-success">{t('وفّر', 'Économisez')} {money(full - o.price)}</span>}
                    </span>
                    <span className="text-end">
                      <span className="num block text-lg font-extrabold">{money(o.price)}</span>
                      {full > o.price && <span className="num block text-xs text-subtle line-through">{money(full)}</span>}
                    </span>
                    {o.badge_ar && <span className="absolute -top-2.5 end-4 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">{o.badge_ar}</span>}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="mt-6 flex items-center gap-3">
              <span className="text-sm font-semibold">{t('الكمية', 'Quantité')}</span>
              <div className="flex h-11 items-center rounded-xl border border-border" dir="ltr">
                <button className="flex size-11 items-center justify-center" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="size-4" /></button>
                <span className="num w-10 text-center font-semibold">{qty}</span>
                <button className="flex size-11 items-center justify-center" onClick={() => setQty(stockLeft === null ? qty + 1 : Math.min(stockLeft, qty + 1))}><Plus className="size-4" /></button>
              </div>
            </div>
          )}

          {/* trust */}
          <div className="mt-6 grid grid-cols-3 gap-2">
            {trust.map((x, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 rounded-2xl bg-surface-2 p-3 text-center text-xs font-medium">
                <x.icon className="size-5 text-brand" />
                {t(x.ar, x.fr)}
              </div>
            ))}
          </div>

          {/* quick order form */}
          <div ref={formRef} id="order" className="mt-6 scroll-mt-20 rounded-3xl border-2 border-brand/30 bg-surface p-5 shadow-pop">
            <div className="mb-1 flex items-center gap-2 text-lg font-extrabold">
              <ShoppingBag className="size-5 text-brand" />
              {t('اطلب دابا — الدفع عند الاستلام', 'Commandez — paiement à la livraison')}
            </div>
            <p className="mb-4 text-sm text-muted">{t('عمّر المعلومات، ونتاصلو بيك نأكدو الطلبية.', 'Remplissez, nous vous appelons pour confirmer.')}</p>
            <form onSubmit={order} className="space-y-3">
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('الاسم الكامل', 'Nom complet')} autoComplete="name" className="h-12 text-base" />
              <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={t('رقم الهاتف (واتساب)', 'Téléphone (WhatsApp)')} inputMode="tel" autoComplete="tel" dir="ltr" className="h-12 text-base" />
              {zones.length > 0 ? (
                <select value={otherCity ? '__other' : f.city} onChange={(e) => (setOtherCity(e.target.value === '__other'), setF({ ...f, city: e.target.value === '__other' ? '' : e.target.value }))} className="h-12 w-full rounded-[10px] border border-border bg-surface px-3 text-base">
                  <option value="">{t('اختر المدينة', 'Choisir la ville')}</option>
                  {zones.map((z) => (
                    <option key={z.city} value={z.city}>{lang === 'fr' ? z.city : z.city_ar || z.city}</option>
                  ))}
                  <option value="__other">{t('مدينة أخرى', 'Autre ville')}</option>
                </select>
              ) : null}
              {(zones.length === 0 || otherCity) && <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} placeholder={t('المدينة', 'Ville')} className="h-12 text-base" />}
              <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} placeholder={t('العنوان: الحي، الزنقة + علامة قريبة', 'Adresse + un repère proche')} autoComplete="street-address" className="h-12 text-base" />
              <input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
              <div className="space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
                <div className="flex justify-between"><span className="text-muted">{t('المنتج', 'Produit')} × <span className="num">{units}</span></span><span className="num">{money(subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">{t('التوصيل', 'Livraison')}</span><span className="num">{fee === 0 ? t('مجاني 🎉', 'Offerte 🎉') : f.city ? money(fee) : t('حسب المدينة', 'selon la ville')}</span></div>
                <div className="flex justify-between border-t border-border pt-1 text-base font-extrabold"><span>{t('المجموع', 'Total')}</span><span className="num text-brand">{money(subtotal + (f.city || fee === 0 ? fee : 0))}</span></div>
              </div>
              <Button type="submit" size="xl" className="w-full text-lg shadow-lg shadow-brand/25" loading={busy} disabled={!available}>
                {t('أكّد الطلب', 'Confirmer la commande')}
              </Button>
              <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="size-3.5" />
                {t('ما كتخلص حتى توصلك الطلبية وتشوفها', 'Vous payez uniquement à la réception')}
              </p>
            </form>
          </div>

          {!focus && (
            <Button
              variant="ghost"
              className="mt-3 w-full"
              disabled={!available}
              onClick={() => {
                cart.add({ variant_id: v.id, product_id: p.id, name_ar: p.name_ar + (v.name_ar ? ` - ${v.name_ar}` : ''), name_fr: p.name_fr + (v.name_fr ? ` - ${v.name_fr}` : ''), image: v.image_url ?? images[0] ?? null, price: v.price, qty, max: stockLeft })
                toast.success(t('أُضيف إلى السلة 🛍️', 'Ajouté au panier 🛍️'))
                cart.setOpen(true)
              }}
            >
              <ShoppingBag />
              {t('أو أضفه للسلة وكمّل التسوق', 'Ou ajouter au panier')}
            </Button>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------- persuasion */}
      {L.video_url && (
        <section className="mx-auto mt-16 flex max-w-6xl justify-center px-4">
          <Video url={L.video_url} />
        </section>
      )}

      {!!L.sections?.length && (
        <section className="mx-auto mt-16 max-w-5xl space-y-10 px-4">
          {L.sections.map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className={cn('grid items-center gap-6 md:grid-cols-2', i % 2 && 'md:[&>*:first-child]:order-2')}>
              {s.image ? <img src={s.image} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-3xl object-cover" /> : <div className="hidden md:block" />}
              <div>
                <h2 className="text-2xl font-extrabold">{lang === 'fr' && s.title_fr ? s.title_fr : s.title_ar}</h2>
                <p className="mt-2 leading-relaxed whitespace-pre-line text-muted">{lang === 'fr' && s.text_fr ? s.text_fr : s.text_ar}</p>
              </div>
            </motion.div>
          ))}
        </section>
      )}

      {(L.benefits?.length ?? 0) > 5 && (
        <section className="mx-auto mt-16 max-w-5xl px-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {L.benefits!.slice(5).map((b, i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand"><DynamicIcon name={b.icon ?? 'sparkles'} className="size-5" /></span>
                {lang === 'fr' && b.text_fr ? b.text_fr : b.text_ar}
              </div>
            ))}
          </div>
        </section>
      )}

      {reviews.length > 0 && (
        <section id="reviews" className="mx-auto mt-16 max-w-6xl scroll-mt-20 px-4">
          <h2 className="mb-6 text-center text-2xl font-extrabold">{t('شنو قالو زبناءنا', 'Ce que disent nos clients')}</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {reviews.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="rounded-3xl border border-border bg-surface p-5">
                <Stars value={r.rating ?? 5} />
                <p className="mt-3 leading-relaxed">«{r.text}»</p>
                {r.image && <img src={r.image} alt="" loading="lazy" className="mt-3 aspect-square w-full rounded-2xl object-cover" />}
                <div className="mt-3 flex items-center gap-1.5 text-sm text-muted">
                  <BadgeCheck className="size-4 text-success" />
                  <b className="text-text">{r.name}</b>
                  {r.city && <span>· {r.city}</span>}
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* how it works */}
      <section className="mx-auto mt-16 max-w-5xl px-4">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            ['1', 'عمّر الطلب فدقيقة', 'Commandez en 1 minute'],
            ['2', 'نتاصلو بيك نأكدو', 'Nous confirmons avec vous'],
            ['3', 'توصلك وتخلص عند الاستلام', 'Livré, vous payez à réception'],
          ].map(([n, ar, fr]) => (
            <div key={n} className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
              <span className="num flex size-10 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-black text-white">{n}</span>
              <span className="font-semibold">{t(ar, fr)}</span>
            </div>
          ))}
        </div>
      </section>

      {!!L.faq?.length && (
        <section className="mx-auto mt-16 max-w-3xl space-y-3 px-4">
          <h2 className="mb-4 text-center text-2xl font-extrabold">{t('أسئلة كتتعاود', 'Questions fréquentes')}</h2>
          {L.faq.map((q, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
              <button onClick={() => setFaq(faq === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">
                {lang === 'fr' && q.q_fr ? q.q_fr : q.q_ar}
                <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', faq === i && 'rotate-180')} />
              </button>
              <AnimatePresence initial={false}>
                {faq === i && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{lang === 'fr' && q.a_fr ? q.a_fr : q.a_ar}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </section>
      )}

      <section className="mx-auto mt-16 max-w-3xl px-4 text-center">
        <div className="rounded-3xl bg-navy p-8 text-white">
          <div className="text-2xl font-extrabold">{headline}</div>
          <div className="num mt-2 text-3xl font-black text-brand">{money(chosen ? chosen.price : v.price)}</div>
          <Button size="xl" className="mt-5 w-full max-w-xs" onClick={scrollToForm} disabled={!available}>
            {t('اطلب الآن', 'Commander')}
          </Button>
        </div>
      </section>

      {!focus && related.length > 0 && (
        <section className="mx-auto mt-16 max-w-6xl px-4">
          <h2 className="mb-6 text-2xl font-bold">{t('غالباً كيعجبك حتى هادو', 'Vous aimerez aussi')}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r: ShopProduct, i) => (
              <ProductCard key={r.id} p={r} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* sticky buy bar (mobile) */}
      <div className={cn('fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur-xl transition-transform duration-300 md:hidden', (formSeen || done) && 'translate-y-full')}>
        <div className="flex items-center gap-3">
          <div className="leading-tight">
            <div className="num text-xl font-black text-brand">{money(f.city || fee === 0 ? subtotal + fee : chosen ? chosen.price : v.price)}</div>
            <div className="text-[11px] text-muted">{f.city || fee === 0 ? t('المجموع مع التوصيل · الدفع عند الاستلام', 'Total livré · paiement à la livraison') : t('الدفع عند الاستلام', 'Paiement à la livraison')}</div>
          </div>
          <Button size="lg" className="flex-1 text-base" onClick={scrollToForm} disabled={!available}>
            {t('اطلب الآن', 'Commander')}
          </Button>
        </div>
      </div>
    </div>
  )
}

/** /p/:id — the ad version: no menu, nothing between the visitor and the order. */
export function FocusProductPage() {
  return <ProductLanding focus />
}
