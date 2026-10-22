import { useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, BellRing, ChevronDown, FolderOpen, Globe2, MessageCircle, PackageCheck, Truck } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { BRAND, BRANDS, OTHER, SITES } from '@/shared/lib/brand'
import { blocksOf, type Block } from '@/shared/lib/blocks'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { DynamicIcon } from '@/shared/ui/icon'
import { useAdminServices, useShop, useSite } from './data'
import { ProductCard, SectionTitle, ServiceCard } from './components'
import { CustomRequestBanner } from './pages/Services'

const isExternal = (l?: string) => !!l && /^https?:/.test(l)
function SmartLink({ to, className, children }: { to?: string; className?: string; children: React.ReactNode }) {
  if (!to) return <div className={className}>{children}</div>
  return isExternal(to) ? <a href={to} target="_blank" rel="noreferrer" className={className}>{children}</a> : <Link to={to} className={className}>{children}</Link>
}

function Title({ b, fallback, action }: { b: Block; fallback?: [string, string]; action?: React.ReactNode }) {
  const { t } = useLang()
  const title = b.title_ar ? t(b.title_ar, b.title_fr || b.title_ar) : fallback ? t(...fallback) : ''
  if (!title) return null
  return <SectionTitle eyebrow={b.subtitle_ar ? t(b.subtitle_ar, b.subtitle_fr || b.subtitle_ar) : undefined} title={title} action={action} />
}

function ProductsBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const shop = useShop()
  const all = shop.data?.products ?? []
  let list = all
  if (b.source === 'featured') list = all.filter((p) => p.is_featured).length ? all.filter((p) => p.is_featured) : all
  if (b.source === 'latest') list = [...all].sort((a, c) => (a.created_at < c.created_at ? 1 : -1))
  if (b.source === 'sale') list = all.filter((p) => p.product_variants.some((v) => v.compare_at_price && v.compare_at_price > v.price))
  if (b.source === 'category') list = all.filter((p) => p.category_id === b.category_id)
  if (b.source === 'manual') list = (b.ids ?? []).map((id) => all.find((p) => p.id === id)).filter(Boolean) as typeof all
  list = list.slice(0, b.limit ?? 8)
  if (!shop.isLoading && !list.length) return null
  const more = b.source === 'category' && b.category_id ? `/shop?cat=${b.category_id}` : '/shop'
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <Title b={b} fallback={['منتجات', 'Produits']} action={<Button asChild variant="outline"><Link to={more}>{t('كل المنتجات', 'Tout voir')}<ArrowLeft className="ltr:rotate-180" /></Link></Button>} />
      {b.layout === 'carousel' ? (
        <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
          {list.map((p, i) => (
            <div key={p.id} className="w-44 shrink-0 snap-start sm:w-56"><ProductCard p={p} index={i} /></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shop.isLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) : list.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
        </div>
      )}
    </section>
  )
}

function CategoriesBlock({ b }: { b: Block }) {
  const { pick } = useLang()
  const shop = useShop()
  const cats = shop.data?.categories ?? []
  if (!cats.length) return null
  return (
    <section className="mx-auto max-w-6xl px-4 pt-14">
      <Title b={b} fallback={['الأقسام', 'Rayons']} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cats.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}>
            <Link to={`/shop?cat=${c.id}`} className="group flex flex-col items-center gap-3 rounded-3xl border border-border bg-surface p-5 text-center transition-all hover:-translate-y-1 hover:shadow-pop">
              <span className="flex size-14 items-center justify-center rounded-2xl text-white transition-transform group-hover:scale-110 group-hover:rotate-6" style={{ background: c.color }}>
                <DynamicIcon name={c.icon} className="size-7" />
              </span>
              <span className="text-sm font-semibold">{pick(c, 'name')}</span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function TrustBlock() {
  const { t } = useLang()
  const site = useSite()
  const items = site.data?.storeSite?.trust ?? []
  if (!items.length) return null
  return (
    <div className="overflow-hidden border-b border-border bg-surface py-3">
      <motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} className="flex w-max gap-10 text-sm font-medium" dir="ltr">
        {[...items, ...items, ...items, ...items].map((x, i) => (
          <span key={i} className="flex items-center gap-2 whitespace-nowrap" dir="rtl">
            <DynamicIcon name={x.icon} className="size-4 text-brand" />
            {t(x.text_ar, x.text_fr)}
          </span>
        ))}
      </motion.div>
    </div>
  )
}

