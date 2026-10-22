import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { Building2, FileCheck2, Globe2, Mail, MessageCircle, Search, Upload } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { matchesSearch, whatsappLink } from '@/shared/lib/utils'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { useAdminServices, useSite } from '../data'
import { ServiceCard } from '../components'
import { useSeo } from '../Layout'

/** 10 · Moroccans abroad: administrative documents requested remotely. */
export function AbroadPage() {
  const { t, pick } = useLang()
  const data = useAdminServices()
  const site = useSite()
  const [q, setQ] = useState('')
  useSeo(t('أنا خارج المغرب', 'Je suis à l’étranger'))
  const ab = site.data?.abroad

  const groups = useMemo(() => {
    const list = (data.data?.services ?? []).filter((x) => x.abroad && x.system_key !== 'custom_request').filter((x) => matchesSearch(q, x.name_ar, x.name_fr))
    return (data.data?.categories ?? []).map((c) => ({ c, items: list.filter((x) => x.category_id === c.id) })).filter((g) => g.items.length)
  }, [data.data, q])
  const custom = data.data?.services.find((x) => x.system_key === 'custom_request' && x.abroad)

  if (ab && ab.enabled === false) return <EmptyState className="py-32" title={t('هذه الصفحة غير متاحة حالياً', 'Page indisponible')} />

  const steps = [
    { icon: Search, ar: 'اختر الوثيقة', fr: 'Choisissez le document', d_ar: 'من القائمة أسفله', d_fr: 'Dans la liste ci-dessous' },
    { icon: Upload, ar: 'املأ وارفع وثائقك', fr: 'Remplissez et envoyez', d_ar: 'صور واضحة بالهاتف تكفي', d_fr: 'Des photos nettes suffisent' },
    { icon: Building2, ar: 'ادفع بالتحويل', fr: 'Payez par virement', d_ar: pick(ab ?? { payment_note_ar: '', payment_note_fr: '' }, 'payment_note') || t('إلى حساب المكتبة بالمغرب', 'Sur le compte de la librairie'), d_fr: '' },
    { icon: Mail, ar: 'استلم وثيقتك', fr: 'Recevez votre document', d_ar: 'بالإيميل، بالبريد، أو يستلمها قريب لك من المحل', d_fr: 'Par e-mail, par la poste, ou retrait par un proche' },
  ]

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-25" />
        <div className="absolute -start-32 -top-32 size-96 rounded-full bg-brand/30 blur-3xl" />
        <div className="absolute -end-24 bottom-0 size-80 rounded-full bg-[#2563EB]/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-sm backdrop-blur">
            <Globe2 className="size-4 text-brand" />
            {t('لمغاربة العالم', 'Pour les Marocains du monde')}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl">{t('أنت خارج المغرب؟ وثائقك علينا', 'À l’étranger ? On s’occupe de vos documents')}</h1>
          <p className="mt-3 max-w-2xl text-white/70">{t('اطلب وثائقك الإدارية من أي بلد، دون سفر ودون وكالة. فريقنا في تطوان ينجزها ويرسلها لك.', 'Demandez vos documents depuis n’importe quel pays. Notre équipe à Tétouan s’en charge et vous les envoie.')}</p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <div className="mb-2 flex items-center gap-2">
                  <span className="num flex size-7 items-center justify-center rounded-full bg-brand text-sm font-bold">{i + 1}</span>
                  <s.icon className="size-5 text-white/70" />
                </div>
                <div className="font-semibold">{t(s.ar, s.fr)}</div>
                <div className="mt-0.5 text-sm text-white/60">{s.d_fr ? t(s.d_ar, s.d_fr) : s.d_ar}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute inset-y-0 start-4 my-auto size-5 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث: عقد الازدياد، شهادة الملكية…', 'Rechercher : acte de naissance…')} className="h-12 w-full rounded-2xl border border-border bg-surface ps-12 pe-4 focus:border-brand focus:outline-none" />
          </div>
          <Button asChild variant="success" size="lg">
            <a href={whatsappLink(site.data?.store.whatsapp ?? '', t('مرحباً، أنا مقيم خارج المغرب وأحتاج وثيقة إدارية', 'Bonjour, je vis à l’étranger et j’ai besoin d’un document'))} target="_blank" rel="noreferrer">
              <MessageCircle />
              {t('اسألنا على واتساب', 'Une question ? WhatsApp')}
            </a>
          </Button>
        </div>

        {data.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : !groups.length ? (
          <EmptyState icon={<FileCheck2 />} title={t('لا توجد خدمات بهذا الاسم', 'Aucun service trouvé')} />
        ) : (
          <div className="space-y-10">
            {groups.map((g) => (
              <section key={g.c.id}>
                <h2 className="mb-4 text-xl font-bold">{pick(g.c, 'name')}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((s, i) => (
                    <ServiceCard key={s.id} s={s} color={g.c.color} index={i} to={`/services/${s.id}?abroad=1`} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {custom && (
          <Link to={`/services/${custom.id}?abroad=1`} className="mt-10 flex items-center gap-4 rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50/60 p-6 transition-colors hover:border-brand">
            <MessageCircle className="size-8 shrink-0 text-brand" />
            <div className="flex-1">
              <div className="font-bold">{t('وثيقتك غير موجودة في القائمة؟', 'Document absent de la liste ?')}</div>
              <div className="text-sm text-muted">{t('اشرح لنا ما تحتاجه وسنخبرك بالإمكانية والسعر والمدة.', 'Décrivez votre besoin, nous revenons vers vous.')}</div>
            </div>
          </Link>
        )}
      </div>
    </>
  )
}
