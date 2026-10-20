import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowLeft, Clock, FileCheck2, MapPin, MessageCircle, Phone, Printer, Search, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import { getSupabase } from '@/shared/lib/supabase'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { whatsappLink } from '@/shared/lib/utils'
import type { Service, ServiceCategory, StoreSettings } from '@/shared/lib/types'
import { Badge, Button, Card, Input, Skeleton } from '@/shared/ui/primitives'
import { LangToggle, Logo } from '@/shared/ui/brand'
import { DynamicIcon } from '@/shared/ui/icon'

const sb = getSupabase('site')

export function App() {
  const { t, pick } = useLang()
  const [q, setQ] = useState('')

  const store = useQuery({
    queryKey: ['site-store'],
    queryFn: async () => (await sb.from('settings').select('value').eq('key', 'store').single()).data?.value as StoreSettings,
  })
  const services = useQuery({
    queryKey: ['site-services'],
    queryFn: async () => {
      const [{ data: s }, { data: c }] = await Promise.all([
        sb.from('services').select('*').order('sort'),
        sb.from('service_categories').select('*').is('deleted_at', null).order('sort'),
      ])
      return { services: (s ?? []) as Service[], cats: (c ?? []) as ServiceCategory[] }
    },
  })

  const wa = store.data?.whatsapp ?? '212697740298'
  const admin = useMemo(() => {
    const list = (services.data?.services ?? []).filter((s) => s.kind === 'admin' && (!q || s.name_ar.includes(q) || s.name_fr.toLowerCase().includes(q.toLowerCase())))
    return (services.data?.cats ?? []).filter((c) => c.kind === 'admin').map((c) => ({ cat: c, items: list.filter((s) => s.category_id === c.id) })).filter((g) => g.items.length)
  }, [services.data, q])
  const counter = (services.data?.services ?? []).filter((s) => s.kind === 'counter' && s.system_key !== 'riyad_fee')

  return (
    <div className="min-h-screen bg-bg">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo />
          <nav className="ms-auto hidden items-center gap-6 text-sm font-medium text-muted md:flex">
            <a href="#services" className="hover:text-text">
              {t('الخدمات الإدارية', 'Services administratifs')}
            </a>
            <a href="#shop" className="hover:text-text">
              {t('خدمات المحل', 'En boutique')}
            </a>
            <a href="#contact" className="hover:text-text">
              {t('تواصل معنا', 'Contact')}
            </a>
          </nav>
          <LangToggle />
          <Button asChild size="sm">
            <a href={whatsappLink(wa, t('مرحباً سويت هاوس 👋', 'Bonjour Sweet House 👋'))} target="_blank" rel="noreferrer">
              <MessageCircle />
              {t('واتساب', 'WhatsApp')}
            </a>
          </Button>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-30" />
        <div className="absolute -top-40 -end-40 size-[36rem] rounded-full bg-brand/30 blur-3xl" />
        <div className="absolute -bottom-40 -start-20 size-96 rounded-full bg-[#2563EB]/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-[1.2fr_1fr] md:py-28">
          <div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Badge tone="brand" className="bg-brand/15 px-3 py-1 text-sm">
                <Sparkles />
                {t('تطوان', 'Tétouan')}
              </Badge>
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-4xl leading-tight font-extrabold md:text-6xl">
              {store.data ? pick(store.data, 'name') : 'Sweet House'}
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg text-white/70">
              {store.data ? pick(store.data, 'tagline') : ''}
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#services">
                  {t('اكتشف خدماتنا', 'Découvrir nos services')}
                  <ArrowLeft className="ltr:rotate-180" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                <a href={`tel:${store.data?.phone ?? ''}`}>
                  <Phone />
                  <span className="num" dir="ltr">
                    {store.data?.phone}
                  </span>
                </a>
              </Button>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 gap-3">
            {[
              { icon: FileCheck2, ar: 'وثائق إدارية', fr: 'Documents administratifs' },
              { icon: Printer, ar: 'طباعة ونسخ', fr: 'Impression & copie' },
              { icon: Truck, ar: 'توصيل لكل المغرب', fr: 'Livraison partout au Maroc' },
              { icon: ShieldCheck, ar: 'سرية تامة', fr: 'Confidentialité totale' },
            ].map((f, i) => (
              <motion.div key={f.fr} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
                <f.icon className="size-7 text-brand" />
                <div className="mt-3 font-semibold">{t(f.ar, f.fr)}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* admin services */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold">{t('الخدمات الإدارية والإلكترونية', 'Services administratifs et en ligne')}</h2>
            <p className="mt-2 text-muted">{t('نقوم بالإجراءات نيابة عنك بسرعة وأمان', 'Nous effectuons vos démarches rapidement et en toute sécurité')}</p>
          </div>
          <div className="w-full max-w-xs">
            <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث عن خدمة…', 'Rechercher un service…')} />
          </div>
        </div>
        <div className="mt-10 space-y-10">
          {services.isLoading
            ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-40" />)
            : admin.map((g) => (
                <div key={g.cat.id}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: g.cat.color }}>
                      <DynamicIcon name={g.cat.icon} className="size-5" />
                    </div>
                    <h3 className="text-lg font-semibold">{pick(g.cat, 'name')}</h3>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.items.map((s, i) => (
                      <motion.div key={s.id} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
                        <Card className="group flex h-full flex-col p-5 transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-pop">
                          <div className="font-semibold">{pick(s, 'name')}</div>
                          {pick(s, 'description') && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{pick(s, 'description')}</p>}
                          <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                            {s.duration_ar && (
                              <span className="flex items-center gap-1 text-xs text-muted">
                                <Clock className="size-3.5" />
                                {pick(s, 'duration')}
                              </span>
                            )}
                            <a
                              href={whatsappLink(wa, t(`مرحباً، أريد خدمة: ${s.name_ar}`, `Bonjour, je souhaite le service : ${s.name_fr}`))}
                              target="_blank"
                              rel="noreferrer"
                              className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand transition-colors group-hover:bg-brand group-hover:text-white"
                            >
                              {s.price > 0 ? <span className="num">{money(s.price)}</span> : t('اطلب', 'Demander')}
                              <MessageCircle className="size-4" />
                            </a>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
        </div>
        <p className="mt-8 text-center text-sm text-muted">{t('قريباً: الطلب والتتبّع والتحميل أونلاين مباشرة من الموقع ✨', 'Bientôt : demande, suivi et téléchargement en ligne ✨')}</p>
      </section>

      {/* counter services */}
      <section id="shop" className="border-y border-border bg-surface py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-3xl font-bold">{t('خدمات المحل', 'Services en boutique')}</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {counter.map((s) => (
              <div key={s.id} className="flex items-center gap-4 rounded-2xl border border-border p-5">
                <div className="flex size-12 items-center justify-center rounded-xl text-white" style={{ background: s.pos_color ?? '#0F172A' }}>
                  <DynamicIcon name={s.icon} className="size-6" />
                </div>
                <div>
                  <div className="font-semibold">{pick(s, 'name')}</div>
                  {s.price > 0 && (
                    <div className="num text-sm text-brand">
                      {t('ابتداءً من', 'Dès')} {money(s.price)}
                      {s.unit_ar ? ` / ${pick(s, 'unit')}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* contact */}
      <section id="contact" className="mx-auto max-w-6xl px-4 py-20">
        <Card className="relative overflow-hidden bg-navy p-10 text-white">
          <div className="absolute -end-20 -top-20 size-72 rounded-full bg-brand/30 blur-3xl" />
          <div className="relative grid gap-8 md:grid-cols-3">
            <div>
              <h2 className="text-2xl font-bold">{t('زورونا أو راسلونا', 'Rendez-nous visite')}</h2>
              <p className="mt-2 text-white/60">{t('نحن في خدمتكم', 'À votre service')}</p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="size-4 text-brand" />
                {store.data ? pick(store.data, 'address') : ''}
              </div>
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-brand" />
                <span className="num" dir="ltr">
                  {store.data?.phone}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <Button asChild>
                <a href={whatsappLink(wa, '')} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
              {store.data?.maps_url && (
                <Button asChild variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10">
                  <a href={store.data.maps_url} target="_blank" rel="noreferrer">
                    <MapPin />
                    {t('الخريطة', 'Carte')}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </Card>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted">© {new Date().getFullYear()} Sweet House · Tétouan</footer>

      <a href={whatsappLink(wa, '')} target="_blank" rel="noreferrer" className="fixed end-5 bottom-5 z-40 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-[#25D366]/30 transition-transform hover:scale-110">
        <MessageCircle className="size-7" />
      </a>
    </div>
  )
}
