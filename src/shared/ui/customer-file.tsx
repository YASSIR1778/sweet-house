import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, Eye, FileCheck2, FolderOpen, Printer, Repeat, Search, ShoppingBag, Receipt as ReceiptIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { ORDER_STATUSES } from '@/shared/lib/online'
import { Badge, Button, Card, Input, Spinner } from './primitives'
import { Sheet } from './overlay'
import { EmptyState } from './data'
import { RequestSheet } from './request-sheet'
import { StaffRequestSheet, type StaffRequestPrefill } from './staff-request'

type Doc = { id: string; name: string; path: string; mime: string | null; created_at: string }
type FileData = {
  customer: { id: string; full_name: string; phone: string; email: string | null; created_at: string; balance: number } | null
  phone_digits: string
  requests: { id: string; number: string; tracking_code: string; service_id: string | null; service_name_ar: string; service_name_fr: string; customer_name: string; phone: string; created_at: string; price: number; payment_status: string; portal_ref: string | null; keep_files: boolean; status: { key: string; name_ar: string; name_fr: string; color: string; is_final: boolean }; assignee: string | null; deliverables: Doc[]; uploads_count: number }[]
  orders: { id: string; number: string; total: number; status: string; payment_status: string; created_at: string }[]
  sales: { id: string; number: string; total: number; paid_credit: number; status: string; created_at: string; items: string | null }[]
}

/** Open a staff document (signed URL) and record the access. */
export async function openStaffDoc(sb: SupabaseClient, doc: { id: string; path: string; name: string }, action: 'view' | 'download' | 'print', lang: 'ar' | 'fr') {
  const { data, error } = await sb.storage.from('customer-docs').createSignedUrl(doc.path, 600, action === 'download' ? { download: doc.name } : undefined)
  if (error || !data) return toast.error(errorMessage(error, lang))
  sb.rpc('log_doc_access', { p_file: doc.id, p_action: action }).then(() => {})
  const w = window.open(data.signedUrl, '_blank')
  if (action === 'print' && w) w.addEventListener('load', () => setTimeout(() => w.print(), 400))
}

