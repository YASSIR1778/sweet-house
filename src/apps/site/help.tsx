import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ChevronDown, HelpCircle, MessageCircle, PhoneCall, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { Service } from '@/shared/lib/types'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Button, Card, Field, Input, Textarea } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { openStatus, sb, useSite } from './data'

export type HelpStep = 'start' | 'contact' | 'info' | 'documents' | 'payment'
export const STEP_LABEL: Record<HelpStep, [string, string]> = {
  start: ['بداية الصفحة', 'Début'],
  contact: ['معلومات التواصل', 'Coordonnées'],
  info: ['معلومات الطلب', 'Informations'],
  documents: ['رفع الوثائق', 'Documents'],
  payment: ['الأداء والإرسال', 'Paiement'],
}

/** 1 · "Need help?" — WhatsApp with full context, or "call me back". */
export function HelpBar({ service, step }: { service: Service; step: HelpStep }) {
  const { t, pick } = useLang()
  const site = useSite()
  const [callback, setCallback] = useState(false)
  const [hidden, setHidden] = useState(false)
  const help = (site.data as unknown as { help?: { enabled?: boolean } } | undefined)?.help
  if (help?.enabled === false || hidden) return null

  const st = openStatus(site.data?.store.hours)
  const open = !!st?.open
  const wa = site.data?.store.whatsapp ?? ''
  const message = t(
    `مرحباً 👋، أحتاج مساعدة في طلب خدمة «${service.name_ar}».\nوصلتُ إلى: ${STEP_LABEL[step][0]}.\nرابط الخدمة: ${location.href.split('?')[0]}`,
    `Bonjour 👋, j’ai besoin d’aide pour « ${service.name_fr} ».\nÉtape : ${STEP_LABEL[step][1]}.\nLien : ${location.href.split('?')[0]}`,
  )
  const openWa = () => {
    sb.rpc('log_help_click', { p_service: service.id, p_step: step }).then(() => {})
    window.open(whatsappLink(wa, message), '_blank')
  }

  return (
    <>
      <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-2xl">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface/95 p-2.5 shadow-pop backdrop-blur sm:flex-nowrap">
          <div className="flex min-w-0 flex-1 items-center gap-2.5 ps-1.5">
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
              <HelpCircle className="size-5" />
              <span className={cn('absolute -end-0.5 -top-0.5 size-3 rounded-full ring-2 ring-surface', open ? 'bg-success' : 'bg-subtle')} />
            </span>
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-semibold">{t('لم تفهم شيئاً؟ نساعدك على الطلب', 'Besoin d’aide ? On vous guide')}</div>
              <div className="truncate text-xs text-muted">
                {open ? t('🟢 متصلون الآن — نرد في دقائق', '🟢 En ligne — réponse en quelques minutes') : t('خارج أوقات العمل — اترك رقمك ونتصل بك', 'Hors horaires — laissez votre numéro')}
              </div>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button size="sm" variant="success" className="flex-1 sm:flex-none" onClick={openWa} disabled={!wa}>
              <MessageCircle />
              {t('واتساب', 'WhatsApp')}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setCallback(true)}>
              <PhoneCall />
              {t('اتصلوا بي', 'Rappelez-moi')}
            </Button>
            <button onClick={() => setHidden(true)} className="px-1 text-subtle hover:text-text" aria-label="close">
              <X className="size-4" />
            </button>
          </div>
        </div>
      </motion.div>
      <CallbackDialog open={callback} onClose={() => setCallback(false)} service={service} step={step} serviceName={pick(service, 'name')} />
    </>
  )
}

function CallbackDialog({ open, onClose, service, step, serviceName }: { open: boolean; onClose: () => void; service: Service; step: HelpStep; serviceName: string }) {
  const { t, lang } = useLang()
  const [f, setF] = useState({ name: '', phone: '', question: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb.rpc('submit_help_request', { p: { ...f, service_id: service.id, step } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setDone(true)
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && (onClose(), setTimeout(() => setDone(false), 300))} size="sm" title={done ? '' : t('نتصل بك ونساعدك', 'On vous rappelle')} description={done ? undefined : serviceName}>
      {done ? (
        <div className="space-y-3 py-4 text-center">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <div className="text-lg font-bold">{t('وصلنا طلبك ✅', 'Demande reçue ✅')}</div>
          <p className="text-sm text-muted">{t('سيتصل بك أحد موظفينا في أقرب وقت لمساعدتك على إكمال الطلب.', 'Un conseiller vous rappelle très vite.')}</p>
          <Button className="w-full" onClick={onClose}>
            {t('حسناً', 'OK')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('رقم الهاتف', 'Téléphone')} required>
            <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required dir="ltr" inputMode="tel" placeholder="06 XX XX XX XX" autoFocus />
          </Field>
          <Field label={t('الاسم', 'Nom')}>
            <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label={t('ما الذي لم تفهمه؟ (اختياري)', 'Votre question (optionnel)')}>
            <Textarea value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} rows={3} />
          </Field>
          <input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <Button type="submit" className="w-full" loading={busy}>
            <PhoneCall />
            {t('اتصلوا بي', 'Rappelez-moi')}
          </Button>
        </form>
      )}
    </Dialog>
  )
}

/** Per-service frequently asked questions (written once by the owner). */
export function ServiceFaq({ faq }: { faq: { q_ar: string; q_fr: string; a_ar: string; a_fr: string }[] }) {
  const { t, pick } = useLang()
  const [open, setOpen] = useState<number | null>(null)
  const items = (faq ?? []).filter((x) => x.q_ar || x.q_fr)
  if (!items.length) return null
  return (
    <Card className="p-5">
      <div className="mb-3 font-bold">{t('أسئلة شائعة', 'Questions fréquentes')}</div>
      <div className="divide-y divide-border">
        {items.map((x, i) => (
          <div key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center gap-2 py-2.5 text-start text-sm font-medium">
              <span className="flex-1">{pick(x, 'q') || x.q_ar}</span>
              <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', open === i && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <p className="pb-3 text-sm whitespace-pre-line text-muted">{pick(x, 'a') || x.a_ar}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </Card>
  )
}
