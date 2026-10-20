import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { HandCoins, Package, Plus, Search, Trash, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card, Field, Input, Spinner, Textarea } from '@/shared/ui/primitives'
import { Dialog, Sheet } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, StatCard, Tabs, type Column } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { MoneyInput } from '@/shared/ui/pickers'

type Supplier = { id: string; name: string; phone: string | null; balance: number; purchases_count: number }
type Purchase = { id: string; number: string; purchased_on: string; total: number; invoice_ref: string | null; suppliers: { name: string } | null }
type VariantOpt = { id: string; label: string; cost: number; stock: number }
type Line = { variant_id: string; label: string; qty: number; unit_cost: number }

export function PurchasesPage() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [tab, setTab] = useState('purchases')
  const [newOpen, setNewOpen] = useState(false)
  const [supplierEdit, setSupplierEdit] = useState<{ id?: string; name: string; phone: string; ice: string; notes: string } | null>(null)
  const [statement, setStatement] = useState<Supplier | null>(null)
  const [viewPurchase, setViewPurchase] = useState<string | null>(null)

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await sb.from('supplier_balances').select('*').order('name')).data as Supplier[] })
  const purchases = useQuery({
    queryKey: ['purchases'],
    queryFn: async () => (await sb.from('purchases').select('id, number, purchased_on, total, invoice_ref, suppliers(name)').order('created_at', { ascending: false }).limit(500)).data as unknown as Purchase[],
  })

  const owed = (suppliers.data ?? []).reduce((a, s) => a + Math.max(0, s.balance), 0)
  const month = (purchases.data ?? []).filter((p) => p.purchased_on >= format(new Date(), 'yyyy-MM-01')).reduce((a, p) => a + p.total, 0)

  const saveSupplier = async () => {
    if (!supplierEdit?.name.trim()) return
    const row = { name: supplierEdit.name, phone: supplierEdit.phone || null, ice: supplierEdit.ice || null, notes: supplierEdit.notes || null }
    const { error } = supplierEdit.id ? await sb.from('suppliers').update(row).eq('id', supplierEdit.id) : await sb.from('suppliers').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    setSupplierEdit(null)
    qc.invalidateQueries({ queryKey: ['suppliers'] })
  }

  const pCols: Column<Purchase>[] = [
    { key: 'n', header: t('الرقم', 'N°'), cell: (p) => <span className="num font-semibold">{p.number}</span> },
    { key: 'd', header: t('التاريخ', 'Date'), sortValue: (p) => p.purchased_on, cell: (p) => <span className="num text-muted">{format(new Date(p.purchased_on), 'dd/MM/yyyy')}</span> },
    { key: 's', header: t('المورد', 'Fournisseur'), cell: (p) => p.suppliers?.name ?? '—' },
    { key: 'r', header: t('مرجع الفاتورة', 'Réf. facture'), cell: (p) => <span className="num">{p.invoice_ref ?? '—'}</span> },
    { key: 't', header: t('المجموع', 'Total'), sortValue: (p) => p.total, cell: (p) => <span className="num font-bold">{money(p.total)}</span> },
  ]
  const sCols: Column<Supplier>[] = [
    { key: 'n', header: t('المورد', 'Fournisseur'), sortValue: (s) => s.name, cell: (s) => <span className="font-medium">{s.name}</span> },
    { key: 'p', header: t('الهاتف', 'Téléphone'), cell: (s) => <span className="num" dir="ltr">{s.phone ?? '—'}</span> },
    { key: 'c', header: t('المشتريات', 'Achats'), cell: (s) => <span className="num">{s.purchases_count}</span> },
    { key: 'b', header: t('ما عليك له', 'Vous devez'), sortValue: (s) => s.balance, cell: (s) => (s.balance > 0 ? <Badge tone="danger" className="num">{money(s.balance)}</Badge> : <Badge tone="success">{t('مسدّد', 'Soldé')}</Badge>) },
  ]

  return (
    <>
      <PageHeader
        icon={<Truck />}
        title={t('المشتريات والموردون', 'Achats & fournisseurs')}
        description={t('سجّل مشترياتك فيزيد المخزون ويتحدث ثمن الشراء تلقائياً', 'Les achats mettent à jour le stock et le coût')}
        actions={
          <>
            <Button variant="outline" onClick={() => setSupplierEdit({ name: '', phone: '', ice: '', notes: '' })}>
              <Plus />
              {t('مورد جديد', 'Fournisseur')}
            </Button>
            {can('purchases.manage') && (
              <Button onClick={() => setNewOpen(true)}>
                <Plus />
                {t('فاتورة شراء', 'Nouvel achat')}
              </Button>
            )}
          </>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard index={0} tone="danger" label={t('ما عليك للموردين', 'Dû aux fournisseurs')} value={money(owed)} icon={<HandCoins />} loading={suppliers.isLoading} />
        <StatCard index={1} label={t('مشتريات هذا الشهر', 'Achats du mois')} value={money(month)} icon={<Package />} loading={purchases.isLoading} />
        <StatCard index={2} tone="navy" label={t('عدد الموردين', 'Fournisseurs')} value={suppliers.data?.length ?? 0} icon={<Truck />} loading={suppliers.isLoading} />
      </div>
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: 'purchases', label: t('فواتير الشراء', 'Achats') }, { value: 'suppliers', label: t('الموردون', 'Fournisseurs') }]} />
      {tab === 'purchases' ? (
        <DataTable rows={purchases.data ?? []} columns={pCols} rowKey={(p) => p.id} loading={purchases.isLoading} onRowClick={(p) => setViewPurchase(p.id)} empty={<EmptyState icon={<Truck />} title={t('لا توجد مشتريات بعد', 'Aucun achat')} />} />
      ) : (
        <DataTable rows={suppliers.data ?? []} columns={sCols} rowKey={(s) => s.id} loading={suppliers.isLoading} onRowClick={setStatement} />
      )}

      <NewPurchaseSheet open={newOpen} onClose={() => setNewOpen(false)} suppliers={suppliers.data ?? []} />
      <SupplierStatement supplier={statement} onClose={() => setStatement(null)} onEdit={(s) => setSupplierEdit({ id: s.id, name: s.name, phone: s.phone ?? '', ice: '', notes: '' })} />
      <PurchaseView id={viewPurchase} onClose={() => setViewPurchase(null)} />

      <Dialog open={!!supplierEdit} onOpenChange={(o) => !o && setSupplierEdit(null)} size="sm" title={supplierEdit?.id ? t('تعديل المورد', 'Modifier') : t('مورد جديد', 'Nouveau fournisseur')}>
        {supplierEdit && (
          <div className="space-y-4">
            <Field label={t('الاسم', 'Nom')} required>
              <Input value={supplierEdit.name} onChange={(e) => setSupplierEdit({ ...supplierEdit, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t('الهاتف', 'Téléphone')}>
              <Input value={supplierEdit.phone} onChange={(e) => setSupplierEdit({ ...supplierEdit, phone: e.target.value })} dir="ltr" />
            </Field>
            <Field label="ICE">
              <Input value={supplierEdit.ice} onChange={(e) => setSupplierEdit({ ...supplierEdit, ice: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t('ملاحظات', 'Notes')}>
              <Textarea value={supplierEdit.notes} onChange={(e) => setSupplierEdit({ ...supplierEdit, notes: e.target.value })} />
            </Field>
            <Button className="w-full" onClick={saveSupplier} disabled={!supplierEdit.name.trim()}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}

function NewPurchaseSheet({ open, onClose, suppliers }: { open: boolean; onClose: () => void; suppliers: Supplier[] }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [supplier, setSupplier] = useState<string | null>(null)
  const [ref, setRef] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [lines, setLines] = useState<Line[]>([])
  const [q, setQ] = useState('')
  const [pay, setPay] = useState<number | null>(null)
  const [method, setMethod] = useState<'bank' | 'owner'>('bank')
  const [busy, setBusy] = useState(false)

  const variants = useQuery({
    queryKey: ['variant-options'],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb.from('product_variants').select('id, name_ar, stock_qty, products!inner(name_ar, deleted_at)').is('deleted_at', null).is('products.deleted_at', null)
      const { data: costs } = await sb.from('product_costs').select('variant_id, cost')
      const cm = Object.fromEntries((costs ?? []).map((c) => [c.variant_id, c.cost]))
      return ((data ?? []) as unknown as { id: string; name_ar: string | null; stock_qty: number; products: { name_ar: string } }[]).map(
        (v) => ({ id: v.id, label: v.products.name_ar + (v.name_ar ? ` - ${v.name_ar}` : ''), cost: cm[v.id] ?? 0, stock: Number(v.stock_qty) }) as VariantOpt,
      )
    },
  })
  const matches = useMemo(() => (q.trim() ? (variants.data ?? []).filter((v) => v.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []), [q, variants.data])
  const total = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_cost), 0)

  const submit = async () => {
    if (!lines.length) return
    setBusy(true)
    const { error } = await sb.rpc('create_purchase', {
      p: { supplier_id: supplier, invoice_ref: ref || null, purchased_on: date, items: lines.map(({ variant_id, qty, unit_cost }) => ({ variant_id, qty, unit_cost })), payment: pay ? { amount: pay, method } : null },
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تسجيل الشراء وتحديث المخزون ✅', 'Achat enregistré, stock mis à jour ✅'))
    setLines([])
    setRef('')
    setPay(null)
    qc.invalidateQueries({ queryKey: ['purchases'] })
    qc.invalidateQueries({ queryKey: ['suppliers'] })
    qc.invalidateQueries({ queryKey: ['products'] })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-3xl"
      title={t('فاتورة شراء جديدة', 'Nouvel achat')}
      footer={
        <>
          <div className="num me-auto text-lg font-bold">{money(total)}</div>
          <Button variant="outline" onClick={onClose}>
            {t('إلغاء', 'Annuler')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!lines.length}>
            {t('تسجيل الشراء', 'Enregistrer')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('المورد', 'Fournisseur')}>
            <Select value={supplier} onValueChange={setSupplier} allowEmpty emptyLabel={t('بدون مورد', 'Sans fournisseur')} options={suppliers.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label={t('مرجع الفاتورة', 'Réf. facture')}>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" />
          </Field>
          <Field label={t('التاريخ', 'Date')}>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
          </Field>
        </div>
        <div className="relative">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث عن منتج لإضافته…', 'Rechercher un produit…')} />
          {matches.length > 0 && (
            <div className="absolute inset-x-0 top-11 z-10 rounded-xl border border-border bg-surface p-1 shadow-pop">
              {matches.map((v) => (
                <button
                  key={v.id}
                  onClick={() => (setLines([...lines.filter((l) => l.variant_id !== v.id), { variant_id: v.id, label: v.label, qty: 1, unit_cost: v.cost }]), setQ(''))}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-start text-sm hover:bg-surface-2"
                >
                  <span>{v.label}</span>
                  <span className="num text-xs text-muted">
                    {t('المخزون', 'Stock')}: {v.stock}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {!lines.length ? (
          <EmptyState icon={<Package />} title={t('أضف المنتجات المشتراة', 'Ajoutez les produits achetés')} />
        ) : (
          <Card className="divide-y divide-border">
            {lines.map((l, i) => (
              <div key={l.variant_id} className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_6rem_9rem_7rem_auto]">
                <span className="text-sm font-medium">{l.label}</span>
                <Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: Number(e.target.value) } : x)))} className="num" />
                <MoneyInput value={l.unit_cost} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unit_cost: v ?? 0 } : x)))} />
                <span className="num text-end font-semibold">{money(Math.round(l.qty * l.unit_cost))}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                  <Trash className="text-danger" />
                </Button>
              </div>
            ))}
          </Card>
        )}
        {supplier && (
          <Card className="space-y-3 p-4">
            <div className="text-sm font-semibold">{t('دفعة الآن (اختياري)', 'Paiement immédiat (optionnel)')}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <MoneyInput value={pay} onChange={setPay} />
              <Select value={method} onValueChange={(v) => setMethod((v ?? 'bank') as 'bank' | 'owner')} options={[{ value: 'bank', label: t('من البنك', 'Banque') }, { value: 'owner', label: t('من المالك', 'Propriétaire') }]} />
            </div>
            <p className="text-xs text-muted">{t('الباقي يُسجَّل ديناً للمورد. الدفع من الدرج يتم من نقطة البيع.', 'Le reste est dû au fournisseur.')}</p>
          </Card>
        )}
      </div>
    </Sheet>
  )
}

function SupplierStatement({ supplier, onClose, onEdit }: { supplier: Supplier | null; onClose: () => void; onEdit: (s: Supplier) => void }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [pay, setPay] = useState<number | null>(null)
  const [method, setMethod] = useState<'bank' | 'owner'>('bank')
  const st = useQuery({
    queryKey: ['supplier-statement', supplier?.id],
    enabled: !!supplier,
    queryFn: async () => (await sb.rpc('supplier_statement', { p_supplier: supplier!.id })).data as { balance: number; entries: { id: string; type: string; amount: number; method: string | null; note: string | null; created_at: string; purchase_number: string | null }[] },
  })
  const doPay = async () => {
    if (!supplier || !pay) return
    const { error } = await sb.rpc('pay_supplier', { p_supplier: supplier.id, p_amount: pay, p_method: method, p_device: null, p_note: null })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تسجيل الدفعة', 'Paiement enregistré'))
    setPay(null)
    qc.invalidateQueries({ queryKey: ['supplier-statement', supplier.id] })
    qc.invalidateQueries({ queryKey: ['suppliers'] })
  }
  return (
    <Sheet open={!!supplier} onOpenChange={(o) => !o && onClose()} title={supplier?.name ?? ''} description={t('كشف حساب المورد', 'Relevé fournisseur')} width="max-w-xl">
      {!st.data ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className={cn('rounded-2xl p-5 text-center', st.data.balance > 0 ? 'bg-danger/10' : 'bg-success/10')}>
            <div className="text-sm text-muted">{t('ما عليك له', 'Vous devez')}</div>
            <div className="num text-3xl font-extrabold">{money(st.data.balance)}</div>
          </div>
          {can('suppliers.pay') && st.data.balance > 0 && (
            <Card className="flex flex-wrap items-end gap-3 p-4">
              <Field label={t('دفعة', 'Paiement')} className="flex-1">
                <MoneyInput value={pay} onChange={setPay} />
              </Field>
              <div className="w-36">
                <Select value={method} onValueChange={(v) => setMethod((v ?? 'bank') as 'bank' | 'owner')} options={[{ value: 'bank', label: t('البنك', 'Banque') }, { value: 'owner', label: t('المالك', 'Propriétaire') }]} />
              </div>
              <Button onClick={doPay} disabled={!pay}>
                {t('تسجيل', 'Enregistrer')}
              </Button>
            </Card>
          )}
          <Card className="divide-y divide-border">
            {st.data.entries.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <Badge tone={e.amount > 0 ? 'danger' : 'success'}>{e.type === 'purchase' ? t('شراء', 'Achat') : e.type === 'payment' ? t('دفعة', 'Paiement') : t('تعديل', 'Ajustement')}</Badge>
                <span className="num flex-1 text-muted">{e.purchase_number ?? e.note ?? ''}</span>
                <span className="num text-xs text-subtle">{format(new Date(e.created_at), 'dd/MM/yyyy')}</span>
                <span className="num font-semibold">{money(e.amount)}</span>
              </div>
            ))}
          </Card>
          <Button variant="outline" onClick={() => supplier && onEdit(supplier)}>
            {t('تعديل معلومات المورد', 'Modifier le fournisseur')}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

function PurchaseView({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const p = useQuery({
    queryKey: ['purchase', id],
    enabled: !!id,
    queryFn: async () => (await sb.rpc('get_purchase', { p_id: id })).data as { number: string; total: number; supplier_name: string | null; purchased_on: string; items: { name_ar: string; name_fr: string; qty: number; unit_cost: number; total: number }[] },
  })
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()} title={p.data?.number ?? ''} description={p.data?.supplier_name ?? undefined}>
      {p.data && (
        <div className="space-y-3">
          {p.data.items.map((i, k) => (
            <div key={k} className="flex justify-between text-sm">
              <span>
                {pick(i, 'name')} <span className="num text-muted">× {i.qty}</span>
              </span>
              <span className="num">{money(i.total)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-3 font-bold">
            <span>{t('المجموع', 'Total')}</span>
            <span className="num">{money(p.data.total)}</span>
          </div>
        </div>
      )}
    </Dialog>
  )
}