function PromiseBlock() {
  const { t } = useLang()
  const site = useSite()
  const W = site.data?.storeSite
  const freeAbove = site.data?.delivery?.free_above
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-brand to-[#ff9466] p-8 text-white md:p-12">
        <PackageCheck className="absolute -end-8 -bottom-8 size-56 opacity-15" />
        <div className="relative grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
          <div>
            <h3 className="text-3xl leading-tight font-extrabold md:text-4xl">{W ? t(W.promise.title_ar, W.promise.title_fr) : ''}</h3>
            <p className="mt-3 text-lg text-white/85">
              {W ? t(W.promise.text_ar, W.promise.text_fr) : ''}
              {freeAbove ? ` ${t(`والتوصيل مجاني فوق ${money(freeAbove)}`, `Livraison offerte dès ${money(freeAbove)}`)}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[['1', 'اطلب', 'Commandez'], ['2', 'نأكدو', 'On confirme'], ['3', 'خلّص', 'Payez']].map(([n, ar, fr]) => (
              <div key={n} className="rounded-2xl bg-white/15 p-4 text-center backdrop-blur">
                <div className="num text-3xl font-black">{n}</div>
                <div className="mt-1 text-sm font-semibold">{t(ar, fr)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ServicesBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const data = useAdminServices()
  const all = (data.data?.services ?? []).filter((x) => !['custom_request', 'school_list'].includes(x.system_key ?? '') && x.is_online !== false)
  let list = all
  if (b.source === 'category') list = all.filter((s) => s.category_id === b.category_id)
  if (b.source === 'manual') list = (b.ids ?? []).map((id) => all.find((s) => s.id === id)).filter(Boolean) as typeof all
  list = list.slice(0, b.limit ?? 6)
  const color = (id: string | null) => data.data?.categories.find((c) => c.id === id)?.color
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20">
      <Title
        b={b}
        fallback={['وثائقك جاهزة دون عناء التنقل', 'Vos documents, sans vous déplacer']}
        action={<Button asChild variant="outline"><Link to="/services">{t('كل الخدمات', 'Tous les services')}<ArrowLeft className="ltr:rotate-180" /></Link></Button>}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />) : list.map((s, i) => <ServiceCard key={s.id} s={s} color={color(s.category_id)} index={i} />)}
      </div>
    </section>
  )
}

function FeaturesBlock() {
  const { pick } = useLang()
  const site = useSite()
  const items = site.data?.website.features ?? []
  if (!items.length) return null
  return (
    <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4">
      <div className="grid grid-cols-2 gap-2 rounded-3xl border border-border bg-surface p-3 shadow-pop sm:gap-4 sm:p-4 lg:grid-cols-4">
        {items.map((f, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="flex flex-col items-start gap-2 rounded-2xl p-3 sm:flex-row sm:gap-3 sm:p-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand"><DynamicIcon name={f.icon} className="size-5" /></div>
            <div>
              <div className="font-semibold">{pick(f, 'title')}</div>
              <div className="mt-0.5 text-sm text-muted">{pick(f, 'text')}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function ShortcutsBlock() {
  const { t } = useLang()
  return (
    <section className="mx-auto grid max-w-6xl gap-4 px-4 pt-12 md:grid-cols-3">
      {[
        { to: '/my', icon: FolderOpen, color: '#2563EB', ar: 'وثائقي وطلباتي', fr: 'Mes documents', d_ar: 'كل طلباتك ووثائقك الجاهزة في مكان واحد', d_fr: 'Toutes vos demandes au même endroit' },
        { to: '/abroad', icon: Globe2, color: '#0891B2', ar: 'أنت خارج المغرب؟', fr: 'À l’étranger ?', d_ar: 'اطلب وثائقك عن بُعد واستلمها بالإيميل أو بالبريد', d_fr: 'Vos documents à distance' },
        { to: '/alerts', icon: BellRing, color: '#16A34A', ar: 'تنبيهات واتساب', fr: 'Alertes WhatsApp', d_ar: 'المباريات والتسجيلات والمنح فور فتحها', d_fr: 'Concours, inscriptions, bourses' },
      ].map((x) => (
        <Link key={x.to} to={x.to} className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:shadow-pop">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-white transition-transform group-hover:scale-110" style={{ background: x.color }}><x.icon className="size-6" /></span>
          <span>
            <span className="block font-bold">{t(x.ar, x.fr)}</span>
            <span className="block text-sm text-muted">{t(x.d_ar, x.d_fr)}</span>
          </span>
        </Link>
      ))}
    </section>
  )
}

function AboutBlock({ b }: { b: Block }) {
  const { t, pick } = useLang()
  const site = useSite()
  const about = site.data?.website.about
  const fallback = BRAND === 'services' ? about : undefined
  const title = b.title_ar ? t(b.title_ar, b.title_fr || b.title_ar) : fallback ? pick(fallback, 'title') : ''
  const text = b.text_ar ? t(b.text_ar, b.text_fr || b.text_ar) : fallback ? pick(fallback, 'text') : ''
  if (!text) return null
  return (
    <section className="mx-auto max-w-3xl px-4 pt-20 text-center">
      <div className="mb-2 text-sm font-semibold text-brand">{title}</div>
      <p className="text-lg leading-relaxed text-muted">{text}</p>
      <Button asChild variant="success" className="mt-6">
        <a href={whatsappLink(site.data?.store.whatsapp ?? '', '')} target="_blank" rel="noreferrer"><MessageCircle />{t('راسلنا على واتساب', 'Écrivez-nous sur WhatsApp')}</a>
      </Button>
    </section>
  )
}

function FaqBlock({ b }: { b: Block }) {
  const { pick } = useLang()
  const site = useSite()
  const [open, setOpen] = useState<number | null>(0)
  const faq = (BRAND === 'store' ? site.data?.storeSite?.faq : site.data?.website.faq) ?? []
  if (!faq.length) return null
  return (
    <section className="mx-auto max-w-3xl space-y-3 px-4 pt-20">
      <Title b={b} fallback={['أسئلة شائعة', 'Questions fréquentes']} />
      {faq.slice(0, b.limit ?? 8).map((f, i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">
            {pick(f, 'q')}
            <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{pick(f, 'a')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </section>
  )
}

function BannerBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const color = b.color || 'var(--brand)'
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SmartLink to={b.link} className="group relative grid overflow-hidden rounded-[2rem] text-white md:grid-cols-2" >
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #0F172A))` }} />
        <div className="relative p-8 md:p-12">
          <h3 className="text-3xl leading-tight font-extrabold md:text-4xl">{t(b.title_ar ?? '', b.title_fr || b.title_ar || '')}</h3>
          {b.text_ar && <p className="mt-3 text-lg text-white/85">{t(b.text_ar, b.text_fr || b.text_ar)}</p>}
          {b.button_ar && (
            <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold text-navy transition-transform group-hover:-translate-x-1">
              {t(b.button_ar, b.button_fr || b.button_ar)}
              <ArrowLeft className="size-4 ltr:rotate-180" />
            </span>
          )}
        </div>
        {b.image_url && <img src={b.image_url} alt="" loading="lazy" className="relative h-64 w-full object-cover md:h-full" />}
      </SmartLink>
    </section>
  )
}

