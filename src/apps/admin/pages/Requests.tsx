import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { ar as arLocale, fr as frLocale } from 'date-fns/locale'
import { Building2, ClipboardList, ExternalLink, Eye, FileCheck2, MessageCircle, Paperclip, Phone, Search, Trash, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { openStaffFile, PAYMENT_STATUS, siteTrackUrl, uploadStaffFile, useRequestStatuses, type RequestStatus } from '@/shared/lib/online'
import { cn, fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, Tabs, type Column } from '@/shared/ui/data'
import { MoneyInput } from '@/shared/ui/pickers'

type Row = { id: string; number: string; tracking_code: string; service_name_ar: string; service_name_fr: string; customer_name: string; phone: string; status: string; price: number; payment_method: string; payment_status: string; created_at: string }
type Detail = Row & {
  email: string | null
  fields: Record<string, string>
  notes: string | null
  internal_notes: string | null
  service: { official_url: string | null; required_documents: { name_ar: string; name_fr: string; required: boolean }[] } | null
  history: { status: string; note: string | null; created_at: string; employee_name: string | null }[]
  files: { id: string; kind: 'upload' | 'deliverable' | 'payment_proof'; name: string; path: string; size: number | null; created_at: string }[]
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

export function RequestsPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const statuses = useRequestStatuses(sb)
  const [tab, setTab] = useState('open')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['requests'],
    refetchInterval: 60_000,
    queryFn: async () => (await sb.from('service_requests').select('id, number, tracking_code, service_name_ar, service_name_fr, customer_name, phone, status, price, payment_method, payment_status, created_at').order('created_at', { ascending: false }).limit(1000)).data as Row[],
  })
  const st = (k: string) => statuses.data?.find((s) => s.key === k)

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (list.data ?? []).filter((r) => {
      const status = st(r.status)
      if (tab === 'open' && status?.is_final) return false
      if (tab === 'proof' && r.payment_status !== 'proof_uploaded') return false
      if (tab !== 'open' && tab !== 'proof' && tab !== 'all' && r.status !== tab) return false
      return !s || r.number.toLowerCase().includes(s) || r.customer_name.toLowerCase().includes(s) || r.phone.includes(s) || r.service_name_ar.includes(s) || r.tracking_code.toLowerCase().includes(s)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, tab, q, statuses.data])

  const count = (fn: (r: Row) => boolean) => (list.data ?? []).filter(fn).length
  const columns: Column<Row>[] = [
    { key: 'n', header: t('الطلب', 'N°'), cell: (r) => <span className="num font-semibold">{r.number}</span> },
    { key: 's', header: t('الخدمة', 'Service'), cell: (r) => <span className="font-medium">{pick(r, 'service_name')}</span> },
    {
      key: 'c',
      header: t('الزبون', 'Client'),
      cell: (r) => (
        <div>
          <div>{r.customer_name}</div>
          <div className="num text-xs text-muted" dir="ltr">+{r.phone}</div>
        </div>
      ),
    },
    { key: 'st', header: t('الحالة', 'Statut'), cell: (r) => <StatusBadge s={st(r.status)} /> },
    { key: 'p', header: t('الأداء', 'Paiement'), cell: (r) => <Badge tone={PAYMENT_STATUS[r.payment_status].tone}>{t(PAYMENT_STATUS[r.payment_status].ar, PAYMENT_STATUS[r.payment_status].fr)}</Badge> },
    { key: 'd', header: t('منذ', 'Reçue'), sortValue: (r) => r.created_at, cell: (r) => <span className="text-xs text-muted">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: lang === 'ar' ? arLocale : frLocale })}</span> },
  ]

  return (
    <>
      <PageHeader icon={<ClipboardList />} title={t('طلبات الخدمات', 'Demandes de services')} description={t('الطلبات الواردة من الموقع: الوثائق، الحالة، الأداء، والتسليم', 'Demandes reçues du site : documents, statut, paiement')} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'open', label: t('قيد الإنجاز', 'En cours'), count: count((r) => !st(r.status)?.is_final) },
            { value: 'received', label: t('جديدة', 'Nouvelles'), count: count((r) => r.status === 'received') },
            { value: 'proof', label: t('تحويلات للتأكيد', 'Virements'), count: count((r) => r.payment_status === 'proof_uploaded') },
            { value: 'all', label: t('الكل', 'Toutes') },
          ]}
        />
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('رقم، اسم، هاتف، خدمة…', 'N°, nom, téléphone…')} />
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => setOpen(r.id)} empty={<EmptyState icon={<ClipboardList />} title={t('لا توجد طلبات', 'Aucune demande')} description={t('الطلبات التي يرسلها الزبائن من الموقع ستظهر هنا', 'Les demandes du site apparaîtront ici')} />} />
      <RequestSheet id={open} onClose={() => setOpen(null)} statuses={statuses.data ?? []} />
    </>
  )
}

