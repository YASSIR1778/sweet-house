import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, format, startOfDay } from 'date-fns'
import { Ban, Banknote, CreditCard, FileText, Printer, Receipt as ReceiptIcon, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { Sale } from '@/shared/lib/types'
import { useReceiptConfig } from '@/shared/lib/receipt-config'
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { DataTable, PageHeader, StatCard, Tabs, type Column } from '@/shared/ui/data'
import { PrintReceipt, Receipt } from '@/shared/ui/receipt'
import { CreateInvoiceDialog } from '@/shared/ui/invoice-dialog'

type Row = {
  id: string
  number: string
  status: 'completed' | 'voided'
  total: number
  paid_cash: number
  paid_card: number
  discount_total: number
  created_at: string
  employees: { full_name: string; color: string } | null
  customers: { full_name: string } | null
}

const RANGES = { today: 1, week: 7, month: 30, quarter: 90 } as const

export function SalesPage() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [range, setRange] = useState<keyof typeof RANGES>('today')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')
  const [printing, setPrinting] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const cfg = useReceiptConfig(sb)

  const from = useMemo(() => addDays(startOfDay(new Date()), 1 - RANGES[range]), [range])

  const sales = useQuery({
    queryKey: ['sales', range],
    queryFn: async () => {
      const { data, error } = await sb
        .from('sales')
        .select('id, number, status, total, paid_cash, paid_card, discount_total, created_at, employees!sales_employee_id_fkey(full_name, color), customers(full_name)')
        .gte('created_at', from.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      return data as unknown as Row[]
    },
  })

  const detail = useQuery({
    queryKey: ['sale', openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await sb.rpc('get_sale', { p_id: openId })
      if (error) throw error
      return data as Sale
    },
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (sales.data ?? []).filter((s) => !q || s.number.toLowerCase().includes(q) || s.customers?.full_name.toLowerCase().includes(q) || s.employees?.full_name.toLowerCase().includes(q))
  }, [sales.data, search])

  const totals = useMemo(() => {
    const ok = (sales.data ?? []).filter((s) => s.status === 'completed')
    return {
      revenue: ok.reduce((a, s) => a + s.total, 0),
      cash: ok.reduce((a, s) => a + s.paid_cash, 0),
      card: ok.reduce((a, s) => a + s.paid_card, 0),
      count: ok.length,
      voided: (sales.data ?? []).length - ok.length,
    }
  }, [sales.data])

  const doVoid = async () => {
    const { error } = await sb.rpc('void_sale', { p_id: openId, p_reason: reason })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم إلغاء البيع وإرجاع المخزون', 'Vente annulée, stock restauré'))
    setVoiding(false)
    setReason('')
    qc.invalidateQueries({ queryKey: ['sales'] })
    qc.invalidateQueries({ queryKey: ['sale', openId] })
  }

  const columns: Column<Row>[] = [
    { key: 'number', header: t('رقم الوصل', 'Ticket'), sortValue: (s) => s.number, cell: (s) => <span className="num font-semibold">{s.number}</span> },
    { key: 'date', header: t('التاريخ', 'Date'), sortValue: (s) => s.created_at, cell: (s) => <span className="num text-muted">{format(new Date(s.created_at), 'dd/MM HH:mm')}</span> },
    {
      key: 'emp',
      header: t('البائع', 'Vendeur'),
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: s.employees?.color }} />
          {s.employees?.full_name}
        </span>
      ),
    },
    { key: 'cust', header: t('الزبون', 'Client'), cell: (s) => s.customers?.full_name ?? <span className="text-subtle">—</span> },
    {
      key: 'pay',
      header: t('الأداء', 'Paiement'),
      cell: (s) => (
        <div className="flex gap-1">
          {s.paid_cash > 0 && (
            <Badge tone="success">
              <Banknote />
              {t('نقداً', 'Espèces')}
            </Badge>
          )}
          {s.paid_card > 0 && (
            <Badge tone="info">
              <CreditCard />
              {t('بطاقة', 'Carte')}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: 'total',
      header: t('المجموع', 'Total'),
      sortValue: (s) => s.total,
      cell: (s) => (
        <div className="flex items-center gap-2">
          <span className={`num font-bold ${s.status === 'voided' ? 'text-subtle line-through' : ''}`}>{money(s.total)}</span>
          {s.status === 'voided' && <Badge tone="danger">{t('ملغى', 'Annulé')}</Badge>}
        </div>
      ),
    },
  ]

  const sale = detail.data

  return (
    <>
      <PageHeader
        icon={<ReceiptIcon />}
        title={t('المبيعات', 'Ventes')}
        description={t('كل عمليات البيع مع إمكانية إعادة الطباعة والإلغاء', 'Toutes les ventes : réimpression et annulation')}
        actions={
          <Tabs
            value={range}
            onChange={(v) => setRange(v as keyof typeof RANGES)}
            items={[
              { value: 'today', label: t('اليوم', "Aujourd'hui") },
              { value: 'week', label: t('7 أيام', '7 j') },
              { value: 'month', label: t('30 يوماً', '30 j') },
              { value: 'quarter', label: t('3 أشهر', '3 mois') },
            ]}
          />
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t('رقم المعاملات', "Chiffre d'affaires")} value={money(totals.revenue)} icon={<ReceiptIcon />} loading={sales.isLoading} hint={`${totals.count} ${t('بيع', 'ventes')}`} />
        <StatCard index={1} tone="success" label={t('نقداً', 'Espèces')} value={money(totals.cash)} icon={<Banknote />} loading={sales.isLoading} />
        <StatCard index={2} tone="info" label={t('بطاقة بنكية', 'Carte')} value={money(totals.card)} icon={<CreditCard />} loading={sales.isLoading} />
        <StatCard index={3} tone="danger" label={t('مبيعات ملغاة', 'Ventes annulées')} value={totals.voided} icon={<Ban />} loading={sales.isLoading} />
      </div>
      <Card className="mb-4 p-3">
        <Input icon={<Search />} placeholder={t('ابحث برقم الوصل أو الزبون أو البائع…', 'Rechercher par ticket, client, vendeur…')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <DataTable rows={rows} columns={columns} rowKey={(s) => s.id} loading={sales.isLoading} onRowClick={(s) => setOpenId(s.id)} />

      <Dialog
        open={!!openId}
        onOpenChange={(o) => !o && (setOpenId(null), setVoiding(false))}
        title={sale ? `${t('وصل', 'Ticket')} ${sale.number}` : t('تفاصيل البيع', 'Détail de la vente')}
        size="md"
        footer={
          sale && (
            <>
              {can('pos.void') && sale.status === 'completed' && !voiding && (
                <Button variant="danger-soft" className="me-auto" onClick={() => setVoiding(true)}>
                  <Ban />
                  {t('إلغاء البيع', 'Annuler la vente')}
                </Button>
              )}
              {can('pos.invoice') && sale.status === 'completed' && (
                <Button variant="outline" onClick={() => setInvoicing(true)}>
                  <FileText />
                  {t('فاتورة', 'Facture')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setPrinting(true)} disabled={!cfg.data}>
                <Printer />
                {t('طباعة', 'Imprimer')}
              </Button>
            </>
          )
        }
      >
        {!sale || !cfg.data ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4">
            {voiding && (
              <Card className="space-y-3 border-danger/30 bg-danger/5 p-4">
                <Field label={t('سبب الإلغاء', "Motif d'annulation")} required>
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setVoiding(false)}>
                    {t('تراجع', 'Retour')}
                  </Button>
                  <Button variant="danger" size="sm" disabled={!reason.trim()} onClick={doVoid}>
                    {t('تأكيد الإلغاء', "Confirmer l'annulation")}
                  </Button>
                </div>
              </Card>
            )}
            {sale.status === 'voided' && (
              <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
                {t('ملغى', 'Annulé')}: {sale.void_reason}
              </div>
            )}
            <div className="flex justify-center rounded-xl bg-white p-4 shadow-inner ring-1 ring-border">
              <Receipt sale={sale} cfg={cfg.data} />
            </div>
          </div>
        )}
      </Dialog>
      <CreateInvoiceDialog saleId={sale?.id ?? null} customer={sale?.customer ?? null} open={invoicing} onClose={() => setInvoicing(false)} />
      {printing && sale && cfg.data && <PrintReceipt sale={sale} cfg={cfg.data} onDone={() => setPrinting(false)} />}
    </>
  )
}
