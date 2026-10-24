import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertOctagon, BookOpen, Camera, CheckCircle2, ChevronDown, ClipboardCopy, Copy, ExternalLink, Hash, MessageSquareText, PlayCircle, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { siteTrackUrl, uploadStaffFile } from '@/shared/lib/online'
import type { GuideStep, ServiceField } from '@/shared/lib/types'
import { cn, fillTemplate } from '@/shared/lib/utils'
import { sendWhatsApp } from '@/shared/lib/whatsapp'
import { Badge, Button, Card, Field, Input, Spinner } from './primitives'
import { Dialog } from './overlay'
import { youtubeId } from './guide'
import { SuggestGuideDialog } from './guide-share'

export type WorkflowGuide = {
  tips_ar: string | null
  links: { label: string; url: string }[]
  images: string[]
  steps: GuideStep[]
  video_url: string | null
  templates: { label: string; text: string }[]
  require_ref: boolean
  require_proof: boolean
}
export type WorkflowRequest = {
  id: string
  number: string
  tracking_code: string
  service_id?: string | null
  service_name_ar: string
  customer_name: string
  phone: string
  email: string | null
  fields: Record<string, string>
  progress: Record<string, { at: string; name: string | null }>
  portal_ref: string | null
  portal_code: string | null
  blocked_reason: string | null
  blocked_note: string | null
  blocked_at: string | null
  service: { id?: string; fields?: ServiceField[] } | null
  files: { id: string; kind: string; name: string; created_at: string }[]
}

const BLOCK_REASONS: [string, string, string][] = [
  ['portal_down', 'البوابة الرسمية لا تعمل', 'Portail en panne'],
  ['missing_info', 'معلومة أو وثيقة ناقصة من الزبون', 'Information / document manquant'],
  ['rejected', 'رفض من الإدارة', 'Refus de l’administration'],
  ['payment', 'مشكل في الأداء', 'Problème de paiement'],
  ['dont_know', 'لا أعرف الطريقة', 'Je ne sais pas comment faire'],
  ['other', 'سبب آخر', 'Autre'],
]
const BLOCK_REPLY: Record<string, string> = {
  portal_down: 'مرحباً {name} 👋\nالبوابة الرسمية متوقفة حالياً، سنعيد المحاولة ونخبركم فور إنجاز طلبكم {number}.\n— مكتبة سويت هاوس',
  missing_info: 'مرحباً {name} 👋\nلإكمال طلبكم {number} نحتاج معلومة أو وثيقة إضافية. يمكنكم إرسالها من هنا: {link}\n— مكتبة سويت هاوس',
  rejected: 'مرحباً {name} 👋\nبخصوص طلبكم {number}: ظهر مشكل من طرف الإدارة، سنتصل بكم لشرح الحل.\n— مكتبة سويت هاوس',
  payment: 'مرحباً {name} 👋\nبخصوص طلبكم {number}: هناك مشكل في عملية الأداء، سنعيد المحاولة ونخبركم.\n— مكتبة سويت هاوس',
}

function useRefresh(id: string) {
  const qc = useQueryClient()
  return () => {
    for (const k of [['request', id], ['requests'], ['pos-requests']]) qc.invalidateQueries({ queryKey: k })
  }
}

