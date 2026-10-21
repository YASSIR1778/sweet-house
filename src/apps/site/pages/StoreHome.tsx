import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Backpack, MessageCircle, PackageCheck, Search, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { whatsappLink } from '@/shared/lib/utils'
import { BRANDS, ME, SITES } from '@/shared/lib/brand'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { DynamicIcon } from '@/shared/ui/icon'
import { useShop, useSite } from '../data'
import { ProductCard, SectionTitle } from '../components'
import { useSeo } from '../Layout'

const TRUST_DEFAULT = [
  { icon: 'truck', text_ar: 'توصيل لجميع المدن', text_fr: 'Livraison partout au Maroc' },
  { icon: 'wallet', text_ar: 'الدفع عند الاستلام', text_fr: 'Paiement à la livraison' },
  { icon: 'rotate-ccw', text_ar: 'استبدال سهل', text_fr: 'Échange facile' },
]

/** Store home: show products fast, remove doubts (delivery, COD), one click to buy. */
export function StoreHome() {
  const { t, pick } = useLang()
  const shop = useShop()
  const site = useSite()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  useSeo()
  const products = shop.data?.products ?? []
  const featured = products.filter((p) => p.is_featured)
  const top = (featured.length ? featured : products).slice(0, 8)
  const latest = [...products].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 8)
  const hero = (featured.length ? featured : products).filter((p) => p.images[0] || p.product_variants[0]?.image_url).slice(0, 3)
  const cats = shop.data?.categories ?? []
  const freeAbove = site.data?.delivery?.free_above
  const month = new Date().getMonth() // 7 = Aug, 8 = Sep
  const schoolSeason = month === 7 || month === 8
  const W = site.data?.storeSite
  const sec = W?.sections ?? {}
  const on = (k: string) => sec[k] !== false
  const TRUST = (W?.trust?.length ? W.trust : TRUST_DEFAULT).map((x) => ({ Icon: x.icon, ar: x.text_ar, fr: x.text_fr }))

  return (
    <>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-20" />
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.55, 0.35] }} transition={{ duration: 9, repeat: Infinity }} className="absolute -end-40 -top-40 size-[40rem] rounded-full bg-brand/45 blur-3xl" />
        <motion.div animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 12, repeat: Infinity }} className="absolute -bottom-56 -start-32 size-[32rem] rounded-full bg-[#F59E0B]/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm backdrop-blur">
              <Sparkles className="size-4 text-brand" />
              {t(ME.name_ar, ME.name_fr)} · {t('تطوان', 'Tétouan')}
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-6 text-4xl leading-[1.15] font-extrabold tracking-tight md:text-6xl">
              {W ? t(W.hero.title_ar, W.hero.title_fr) : t('كلشي اللي محتاج،', 'Tout ce qu’il vous faut,')}
              <br />
              <span className="bg-gradient-to-l from-brand to-[#FBBF24] bg-clip-text text-transparent">{W ? t(W.hero.accent_ar, W.hero.accent_fr) : t('يوصلك لباب الدار', 'livré chez vous')}</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg leading-relaxed text-white/70">
              {W ? t(W.hero.subtitle_ar, W.hero.subtitle_fr) : ''}
            </motion.p>
            <motion.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.22 }}
              onSubmit={(e) => (e.preventDefault(), nav(`/shop${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`))}
              className="mt-8 flex max-w-lg gap-2 rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur"
            >
              <Search className="ms-2 size-5 self-center text-white/50" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('على شنو كتقلب؟', 'Que cherchez-vous ?')} className="min-w-0 flex-1 bg-transparent text-base placeholder:text-white/40 focus:outline-none" />
              <Button type="submit" size="lg">{t('قلّب', 'Chercher')}</Button>
            </motion.form>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/70">
              {TRUST.slice(0, 3).map((x) => (
                <span key={x.ar} className="flex items-center gap-1.5">
                  <DynamicIcon name={x.Icon} className="size-4 text-brand" />
                  {t(x.ar, x.fr)}
                </span>
              ))}
            </motion.div>
          </div>

          {/* floating product cards */}
          <div className="relative hidden h-[26rem] md:block">
            {shop.isLoading
              ? [0, 1, 2].map((i) => (
                  <div key={i} className="absolute" style={{ top: `${i * 18}%`, insetInlineStart: `${i * 26}%` }}>
                    <Skeleton className="h-56 w-44 bg-white/10" />
                  </div>
                ))
              : hero.map((p, i) => {
                  const v = p.product_variants[0]
                  const pos = [
                    { top: '6%', start: '4%', r: -6 },
                    { top: '28%', start: '40%', r: 4 },
                    { top: '52%', start: '8%', r: -2 },
                  ][i]
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: [0, -10, 0] }} transition={{ opacity: { delay: 0.2 + i * 0.12 }, y: { duration: 5 + i, repeat: Infinity, ease: 'easeInOut' } }} className="absolute w-48" style={{ top: pos.top, insetInlineStart: pos.start, rotate: `${pos.r}deg` }}>
                      <Link to={`/shop/${p.id}`} className="block overflow-hidden rounded-3xl bg-white text-text shadow-2xl ring-1 ring-white/20 transition-transform hover:scale-105">
                        <img src={p.images[0] ?? v.image_url ?? ''} alt="" className="aspect-square w-full object-cover" />
                        <div className="p-3">
                          <div className="line-clamp-1 text-sm font-semibold">{pick(p, 'name')}</div>
                          <div className="num font-extrabold text-brand">{money(v.price)}</div>
                        </div>
                      </Link>
                    </motion.div>
                  )
                })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- trust marquee */}
      <div className="overflow-hidden border-b border-border bg-surface py-3">
        <motion.div animate={{ x: ['0%', '-50%'] }} transition={{ duration: 28, repeat: Infinity, ease: 'linear' }} className="flex w-max gap-10 text-sm font-medium" dir="ltr">
          {[...TRUST, ...TRUST, ...TRUST, ...TRUST].map((x, i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap" dir="rtl">
              <DynamicIcon name={x.Icon} className="size-4 text-brand" />
              {t(x.ar, x.fr)}
            </span>
          ))}
        </motion.div>
      </div>

      {/* ---------------------------------------------------------- categories */}
      {on('categories') && cats.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-14">
          <SectionTitle eyebrow={t('الأقسام', 'Rayons')} title={t('شنو كتقلب عليه؟', 'Que cherchez-vous ?')} />
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
      )}

      {/* ---------------------------------------------------------- best sellers */}
      {on('best') && (
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <SectionTitle
          eyebrow={t('الأكثر طلباً', 'Les plus demandés')}
          title={t('اختيارات زبناءنا', 'Les favoris de nos clients')}
          action={
            <Button asChild variant="outline">
              <Link to="/shop">
                {t('كل المنتجات', 'Tous les produits')}
                <ArrowLeft className="ltr:rotate-180" />
              </Link>
            </Button>
          }
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {shop.isLoading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) : top.map((p, i) => <ProductCard key={p.id} p={p} index={i} />)}
        </div>
      </section>
      )}

      {/* ---------------------------------------------------------- COD promise */}
      {on('promise') && (
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
              {[
                ['1', 'اطلب', 'Commandez'],
                ['2', 'نأكدو', 'On confirme'],
                ['3', 'خلّص', 'Payez'],
              ].map(([n, ar, fr]) => (
                <div key={n} className="rounded-2xl bg-white/15 p-4 text-center backdrop-blur">
                  <div className="num text-3xl font-black">{n}</div>
                  <div className="mt-1 text-sm font-semibold">{t(ar, fr)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ---------------------------------------------------------- new */}
      {on('latest') && latest.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-16">
          <SectionTitle eyebrow={t('جديدنا', 'Nouveautés')} title={t('وصل حديثاً', 'Fraîchement arrivé')} />
          <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2">
            {latest.map((p, i) => (
              <div key={p.id} className="w-44 shrink-0 snap-start sm:w-56">
                <ProductCard p={p} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- school list */}
      {on('school') && (
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <Link to="/school-list" className={`group flex flex-wrap items-center gap-5 rounded-3xl border p-6 transition-all hover:shadow-pop ${schoolSeason ? 'border-brand/40 bg-brand-50' : 'border-border bg-surface'}`}>
          <span className="flex size-16 items-center justify-center rounded-2xl bg-[#2563EB] text-white"><Backpack className="size-8" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xl font-extrabold">{schoolSeason ? t('🎒 الدخول المدرسي: صيفط لينا اللائحة ونوجدوها ليك', '🎒 Rentrée : envoyez la liste, on la prépare') : t('🎒 اللائحة المدرسية واجدة فـ 24 ساعة', '🎒 Liste scolaire prête en 24 h')}</span>
            <span className="block text-muted">{t('صوّر اللائحة، نجهزو كلشي ونرسلو ليك الثمن قبل.', 'Photographiez la liste, on prépare tout et on vous envoie le prix.')}</span>
          </span>
          <ArrowLeft className="size-5 text-brand transition-transform group-hover:-translate-x-1 ltr:rotate-180" />
        </Link>
      </section>
      )}

      {/* ---------------------------------------------------------- services cross-promo + whatsapp */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pt-6 md:grid-cols-2">
        {on('cross') && (
        <a href={SITES.services} className="group flex items-center gap-4 rounded-3xl bg-[#2563EB] p-6 text-white transition-all hover:-translate-y-1">
          <span className="text-4xl">🗂️</span>
          <span>
            <span className="block text-sm text-white/70">{t('عندنا أيضاً', 'Découvrez aussi')}</span>
            <span className="block text-lg font-bold">{t(BRANDS.services.name_ar, BRANDS.services.name_fr)}</span>
            <span className="block text-sm text-white/80">{t(BRANDS.services.tagline_ar, BRANDS.services.tagline_fr)}</span>
          </span>
        </a>
        )}
        <a href={whatsappLink(site.data?.store.whatsapp ?? '', t('سلام، بغيت نسول على منتج', 'Bonjour, une question'))} target="_blank" rel="noreferrer" className="group flex items-center gap-4 rounded-3xl border border-border bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-pop">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-[#25D366] text-white"><MessageCircle className="size-7" /></span>
          <span>
            <span className="block text-lg font-bold">{t('عندك سؤال؟ سولنا فواتساب', 'Une question ? WhatsApp')}</span>
            <span className="block text-sm text-muted">{t('كنجاوبو بسرعة خلال أوقات العمل', 'Réponse rapide pendant les horaires')}</span>
          </span>
        </a>
      </section>
    </>
  )
}
