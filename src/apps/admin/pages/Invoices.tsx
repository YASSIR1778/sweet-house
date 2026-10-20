import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, FileText, Plus, Search, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import { Badge, Button, Card, Field, Input } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { DataTable, PageHeader, StatCard, Tabs, type Column } from '@/shared/ui/data'
import { MoneyInput } from '@/shared/ui/pickers'
import { InvoiceViewer } from '@/shared/ui/invoice-dialog'

type Row = { id: string; number: string; kind: 'invoice' | 'credit_note'; status: string; client_name: string; client_ice: string | null; issued_on: string; subtotal_ht: number; tax_total: number; total_ttc: number }
type Line = { description_fr: string; qty: number; unit_price_ttc: number; tax_rate: number }

export function InvoicesPage() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [tab, setTab] = useState('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [form, setForm] = useState({ client_name: '', client_ice: '', client_address: '', client_city: '', notes: '', payment_method: 'transfer' })
  const [lines, setLines] = useState<Line[]>([{ description_fr: '', qty: 1, unit_price_ttc: 0, tax_rate: 20 }])
  const [busy, setBusy] = useState(false)

  const list = useQuery({ queryKey: ['invoices'], queryFn: async () => (await sb.from('invoices').select('id, number, kind, status, client_name, client_ice, issued_on, subtotal_ht, tax_total, total_ttc').order('created_at', { ascending: false })).data as Row[] })
  const rows = useMemo(() => {
    const s = q.toLowerCase()
    return (list.data ?? []).filter((r) => (tab === 'all' || r.kind === tab) && (!s || r.number.toLowerCase().includes(s) || r.client_name.toLowerCase().includes(s) || r.client_ice?.includes(s)))
  }, [list.data, tab, q])
  const sum = (k: keyof Row) => (list.data ?? []).filter((r) => r.kind === 'invoice' && r.status === 'issued').reduce((a, r) => a + (r[k] as number), 0)

  const createManual = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('create_invoice', { p: { ...form, items: lines.filter((l) => l.description_fr.trim() && l.qty > 0) } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setManual(false)
    setLines([{ description_fr: '', qty: 1, unit_price_ttc: 0, tax_rate: 20 }])
    qc.invalidateQueries({ queryKey: ['invoices'] })
    setView(data as string)
  }

  const columns: Column<Row>[] = [
    { key: 'n', header: t('الرقم', 'N°'), sortValue: (r) => r.number, cell: (r) => <span className="num font-semibold">{r.number}</span> },
    { key: 'k', header: t('النوع', 'Type'), cell: (r) => (r.kind === 'credit_note' ? <Badge tone="danger">{t('مضادة', 'Avoir')}</Badge> : r.status === 'credited' ? <Badge tone="warning">{t('ملغاة', 'Annulée')}</Badge> : <Badge tone="success">{t('فاتورة', 'Facture')}</Badge>) },
    { key: 'c', header: t('الزبون', 'Client'), cell: (r) => (<div><div className="font-medium">{r.client_name}</div>{r.client_ice && <div className="num text-xs text-muted">ICE {r.client_ice}</div>}</div>) },
    { key: 'd', header: t('التاريخ', 'Date'), sortValue: (r) => r.issued_on, cell: (r) => <span className="num text-muted">{format(new Date(r.issued_on), 'dd/MM/yyyy')}</span> },
    { key: 'ht', header: 'HT', cell: (r) => <span className="num">{money(r.subtotal_ht)}</span> },
    { key: 'ttc', header: 'TTC', sortValue: (r) => r.total_ttc, cell: (r) => <span className="num font-bold">{money(r.total_ttc)}</span> },
  ]

  return (
    <>
      <PageHeader
        icon={<FileText />}
        title={t('الفواتير', 'Factures')}
        description={t('فواتير رسمية مرقّمة بالتسلسل. لا تُحذف، بل تُلغى بفاتورة مضادة.', 'Numérotation continue ; annulation par avoir uniquement')}
        actions={
          <>
            <Button variant="outline" onClick={() => downloadCsv(`factures-${format(new Date(), 'yyyyMMdd')}`, ['N°', 'Type', 'Statut', 'Client', 'ICE', 'Date', 'HT', 'TVA', 'TTC'], (list.data ?? []).map((r) => [r.number, r.kind, r.status, r.client_name, r.client_ice, r.issued_on, csvMoney(r.subtotal_ht), csvMoney(r.tax_total), csvMoney(r.total_ttc)]))}>
              <Download />
              Excel
            </Button>
            {can('pos.invoice') && (
              <Button onClick={() => setManual(true)}>
                <Plus />
                {t('فاتورة يدوية', 'Facture manuelle')}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard index={0} label={t('مجموع الفواتير TTC', 'Total TTC')} value={money(sum('total_ttc'))} icon={<FileText />} loading={list.isLoading} />
        <StatCard index={1} tone="navy" label={t('مجموع HT', 'Total HT')} value={money(sum('subtotal_ht'))} icon={<FileText />} loading={list.isLoading} />
        <StatCard index={2} tone="info" label={t('الضريبة على القيمة المضافة', 'TVA')} value={money(sum('tax_total'))} icon={<FileText />} loading={list.isLoading} />
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'all', label: t('الكل', 'Tout') }, { value: 'invoice', label: t('الفواتير', 'Factures') }, { value: 'credit_note', label: t('المضادة', 'Avoirs') }]} />
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('رقم، زبون، ICE…', 'N°, client, ICE…')} />
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => setView(r.id)} />
      <p className="mt-3 text-xs text-muted">{t('لإصدار فاتورة لبيع موجود: افتح المبيعات ← الوصل ← "فاتورة".', 'Pour une vente : Ventes → ticket → « Facture ».')}</p>

      <InvoiceViewer id={view} onClose={() => setView(null)} />

      <Sheet open={manual} onOpenChange={setManual} width="max-w-3xl" title={t('فاتورة يدوية', 'Facture manuelle')} footer={<Button onClick={createManual} loading={busy} disabled={form.client_name.trim().length < 2 || !lines.some((l) => l.description_fr.trim())}>{t('إنشاء الفاتورة', 'Créer')}</Button>}>
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('الزبون أو الشركة', 'Client')} required><Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} /></Field>
            <Field label="ICE"><Input value={form.client_ice} onChange={(e) => setForm({ ...form, client_ice: e.target.value })} dir="ltr" className="num" /></Field>
            <Field label={t('العنوان', 'Adresse')}><Input value={form.client_address} onChange={(e) => setForm({ ...form, client_address: e.target.value })} /></Field>
            <Field label={t('المدينة', 'Ville')}><Input value={form.client_city} onChange={(e) => setForm({ ...form, client_city: e.target.value })} /></Field>
          </div>
          <Card className="space-y-2 p-4">
            <div className="grid grid-cols-[1fr_5rem_9rem_5rem_auto] gap-2 text-xs text-muted"><span>{t('البيان (بالفرنسية)', 'Désignation')}</span><span>{t('الكمية', 'Qté')}</span><span>P.U. TTC</span><span>TVA</span><span /></div>
            {lines.map((l, i) => {
              const set = (p: Partial<Line>) => setLines(lines.map((x, j) => (j === i ? { ...x, ...p } : x)))
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_9rem_5rem_auto] items-center gap-2">
                  <Input value={l.description_fr} onChange={(e) => set({ description_fr: e.target.value })} dir="ltr" />
                  <Input type="number" min={0} value={l.qty} onChange={(e) => set({ qty: Number(e.target.value) })} className="num" />
                  <MoneyInput value={l.unit_price_ttc} onChange={(v) => set({ unit_price_ttc: v ?? 0 })} />
                  <select value={l.tax_rate} onChange={(e) => set({ tax_rate: Number(e.target.value) })} className="h-10 rounded-[10px] border border-border bg-surface px-2 text-sm">{[0, 7, 10, 14, 20].map((r) => <option key={r} value={r}>{r}%</option>)}</select>
                  <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash className="text-danger" /></Button>
                </div>
              )
            })}
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, { description_fr: '', qty: 1, unit_price_ttc: 0, tax_rate: 20 }])}><Plus />{t('سطر', 'Ligne')}</Button>
            <div className="num pt-2 text-end font-bold">{money(lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price_ttc), 0))} TTC</div>
          </Card>
          <Field label={t('طريقة الأداء', 'Règlement')}>
            <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className="h-10 w-60 rounded-[10px] border border-border bg-surface px-3 text-sm">
              <option value="transfer">Virement</option><option value="cash">Espèces</option><option value="card">Carte</option><option value="cheque">Chèque</option><option value="credit">À crédit</option>
            </select>
          </Field>
        </div>
      </Sheet>
    </>
  )
}