function RequestSheet({ id, onClose, statuses }: { id: string | null; onClose: () => void; statuses: RequestStatus[] }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [note, setNote] = useState('')
  const [price, setPrice] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const d = useQuery({
    queryKey: ['request', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.rpc('request_detail', { p_id: id })
      if (error) throw error
      setPrice((data as Detail).price)
      return data as Detail
    },
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['request', id] })
    qc.invalidateQueries({ queryKey: ['requests'] })
    qc.invalidateQueries({ queryKey: ['online-pending'] })
  }

  const r = d.data
  const status = statuses.find((s) => s.key === r?.status)
  const link = r ? siteTrackUrl(r.tracking_code) : ''
  const waText = (s?: RequestStatus) => (r ? fillTemplate((lang === 'fr' && s?.template_fr) || s?.template_ar || '{name} — {number}\n{link}', { name: r.customer_name, service: pick(r, 'service_name'), number: r.number, link, code: r.tracking_code }) : '')

  const setStatus = async (key: string) => {
    if (!r) return
    const { error } = await sb.rpc('set_request_status', { p_id: r.id, p_status: key, p_note: note || null })
    if (error) return toast.error(errorMessage(error, lang))
    setNote('')
    refresh()
    const s = statuses.find((x) => x.key === key)
    toast.success(t('تم تغيير الحالة', 'Statut modifié'), s?.template_ar ? { action: { label: t('إرسال واتساب', 'WhatsApp'), onClick: () => window.open(whatsappLink(r.phone, waText(s)), '_blank') } } : undefined)
  }
  const savePrice = async () => {
    if (!r || price === null) return
    const { error } = await sb.from('service_requests').update({ price }).eq('id', r.id)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تحديث السعر', 'Prix mis à jour'))
    refresh()
  }
  const confirmPay = async (method: 'transfer' | 'card') => {
    if (!r) return
    if (!(await confirm({ title: t('تأكيد الأداء؟', 'Confirmer le paiement ?'), description: money(price ?? r.price) }))) return
    const { error } = await sb.rpc('confirm_request_payment', { p_id: r.id, p_amount: price, p_method: method, p_device: null })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تأكيد الأداء ✅', 'Paiement confirmé ✅'))
    refresh()
  }
  const uploadDeliverable = async (files: FileList | null) => {
    if (!r || !files?.length) return
    setUploading(true)
    try {
      for (const f of Array.from(files)) await uploadStaffFile(sb, { request: r.id }, f, 'deliverable')
      toast.success(t('تم رفع الوثيقة الجاهزة', 'Document ajouté'))
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

  const FILE_KIND: Record<string, [string, string, 'info' | 'success' | 'warning']> = { upload: ['من الزبون', 'Client', 'info'], deliverable: ['جاهزة', 'Livrable', 'success'], payment_proof: ['وصل تحويل', 'Justificatif', 'warning'] }

  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()} width="max-w-3xl" title={r ? `${r.number} · ${pick(r, 'service_name')}` : ''} description={r ? `${t('رقم التتبّع', 'Code')}: ${r.tracking_code}` : undefined}>
      {confirmNode}
      {!r ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{r.customer_name}</div>
              <div className="num text-sm text-muted" dir="ltr">
                +{r.phone} {r.email && `· ${r.email}`}
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:+${r.phone}`}>
                <Phone />
              </a>
            </Button>
            <Button asChild variant="success" size="sm">
              <a href={whatsappLink(r.phone, waText(status))} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t('واتساب', 'WhatsApp')}
              </a>
            </Button>
          </Card>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t('الحالة', 'Statut')}</div>
              <StatusBadge s={status} />
            </div>
            {can('requests.manage') && (
              <>
                <div className="flex flex-wrap gap-2">
                  {statuses
                    .filter((s) => s.key !== r.status)
                    .map((s) => (
                      <button key={s.key} onClick={() => setStatus(s.key)} className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:text-white" style={{ borderColor: `${s.color}55`, color: s.color }} onMouseEnter={(e) => (e.currentTarget.style.background = s.color, e.currentTarget.style.color = '#fff')} onMouseLeave={(e) => (e.currentTarget.style.background = '', e.currentTarget.style.color = s.color)}>
                        → {pick(s, 'name')}
                      </button>
                    ))}
                </div>
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('ملاحظة مع تغيير الحالة (اختياري)', 'Note (optionnel)')} />
              </>
            )}
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-2 p-4">
              <div className="mb-1 text-sm font-semibold">{t('معلومات الطلب', 'Informations')}</div>
              {Object.entries(r.fields ?? {}).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 text-sm">
                  <span className="text-muted">{k}</span>
                  <span className="font-medium select-all">{String(v)}</span>
                </div>
              ))}
              {r.notes && <div className="rounded-lg bg-surface-2 p-2 text-sm">{r.notes}</div>}
              {r.service?.official_url && (
                <a href={r.service.official_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 pt-2 text-xs text-brand hover:underline">
                  <ExternalLink className="size-3.5" />
                  {t('فتح البوابة الرسمية', 'Ouvrir le portail officiel')}
                </a>
              )}
            </Card>
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm font-semibold">
                {t('الأداء', 'Paiement')}
                <Badge tone={PAYMENT_STATUS[r.payment_status].tone}>{t(PAYMENT_STATUS[r.payment_status].ar, PAYMENT_STATUS[r.payment_status].fr)}</Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-muted">
                {r.payment_method === 'bank_transfer' ? <Building2 className="size-3.5" /> : null}
                {r.payment_method === 'bank_transfer' ? t('تحويل بنكي', 'Virement') : t('في المحل', 'En boutique')}
              </div>
              <div className="flex gap-2">
                <MoneyInput value={price} onChange={setPrice} className="flex-1" />
                {r.payment_status !== 'paid' && price !== r.price && (
                  <Button size="sm" variant="outline" onClick={savePrice}>
                    {t('حفظ', 'OK')}
                  </Button>
                )}
              </div>
              {r.payment_status !== 'paid' && can('payments.confirm_transfer') && (
                <div className="flex gap-2">
                  <Button size="sm" variant="success" onClick={() => confirmPay('transfer')}>
                    {t('تأكيد التحويل', 'Confirmer virement')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => confirmPay('card')}>
                    {t('بطاقة', 'Carte')}
                  </Button>
                </div>
              )}
              {r.payment_status !== 'paid' && <p className="text-xs text-muted">{t('الأداء نقداً في المحل يُسجَّل من نقطة البيع ← الطلبات.', 'Les paiements en espèces se font depuis le POS.')}</p>}
            </Card>
          </div>

          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{t('الوثائق', 'Documents')}</div>
              {can('requests.manage') && (
                <>
                  <Button size="sm" onClick={() => fileRef.current?.click()} loading={uploading}>
                    <Upload />
                    {t('رفع الوثيقة الجاهزة', 'Ajouter le document prêt')}
                  </Button>
                  <input ref={fileRef} type="file" multiple hidden onChange={(e) => (uploadDeliverable(e.target.files), (e.target.value = ''))} />
                </>
              )}
            </div>
            {r.service?.required_documents?.length ? (
              <div className="flex flex-wrap gap-1.5 text-xs">
                {r.service.required_documents.map((x, i) => (
                  <Badge key={i}>
                    <FileCheck2 />
                    {pick(x, 'name')}
                  </Badge>
                ))}
              </div>
            ) : null}
            {!r.files.length ? (
              <div className="rounded-xl bg-surface-2 p-4 text-center text-sm text-muted">{t('لا توجد ملفات', 'Aucun fichier')}</div>
            ) : (
              <div className="divide-y divide-border rounded-xl border border-border">
                {r.files.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <Paperclip className="size-4 text-muted" />
                    <Badge tone={FILE_KIND[f.kind][2]}>{t(FILE_KIND[f.kind][0], FILE_KIND[f.kind][1])}</Badge>
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <span className="num text-xs text-subtle">{format(new Date(f.created_at), 'dd/MM HH:mm')}</span>
                    {can('requests.view_documents') && (
                      <Button variant="ghost" size="icon-sm" onClick={() => openStaffFile(sb, f.path).catch((e) => toast.error(errorMessage(e, lang)))}>
                        <Eye />
                      </Button>
                    )}
                    {can('requests.manage') && (
                      <Button variant="ghost" size="icon-sm" onClick={() => removeFile(f.id)}>
                        <Trash className="text-danger" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {status?.allow_download && r.files.some((f) => f.kind === 'deliverable') && r.payment_status !== 'paid' && r.price > 0 && (
              <div className="rounded-lg bg-warning/10 p-2 text-xs text-warning">{t('الزبون لن يستطيع التحميل حتى تأكيد الأداء.', 'Le client pourra télécharger après le paiement.')}</div>
            )}
          </Card>

          <Field label={t('ملاحظات داخلية (لا يراها الزبون)', 'Notes internes')}>
            <Textarea defaultValue={r.internal_notes ?? ''} onBlur={(e) => saveInternal(e.target.value)} />
          </Field>

          <Card className="p-4">
            <div className="mb-3 text-sm font-semibold">{t('السجل', 'Historique')}</div>
            <ol className="space-y-2">
              {r.history.map((h, i) => {
                const s = statuses.find((x) => x.key === h.status)
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="size-2 rounded-full" style={{ background: s?.color ?? '#94a3b8' }} />
                    <span className="font-medium">{h.note === 'payment_confirmed' ? t('تأكيد الأداء', 'Paiement confirmé') : s ? pick(s, 'name') : h.status}</span>
                    {h.note && h.note !== 'payment_confirmed' && <span className="text-muted">— {h.note}</span>}
                    <span className={cn('num ms-auto text-xs text-subtle')}>
                      {format(new Date(h.created_at), 'dd/MM HH:mm')} {h.employee_name && `· ${h.employee_name}`}
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