/** Everything a returning customer did with the shop, from a phone number. */
export function CustomerFileSheet({ open, onClose, phone, customerId, deviceId }: { open: boolean; onClose: () => void; phone?: string | null; customerId?: string | null; deviceId?: string }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const [q, setQ] = useState(phone ?? '')
  const [target, setTarget] = useState<{ phone?: string | null; id?: string | null }>({ phone, id: customerId })
  const [openReq, setOpenReq] = useState<string | null>(null)
  const [repeat, setRepeat] = useState<StaffRequestPrefill | null>(null)
  useEffect(() => {
    if (open) (setQ(phone ?? ''), setTarget({ phone, id: customerId }))
  }, [open, phone, customerId])

  const enabled = open && (!!target.id || (target.phone ?? '').replace(/\D/g, '').length >= 9)
  const d = useQuery({
    queryKey: ['customer-file', target.phone, target.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await sb.rpc('customer_file', { p_phone: target.id ? null : target.phone, p_customer: target.id ?? null })
      if (error) throw error
      return data as FileData
    },
  })
  const f = d.data
  const docsCount = (f?.requests ?? []).reduce((a, r) => a + r.deliverables.length, 0)

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="max-w-3xl" title={t('ملف الزبون', 'Dossier client')} description={t('كل طلباته ووثائقه ومشترياته مع المكتبة', 'Toutes ses demandes, documents et achats')}>
      <form onSubmit={(e) => (e.preventDefault(), setTarget({ phone: q }))} className="mb-4 flex gap-2">
        <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('رقم هاتف الزبون', 'Téléphone du client')} dir="ltr" inputMode="tel" autoFocus={!phone && !customerId} />
        <Button type="submit">{t('بحث', 'Chercher')}</Button>
      </form>

      {!enabled ? (
        <EmptyState icon={<FolderOpen />} title={t('اكتب رقم هاتف الزبون', 'Saisissez le téléphone du client')} />
      ) : d.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !f || (!f.customer && !f.requests.length && !f.orders.length) ? (
        <EmptyState icon={<FolderOpen />} title={t('لا يوجد أي ملف بهذا الرقم', 'Aucun dossier avec ce numéro')} />
      ) : (
        <div className="space-y-5">
          <Card className="flex flex-wrap items-center gap-4 p-4">
            <div className="min-w-0 flex-1">
              <div className="text-lg font-bold">{f.customer?.full_name ?? f.requests[0]?.customer_name}</div>
              <div className="num text-sm text-muted" dir="ltr">
                +{f.customer?.phone ?? f.requests[0]?.phone}
              </div>
              {f.customer && <div className="text-xs text-subtle">{t('زبون منذ', 'Client depuis')} {format(new Date(f.customer.created_at), 'dd/MM/yyyy')}</div>}
            </div>
            <div className="flex flex-wrap gap-2 text-center text-xs">
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="num text-lg font-bold">{f.requests.length}</div>
                {t('طلب خدمة', 'demandes')}
              </div>
              <div className="rounded-xl bg-surface-2 px-3 py-2">
                <div className="num text-lg font-bold">{docsCount}</div>
                {t('وثيقة جاهزة', 'documents')}
              </div>
              {f.customer && f.customer.balance !== 0 && (
                <div className="rounded-xl bg-danger/10 px-3 py-2 text-danger">
                  <div className="num text-lg font-bold">{money(f.customer.balance)}</div>
                  {t('دين', 'crédit')}
                </div>
              )}
            </div>
          </Card>

          {f.requests.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('طلبات الخدمات', 'Démarches')}</h3>
              {f.requests.map((r) => (
                <Card key={r.id} className="space-y-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => setOpenReq(r.id)} className="min-w-0 flex-1 text-start">
                      <div className="font-medium hover:text-brand">{pick(r, 'service_name')}</div>
                      <div className="num text-xs text-muted">
                        {r.number} · {format(new Date(r.created_at), 'dd/MM/yyyy')} {r.portal_ref && `· ${t('مرجع', 'réf')} ${r.portal_ref}`} {r.assignee && `· ${r.assignee}`}
                      </div>
                    </button>
                    <Badge style={{ background: `${r.status.color}1a`, color: r.status.color }}>{pick(r.status, 'name')}</Badge>
                    {can('requests.manage') && (
                      <Button size="sm" variant="ghost" onClick={() => setRepeat({ service_id: r.service_id, name: r.customer_name, phone: r.phone, from_request: r.id })} title={t('طلب جديد مماثل', 'Nouvelle demande identique')}>
                        <Repeat />
                      </Button>
                    )}
                  </div>
                  {r.deliverables.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 rounded-lg bg-success/5 px-2.5 py-1.5 text-sm">
                      <FileCheck2 className="size-4 shrink-0 text-success" />
                      <span className="min-w-0 flex-1 truncate">{doc.name}</span>
                      <Button size="icon-sm" variant="ghost" onClick={() => openStaffDoc(sb, doc, 'view', lang)} title={t('عرض', 'Voir')}>
                        <Eye />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => openStaffDoc(sb, doc, 'print', lang)} title={t('طباعة', 'Imprimer')}>
                        <Printer />
                      </Button>
                      <Button size="icon-sm" variant="ghost" onClick={() => openStaffDoc(sb, doc, 'download', lang)} title={t('تحميل', 'Télécharger')}>
                        <Download />
                      </Button>
                    </div>
                  ))}
                </Card>
              ))}
            </section>
          )}

          {f.orders.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('طلبيات المتجر', 'Commandes')}</h3>
              {f.orders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <ShoppingBag className="size-4 text-brand" />
                  <span className="num flex-1">
                    {o.number} · {format(new Date(o.created_at), 'dd/MM/yyyy')}
                  </span>
                  {ORDER_STATUSES[o.status] && <Badge style={{ background: `${ORDER_STATUSES[o.status].color}1a`, color: ORDER_STATUSES[o.status].color }}>{t(ORDER_STATUSES[o.status].ar, ORDER_STATUSES[o.status].fr)}</Badge>}
                  <span className="num font-semibold">{money(o.total)}</span>
                </div>
              ))}
            </section>
          )}

          {f.sales.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">{t('المشتريات من المحل', 'Achats en boutique')}</h3>
              {f.sales.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2 text-sm">
                  <ReceiptIcon className="size-4 text-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="num">{s.number}</span> · {format(new Date(s.created_at), 'dd/MM/yyyy')} {s.items && <span className="text-muted">· {s.items}</span>}
                  </span>
                  {s.status === 'voided' && <Badge tone="danger">{t('ملغى', 'Annulée')}</Badge>}
                  {s.paid_credit > 0 && <Badge tone="warning">{t('بالدين', 'Crédit')}</Badge>}
                  <span className="num font-semibold">{money(s.total)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
      <RequestSheet id={openReq} onClose={() => (setOpenReq(null), d.refetch())} deviceId={deviceId} />
      <StaffRequestSheet open={!!repeat} onClose={() => (setRepeat(null), d.refetch())} prefill={repeat ?? undefined} />
    </Sheet>
  )
}

/** Small button that opens the file for a phone number. */
export function CustomerFileButton({ phone, customerId, deviceId, label, variant = 'outline' }: { phone?: string | null; customerId?: string | null; deviceId?: string; label?: string; variant?: 'outline' | 'ghost' }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="sm" variant={variant} onClick={() => setOpen(true)}>
        <FolderOpen />
        {label ?? t('ملف الزبون', 'Dossier client')}
      </Button>
      {open && <CustomerFileSheet open={open} onClose={() => setOpen(false)} phone={phone} customerId={customerId} deviceId={deviceId} />}
    </>
  )
}