function TextBlock({ b }: { b: Block }) {
  const { t } = useLang()
  return (
    <section className="mx-auto max-w-3xl px-4 pt-16 text-center">
      {b.title_ar && <h2 className="text-3xl font-extrabold">{t(b.title_ar, b.title_fr || b.title_ar)}</h2>}
      {b.text_ar && <p className="mt-4 text-lg leading-relaxed whitespace-pre-line text-muted">{t(b.text_ar, b.text_fr || b.text_ar)}</p>}
      {b.button_ar && b.link && (
        <Button asChild className="mt-6"><SmartLink to={b.link}>{t(b.button_ar, b.button_fr || b.button_ar)}</SmartLink></Button>
      )}
    </section>
  )
}

function ImageBlock({ b }: { b: Block }) {
  if (!b.image_url) return null
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <SmartLink to={b.link} className="block overflow-hidden rounded-[2rem]">
        <img src={b.image_url} alt={b.title_ar ?? ''} loading="lazy" className="w-full object-cover transition-transform duration-700 hover:scale-[1.02]" />
      </SmartLink>
    </section>
  )
}

function VideoBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const url = b.video_url ?? ''
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/)([\w-]{6,})/)
  return (
    <section className="mx-auto max-w-4xl px-4 pt-16 text-center">
      {b.title_ar && <h2 className="mb-6 text-3xl font-extrabold">{t(b.title_ar, b.title_fr || b.title_ar)}</h2>}
      {yt ? (
        <iframe className="aspect-video w-full rounded-3xl" src={`https://www.youtube.com/embed/${yt[1]}`} allow="encrypted-media" allowFullScreen />
      ) : /\.(mp4|webm)(\?|$)/i.test(url) ? (
        <video className="w-full rounded-3xl" src={url} controls playsInline />
      ) : null}
    </section>
  )
}

function StepsBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const items = b.items ?? []
  return (
    <section className="mx-auto max-w-6xl px-4 pt-20">
      <Title b={b} />
      <div className={cn('grid gap-4', items.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
        {items.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="relative overflow-hidden rounded-3xl border border-border bg-surface p-7">
            <div className="num absolute -end-2 -top-4 text-8xl font-black text-brand/[0.07]">{String(i + 1).padStart(2, '0')}</div>
            {s.icon ? <DynamicIcon name={s.icon} className="size-8 text-brand" /> : <span className="num text-3xl font-black text-brand">{i + 1}</span>}
            <div className="mt-4 text-lg font-bold">{t(s.title_ar, s.title_fr || s.title_ar)}</div>
            {s.text_ar && <div className="mt-1 text-sm text-muted">{t(s.text_ar, s.text_fr || s.text_ar)}</div>}
          </motion.div>
        ))}
      </div>
    </section>
  )
}

function WhatsAppBlock({ b }: { b: Block }) {
  const { t } = useLang()
  const site = useSite()
  return (
    <section className="mx-auto max-w-6xl px-4 pt-6">
      <a href={whatsappLink(site.data?.store.whatsapp ?? '', '')} target="_blank" rel="noreferrer" className="flex items-center gap-4 rounded-3xl border border-border bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-pop">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[#25D366] text-white"><MessageCircle className="size-7" /></span>
        <span>
          <span className="block text-lg font-bold">{b.title_ar ? t(b.title_ar, b.title_fr || b.title_ar) : t('عندك سؤال؟ سولنا فواتساب', 'Une question ? WhatsApp')}</span>
          <span className="block text-sm text-muted">{b.text_ar ? t(b.text_ar, b.text_fr || b.text_ar) : t('كنجاوبو بسرعة خلال أوقات العمل', 'Réponse rapide pendant les horaires')}</span>
        </span>
      </a>
    </section>
  )
}

function CrossBlock() {
  const { t } = useLang()
  const o = BRANDS[OTHER]
  const store = OTHER === 'store'
  return (
    <section className="mx-auto max-w-6xl px-4 pt-16">
      <a href={SITES[OTHER]} className="group relative block overflow-hidden rounded-3xl p-10 text-white md:p-14" style={{ background: `linear-gradient(135deg, ${o.color}, color-mix(in srgb, ${o.color} 60%, #0F172A))` }}>
        <Truck className="absolute -end-6 -bottom-6 size-48 opacity-15" />
        <div className="relative max-w-xl">
          <div className="text-sm font-semibold text-white/80">{store ? '🛍️' : '🗂️'} {t(o.name_ar, o.name_fr)}</div>
          <h3 className="mt-1 text-3xl font-extrabold">{t(o.tagline_ar, o.tagline_fr)}</h3>
          <p className="mt-3 text-white/85">{store ? t('منتجات عملية للدار، الهاتف، الأطفال والمدرسة. توصيل لكل المغرب والأداء عند الاستلام.', 'Maison, téléphone, enfants, école. Livraison partout, paiement à la livraison.') : t('أكثر من 40 خدمة إدارية: السجل العدلي، جواز السفر، CNSS، المقاول الذاتي…', 'Plus de 40 services administratifs en ligne.')}</p>
          <span className="mt-6 inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 font-semibold">{store ? t('زوروا المتجر', 'Visiter la boutique') : t('اكتشف الخدمات', 'Voir les services')}<ArrowLeft className="size-4 ltr:rotate-180" /></span>
        </div>
      </a>
    </section>
  )
}

function CustomRequestBlock() {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-4">
      <CustomRequestBanner compact />
    </section>
  )
}

const RENDER: Record<Block['type'], (p: { b: Block }) => React.ReactNode> = {
  products: ProductsBlock,
  categories: CategoriesBlock,
  trust: TrustBlock,
  promise: PromiseBlock,
  services: ServicesBlock,
  features: FeaturesBlock,
  shortcuts: ShortcutsBlock,
  about: AboutBlock,
  custom_request: CustomRequestBlock,
  banner: BannerBlock,
  text: TextBlock,
  image: ImageBlock,
  video: VideoBlock,
  steps: StepsBlock,
  faq: FaqBlock,
  whatsapp: WhatsAppBlock,
  cross: CrossBlock,
}

/** The home page sections of this site, in the order the owner chose. */
export function HomeBlocks() {
  const site = useSite()
  const raw = BRAND === 'store' ? site.data?.storeSite : site.data?.website
  const blocks = blocksOf(BRAND, (raw as { blocks?: Block[] } | undefined)?.blocks, (raw as { sections?: Record<string, boolean> } | undefined)?.sections)
  return (
    <>
      {blocks.filter((b) => b.enabled).map((b) => {
        const R = RENDER[b.type]
        return R ? <R key={b.id} b={b} /> : null
      })}
    </>
  )
}
