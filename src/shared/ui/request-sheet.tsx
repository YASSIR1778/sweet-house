import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Banknote, Building2, CheckCheck, Copy, Download, ExternalLink, FileCheck2, FileText, MessageCircle, Phone, Trash, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { PAYMENT_STATUS, siteTrackUrl, uploadStaffFile, useRequestStatuses, type RequestStatus } from '@/shared/lib/online'
import { cn, fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { sendWhatsApp } from '@/shared/lib/whatsapp'
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from './primitives'
import { Sheet, useConfirm } from './overlay'
import { MoneyInput } from './pickers'

type FileRow = { id: string; kind: 'upload' | 'deliverable' | 'payment_proof'; name: string; path: string; size: number | null; mime: string | null; created_at: string; downloaded_at?: string | null; download_count?: number }
type Detail = {
  id: string
  number: string
  tracking_code: string
  service_name_ar: string
  service_name_fr: string
  customer_name: string
  phone: string
  email: string | null
  status: string
  price: number
  payment_method: string
  payment_status: string
  fields: Record<string, string>
  notes: string | null
  internal_notes: string | null
  created_at: string
  service: { official_url: string | null; required_documents: { name_ar: string; name_fr: string; required: boolean }[] } | null
  history: { status: string; note: string | null; created_at: string; employee_name: string | null }[]
  files: FileRow[]
}

export function StatusBadge({ s }: { s?: RequestStatus }) {
  const { pick } = useLang()
  if (!s) return null
  return (
    <Badge style={{ background: `${s.color}1a`, color: s.color }}>
      <span className="size-1.5 rounded-full" style={{ background: s.color }} />
      {pick(s, 'name')}
    </Badge>
  )
}

const isImage = (f: FileRow) => (f.mime ?? '').startsWith('image/') || /\.(jpe?g|png|webp|heic)$/i.test(f.name)

/**
 * Full service-request workspace, shared by the dashboard and the POS:
 * customer info, form answers, documents with previews, status, payment,
 * deliverable upload and history. Pass deviceId to allow cash payment.
 */
export function RequestSheet({ id, onClose, deviceId }: { id: string | null; onClose: () => void; deviceId?: string }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const statuses = useRequestStatuses(sb)
  const [note, setNote] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const d = useQuery({
    queryKey: ['request', id],
    enabled: !!id,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('request_detail', { p_id: id })
      if (error) throw error
      const r = data as Detail
      setPrice((p) => (p === null ? r.price : p))
      return r
    },
  })
  const r = d.data
  const extra = useQuery({
    queryKey: ['request-files-meta', id, r?.files.length],
    enabled: !!r,
    queryFn: async () => (await sb.from('request_files').select('id, downloaded_at, download_count').eq('request_id', id!)).data ?? [],
  })
  const urls = useQuery({
    queryKey: ['request-urls', id, r?.files.map((f) => f.id).join()],
    enabled: !!r?.files.length && can('requests.view_documents'),
    staleTime: 50_000,
    queryFn: async () => {
      const { data } = await sb.storage.from('customer-docs').createSignedUrls(r!.files.map((f) => f.path), 3600)
      return Object.fromEntries((data ?? []).map((x, i) => [r!.files[i].id, x.signedUrl ?? ''])) as Record<string, string>
    },
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['request', id] })
    qc.invalidateQueries({ queryKey: ['requests'] })
    qc.invalidateQueries({ queryKey: ['pos-requests'] })
    qc.invalidateQueries({ queryKey: ['online-pending'] })
    if (deviceId) qc.invalidateQueries({ queryKey: ['shift', deviceId] })
  }

  const status = statuses.data?.find((s) => s.key === r?.status)
  const link = r ? siteTrackUrl(r.tracking_code) : ''
  const waText = (s?: RequestStatus) => (r ? fillTemplate((lang === 'fr' && s?.template_fr) || s?.template_ar || 'مرحباً {name}، بخصوص طلبكم رقم {number}:\n{link}', { name: r.customer_name, service: pick(r, 'service_name'), number: r.number, link, code: r.tracking_code }) : '')

  const setStatus = async (key: string) => {
    if (!r) return
    const { error } = await sb.rpc('set_request_status', { p_id: r.id, p_status: key, p_note: note || null })
    if (error) return toast.error(errorMessage(error, lang))
    setNote('')
    refresh()
    const s = statuses.data?.find((x) => x.key === key)
    toast.success(t('تم تغيير الحالة', 'Statut modifié'), s?.template_ar ? { action: { label: t('إرسال واتساب', 'WhatsApp'), onClick: () => sendWhatsApp(sb, r.phone, waText(s), lang) } } : undefined)
  }
  const savePrice = async () => {
    if (!r || price === null) return
    const { error } = await sb.from('service_requests').update({ price }).eq('id', r.id)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تحديث السعر', 'Prix mis à jour'))
    refresh()
  }
  const confirmPay = async (method: 'transfer' | 'card' | 'cash') => {
    if (!r) return
    const amount = price ?? r.price
    if (method === 'cash' && !amount) return toast.error(t('حدد السعر أولاً', 'Indiquez le prix'))
    if (!(await confirm({ title: method === 'cash' ? t('استلام الأداء نقداً؟', 'Encaisser en espèces ?') : t('تأكيد الأداء؟', 'Confirmer le paiement ?'), description: money(amount) }))) return
    const { error } = await sb.rpc('confirm_request_payment', { p_id: r.id, p_amount: amount, p_method: method, p_device: deviceId ?? null })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(method === 'cash' ? t('تم الاستلام ودخل المبلغ الصندوق ✅', 'Encaissé ✅') : t('تم تأكيد الأداء ✅', 'Paiement confirmé ✅'))
    refresh()
  }
  const uploadDeliverable = async (files: FileList | null) => {
    if (!r || !files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) await uploadStaffFile(sb, { request: r.id }, f, 'deliverable')
      toast.success(t('تم رفع الوثيقة الجاهزة. غيّر الحالة إلى "جاهز" ليتمكن الزبون من تحميلها.', 'Document ajouté. Passez le statut à « Prêt ».'))
      refresh()
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setUploading(false)
    }
  }
  const removeFile = async (fid: string) => {
    if (!(await confirm({ title: t('حذف الملف؟', 'Supprimer le fichier ?'), danger: true }))) return
    await sb.rpc('delete_request_file', { p_file: fid })
    refresh()
  }
  const saveInternal = async (v: string) => {
    if (!r) return
    await sb.from('service_requests').update({ internal_notes: v }).eq('id', r.id)
  }
  const copy = (v: string) => (navigator.clipboard.writeText(v), toast.success(t('تم النسخ', 'Copié')))

  const meta = (f: FileRow) => extra.data?.find((x) => x.id === f.id)
  const uploads = (r?.files ?? []).filter((f) => f.kind !== 'deliverable')
  const deliverables = (r?.files ?? []).filter((f) => f.kind === 'deliverable')

  const historyLabel = (h: Detail['history'][number]) => {
    if (h.note === 'payment_confirmed') return t('تأكيد الأداء', 'Paiement confirmé')
    if (h.note?.startsWith('customer_downloaded:')) return t(`الزبون حمّل: ${h.note.slice(20)}`, `Téléchargé par le client : ${h.note.slice(20)}`)
    if (h.note === 'auto_after_download') return t('تم التسليم تلقائياً بعد التحميل', 'Livrée automatiquement après téléchargement')
    const s = statuses.data?.find((x) => x.key === h.status)
    return (s ? pick(s, 'name') : h.status) + (h.note ? ` — ${h.note}` : '')
  }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} width="max-w-3xl" title={r ? `${r.number} · ${pick(r, 'service_name')}` : ''} description={r ? `${t('رقم التتبّع', 'Code')}: ${r.tracking_code} · ${format(new Date(r.created_at), 'dd/MM/yyyy HH:mm')}` : undefined}>
      {confirmNode}
      {!r ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          {/* customer */}
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.customer_name}</div>
              <div className="num text-sm text-muted" dir="ltr">
                +{r.phone} {r.email && `· ${r.email}`}
              </div>
            </div>
            <StatusBadge s={status} />
            <Button asChild variant="outline" size="sm">
              <a href={`tel:+${r.phone}`}>
                <Phone />
              </a>
            </Button>
            <Button asChild variant="success" size="sm">
              <a href={whatsappLink(r.phone, waText(status))} target="_blank" rel="noreferrer">
                <MessageCircle />
                WhatsApp
              </a>
            </Button>
          </Card>

          {/* what the customer asked */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-brand" />
                {t('تفاصيل الطلب', 'Détails de la demande')}
              </div>
              {r.service?.official_url && (
                <a href={r.service.official_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand hover:underline">
                  <ExternalLink className="size-3.5" />
                  {t('البوابة الرسمية', 'Portail officiel')}
                </a>
              )}
            </div>
            {Object.keys(r.fields ?? {}).length === 0 && !r.notes && <div className="text-sm text-muted">{t('لم يملأ الزبون معلومات إضافية', 'Aucune information')}</div>}
            <div className="divide-y divide-border rounded-xl border border-border">
              {Object.entries(r.fields ?? {}).map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="shrink-0 text-muted">{k}</span>
                  <span className="flex items-start gap-2 text-end font-medium whitespace-pre-line">
                    {String(v)}
                    <button onClick={() => copy(String(v))} className="mt-0.5 text-subtle hover:text-brand">
                      <Copy className="size-3.5" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            {r.notes && (
              <div className="rounded-xl bg-warning/5 p-3 text-sm whitespace-pre-line">
                <div className="mb-1 text-xs font-semibold text-warning">{t('ملاحظة الزبون', 'Note du client')}</div>
                {r.notes}
              </div>
            )}
          </Card>

          {/* customer documents */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>
                {t('وثائق الزبون', 'Documents du client')} <span className="num text-muted">({uploads.length})</span>
              </span>
            </div>
            {r.service?.required_documents?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {r.service.required_documents.map((x, i) => (
                  <Badge key={i} tone={x.required ? 'brand' : 'neutral'}>
                    <FileCheck2 />
                    {pick(x, 'name')}
                  </Badge>
                ))}
              </div>
            ) : null}
            {!uploads.length ? (
              <div className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t('لم يرفع الزبون أي وثيقة بعد', 'Aucun document envoyé')}</div>
            ) : !can('requests.view_documents') ? (
              <div className="text-sm text-muted">{t('ليست لديك صلاحية رؤية الوثائق', 'Accès aux documents non autorisé')}</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {uploads.map((f) => (
                  <div key={f.id} className="group overflow-hidden rounded-xl border border-border bg-surface">
                    <a href={urls.data?.[f.id]} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-surface-2">
                      {isImage(f) && urls.data?.[f.id] ? <img src={urls.data[f.id]} alt="" className="size-full object-cover" /> : <FileText className="m-auto h-full size-10 text-subtle" />}
                    </a>
                    <div className="flex items-center gap-1 p-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{f.name}</div>
                        <div className="num text-[10px] text-muted">
                          {f.kind === 'payment_proof' ? t('وصل تحويل', 'Justificatif') + ' · ' : ''}
                          {format(new Date(f.created_at), 'dd/MM HH:mm')}
                        </div>
                      </div>
                      <a href={urls.data?.[f.id]} download={f.name} target="_blank" rel="noreferrer" className="rounded p-1 text-subtle hover:text-brand">
                        <Download className="size-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* status */}
          {can('requests.manage') && (
            <Card className="space-y-3 p-4">
              <div className="text-sm font-semibold">{t('تغيير الحالة', 'Changer le statut')}</div>
              <div className="flex flex-wrap gap-2">
                {(statuses.data ?? [])
                  .filter((s) => s.key !== r.status)
                  .map((s) => (
                    <button key={s.key} onClick={() => setStatus(s.key)} className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-2" style={{ borderColor: `${s.color}55`, color: s.color }}>
                      → {pick(s, 'name')}
                    </button>
                  ))}
              </div>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ملاحظة مع تغيير الحالة (اختياري)', 'Note (optionnel)')} />
            </Card>
          )}

          {/* deliverable */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t('الوثيقة الجاهزة للزبون', 'Document final')}</div>
              {can('requests.manage') && (
                <>
                  <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                    <Upload />
                    {t('رفع الوثيقة', 'Ajouter')}
                  </Button>
                  <input ref={fileRef} type="file" multiple hidden onChange={(e) => (uploadDeliverable(e.target.files), (e.target.value = ''))} />
                </>
              )}
            </div>
            {!deliverables.length ? (
              <div className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t('ارفع الوثيقة بعد إنجازها، ثم غيّر الحالة إلى "جاهز"', 'Ajoutez le document puis passez à « Prêt »')}</div>
            ) : (
              <div className="space-y-2">
                {deliverables.map((f) => {
                  const m = meta(f)
                  return (
                    <div key={f.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
                      <FileCheck2 className="size-4 text-success" />
                      <a href={urls.data?.[f.id]} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:text-brand">
                        {f.name}
                      </a>
                      {m?.downloaded_at ? (
                        <Badge tone="success">
                          <CheckCheck />
                          {t('حمّلها الزبون', 'Téléchargé')} · <span className="num">{format(new Date(m.downloaded_at), 'dd/MM HH:mm')}</span>
                          {(m.download_count ?? 0) > 1 && <span className="num">×{m.download_count}</span>}
                        </Badge>
                      ) : (
                        <Badge>{t('لم تُحمَّل بعد', 'Pas encore téléchargé')}</Badge>
                      )}
                      {can('requests.manage') && (
                        <Button variant="ghost" size="icon-sm" onClick={() => removeFile(f.id)}>
                          <Trash className="text-danger" />
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {status?.allow_download && deliverables.length > 0 && r.payment_status !== 'paid' && r.price > 0 && (
              <div className="rounded-lg bg-warning/10 p-2 text-xs text-warning">{t('الزبون لن يستطيع التحميل حتى تأكيد الأداء.', 'Téléchargement possible après paiement.')}</div>
            )}
          </Card>

          {/* payment */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2">
                {t('الأداء', 'Paiement')}
                <span className="flex items-center gap-1 text-xs font-normal text-muted">
                  {r.payment_method === 'bank_transfer' && <Building2 className="size-3.5" />}
                  {r.payment_method === 'bank_transfer' ? t('تحويل بنكي', 'Virement') : t('في المحل', 'En boutique')}
                </span>
              </span>
              <Badge tone={PAYMENT_STATUS[r.payment_status].tone}>{t(PAYMENT_STATUS[r.payment_status].ar, PAYMENT_STATUS[r.payment_status].fr)}</Badge>
            </div>
            <div className="flex gap-2">
              <MoneyInput value={price} onChange={setPrice} className="flex-1" />
              {r.payment_status !== 'paid' && price !== r.price && can('requests.manage') && (
                <Button size="sm" variant="outline" onClick={savePrice}>
                  {t('حفظ السعر', 'Enregistrer')}
                </Button>
              )}
            </div>
            {r.payment_status !== 'paid' && (
              <div className="flex flex-wrap gap-2">
                {deviceId && can('requests.manage') && (
                  <Button size="sm" onClick={() => confirmPay('cash')}>
                    <Banknote />
                    {t('استلام نقداً', 'Encaisser en espèces')}
                  </Button>
                )}
                {can('payments.confirm_transfer') && (
                  <>
                    <Button size="sm" variant="success" onClick={() => confirmPay('transfer')}>
                      {t('تأكيد التحويل', 'Confirmer virement')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => confirmPay('card')}>
                      {t('بطاقة', 'Carte')}
                    </Button>
                  </>
                )}
              </div>
            )}
            {r.payment_status !== 'paid' && !deviceId && <p className="text-xs text-muted">{t('الأداء نقداً يُسجَّل من نقطة البيع حتى يدخل الصندوق.', 'Les espèces se saisissent au POS.')}</p>}
          </Card>

          {can('requests.manage') && (
            <Field label={t('ملاحظات داخلية (لا يراها الزبون)', 'Notes internes')}>
              <Textarea defaultValue={r.internal_notes ?? ''} onBlur={(e) => saveInternal(e.target.value)} />
            </Field>
          )}

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">{t('السجل', 'Historique')}</div>
            <ol className="space-y-2">
              {r.history.map((h, i) => {
                const s = statuses.data?.find((x) => x.key === h.status)
                const dl = h.note?.startsWith('customer_downloaded:')
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className={cn('size-2 shrink-0 rounded-full')} style={{ background: dl ? '#16A34A' : (s?.color ?? '#94a3b8') }} />
                    <span className={cn(dl && 'font-medium text-success')}>{historyLabel(h)}</span>
                    <span className="num ms-auto shrink-0 text-xs text-subtle">
                      {format(new Date(h.created_at), 'dd/MM HH:mm')} {h.employee_name ? `· ${h.employee_name}` : !h.note?.startsWith('payment') && i > 0 ? `· ${t('الزبون', 'client')}` : ''}
                    </span>
                  </li>
                )
              })}
            </ol>
          </Card>
        </div>
      )}
    </Sheet>
  )
}
