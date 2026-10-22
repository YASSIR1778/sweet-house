import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, MessageCircle, RotateCcw } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/primitives'
import { useSite } from '../data'
import { useSeo } from '../Layout'

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
  const items: [string, string, string, string][] = (site.data?.storeSite?.faq ?? []).map((q) => [q.q_ar, q.q_fr, q.a_ar, q.a_fr] as [string, string, string, string])
  if (d?.zones?.length || d?.default_price)
    items.splice(3, 0, [
      'شحال ثمن التوصيل؟',
      'Prix de la livraison ?',
      `حسب المدينة${d?.default_price ? ` (ابتداءً من ${money(Math.min(d.default_price, ...(d.zones ?? []).map((z) => z.price)))})` : ''}${d?.free_above ? `، ومجاني فوق ${money(d.free_above)}` : ''}. كيبان ليك الثمن قبل ما تأكد.`,
      `Selon la ville${d?.free_above ? `, offerte dès ${money(d.free_above)}` : ''}. Le prix s’affiche avant la confirmation.`,
    ])
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
  const site = useSite()
  const rules: [string, string][] = (site.data?.storeSite?.returns ?? []).map((r) => [r.text_ar, r.text_fr] as [string, string])
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
