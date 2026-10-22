import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { CheckCircle2, ChevronLeft, Clock, ExternalLink, FileCheck2, FileText, Globe2, Lock, Mail, MessageCircle, Package, Paperclip, Search, ShieldCheck, Store, Building2, Upload, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { ServiceField } from '@/shared/lib/types'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, Checkbox, Field, Input, Skeleton, Spinner, Textarea } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { attributeOnline, sb, trackUrl, useAdminServices, useSite } from '../data'
import { ServiceCard } from '../components'
import { useSeo } from '../Layout'
import { ACCEPT, MAX_FILE, uploadPublicFile } from '../upload'
import { Row } from './Checkout'
import { HelpBar, ServiceFaq, type HelpStep } from '../help'
import { storage } from '@/shared/lib/utils'

export function ServicesPage() {
  const { t, pick } = useLang()
  const data = useAdminServices()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  useSeo(t('الخدمات الإدارية', 'Services administratifs'))

  const groups = useMemo(() => {
    const s = q.trim().toLowerCase()
    const list = (data.data?.services ?? []).filter((x) => x.system_key !== 'custom_request' && x.system_key !== 'school_list').filter((x) => !s || x.name_ar.includes(s) || x.name_fr.toLowerCase().includes(s) || (x.description_ar ?? '').includes(s))
    return (data.data?.categories ?? []).filter((c) => !cat || c.id === cat).map((c) => ({ c, items: list.filter((x) => x.category_id === c.id) })).filter((g) => g.items.length)
  }, [data.data, q, cat])

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="bg-grid absolute inset-0 opacity-25" />
        <div className="absolute -end-32 -top-32 size-96 rounded-full bg-brand/30 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-16">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t('الخدمات الإدارية والإلكترونية', 'Services administratifs et en ligne')}</h1>
          <p className="mt-3 max-w-2xl text-white/70">{t('اختر الخدمة، املأ المعلومات وارفع وثائقك. نتكفّل بالباقي ونرسل لك رسالة عند الجاهزية.', 'Choisissez, remplissez, envoyez vos documents. Nous faisons le reste.')}</p>
          <div className="mt-8 max-w-xl">
            <div className="relative">
              <Search className="absolute inset-y-0 start-4 my-auto size-5 text-white/50" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث: سجل عدلي، شهادة ملكية، موعد جواز…', 'Rechercher : casier, certificat, passeport…')} className="h-14 w-full rounded-2xl border border-white/15 bg-white/10 ps-12 pe-4 text-white placeholder:text-white/40 backdrop-blur focus:border-brand focus:outline-none" />
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <CustomRequestBanner />
          <AbroadBanner />
        </div>
        <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setCat(null)} className={cn('shrink-0 rounded-full border px-4 py-2 text-sm font-medium', !cat ? 'border-transparent bg-navy text-white' : 'border-border bg-surface text-muted')}>
            {t('الكل', 'Tout')}
          </button>
          {data.data?.categories.map((c) => (
            <button key={c.id} onClick={() => setCat(c.id)} className={cn('flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium', cat === c.id ? 'border-transparent text-white' : 'border-border bg-surface text-muted')} style={cat === c.id ? { background: c.color } : undefined}>
              <DynamicIcon name={c.icon} className="size-4" />
              {pick(c, 'name')}
            </button>
          ))}
        </div>
        {data.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        ) : !groups.length ? (
          <div className="mx-auto max-w-2xl space-y-4">
            <EmptyState icon={<FileText />} title={t('لم نجد هذه الخدمة في القائمة', 'Service introuvable')} />
            <CustomRequestBanner />
          </div>
        ) : (
          <div className="space-y-12">
            {groups.map((g) => (
              <section key={g.c.id}>
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl text-white" style={{ background: g.c.color }}>
                    <DynamicIcon name={g.c.icon} className="size-5" />
                  </div>
                  <h2 className="text-xl font-bold">{pick(g.c, 'name')}</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {g.items.map((s, i) => (
                    <ServiceCard key={s.id} s={s} color={g.c.color} index={i} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

export function AbroadBanner() {
  const { t } = useLang()
  const site = useSite()
  if (site.data?.abroad?.enabled === false) return null
  return (
    <Link to="/abroad" className="group flex items-center gap-4 rounded-2xl border border-border bg-surface p-6 transition-all hover:border-info/50 hover:shadow-pop">
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-info/10 text-info transition-transform group-hover:scale-110">
        <Globe2 className="size-6" />
      </div>
      <div>
        <div className="font-bold">{t('أنت خارج المغرب؟', 'Vous êtes à l’étranger ?')}</div>
        <div className="text-sm text-muted">{t('اطلب وثائقك عن بُعد واستلمها بالإيميل أو بالبريد', 'Vos documents à distance, par e-mail ou poste')}</div>
      </div>
    </Link>
  )
}

export function CustomRequestBanner({ compact }: { compact?: boolean }) {
  const { t } = useLang()
  const data = useAdminServices()
  const custom = data.data?.services.find((x) => x.system_key === 'custom_request')
  if (!custom) return null
  return (
    <Link to={`/services/${custom.id}`} className={cn('group flex items-center gap-4 overflow-hidden rounded-2xl border-2 border-dashed border-brand/40 bg-brand-50/60 transition-all hover:border-brand hover:bg-brand-50', compact ? 'p-4' : 'p-6')}>
      <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-lg shadow-brand/30 transition-transform group-hover:scale-110">
        <MessageCircle className="size-6" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{t('لم تجد الوثيقة أو الخدمة التي تبحث عنها؟', 'Vous ne trouvez pas votre document ?')}</div>
        <div className="text-sm text-muted">{t('اشرح لنا طلبك بكلماتك وارفع ما لديك من وثائق، وسنتواصل معك بالسعر والمدة.', 'Décrivez votre besoin, nous vous recontactons avec le prix et le délai.')}</div>
      </div>
      <span className="hidden shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white sm:block">{t('اشرح طلبك', 'Décrire ma demande')}</span>
    </Link>
  )
}

type Done = { number: string; tracking_code: string; phone: string; failed: string[] }

export function ServiceRequestPage({ serviceId }: { serviceId?: string } = {}) {
  const routeParams = useParams()
  const id = serviceId ?? routeParams.id
  const { t, pick, lang } = useLang()
  const data = useAdminServices()
  const site = useSite()
  const s = data.data?.services.find((x) => x.id === id)
  const cat = data.data?.categories.find((c) => c.id === s?.category_id)
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' })
  const [fields, setFields] = useState<Record<string, string>>({})
  const [files, setFiles] = useState<File[]>([])
  const [pay, setPay] = useState<'in_store' | 'bank_transfer'>('in_store')
  const [params] = useSearchParams()
  const [abroad, setAbroad] = useState(params.get('abroad') === '1')
  const [far, setFar] = useState({ country: '', delivery: 'email' as 'email' | 'post' | 'person', address: '' })
  const [step, setStep] = useState<HelpStep>('start')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Done | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // Auto-saved draft: someone who leaves to ask a question finds everything back.
  const draft = useMemo(() => storage<{ form: typeof form; fields: Record<string, string>; pay: typeof pay; abroad: boolean; far: typeof far; at: string } | null>(`sh-draft-${id}`, null), [id])
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const d = draft.get()
    if (d && (d.form.name || d.form.phone || Object.keys(d.fields).length)) {
      setForm({ ...d.form, website: '' })
      setFields(d.fields)
      setPay(d.pay)
      setAbroad(d.abroad)
      setFar(d.far)
      setRestored(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])
  useEffect(() => {
    if (!done && (form.name || form.phone || Object.keys(fields).length)) draft.set({ form: { ...form, website: '' }, fields, pay, abroad, far, at: new Date().toISOString() })
  }, [form, fields, pay, abroad, far, done, draft])
  useSeo(s ? pick(s, 'name') : undefined)

  if (data.isLoading) return <div className="mx-auto max-w-4xl px-4 py-10"><Skeleton className="h-96" /></div>
  if (!s) return <EmptyState className="py-32" title={t('الخدمة غير موجودة', 'Service introuvable')} action={<Button asChild><Link to="/services">{t('كل الخدمات', 'Tous les services')}</Link></Button>} />

  const pm = site.data?.payments
  const addFiles = (list: FileList | null) => {
    const ok = Array.from(list ?? []).filter((f) => {
      if (f.size > MAX_FILE) {
        toast.error(t(`${f.name}: الحجم الأقصى 10 ميغا`, `${f.name} : 10 Mo maximum`))
        return false
      }
      return true
    })
    setFiles((x) => [...x, ...ok].slice(0, 10))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const missing = s.fields.filter((f) => f.required && !fields[f.key]?.trim())
    if (missing.length) return toast.error(t(`المرجو ملء: ${missing.map((m) => m.label_ar).join('، ')}`, `Champs requis : ${missing.map((m) => m.label_fr).join(', ')}`))
    if (!consent) return toast.error(t('المرجو الموافقة على سياسة الخصوصية', 'Veuillez accepter la politique de confidentialité'))
    const isAbroad = abroad && s.abroad
    if (isAbroad && far.country.trim().length < 2) return toast.error(t('المرجو كتابة بلد الإقامة', 'Indiquez votre pays'))
    if (isAbroad && far.delivery === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return toast.error(t('المرجو كتابة بريد إلكتروني صحيح لاستلام الوثيقة', 'E-mail valide requis pour l’envoi'))
    if (isAbroad && far.delivery === 'post' && far.address.trim().length < 8) return toast.error(t('المرجو كتابة عنوان الإرسال كاملاً', 'Adresse complète requise'))
    // Foreign numbers keep their country code (+33…, +34…)
    const phone = isAbroad && !/^\s*(\+|00)/.test(form.phone) ? `+${form.phone.trim()}` : form.phone
    setBusy(t('جارٍ إرسال الطلب…', 'Envoi…'))
    const labeled = Object.fromEntries(s.fields.map((f) => [f.label_ar, fields[f.key] ?? '']).filter(([, v]) => v))
    const { data: res, error } = await sb.rpc('submit_service_request', {
      p: { service_id: s.id, ...form, phone, fields: labeled, payment_method: isAbroad ? 'bank_transfer' : pay, consent, abroad: isAbroad, country: far.country, delivery_method: far.delivery, delivery_address: far.address },
    })
    if (error) {
      setBusy(null)
      return toast.error(errorMessage(error, lang))
    }
    const r = res as { number: string; tracking_code: string }
    attributeOnline(r?.tracking_code)
    const failed: string[] = []
    for (let i = 0; i < files.length; i++) {
      setBusy(t(`رفع الوثيقة ${i + 1} من ${files.length}…`, `Envoi du document ${i + 1}/${files.length}…`))
      try {
        await uploadPublicFile(r.tracking_code, phone, files[i], 'upload')
      } catch {
        failed.push(files[i].name)
      }
    }
    setBusy(null)
    draft.clear()
    setDone({ ...r, phone, failed })
    window.scrollTo({ top: 0 })
  }

  if (done) return <RequestDone done={done} serviceName={pick(s, 'name')} />

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted">
        <Link to="/services" className="hover:text-brand">
          {t('الخدمات', 'Services')}
        </Link>
        <ChevronLeft className="size-4 ltr:rotate-180" />
        <span className="text-text">{pick(s, 'name')}</span>
      </nav>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <form onSubmit={submit} className="space-y-6">
          <div className="flex items-start gap-4">
            <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg" style={{ background: cat?.color ?? '#FF6B35' }}>
              <DynamicIcon name={s.icon ?? cat?.icon} className="size-7" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold">{pick(s, 'name')}</h1>
              {pick(s, 'description') && <p className="mt-2 text-muted">{pick(s, 'description')}</p>}
            </div>
          </div>

          {s.abroad && site.data?.abroad?.enabled !== false && (
            <button type="button" onClick={() => setAbroad((a) => !a)} className={cn('flex w-full items-center gap-3 rounded-2xl border-2 p-4 text-start transition-colors', abroad ? 'border-info bg-info/5' : 'border-border bg-surface hover:border-info/40')}>
              <Globe2 className={cn('size-6 shrink-0', abroad ? 'text-info' : 'text-subtle')} />
              <span className="flex-1">
                <span className="block font-semibold">{t('أنا مقيم خارج المغرب', 'Je vis à l’étranger')}</span>
                <span className="block text-sm text-muted">{t('رقم هاتف أجنبي، أداء بالتحويل، واستلام بالإيميل أو بالبريد', 'Numéro étranger, virement, envoi par e-mail ou poste')}</span>
              </span>
              <Checkbox checked={abroad} onCheckedChange={setAbroad} />
            </button>
          )}

          {restored && (
            <div className="flex items-center gap-3 rounded-xl bg-info/5 p-3 text-sm">
              <span className="flex-1">{t('استعدنا ما كتبتَه سابقاً في هذه الصفحة ✍️ (الملفات تُرفع من جديد)', 'Nous avons restauré votre saisie ✍️ (fichiers à rejoindre)')}</span>
              <button type="button" className="text-xs text-muted underline" onClick={() => (draft.clear(), setForm({ name: '', phone: '', email: '', notes: '', website: '' }), setFields({}), setRestored(false))}>
                {t('مسح', 'Effacer')}
              </button>
            </div>
          )}

          <Card className="space-y-4 p-6" onFocusCapture={() => setStep('contact')}>
            <h2 className="font-bold">{t('معلومات التواصل', 'Vos coordonnées')}</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('الاسم الكامل', 'Nom complet')} required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoComplete="name" />
              </Field>
              <Field label={t('رقم الهاتف (واتساب)', 'Téléphone (WhatsApp)')} required hint={t('سنرسل لك إشعار الجاهزية على هذا الرقم', 'Pour la notification')}>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required dir="ltr" inputMode="tel" placeholder={abroad ? '+33 6 12 34 56 78' : '06 XX XX XX XX'} autoComplete="tel" />
              </Field>
              {abroad && (
                <Field label={t('بلد الإقامة', 'Pays de résidence')} required className="sm:col-span-2">
                  <Input value={far.country} onChange={(e) => setFar({ ...far, country: e.target.value })} placeholder={t('إسبانيا، فرنسا، بلجيكا…', 'Espagne, France, Belgique…')} />
                </Field>
              )}
              <Field label={abroad && far.delivery === 'email' ? t('البريد الإلكتروني (لاستلام الوثيقة)', 'E-mail (pour recevoir le document)') : t('البريد الإلكتروني (اختياري)', 'E-mail (optionnel)')} required={abroad && far.delivery === 'email'} className="sm:col-span-2">
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" dir="ltr" />
              </Field>
            </div>
            <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
          </Card>

          {s.fields.length > 0 && (
            <Card className="space-y-4 p-6" onFocusCapture={() => setStep('info')}>
              <h2 className="font-bold">{t('معلومات الطلب', 'Informations de la demande')}</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {s.fields.map((f) => (
                  <DynamicField key={f.key} f={f} value={fields[f.key] ?? ''} onChange={(v) => setFields({ ...fields, [f.key]: v })} />
                ))}
              </div>
            </Card>
          )}

          <Card className="space-y-4 p-6" onClickCapture={() => setStep('documents')} onFocusCapture={() => setStep('documents')}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold">{t('الوثائق', 'Documents')}</h2>
              <span className="flex items-center gap-1 text-xs text-success">
                <Lock className="size-3.5" />
                {t('رفع آمن ومشفّر', 'Envoi sécurisé')}
              </span>
            </div>
            {s.required_documents.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {s.required_documents.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <FileCheck2 className={cn('size-4', d.required ? 'text-brand' : 'text-subtle')} />
                    {pick(d, 'name')}
                    {!d.required && <span className="text-xs text-muted">({t('اختياري', 'optionnel')})</span>}
                  </li>
                ))}
              </ul>
            )}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => (e.preventDefault(), addFiles(e.dataTransfer.files))}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-surface-2/40 p-8 text-center transition-colors hover:border-brand hover:bg-brand-50/50"
            >
              <Upload className="size-8 text-brand" />
              <div className="font-medium">{t('اضغط أو اسحب الملفات هنا', 'Cliquez ou déposez vos fichiers')}</div>
              <div className="text-xs text-muted">{t('صور أو PDF · 10 ميغا كحد أقصى للملف', 'Images ou PDF · 10 Mo max')}</div>
              <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ''))} />
            </div>
            {files.length > 0 && (
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border border-border p-2.5 text-sm">
                    <Paperclip className="size-4 text-muted" />
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="num text-xs text-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="text-subtle hover:text-danger">
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6" onClickCapture={() => setStep('payment')} onFocusCapture={() => setStep('payment')}>
            {abroad && (
              <>
                <h2 className="font-bold">{t('كيف تريد استلام الوثيقة؟', 'Comment recevoir le document ?')}</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  <PayOpt active={far.delivery === 'email'} onClick={() => setFar({ ...far, delivery: 'email' })} icon={<Mail />} title={t('بالإيميل', 'Par e-mail')} text={t('نسخة PDF', 'Copie PDF')} />
                  <PayOpt active={far.delivery === 'post'} onClick={() => setFar({ ...far, delivery: 'post' })} icon={<Package />} title={t('بالبريد', 'Par la poste')} text={t('الأصل إلى عنوانك', 'Original chez vous')} />
                  <PayOpt active={far.delivery === 'person'} onClick={() => setFar({ ...far, delivery: 'person' })} icon={<UserRound />} title={t('يستلمها قريب', 'Un proche')} text={t('من المحل بتطوان', 'Au magasin à Tétouan')} />
                </div>
                {far.delivery === 'post' && (
                  <>
                    <Field label={t('عنوان الإرسال الكامل', 'Adresse d’envoi complète')} required>
                      <Textarea value={far.address} onChange={(e) => setFar({ ...far, address: e.target.value })} placeholder={t('الاسم، الشارع، الرقم، المدينة، الرمز البريدي، البلد', 'Nom, rue, n°, ville, code postal, pays')} />
                    </Field>
                    {site.data?.abroad && pick(site.data.abroad, 'post_note') && <p className="rounded-xl bg-info/5 p-3 text-sm text-muted">{pick(site.data.abroad, 'post_note')}</p>}
                  </>
                )}
              </>
            )}
            <h2 className="font-bold">{t('الأداء', 'Paiement')}</h2>
            {abroad ? (
              <div className="flex items-start gap-3 rounded-2xl border-2 border-brand bg-brand-50 p-4 text-sm">
                <Building2 className="size-5 shrink-0 text-brand" />
                <span>
                  <span className="block font-semibold">{t('تحويل بنكي', 'Virement bancaire')}</span>
                  <span className="block text-muted">{(site.data?.abroad && pick(site.data.abroad, 'payment_note')) || t('ستجد معلومات الحساب في صفحة تتبّع الطلب بعد الإرسال.', 'Les coordonnées bancaires sont sur la page de suivi.')}</span>
                </span>
              </div>
            ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {pm?.in_store !== false && <PayOpt active={pay === 'in_store'} onClick={() => setPay('in_store')} icon={<Store />} title={t('في المحل', 'En boutique')} text={t('عند استلام الوثيقة', 'Au retrait')} />}
              {pm?.bank_transfer !== false && <PayOpt active={pay === 'bank_transfer'} onClick={() => setPay('bank_transfer')} icon={<Building2 />} title={t('تحويل بنكي', 'Virement')} text={t('للتحميل أونلاين بعد الأداء', 'Pour télécharger en ligne')} />}
            </div>
            )}
            {s.system_key !== 'custom_request' && <Field label={t('تفاصيل إضافية أو شرح لطلبك (اختياري)', 'Précisions sur votre demande (optionnel)')} hint={t('اكتب أي معلومة تساعدنا على إنجاز طلبك بسرعة', 'Toute information utile pour traiter votre demande')}>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('مثلاً: أحتاج نسختين، أو الوثيقة باسم شخص آخر…', 'ex : deux exemplaires, au nom d’un tiers…')} />
            </Field>}
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted">
              <Checkbox checked={consent} onCheckedChange={setConsent} />
              <span>
                {t('أوافق على معالجة معطياتي ووثائقي لإنجاز هذا الطلب وفق ', "J'accepte le traitement de mes données selon la ")}
                <Link to="/privacy" target="_blank" className="text-brand underline">
                  {t('سياسة الخصوصية', 'politique de confidentialité')}
                </Link>
              </span>
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={!!busy || !consent}>
              {busy ? (
                <>
                  <Spinner className="size-4 text-white" />
                  {busy}
                </>
              ) : (
                t('إرسال الطلب', 'Envoyer la demande')
              )}
            </Button>
          </Card>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="text-muted">{t('السعر', 'Prix')}</span>
              <span className="num text-2xl font-extrabold text-brand">{s.price ? money(s.price) : t('حسب الطلب', 'Sur devis')}</span>
            </div>
            {s.duration_ar && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-muted">
                  <Clock className="size-4" />
                  {t('المدة', 'Délai')}
                </span>
                <span className="font-medium">{pick(s, 'duration')}</span>
              </div>
            )}
            {s.official_url && (
              <a href={s.official_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted hover:text-brand">
                <ExternalLink className="size-3.5" />
                {t('البوابة الرسمية', 'Portail officiel')}
              </a>
            )}
          </Card>
          <ServiceFaq faq={s.faq ?? []} />
          <Card className="space-y-3 p-5 text-sm">
            {[
              [ShieldCheck, t('وثائقك محمية ولا يطّلع عليها إلا فريقنا', 'Documents protégés')],
              [MessageCircle, t('إشعار على واتساب عند الجاهزية', 'Notification WhatsApp')],
              [FileCheck2, t('تحميل الوثيقة من الموقع أو الاستلام من المحل', 'Téléchargement ou retrait')],
            ].map(([Icon, text], i) => {
              const I = Icon as typeof ShieldCheck
              return (
                <div key={i} className="flex items-start gap-2.5">
                  <I className="mt-0.5 size-4 shrink-0 text-success" />
                  <span className="text-muted">{text as string}</span>
                </div>
              )
            })}
          </Card>
        </aside>
      </div>
      <div className="h-24" />
      <HelpBar service={s} step={step} />
    </div>
  )
}

