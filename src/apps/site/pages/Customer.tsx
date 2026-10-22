import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { format } from 'date-fns'
import { BellRing, CheckCircle2, ChevronLeft, Download, FolderOpen, LogOut, MessageCircle, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { ORDER_STATUSES, trackPhone } from '@/shared/lib/online'
import { cn, storage } from '@/shared/lib/utils'
import { Badge, Button, Card, Checkbox, Field, Input, Spinner } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { sb } from '../data'
import { useSeo } from '../Layout'

// ---------------------------------------------------------------------
// 3 · My documents
// ---------------------------------------------------------------------
type Mine = {
  name: string | null
  requests: { number: string; tracking_code: string; service_name_ar: string; service_name_fr: string; created_at: string; price: number; payment_status: string; status: { key: string; name_ar: string; name_fr: string; color: string; is_final: boolean }; ready_files: number }[]
  orders: { number: string; tracking_code: string; total: number; status: string; payment_status: string; created_at: string }[]
}
const remember = storage<{ code: string; phone: string } | null>('sh-my-docs', null)

export function MyDocumentsPage() {
  const { t, pick, lang } = useLang()
  useSeo(t('وثائقي وطلباتي', 'Mes documents'))
  const saved = remember.get()
  const [code, setCode] = useState(saved?.code ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [keep, setKeep] = useState(true)
  const [data, setData] = useState<Mine | null>(null)
  const [busy, setBusy] = useState(false)

  const load = async (c = code, p = phone, silent = false) => {
    if (!c.trim() || !p.trim()) return
    setBusy(true)
    const { data: res, error } = await sb.rpc('my_documents', { p_code: c.trim(), p_phone: p.trim() })
    setBusy(false)
    if (error) {
      if (!silent) toast.error(error.message.includes('not_found') ? t('لم نجد طلباً بهذا الرقم وهذا الهاتف', 'Aucune demande avec ce code et ce numéro') : errorMessage(error, lang))
      remember.set(null)
      return
    }
    if (keep) remember.set({ code: c.trim(), phone: p.trim() })
    setData(res as Mine)
  }
  useEffect(() => {
    if (saved) load(saved.code, saved.phone, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const logout = () => (remember.set(null), setData(null), setCode(''), setPhone(''))
  const link = (tc: string) => (trackPhone.set(tc, phone), `/track/${tc}`)

  if (!data)
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30">
            <FolderOpen className="size-8" />
          </div>
          <h1 className="text-3xl font-extrabold">{t('وثائقي وطلباتي', 'Mes documents')}</h1>
          <p className="mt-2 text-muted">{t('كل طلباتك السابقة ووثائقك الجاهزة في مكان واحد. أدخل رقم هاتفك ورقم تتبّع أي طلب سابق.', 'Toutes vos demandes et documents prêts. Saisissez votre téléphone et le code d’une demande.')}</p>
        </div>
        <Card className="space-y-4 p-6">
          <form onSubmit={(e) => (e.preventDefault(), load())} className="space-y-4">
            <Field label={t('رقم الهاتف', 'Téléphone')}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="06 XX XX XX XX" required />
            </Field>
            <Field label={t('رقم تتبّع أي طلب', 'Code de suivi d’une demande')} hint={t('تجده في رسالة واتساب أو في الوصل', 'Dans le message WhatsApp ou le reçu')}>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} dir="ltr" className="num tracking-widest uppercase" placeholder="ABCD2345" required />
            </Field>
            <label className="flex items-center gap-2 text-sm text-muted">
              <Checkbox checked={keep} onCheckedChange={setKeep} />
              {t('تذكرني على هذا الجهاز', 'Se souvenir de moi sur cet appareil')}
            </label>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {t('عرض وثائقي', 'Voir mes documents')}
            </Button>
          </form>
        </Card>
      </div>
    )

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-brand text-white">
          <FolderOpen className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold">{data.name ? t(`مرحباً ${data.name} 👋`, `Bonjour ${data.name} 👋`) : t('وثائقي', 'Mes documents')}</h1>
          <p className="text-sm text-muted">{t(`${data.requests.length} طلب خدمة · ${data.orders.length} طلب من المتجر`, `${data.requests.length} demandes · ${data.orders.length} commandes`)}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>
          <LogOut />
          {t('خروج', 'Quitter')}
        </Button>
      </div>

      {data.requests.length > 0 && (
        <section className="mb-8 space-y-3">
          <h2 className="font-bold">{t('طلبات الخدمات', 'Démarches')}</h2>
          {data.requests.map((r, i) => (
            <motion.div key={r.tracking_code} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Link to={link(r.tracking_code)}>
                <Card className="flex items-center gap-4 p-4 transition-all hover:border-brand/40 hover:shadow-pop">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{pick(r, 'service_name')}</div>
                    <div className="num text-xs text-muted">
                      {r.number} · {format(new Date(r.created_at), 'dd/MM/yyyy')}
                    </div>
                  </div>
                  {r.ready_files > 0 ? (
                    <Badge tone="success">
                      <Download />
                      {t('جاهزة للتحميل', 'Prête à télécharger')}
                    </Badge>
                  ) : (
                    <Badge style={{ background: `${r.status.color}1a`, color: r.status.color }}>{pick(r.status, 'name')}</Badge>
                  )}
                  <ChevronLeft className="size-4 text-subtle ltr:rotate-180" />
                </Card>
              </Link>
            </motion.div>
          ))}
        </section>
      )}

      {data.orders.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-bold">{t('طلبات المتجر', 'Commandes')}</h2>
          {data.orders.map((o) => {
            const st = ORDER_STATUSES[o.status]
            return (
              <Link key={o.tracking_code} to={link(o.tracking_code)}>
                <Card className="flex items-center gap-4 p-4 transition-all hover:border-brand/40 hover:shadow-pop">
                  <ShoppingBag className="size-5 text-brand" />
                  <div className="min-w-0 flex-1">
                    <div className="num font-semibold">{o.number}</div>
                    <div className="num text-xs text-muted">{format(new Date(o.created_at), 'dd/MM/yyyy')} · {money(o.total)}</div>
                  </div>
                  {st && <Badge style={{ background: `${st.color}1a`, color: st.color }}>{t(st.ar, st.fr)}</Badge>}
                  <ChevronLeft className="size-4 text-subtle ltr:rotate-180" />
                </Card>
              </Link>
            )
          })}
        </section>
      )}
      {!data.requests.length && !data.orders.length && <EmptyState title={t('لا توجد طلبات', 'Aucune demande')} />}

      <Link to="/alerts" className="mt-8 flex items-center gap-3 rounded-2xl border border-dashed border-brand/40 bg-brand-50/50 p-4 text-sm">
        <BellRing className="size-5 text-brand" />
        <span className="flex-1">{t('تريد أن نخبرك بالمباريات والتسجيلات الجديدة على واتساب؟', 'Être prévenu des concours et inscriptions sur WhatsApp ?')}</span>
        <ChevronLeft className="size-4 ltr:rotate-180" />
      </Link>
    </div>
  )
}

// ---------------------------------------------------------------------
// 8 · Alerts sign-up / unsubscribe
// ---------------------------------------------------------------------
type Topic = { id: string; name_ar: string; name_fr: string; icon: string | null; color: string }

export function AlertsPage() {
  const { t, pick, lang } = useLang()
  useSeo(t('تنبيهات واتساب', 'Alertes WhatsApp'))
  const topics = useQuery({ queryKey: ['bc-topics-public'], queryFn: async () => (await sb.from('broadcast_topics').select('id, name_ar, name_fr, icon, color').order('sort')).data as Topic[] })
  const [form, setForm] = useState({ name: '', phone: '', website: '' })
  const [chosen, setChosen] = useState<string[]>([])
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chosen.length) return toast.error(t('اختر موضوعاً واحداً على الأقل', 'Choisissez au moins un sujet'))
    setBusy(true)
    const { error } = await sb.rpc('broadcast_subscribe', { p: { ...form, topics: chosen, consent } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setDone(true)
  }

  if (done)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="size-12 text-success" />
        </motion.div>
        <h1 className="mt-5 text-2xl font-extrabold">{t('تم اشتراكك ✅', 'Inscription confirmée ✅')}</h1>
        <p className="mt-2 text-muted">{t('سنراسلك على واتساب فقط في المواضيع التي اخترتها. في كل رسالة رابط لإيقافها متى شئت.', 'Uniquement sur vos sujets. Chaque message contient un lien de désinscription.')}</p>
        <Button asChild className="mt-6">
          <Link to="/services">{t('تصفح الخدمات', 'Voir les services')}</Link>
        </Button>
      </div>
    )

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-[#16A34A] text-white shadow-lg">
          <MessageCircle className="size-8" />
        </div>
        <h1 className="text-3xl font-extrabold">{t('كن أول من يعلم', 'Soyez informé en premier')}</h1>
        <p className="mt-2 text-muted">{t('نرسل لك على واتساب عند فتح مباراة أو تسجيل أو منحة، وعروض المكتبة. اختر ما يهمك فقط.', 'Concours, inscriptions, bourses et promos, sur WhatsApp. Choisissez vos sujets.')}</p>
      </div>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-2 sm:grid-cols-2">
            {(topics.data ?? []).map((tp) => {
              const on = chosen.includes(tp.id)
              return (
                <button key={tp.id} type="button" onClick={() => setChosen(on ? chosen.filter((x) => x !== tp.id) : [...chosen, tp.id])} className={cn('flex items-center gap-3 rounded-xl border-2 p-3 text-start text-sm font-medium transition-colors', on ? 'border-transparent text-white' : 'border-border hover:bg-surface-2')} style={on ? { background: tp.color } : undefined}>
                  <DynamicIcon name={tp.icon} className="size-5" />
                  {pick(tp, 'name')}
                </button>
              )
            })}
            {topics.isLoading && <Spinner />}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('الاسم', 'Prénom')}>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="given-name" />
            </Field>
            <Field label={t('رقم واتساب', 'N° WhatsApp')} required>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" inputMode="tel" placeholder="06… / +34…" autoComplete="tel" />
            </Field>
          </div>
          <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
            <Checkbox checked={consent} onCheckedChange={setConsent} />
            <span>
              {t('أوافق على أن تراسلني مكتبة سويت هاوس على واتساب في المواضيع المختارة، ويمكنني إيقاف ذلك في أي وقت. ', 'J’accepte de recevoir ces messages WhatsApp et peux me désinscrire à tout moment. ')}
              <Link to="/privacy" target="_blank" className="text-brand underline">
                {t('سياسة الخصوصية', 'Confidentialité')}
              </Link>
            </span>
          </label>
          <Button type="submit" size="lg" variant="success" className="w-full" loading={busy} disabled={!consent}>
            <BellRing />
            {t('اشترك', 'M’inscrire')}
          </Button>
        </form>
      </Card>
    </div>
  )
}

export function UnsubscribePage() {
  const { t } = useLang()
  const [params] = useSearchParams()
  const code = params.get('c') ?? ''
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading')
  useSeo(t('إيقاف الرسائل', 'Désinscription'))
  useEffect(() => {
    if (!code) return setState('bad')
    sb.rpc('broadcast_unsubscribe', { p_code: code }).then(({ data, error }) => setState(!error && data ? 'ok' : 'bad'))
  }, [code])
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      {state === 'loading' ? (
        <Spinner />
      ) : state === 'ok' ? (
        <>
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <h1 className="mt-4 text-2xl font-extrabold">{t('تم إيقاف الرسائل', 'Vous êtes désinscrit')}</h1>
          <p className="mt-2 text-muted">{t('لن تصلك رسائل جماعية منا بعد الآن. يمكنك الاشتراك من جديد متى شئت.', 'Vous ne recevrez plus nos messages groupés.')}</p>
          <Button asChild variant="outline" className="mt-6">
            <Link to="/alerts">{t('الاشتراك من جديد', 'Se réinscrire')}</Link>
          </Button>
        </>
      ) : (
        <EmptyState title={t('الرابط غير صالح', 'Lien invalide')} />
      )}
    </div>
  )
}