/** 1 + 2 + 5 + 7 · Checklist with one button per link, video, tips, suggest an edit. */
export function WorkflowCard({ r, guide }: { r: WorkflowRequest; guide: WorkflowGuide }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const refresh = useRefresh(r.id)
  const [busy, setBusy] = useState<number | null>(null)
  const [open, setOpen] = useState(true)
  const [video, setVideo] = useState(false)
  const [suggest, setSuggest] = useState(false)
  const steps = guide.steps ?? []
  const done = steps.filter((_, i) => r.progress?.[String(i)]).length
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0
  const yt = guide.video_url ? youtubeId(guide.video_url) : undefined

  const tick = async (i: number, v: boolean) => {
    setBusy(i)
    const { error } = await sb.rpc('request_step', { p_id: r.id, p_index: i, p_done: v })
    setBusy(null)
    if (error) return toast.error(errorMessage(error, lang))
    refresh()
  }

  if (!steps.length && !guide.tips_ar && !guide.links?.length && !guide.images?.length && !guide.video_url) return null
  return (
    <Card className="overflow-hidden border-brand/30">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand">
        <BookOpen className="size-4" />
        {t('خطوات الإنجاز', 'Étapes de traitement')}
        {steps.length > 0 && (
          <span className="num ms-2 rounded-full bg-white px-2 py-0.5 text-xs">
            {done}/{steps.length}
          </span>
        )}
        <ChevronDown className={cn('ms-auto size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {steps.length > 0 && (
        <div className="h-1 bg-brand-50">
          <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      {open && (
        <div className="space-y-3 p-4">
          {steps.map((s, i) => {
            const p = r.progress?.[String(i)]
            return (
              <div key={i} className={cn('flex items-start gap-3 rounded-xl border p-3', p ? 'border-success/30 bg-success/5' : 'border-border')}>
                <button disabled={!can('requests.manage') || busy !== null} onClick={() => tick(i, !p)} className={cn('mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors', p ? 'border-success bg-success text-white' : 'border-brand text-brand hover:bg-brand-50')}>
                  {busy === i ? <Spinner className="size-3" /> : p ? <CheckCircle2 className="size-4" /> : <span className="num">{i + 1}</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn('text-sm', p && 'text-muted line-through')}>
                    {s.title}
                    {!s.required && <span className="ms-1 text-xs text-subtle">({t('اختيارية', 'optionnelle')})</span>}
                  </div>
                  {p && <div className="num text-[11px] text-subtle">{p.name} · {format(new Date(p.at), 'dd/MM HH:mm')}</div>}
                </div>
                {s.url && (
                  <Button size="sm" variant={p ? 'ghost' : 'outline'} asChild>
                    <a href={s.url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      {s.url_label || t('فتح', 'Ouvrir')}
                    </a>
                  </Button>
                )}
              </div>
            )
          })}
          {guide.tips_ar && (
            <div className="rounded-xl bg-warning/10 p-3 text-sm whitespace-pre-line">
              <div className="mb-1 text-xs font-semibold text-warning">{t('انتبه', 'Attention')}</div>
              {guide.tips_ar}
            </div>
          )}
          {(guide.links ?? []).filter((l) => l.url).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {guide.links.filter((l) => l.url).map((l, i) => (
                <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-brand hover:bg-surface-2">
                  <ExternalLink className="size-3.5" />
                  {l.label || l.url}
                </a>
              ))}
            </div>
          )}
          {guide.video_url && (
            <div>
              <Button size="sm" variant="outline" onClick={() => (yt ? setVideo((v) => !v) : window.open(guide.video_url!, '_blank'))}>
                <PlayCircle />
                {t('فيديو الشرح', 'Vidéo explicative')}
              </Button>
              {video && yt && <iframe className="mt-2 aspect-video w-full rounded-xl" src={`https://www.youtube-nocookie.com/embed/${yt}`} allow="encrypted-media; picture-in-picture" allowFullScreen title="guide" />}
            </div>
          )}
          {(guide.images ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {guide.images.map((u) => (
                <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
                  <img src={u} alt="" className="aspect-video w-full object-cover" />
                </a>
              ))}
            </div>
          )}
          <button onClick={() => setSuggest(true)} className="text-xs text-muted underline hover:text-text">
            {t('الدليل غير دقيق أو تغيّر شيء في البوابة؟ اقترح تعديلاً', 'Guide inexact ? Suggérer une correction')}
          </button>
        </div>
      )}
      <SuggestGuideDialog serviceId={suggest ? (r.service?.id ?? r.service_id ?? null) : null} onClose={() => setSuggest(false)} />
    </Card>
  )
}

/** 3 · Customer data in the official portal's order, one copy button each. */
export function CopyPanel({ r }: { r: WorkflowRequest }) {
  const { t, pick } = useLang()
  const copy = (v: string) => (navigator.clipboard.writeText(v), toast.success(t('تم النسخ', 'Copié')))
  const ordered = (r.service?.fields ?? []).map((f) => ({ label: pick(f, 'label'), value: r.fields?.[f.label_ar] ?? r.fields?.[f.key] ?? '' }))
  const known = new Set((r.service?.fields ?? []).map((f) => f.label_ar))
  const extra = Object.entries(r.fields ?? {}).filter(([k]) => !known.has(k)).map(([label, value]) => ({ label, value: String(value) }))
  const rows = [
    { label: t('الاسم الكامل', 'Nom complet'), value: r.customer_name },
    ...ordered,
    ...extra,
    { label: t('الهاتف', 'Téléphone'), value: r.phone.startsWith('212') ? `0${r.phone.slice(3)}` : `+${r.phone}` },
    ...(r.email ? [{ label: t('البريد الإلكتروني', 'E-mail'), value: r.email }] : []),
  ].filter((x) => x.value)
  const all = rows.map((x) => `${x.label}: ${x.value}`).join('\n')
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCopy className="size-4 text-brand" />
        {t('للنسخ في البوابة (بنفس ترتيبها)', 'À copier dans le portail (même ordre)')}
        <button onClick={() => copy(all)} className="ms-auto flex items-center gap-1 text-xs text-brand hover:underline">
          <Copy className="size-3.5" />
          {t('نسخ الكل', 'Tout copier')}
        </button>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {rows.map((x, i) => (
          <button key={i} onClick={() => copy(x.value)} className="group flex w-full items-center gap-3 px-3 py-2 text-start text-sm hover:bg-surface-2">
            <span className="num flex size-5 shrink-0 items-center justify-center rounded bg-surface-2 text-[10px] text-muted">{i + 1}</span>
            <span className="w-32 shrink-0 truncate text-muted">{x.label}</span>
            <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{x.value}</span>
            <Copy className="size-3.5 text-subtle group-hover:text-brand" />
          </button>
        ))}
      </div>
    </Card>
  )
}

/** 4 · Completion reference: portal number, secret code, confirmation screenshot. */
export function ReferenceCard({ r, guide }: { r: WorkflowRequest; guide: WorkflowGuide | null }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const refresh = useRefresh(r.id)
  const [ref, setRef] = useState(r.portal_ref ?? '')
  const [code, setCode] = useState(r.portal_code ?? '')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const proofs = r.files.filter((f) => f.kind === 'portal_proof')
  const dirty = ref !== (r.portal_ref ?? '') || code !== (r.portal_code ?? '')
  const needRef = !!guide?.require_ref && (guide?.steps?.length ?? 0) > 0
  const needProof = !!guide?.require_proof

  const save = async () => {
    const { error } = await sb.rpc('request_set_ref', { p_id: r.id, p_ref: ref, p_code: code })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظ مرجع الإنجاز', 'Référence enregistrée'))
    refresh()
  }
  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) await uploadStaffFile(sb, { request: r.id }, f, 'portal_proof')
      toast.success(t('رُفعت لقطة التأكيد', 'Capture ajoutée'))
      refresh()
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Hash className="size-4 text-brand" />
        {t('مرجع الإنجاز في البوابة الرسمية', 'Référence sur le portail officiel')}
        {(needRef || needProof) && <Badge tone={(!needRef || r.portal_ref) && (!needProof || proofs.length) ? 'success' : 'warning'}>{t('إلزامي قبل «جاهز»', 'Requis avant « Prêt »')}</Badge>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('رقم الطلب / الوصل في البوابة', 'N° de demande / reçu')}>
          <Input value={ref} onChange={(e) => setRef(e.target.value)} onBlur={() => dirty && save()} dir="ltr" className="num" disabled={!can('requests.manage')} />
        </Field>
        <Field label={t('القن السري / رمز التتبّع (إن وُجد)', 'Code secret / suivi (si existe)')}>
          <Input value={code} onChange={(e) => setCode(e.target.value)} onBlur={() => dirty && save()} dir="ltr" className="num" disabled={!can('requests.manage')} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {dirty && (
          <Button size="sm" onClick={save}>
            {t('حفظ', 'Enregistrer')}
          </Button>
        )}
        {can('requests.manage') && (
          <>
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} loading={uploading}>
              <Camera />
              {t('لقطة شاشة للتأكيد', 'Capture de confirmation')}
            </Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (upload(e.target.files), (e.target.value = ''))} />
          </>
        )}
        {proofs.map((p) => (
          <Badge key={p.id} tone="success">
            <CheckCircle2 />
            {p.name.slice(0, 24)}
          </Badge>
        ))}
      </div>
      <p className="text-xs text-muted">{t('يرى زملاؤك هذه المعلومات، فيتابعون الطلب أو يجيبون الزبون دون أن يسألوك. لا يراها الزبون.', 'Visible par l’équipe, pas par le client.')}</p>
    </Card>
  )
}