function DynamicField({ f, value, onChange }: { f: ServiceField; value: string; onChange: (v: string) => void }) {
  const { pick, t } = useLang()
  const label = pick(f, 'label')
  const hint = (pick(f, 'hint') || f.hint_ar || '').trim()
  const [img, setImg] = useState(false)
  return (
    <Field
      label={label}
      required={f.required}
      className={f.type === 'textarea' ? 'sm:col-span-2' : undefined}
      hint={
        hint || f.hint_image ? (
          <span className="flex items-start gap-2">
            {hint && <span>{hint}</span>}
            {f.hint_image && (
              <button type="button" onClick={() => setImg((x) => !x)} className="shrink-0 text-brand underline">
                {img ? t('إخفاء المثال', 'Masquer') : t('أين أجده؟ 🔍', 'Où le trouver ? 🔍')}
              </button>
            )}
          </span>
        ) : undefined
      }
    >
      {f.type === 'textarea' ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} />
      ) : f.type === 'select' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
          <option value="">—</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} dir={f.type === 'text' ? undefined : 'ltr'} />
      )}
      {img && f.hint_image && <img src={f.hint_image} alt="" className="mt-2 max-h-56 rounded-xl border border-border object-contain" />}
    </Field>
  )
}

function PayOpt({ active, onClick, icon, title, text }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className={cn('flex items-center gap-3 rounded-2xl border-2 p-4 text-start [&_svg]:size-5', active ? 'border-brand bg-brand-50' : 'border-border')}>
      <span className={cn('flex size-10 items-center justify-center rounded-xl', active ? 'bg-brand text-white' : 'bg-surface-2 text-muted')}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  )
}

