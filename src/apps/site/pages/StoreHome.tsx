import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { Search, Sparkles } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { ME } from '@/shared/lib/brand'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { DynamicIcon } from '@/shared/ui/icon'
import { useShop, useSite } from '../data'
import { useSeo } from '../Layout'
import { HomeBlocks } from '../blocks'

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
  const hero = (featured.length ? featured : products).filter((p) => p.images[0] || p.product_variants[0]?.image_url).slice(0, 3)
  const W = site.data?.storeSite
  const TRUST = (W?.trust?.length ? W.trust : TRUST_DEFAULT).map((x) => ({ Icon: x.icon, ar: x.text_ar, fr: x.text_fr }))

  return (
    <>
      {/* ---------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-20" />
        <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0.55, 0.35] }} transition={{ duration: 9, repeat: Infinity }} className="absolute -end-40 -top-40 size-[40rem] rounded-full bg-brand/45 blur-3xl" />
        <motion.div animate={{ scale: [1.1, 1, 1.1] }} transition={{ duration: 12, repeat: Infinity }} className="absolute -bottom-56 -start-32 size-[32rem] rounded-full bg-[#F59E0B]/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1.15fr_1fr] md:py-24">
          <div className="min-w-0">
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
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('على شنو كتقلب؟', 'Que cherchez-vous ?')} className="w-0 min-w-0 flex-1 bg-transparent text-base placeholder:text-white/40 focus:outline-none" />
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

      <HomeBlocks />
    </>
  )
}
