import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, MessageCircle, RotateCcw } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Button, Skeleton } from '@/shared/ui/primitives'
import { useAdminServices, useSite } from '../data'
import { useSeo } from '../Layout'
import { ServiceRequestPage } from './Services'

function Faq({ items }: { items: [string, string, string, string][] }) {
  const { t } = useLang()
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="space-y-3">
      {items.map(([qa, qf, aa, af], i) => (
        <div key={i} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 p-5 text-start font-semibold">
            {t(qa, qf)}
            <ChevronDown className={cn('size-5 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed whitespace-pre-line text-muted">{t(aa, af)}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  )
}

export function StoreFaqPage() {
  const { t } = useLang()
  const site = useSite()
  useSeo(t('الأسئلة الشائعة', 'FAQ'))
  const d = site.data?.delivery
  const items: [string, string, string, string][] = [
    ['كيفاش نطلب؟', 'Comment commander ?', 'اختار المنتج، عمّر الاسم والهاتف والمدينة والعنوان، وأكّد. غادي نتاصلو بيك باش نأكدو الطلبية قبل ما نصيفطوها.', 'Choisissez le produit, remplissez nom, téléphone, ville et adresse, puis confirmez. Nous vous appelons pour confirmer avant l’envoi.'],
    ['واش كنخلص عند الاستلام؟', 'Paiement à la livraison ?', 'إيه، كتخلص غير ملي توصلك الطلبية وتشوفها.', 'Oui, vous payez uniquement à la réception.'],
    ['شحال كيدير التوصيل؟', 'Délais de livraison ?', 'عادة بين 24 و72 ساعة حسب المدينة. فتطوان والنواحي غالباً نفس النهار أو النهار الموالي.', 'En général 24 à 72 h selon la ville. Tétouan et environs : souvent le jour même ou le lendemain.'],
    [
      'شحال ثمن التوصيل؟',
      'Prix de la livraison ?',
      `حسب المدينة${d?.default_price ? ` (ابتداءً من ${money(Math.min(d.default_price, ...(d.zones ?? []).map((z) => z.price)))})` : ''}${d?.free_above ? `، ومجاني فوق ${money(d.free_above)}` : ''}. كيبان ليك الثمن قبل ما تأكد.`,
      `Selon la ville${d?.free_above ? `, offerte dès ${money(d.free_above)}` : ''}. Le prix s’affiche avant la confirmation.`,
    ],
    ['واش نقدر نستبدل ولا نرجع؟', 'Échange ou retour ?', 'إيه، شوف «الإرجاع والاستبدال». الأهم: تشوف المنتج قدام الموزع قبل ما تخلص.', 'Oui, voir « Retours et échanges ». Vérifiez le produit devant le livreur avant de payer.'],
    ['نقدر نجي نشري من المحل؟', 'Retrait en boutique ?', 'مرحبا بيك فالمحل فتطوان، أو اطلب أونلاين وخلي الطلبية تتسنّاك.', 'Bienvenue en boutique à Tétouan, ou commandez en ligne et retirez sur place.'],
    ['كيفاش نتبّع الطلبية؟', 'Suivre ma commande ?', 'من صفحة «تتبّع طلبيتي» برقم التتبّع ورقم الهاتف، ولا سولنا فواتساب.', 'Page « Suivi » avec le code et votre téléphone, ou sur WhatsApp.'],
  ]
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="mb-2 text-4xl font-extrabold">{t('الأسئلة الشائعة', 'Questions fréquentes')}</h1>
      <p className="mb-8 text-muted">{t('كلشي اللي خاصك تعرف قبل ما تطلب.', 'Tout ce qu’il faut savoir avant de commander.')}</p>
      <Faq items={items} />
      <WhatsAppBox />
    </div>
  )
}

export function ReturnsPage() {
  const { t } = useLang()
  useSeo(t('الإرجاع والاستبدال', 'Retours et échanges'))
  const rules: [string, string][] = [
    ['شوف الطلبية قدام الموزع قبل ما تخلص. إلا كان شي مشكل، ما تقبلهاش وما كتخلص والو.', 'Vérifiez devant le livreur avant de payer. En cas de problème, refusez sans rien payer.'],
    ['عندك 3 أيام من الاستلام باش تطلب الاستبدال إلا كان المنتج فيه عيب أو ماشي هو اللي طلبتي.', '3 jours après réception pour demander un échange si le produit est défectueux ou non conforme.'],
    ['المنتج خاصو يرجع فالحالة ديالو، مع الكارطونة ديالو، وما مستعملش.', 'Le produit doit être retourné neuf, dans son emballage.'],
    ['إلا كان الغلط منّا (عيب أو منتج آخر)، الاستبدال والتوصيل علينا.', 'Si l’erreur vient de nous, l’échange et la livraison sont à notre charge.'],
    ['إلا بدّلتي رأيك بلا عيب، التوصيل ديال الرجوع عليك.', 'Si vous changez d’avis sans défaut, la livraison du retour est à votre charge.'],
    ['للطلب: راسلنا فواتساب برقم الطلبية وتصويرة ديال المنتج.', 'Pour demander : écrivez-nous sur WhatsApp avec le numéro de commande et une photo.'],
  ]
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand"><RotateCcw className="size-7" /></div>
      <h1 className="mb-2 text-4xl font-extrabold">{t('الإرجاع والاستبدال', 'Retours et échanges')}</h1>
      <p className="mb-8 text-muted">{t('بغيناك تكون مرتاح فكل طلبية.', 'Nous voulons que chaque commande vous satisfasse.')}</p>
      <ol className="space-y-3">
        {rules.map(([ar, fr], i) => (
          <li key={i} className="flex gap-4 rounded-2xl border border-border bg-surface p-4">
            <span className="num flex size-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{i + 1}</span>
            <span className="leading-relaxed">{t(ar, fr)}</span>
          </li>
        ))}
      </ol>
      <WhatsAppBox />
    </div>
  )
}

function WhatsAppBox() {
  const { t } = useLang()
  const site = useSite()
  return (
    <div className="mt-10 flex flex-wrap items-center gap-4 rounded-3xl bg-surface-2 p-6">
      <div className="flex-1">
        <div className="font-bold">{t('باقي عندك سؤال؟', 'Encore une question ?')}</div>
        <div className="text-sm text-muted">{t('سولنا مباشرة', 'Écrivez-nous directement')}</div>
      </div>
      <Button asChild variant="success">
        <a href={whatsappLink(site.data?.store.whatsapp ?? '', '')} target="_blank" rel="noreferrer">
          <MessageCircle />
          WhatsApp
        </a>
      </Button>
    </div>
  )
}

/** /school-list on the store: the "school list" request form. */
export function SchoolListPage() {
  const data = useAdminServices()
  const s = data.data?.services.find((x) => x.system_key === 'school_list')
  if (data.isLoading) return <div className="mx-auto max-w-4xl px-4 py-12"><Skeleton className="h-96" /></div>
  return <ServiceRequestPage serviceId={s?.id ?? ''} />
}