/** 6 · "I'm stuck" + current blocker banner with a ready reply for the customer. */
export function BlockerBar({ r }: { r: WorkflowRequest }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const refresh = useRefresh(r.id)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const vars = { name: r.customer_name, number: r.number, service: r.service_name_ar, link: siteTrackUrl(r.tracking_code) }

  const submit = async () => {
    const { error } = await sb.rpc('request_blocked', { p_id: r.id, p_reason: reason, p_note: note })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('أُبلغ المالك بالمشكل', 'Le propriétaire est prévenu'))
    setOpen(false)
    refresh()
    const reply = BLOCK_REPLY[reason]
    if (reply) toast(t('أرسل للزبون رسالة توضيح؟', 'Prévenir le client ?'), { action: { label: 'WhatsApp', onClick: () => sendWhatsApp(sb, r.phone, fillTemplate(reply, vars), lang) } })
  }
  const unblock = async () => {
    await sb.rpc('request_unblock', { p_id: r.id })
    refresh()
  }
  const label = BLOCK_REASONS.find((x) => x[0] === r.blocked_reason)

  if (!can('requests.manage')) return null
  return (
    <>
      {r.blocked_reason ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border-2 border-danger/40 bg-danger/5 p-3 text-sm">
          <AlertOctagon className="size-5 text-danger" />
          <span className="flex-1">
            <span className="font-semibold text-danger">{label ? t(label[1], label[2]) : r.blocked_reason}</span>
            {r.blocked_note && <span className="text-muted"> — «{r.blocked_note}»</span>}
            {r.blocked_at && <span className="num ms-1 text-xs text-subtle">{format(new Date(r.blocked_at), 'dd/MM HH:mm')}</span>}
          </span>
          {BLOCK_REPLY[r.blocked_reason] && (
            <Button size="sm" variant="success" onClick={() => sendWhatsApp(sb, r.phone, fillTemplate(BLOCK_REPLY[r.blocked_reason!], vars), lang)}>
              WhatsApp
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={unblock}>
            <Undo2 />
            {t('حُلّ المشكل', 'Résolu')}
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)}>
          <AlertOctagon />
          {t('تعثّرت', 'Je suis bloqué(e)')}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen} size="sm" title={t('ما المشكل؟', 'Quel est le problème ?')} description={pick({ name_ar: r.service_name_ar, name_fr: r.service_name_ar }, 'name')}>
        <div className="space-y-3">
          <div className="grid gap-2">
            {BLOCK_REASONS.map(([k, ar, fr]) => (
              <button key={k} onClick={() => setReason(k)} className={cn('rounded-xl border-2 p-2.5 text-start text-sm', reason === k ? 'border-danger bg-danger/5' : 'border-border hover:bg-surface-2')}>
                {t(ar, fr)}
              </button>
            ))}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('شرح قصير (اختياري)', 'Précision (optionnel)')} />
          <Button className="w-full" variant="danger-soft" disabled={!reason} onClick={submit}>
            {t('إبلاغ المالك', 'Prévenir le propriétaire')}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

/** 8 · Ready WhatsApp messages written for this service. */
export function TemplatesMenu({ r, templates }: { r: WorkflowRequest; templates: { label: string; text: string }[] }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [open, setOpen] = useState(false)
  const list = (templates ?? []).filter((x) => x.text?.trim())
  if (!list.length) return null
  const vars = { name: r.customer_name, number: r.number, service: r.service_name_ar, link: siteTrackUrl(r.tracking_code), code: r.tracking_code }
  return (
    <div className="relative">
      <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
        <MessageSquareText />
        {t('رسائل جاهزة', 'Messages prêts')}
      </Button>
      {open && (
        <div className="absolute end-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          {list.map((x, i) => (
            <button key={i} onClick={() => (sendWhatsApp(sb, r.phone, fillTemplate(x.text, vars), lang), setOpen(false))} className="block w-full rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2">
              <div className="font-medium">{x.label || t('رسالة', 'Message')}</div>
              <div className="line-clamp-2 text-xs text-muted">{fillTemplate(x.text, vars)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
