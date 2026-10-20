import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, ChevronDown, FileCheck2, MessageCircle, PackageSearch, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { DynamicIcon } from '@/shared/ui/icon'
import { useAdminServices, useShop, useSite } from '../data'
import { ProductCard, SectionTitle, ServiceCard } from '../components'
import { useSeo } from '../Layout'
import { CustomRequestBanner } from './Services'

export function HomePage() {
  const { t, pick } = useLang()
  const site = useSite()
  const shop = useShop()
  const services = useAdminServices()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  const [faqOpen, setFaqOpen] = useState<number | null>(0)
  useSeo()

  const w = site.data?.website
  const store = site.data?.store
  const sec = w?.sections ?? { features: true, featured: true, services: true, about: true, faq: true }
  const featured = (shop.data?.products ?? []).filter((p) => p.is_featured).slice(0, 8)
  const latest = featured.length ? featured : (shop.data?.products ?? []).slice(0, 8)
  const popular = (services.data?.services ?? []).filter((x) => x.system_key !== 'custom_request').slice(0, 6)
  const catColor = (id: string | null) => services.data?.categories.find((c) => c.id === id)?.color

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-25" />
        <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.5, 0.35] }} transition={{ duration: 10, repeat: Infinity }} className="absolute -end-40 -top-40 size-[38rem] rounded-full bg-brand/40 blur-3xl" />
        <div className="absolute -bottom-48 -start-24 size-[30rem] rounded-full bg-[#2563EB]/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-[1.25fr_1fr] md:py-28">
          <div>
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm backdrop-blur">
              <Sparkles className="size-4 text-brand" />
              {store ? pick(store, 'name') : 'Sweet House'} · {t('تطوان', 'Tétouan')}
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-6 text-4xl leading-[1.15] font-extrabold tracking-tight md:text-6xl">
              {w ? pick(w.hero, 'title') : <Skeleton className="h-14 w-full bg-white/10" />}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
              {w ? pick(w.hero, 'subtitle') : ''}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/services">
                  <FileCheck2 />
                  {t('اطلب وثيقة إدارية', 'Demander un document')}
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                <Link to="/shop">
                  {t('تصفّح المتجر', 'Voir la boutique')}
                  <ArrowLeft className="ltr:rotate-180" />
                </Link>
              </Button>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
            {w?.hero.image_url ? (
              <img src={w.hero.image_url} alt="" className="aspect-[4/3] w-full rounded-3xl object-cover shadow-2xl ring-1 ring-white/10" />
            ) : (
              <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <PackageSearch className="size-5 text-brand" />
                  {t('تتبّع طلبك', 'Suivez votre demande')}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (code.trim()) nav(`/track/${code.trim().toUpperCase()}`)
                  }}
                  className="mt-4 flex gap-2"
                >
                  <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('رقم التتبّع', 'Code de suivi')} dir="ltr" className="num h-12 flex-1 rounded-xl border border-white/15 bg-white/10 px-4 tracking-widest uppercase placeholder:tracking-normal placeholder:text-white/40 focus:border-brand focus:outline-none" />
                  <Button type="submit" size="lg" className="px-4">
                    <Search />
                  </Button>
                </form>
                <div className="mt-6 grid grid-cols-3 gap-3 text-center">
                  {[
                    [String(services.data?.services.length ?? '40') + '+', t('خدمة إدارية', 'services')],
                    ['48h', t('متوسط الإنجاز', 'délai moyen')],
                    ['🇲🇦', t('توصيل لكل المغرب', 'livraison Maroc')],
                  ].map(([a, b]) => (
                    <div key={b} className="rounded-2xl bg-white/5 p-3">
                      <div className="num text-2xl font-extrabold text-brand">{a}</div>
                      <div className="mt-1 text-xs text-white/60">{b}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* features */}
      {sec.features && w && (
        <section className="relative z-10 mx-auto -mt-10 max-w-6xl px-4">
          <div className="grid gap-4 rounded-3xl border border-border bg-surface p-4 shadow-pop sm:grid-cols-2 lg:grid-cols-4">
            {w.features.map((f, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }} className="flex items-start gap-3 rounded-2xl p-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
                  <DynamicIcon name={f.icon} className="size-5" />
                </div>
                <div>
                  <div className="font-semibold">{pick(f, 'title')}</div>
                  <div className="mt-0.5 text-sm text-muted">{pick(f, 'text')}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* services */}
      {sec.services && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <SectionTitle
            eyebrow={t('الخدمات الإدارية والإلكترونية', 'Services administratifs')}
            title={t('وثائقك جاهزة دون عناء التنقل', 'Vos documents, sans vous déplacer')}
            subtitle={t('اطلب الخدمة، ارفع وثائقك، وتابع طلبك حتى تتوصل بالوثيقة الجاهزة.', 'Demandez, envoyez vos documents et suivez votre demande jusqu’au document prêt.')}
            action={
              <Button asChild variant="outline">
                <Link to="/services">
                  {t('كل الخدمات', 'Tous les services')}
                  <ArrowLeft className="ltr:rotate-180" />
                </Link>
              </Button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.isLoading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />) : popular.map((s, i) => <ServiceCard key={s.id} s={s} color={catColor(s.category_id)} index={i} />)}
          </div>
          <div className="mt-4">
            <CustomRequestBanner compact />
          </div>
        </section>
      )}

      {/* how it works */}
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { n: '01', icon: FileCheck2, ar: 'اختر الخدمة واملأ الطلب', fr: 'Choisissez et remplissez', d_ar: 'في دقيقة واحدة، مع رفع وثائقك بأمان', d_fr: 'En une minute, documents envoyés en sécurité' },
            { n: '02', icon: ShieldCheck, ar: 'نُنجز طلبك', fr: 'Nous traitons', d_ar: 'فريقنا يتكفّل بكل الإجراءات', d_fr: 'Notre équipe s’occupe de tout' },
            { n: '03', icon: MessageCircle, ar: 'رسالة واتساب عند الجاهزية', fr: 'Message WhatsApp', d_ar: 'حمّل وثيقتك أو استلمها من المحل', d_fr: 'Téléchargez ou retirez en boutique' },
          ].map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="relative overflow-hidden rounded-3xl border border-border bg-surface p-7">
              <div className="num absolute -end-2 -top-4 text-8xl font-black text-brand/[0.07]">{s.n}</div>
              <s.icon className="size-8 text-brand" />
              <div className="mt-4 text-lg font-bold">{t(s.ar, s.fr)}</div>
              <div className="mt-1 text-sm text-muted">{t(s.d_ar, s.d_fr)}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* products */}
      {sec.featured && latest.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <SectionTitle
            eyebrow={t('المتجر', 'Boutique')}
            title={featured.length ? t('منتجات مختارة', 'Notre sélection') : t('وصل حديثاً', 'Nouveautés')}
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
            {latest.map((p, i) => (
              <ProductCard key={p.id} p={p} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* delivery banner */}
      <section className="mx-auto max-w-6xl px-4 pt-20">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand to-[#ff9466] p-10 text-white md:p-14">
          <Truck className="absolute -end-6 -bottom-6 size-48 opacity-15" />
          <div className="relative max-w-xl">
            <h3 className="text-3xl font-extrabold">{t('نوصل طلبك لكل مدن المغرب 🚚', 'Livraison dans tout le Maroc 🚚')}</h3>
            <p className="mt-3 text-white/85">{t('أو استلمه من المحل في تطوان. الأداء عند الاستلام متاح.', 'Ou retrait en boutique à Tétouan. Paiement à la livraison disponible.')}</p>
            <Button asChild size="lg" variant="navy" className="mt-6">
              <Link to="/shop">{t('ابدأ التسوق', 'Commencer')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* about + faq */}
      <section className="mx-auto grid max-w-6xl gap-10 px-4 pt-20 lg:grid-cols-2">
        {sec.about && w && (
          <div>
            <div className="mb-2 text-sm font-semibold text-brand">{pick(w.about, 'title')}</div>
            <h2 className="text-3xl font-extrabold">{store ? pick(store, 'name') : ''}</h2>
            <p className="mt-4 leading-relaxed text-muted">{pick(w.about, 'text')}</p>
            <Button asChild variant="success" className="mt-6">
              <a href={whatsappLink(store?.whatsapp ?? '', '')} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t('راسلنا على واتساب', 'Écrivez-nous sur WhatsApp')}
              </a>
            </Button>
          </div>
        )}
        {sec.faq && w && w.faq.length > 0 && (
          <div className="space-y-3">
            {w.faq.map((f, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">
                  {pick(f, 'q')}
                  <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', faqOpen === i && 'rotate-180')} />
                </button>
                <AnimatePresence initial={false}>
                  {faqOpen === i && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{pick(f, 'a')}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