function RequestDone({ done, serviceName }: { done: Done; serviceName: string }) {
  const { t } = useLang()
  const site = useSite()
  const link = trackUrl(done.tracking_code)
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center">
      <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="mx-auto flex size-24 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="size-14 text-success" />
      </motion.div>
      <h1 className="mt-6 text-3xl font-extrabold">{t('تم إرسال طلبك بنجاح ✅', 'Demande envoyée ✅')}</h1>
      <p className="mt-2 text-muted">{serviceName}</p>
      <Card className="mt-8 space-y-3 p-6 text-start">
        <Row label={t('رقم الطلب', 'Demande')} value={done.number} />
        <Row label={t('رقم التتبّع', 'Code de suivi')} value={done.tracking_code} copy />
      </Card>
      <p className="mt-4 text-sm text-muted">{t('احتفظ برقم التتبّع. ستصلك رسالة على واتساب عندما تكون وثيقتك جاهزة.', 'Gardez ce code. Vous recevrez un message WhatsApp.')}</p>
      {done.failed.length > 0 && (
        <div className="mt-4 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          {t('لم يتم رفع بعض الملفات، يمكنك رفعها من صفحة التتبّع:', 'Certains fichiers n’ont pas été envoyés, réessayez depuis le suivi :')} {done.failed.join('، ')}
        </div>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to={`/track/${done.tracking_code}?p=${encodeURIComponent(done.phone)}`}>{t('تتبّع الطلب', 'Suivre ma demande')}</Link>
        </Button>
        <Button asChild size="lg" variant="success">
          <a href={whatsappLink(site.data?.store.whatsapp ?? '', `${t('مرحباً، أرسلت طلب', 'Bonjour, j’ai envoyé la demande')} ${done.number} (${serviceName})\n${link}`)} target="_blank" rel="noreferrer">
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
      </div>
      <Link to="/alerts" className="mt-8 flex items-center gap-3 rounded-2xl border border-dashed border-success/40 bg-success/5 p-4 text-start text-sm">
        <MessageCircle className="size-5 shrink-0 text-success" />
        <span>{t('هل تريد أن نخبرك بالمباريات والتسجيلات الجديدة على واتساب؟ اشترك هنا', 'Être prévenu des concours et inscriptions ? Inscrivez-vous')}</span>
      </Link>
      <Badge className="mt-8">{t('يمكنك إغلاق هذه الصفحة', 'Vous pouvez fermer cette page')}</Badge>
    </div>
  )
}
