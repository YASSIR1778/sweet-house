import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, Printer, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Button, Field, Input, Spinner, Textarea } from './primitives'
import { Dialog } from './overlay'
import { InvoiceDocument, type InvoiceCfg, type InvoiceData } from './invoice'
import { PrintArea } from './receipt'

export function useInvoiceCfg() {
  const { sb } = useAuth()
  return useQuery({
    queryKey: ['invoice-cfg'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await sb.from('settings').select('key, value').in('key', ['store', 'legal', 'invoice'])
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      return { store: m.store ?? {}, legal: m.legal ?? {}, invoice: m.invoice ?? {} } as InvoiceCfg
    },
  })
}

/** Create an invoice from a sale (client details form), then preview / print it. */
export function CreateInvoiceDialog({ saleId, customer, open, onClose }: { saleId: string | null; customer?: { id: string; full_name: string } | null; open: boolean; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [form, setForm] = useState({ client_name: '', client_ice: '', client_address: '', client_city: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setCreated(null)
    setForm({ client_name: customer?.full_name ?? '', client_ice: '', client_address: '', client_city: '', notes: '' })
    if (customer?.id)
      sb.from('customers').select('full_name, company_name, ice, address, city').eq('id', customer.id).single().then(({ data }) => {
        if (data) setForm((f) => ({ ...f, client_name: data.company_name || data.full_name, client_ice: data.ice ?? '', client_address: data.address ?? '', client_city: data.city ?? '' }))
      })
  }, [open, customer, sb])

  const submit = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('create_invoice', { p: { sale_id: saleId, customer_id: customer?.id ?? null, ...form } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setCreated(data as string)
    qc.invalidateQueries({ queryKey: ['invoices'] })
  }

  return (
    <>
      <Dialog open={open && !created} onOpenChange={(o) => !o && onClose()} size="md" title={t('فاتورة رسمية', 'Facture')} description={t('معلومات الزبون كما ستظهر في الفاتورة', 'Informations client')}>
        <div className="space-y-4">
          <Field label={t('اسم الزبون أو الشركة', 'Client / société')} required>
            <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ICE">
              <Input value={form.client_ice} onChange={(e) => setForm({ ...form, client_ice: e.target.value })} dir="ltr" className="num" />
            </Field>
            <Field label={t('المدينة', 'Ville')}>
              <Input value={form.client_city} onChange={(e) => setForm({ ...form, client_city: e.target.value })} />
            </Field>
          </div>
          <Field label={t('العنوان', 'Adresse')}>
            <Input value={form.client_address} onChange={(e) => setForm({ ...form, client_address: e.target.value })} />
          </Field>
          <Field label={t('ملاحظة (اختياري)', 'Note')}>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={form.client_name.trim().length < 2}>
            <FileText />
            {t('إنشاء الفاتورة', 'Créer la facture')}
          </Button>
        </div>
      </Dialog>
      <InvoiceViewer id={created} onClose={() => (setCreated(null), onClose())} />
    </>
  )
}

export function InvoiceViewer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const cfg = useInvoiceCfg()
  const [printing, setPrinting] = useState(false)
  const [crediting, setCrediting] = useState(false)
  const [reason, setReason] = useState('')
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => setShown(id), [id])

  const inv = useQuery({ queryKey: ['invoice', shown], enabled: !!shown, queryFn: async () => (await sb.rpc('invoice_detail', { p_id: shown })).data as InvoiceData })

  const credit = async () => {
    const { data, error } = await sb.rpc('create_credit_note', { p_invoice: shown, p_reason: reason })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم إنشاء الفاتورة المضادة', 'Avoir créé'))
    setCrediting(false)
    setReason('')
    qc.invalidateQueries({ queryKey: ['invoices'] })
    setShown(data as string)
  }

  const d = inv.data
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      size="full"
      title={d ? `${d.kind === 'credit_note' ? t('فاتورة مضادة', 'Avoir') : t('فاتورة', 'Facture')} ${d.number}` : ''}
      description={d?.status === 'credited' ? t(`أُلغيت بالفاتورة المضادة ${d.credit_note_number}`, `Annulée par l'avoir ${d.credit_note_number}`) : undefined}
      footer={
        d && (
          <>
            {d.kind === 'invoice' && d.status === 'issued' && can('pos.invoice') && (
              <Button variant="danger-soft" className="me-auto" onClick={() => setCrediting(true)}>
                <Undo2 />
                {t('إلغاء بفاتورة مضادة', 'Annuler par avoir')}
              </Button>
            )}
            <Button onClick={() => setPrinting(true)} disabled={!cfg.data}>
              <Printer />
              {t('طباعة / PDF', 'Imprimer / PDF')}
            </Button>
          </>
        )
      }
    >
      {!d || !cfg.data ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-4">
          {crediting && (
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
              <Field label={t('سبب الإلغاء', 'Motif')} className="min-w-60 flex-1">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              </Field>
              <Button variant="danger" onClick={credit} disabled={!reason.trim()}>
                {t('تأكيد', 'Confirmer')}
              </Button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl bg-white p-6 shadow-inner ring-1 ring-border">
            <div className="mx-auto w-fit">
              <InvoiceDocument inv={d} cfg={cfg.data} />
            </div>
          </div>
          {printing && (
            <PrintArea page="A4" margin="10mm" onDone={() => setPrinting(false)}>
              <InvoiceDocument inv={d} cfg={cfg.data} />
            </PrintArea>
          )}
        </div>
      )}
    </Dialog>
  )
}
