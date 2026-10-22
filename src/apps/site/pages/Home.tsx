import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, FileCheck2, PackageSearch, Search, Sparkles } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { useAdminServices, useSite } from '../data'
import { ME } from '@/shared/lib/brand'
import { useSeo } from '../Layout'
import { HomeBlocks } from '../blocks'
import { OpenBadge } from '../Layout'

export function HomePage() {
  const { t, pick } = useLang()
  const site = useSite()
  const services = useAdminServices()
  const nav = useNavigate()
  const [code, setCode] = useState('')
  useSeo()

  const w = site.data?.website

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-25" />
        <motion.div animate={{ scale: [1, 1.15, 1], opacity: [0.35, 0.5, 0.35] }} transition={{ duration: 10, repeat: Infinity }} className="absolute -end-40 -top-40 size-[38rem] rounded-full bg-brand/40 blur-3xl" />
        <div className="absolute -bottom-48 -start-24 size-[30rem] rounded-full bg-[#2563EB]/25 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-[1.25fr_1fr] md:py-28">
          <div className="min-w-0">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-sm backdrop-blur">
              <Sparkles className="size-4 text-brand" />
              {t(ME.name_ar, ME.name_fr)} · {t('تطوان', 'Tétouan')}
            </motion.div>
            <div className="mt-3">
              <OpenBadge big />
            </div>
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
                <Link to="/abroad">
                  {t('🌍 أنا خارج المغرب', '🌍 Je suis à l’étranger')}
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
                    ['🌍', t('حتى من خارج المغرب', 'même depuis l’étranger')],
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

      <HomeBlocks />
    </>
  )
}
