import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle2, ChevronDown, Compass, HelpCircle, MessageCircle, PhoneCall, Send, X } from 'lucide-react'
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
  const [guide, setGuide] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [mini, setMini] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640)
  const help = (site.data as unknown as { help?: { enabled?: boolean } } | undefined)?.help
  if (help?.enabled === false || hidden) return null
  if (mini)
    return (
      <>
        <button onClick={() => setMini(false)} className="fixed start-4 bottom-4 z-30 flex items-center gap-2 rounded-full border border-border bg-surface/95 px-4 py-2.5 text-sm font-semibold shadow-pop backdrop-blur">
          <HelpCircle className="size-5 text-brand" />
          {t('محتاج مساعدة؟', 'Besoin d’aide ?')}
        </button>
        <GuideChat open={guide} onClose={() => setGuide(false)} service={service} onWhatsApp={() => {}} onCallback={() => (setGuide(false), setCallback(true))} />
        <CallbackDialog open={callback} onClose={() => setCallback(false)} service={service} step={step} serviceName={pick(service, 'name')} />
      </>
    )

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
                {open ? t('🟢 المحل مفتوح الآن — نجاوبك بسرعة', '🟢 Boutique ouverte — réponse rapide') : t('خارج أوقات العمل — اترك رقمك ونتصل بك', 'Hors horaires — laissez votre numéro')}
              </div>
            </div>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setGuide(true)}>
              <Compass />
              {t('اسأل المرشد', 'Demander')}
            </Button>
            <Button size="sm" variant="success" className="flex-1 sm:flex-none" onClick={openWa} disabled={!wa}>
              <MessageCircle />
              {t('واتساب', 'WhatsApp')}
            </Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setCallback(true)}>
              <PhoneCall />
              {t('اتصلوا بي', 'Rappelez-moi')}
            </Button>
            <button onClick={() => (window.innerWidth < 640 ? setMini(true) : setHidden(true))} className="px-1 text-subtle hover:text-text" aria-label="close">
              <X className="size-4" />
            </button>
          </div>
        </div>
      </motion.div>
      <GuideChat open={guide} onClose={() => setGuide(false)} service={service} onWhatsApp={openWa} onCallback={() => (setGuide(false), setCallback(true))} />
      <CallbackDialog open={callback} onClose={() => setCallback(false)} service={service} step={step} serviceName={pick(service, 'name')} />
    </>
  )
}

type Turn = { role: 'user' | 'assistant'; text: string; escalate?: boolean }

/** 🧭 The guide answers from the service's public info; when unsure it hands over to staff. */
function GuideChat({ open, onClose, service, onWhatsApp, onCallback }: { open: boolean; onClose: () => void; service: Service; onWhatsApp: () => void; onCallback: () => void }) {
  const { t, pick } = useLang()
  const [turns, setTurns] = useState<Turn[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, busy])
  const ask = async (text: string) => {
    text = text.trim()
    if (!text || busy) return
    setQ('')
    const history = turns.map(({ role, text }) => ({ role, text }))
    setTurns((x) => [...x, { role: 'user', text }])
    setBusy(true)
    const { data, error } = await sb.functions.invoke('helper', { body: { question: text, history, service_id: service.id } })
    setBusy(false)
    let errCode = ''
    if (error) {
      try {
        errCode = (await (error as { context?: Response }).context?.json())?.error ?? ''
      } catch {
        /* ignore */
      }
    }
    const answer = error
      ? errCode === 'too_many_requests' || errCode === 'helper_busy'
        ? t('المرشد مشغول الآن 🙏 تواصل معنا مباشرة وسنساعدك.', 'Le guide est occupé, contactez-nous directement.')
        : t('المرشد غير متاح حالياً 🙏 تواصل معنا مباشرة وسنساعدك.', 'Guide indisponible, contactez-nous.')
      : (data as { answer: string }).answer
    setTurns((x) => [...x, { role: 'assistant', text: answer, escalate: !!error || !!(data as { escalate?: boolean })?.escalate }])
  }
  const starters = [
    t('ما هي الوثائق المطلوبة؟', 'Quels documents faut-il ?'),
    t('كم الثمن والمدة؟', 'Quel prix et quel délai ?'),
    t('كيف أرفع الوثائق؟', 'Comment envoyer les documents ?'),
  ]
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title={`🧭 ${t('مرشد سويت هاوس', 'Guide Sweet House')}`} description={pick(service, 'name')}>
      <div className="flex h-[60vh] flex-col">
        <div className="flex-1 space-y-2 overflow-y-auto pb-2">
          <div className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">{t('مرحباً 👋 أنا المرشد. اسألني عن هذه الخدمة: الوثائق، الثمن، المدة، أو كيف تكمل الطلب.', 'Bonjour 👋 Posez-moi vos questions sur ce service.')}</div>
          {!turns.length && (
            <div className="flex flex-wrap gap-2">
              {starters.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-brand hover:bg-brand-50">
                  {s}
                </button>
              ))}
            </div>
          )}
          {turns.map((m, i) => (
            <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[88%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap', m.role === 'user' ? 'bg-brand text-white' : 'bg-surface-2')}>
                {m.text}
                {m.escalate && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" variant="success" onClick={onWhatsApp}>
                      <MessageCircle />
                      {t('واتساب', 'WhatsApp')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={onCallback}>
                      <PhoneCall />
                      {t('اتصلوا بي', 'Rappelez-moi')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-sm text-muted">{t('المرشد يكتب…', 'Le guide écrit…')}</div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => (e.preventDefault(), ask(q))} className="flex gap-2 border-t border-border pt-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('اكتب سؤالك…', 'Votre question…')} maxLength={600} />
          <Button type="submit" size="icon" disabled={!q.trim() || busy}>
            <Send />
          </Button>
        </form>
        <p className="mt-2 text-[11px] text-subtle">{t('لا تكتب هنا معطيات شخصية (رقم البطاقة…)؛ مكانها استمارة الطلب.', 'N’écrivez pas de données personnelles ici.')}</p>
      </div>
    </Dialog>
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
