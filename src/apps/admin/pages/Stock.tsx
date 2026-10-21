import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Boxes, CheckCircle2, ClipboardCheck, Plus, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { qty as fmtQty } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card, Input, Spinner } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, Tabs, type Column } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { StaleProducts } from './StaleProducts'

type Move = { id: number; qty_change: number; reason: string; note: string | null; created_at: string; name_ar: string; name_fr: string; employee_name: string | null; stock_qty: number }
type Count = { id: string; status: 'draft' | 'applied' | 'cancelled'; note: string | null; created_at: string; applied_at: string | null }
type CountItem = { id: string; name_ar: string; name_fr: string; barcode: string | null; expected_qty: number; counted_qty: number | null; current_qty: number }

const REASONS: Record<string, [string, string, 'success' | 'danger' | 'info' | 'warning' | 'neutral' | 'brand']> = {
  initial: ['مخزون أولي', 'Initial', 'neutral'],
  sale: ['بيع', 'Vente', 'danger'],
  void: ['إلغاء بيع', 'Annulation', 'info'],
  refund: ['إرجاع', 'Retour', 'info'],
  purchase: ['شراء', 'Achat', 'success'],
  adjustment: ['تعديل يدوي', 'Ajustement', 'warning'],
  inventory: ['جرد', 'Inventaire', 'brand'],
}

export function StockPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [tab, setTab] = useState('moves')
  const [openCount, setOpenCount] = useState<string | null>(null)
  const [cat, setCat] = useState<string | null>(null)

  const moves = useQuery({ queryKey: ['stock-history'], enabled: tab === 'moves', queryFn: async () => (await sb.rpc('stock_history', { p_limit: 500 })).data as Move[] })
  const counts = useQuery({ queryKey: ['inventory-counts'], queryFn: async () => (await sb.from('inventory_counts').select('*').order('created_at', { ascending: false })).data as Count[] })
  const cats = useQuery({ queryKey: ['categories-lite'], queryFn: async () => (await sb.from('categories').select('id, name_ar, name_fr').is('deleted_at', null).order('sort')).data ?? [] })

  const start = async () => {
    const { data, error } = await sb.rpc('start_inventory', { p_category: cat, p_note: null })
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['inventory-counts'] })
    setOpenCount(data as string)
  }

  const mCols: Column<Move>[] = [
    { key: 'd', header: t('التاريخ', 'Date'), cell: (m) => <span className="num text-muted">{format(new Date(m.created_at), 'dd/MM HH:mm')}</span> },
    { key: 'p', header: t('المنتج', 'Produit'), cell: (m) => <span className="font-medium">{pick(m, 'name')}</span> },
    { key: 'r', header: t('النوع', 'Type'), cell: (m) => <Badge tone={REASONS[m.reason]?.[2] ?? 'neutral'}>{t(REASONS[m.reason]?.[0] ?? m.reason, REASONS[m.reason]?.[1] ?? m.reason)}</Badge> },
    { key: 'q', header: t('الكمية', 'Qté'), cell: (m) => <span className={cn('num font-semibold', m.qty_change > 0 ? 'text-success' : 'text-danger')}>{m.qty_change > 0 ? '+' : ''}{fmtQty(m.qty_change)}</span> },
    { key: 'n', header: t('ملاحظة', 'Note'), cell: (m) => <span className="text-muted">{m.note ?? ''}</span> },
    { key: 'e', header: t('الموظف', 'Employé'), cell: (m) => m.employee_name ?? '—' },
  ]

  return (
    <>
      <PageHeader icon={<Boxes />} title={t('المخزون والجرد', 'Stock & inventaire')} description={t('كل حركة دخول وخروج، والجرد الدوري', 'Tous les mouvements et inventaires')} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: 'moves', label: t('حركات المخزون', 'Mouvements') }, { value: 'inventory', label: t('الجرد', 'Inventaires'), count: counts.data?.filter((c) => c.status === 'draft').length }, { value: 'stale', label: t('منتجات راكدة', 'Produits dormants') }]} />
      {tab === 'stale' ? (
        <StaleProducts />
      ) : tab === 'moves' ? (
        <DataTable rows={moves.data ?? []} columns={mCols} rowKey={(m) => String(m.id)} loading={moves.isLoading} pageSize={50} />
      ) : (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center gap-3 p-4">
            <ClipboardCheck className="size-6 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{t('جرد جديد', 'Nouvel inventaire')}</div>
              <div className="text-sm text-muted">{t('يُصوَّر المخزون الحالي، ثم تُدخل الكميات المعدودة وتُعتمد الفروقات', 'Saisissez les quantités comptées puis validez')}</div>
            </div>
            <div className="w-52">
              <Select value={cat} onValueChange={setCat} allowEmpty emptyLabel={t('كل المنتجات', 'Tous les produits')} options={(cats.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} />
            </div>
            <Button onClick={start}>
              <Plus />
              {t('بدء الجرد', 'Démarrer')}
            </Button>
          </Card>
          {!counts.data?.length ? (
            <Card>
              <EmptyState icon={<ClipboardCheck />} title={t('لا يوجد جرد بعد', 'Aucun inventaire')} />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {counts.data.map((c) => (
                <Card key={c.id} onClick={() => setOpenCount(c.id)} className="cursor-pointer p-4 transition-shadow hover:shadow-pop">
                  <div className="flex items-center justify-between">
                    <span className="num font-semibold">{format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}</span>
                    <Badge tone={c.status === 'applied' ? 'success' : c.status === 'draft' ? 'warning' : 'neutral'}>{c.status === 'applied' ? t('معتمد', 'Validé') : c.status === 'draft' ? t('قيد العدّ', 'En cours') : t('ملغى', 'Annulé')}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
      <InventorySheet id={openCount} onClose={() => setOpenCount(null)} />
    </>
  )
}

function InventorySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [q, setQ] = useState('')
  const [onlyDiff, setOnlyDiff] = useState(false)
  const d = useQuery({ queryKey: ['inventory', id], enabled: !!id, queryFn: async () => (await sb.rpc('inventory_detail', { p_count: id })).data as Count & { items: CountItem[] } })

  const items = useMemo(
    () => (d.data?.items ?? []).filter((i) => (!q || i.name_ar.includes(q) || i.name_fr.toLowerCase().includes(q.toLowerCase()) || i.barcode?.includes(q)) && (!onlyDiff || (i.counted_qty !== null && i.counted_qty !== i.current_qty))),
    [d.data, q, onlyDiff],
  )
  const counted = (d.data?.items ?? []).filter((i) => i.counted_qty !== null).length
  const diffs = (d.data?.items ?? []).filter((i) => i.counted_qty !== null && Number(i.counted_qty) !== Number(i.current_qty)).length

  const setCount = async (item: CountItem, v: string) => {
    const n = v === '' ? null : Number(v.replace(',', '.'))
    if (n !== null && !Number.isFinite(n)) return
    const { error } = await sb.rpc('set_inventory_count', { p_item: item.id, p_qty: n })
    if (error) return toast.error(errorMessage(error, lang))
    qc.setQueryData(['inventory', id], (old: typeof d.data) => old && { ...old, items: old.items.map((i) => (i.id === item.id ? { ...i, counted_qty: n } : i)) })
  }

  const apply = async () => {
    if (!(await confirm({ title: t('اعتماد الجرد؟', "Valider l'inventaire ?"), description: t(`سيتم تعديل مخزون ${diffs} منتج حسب الكميات المعدودة.`, `${diffs} produits seront ajustés.`) }))) return
    const { error } = await sb.rpc('apply_inventory', { p_count: id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم اعتماد الجرد ✅', 'Inventaire validé ✅'))
    qc.invalidateQueries({ queryKey: ['inventory-counts'] })
    qc.invalidateQueries({ queryKey: ['inventory', id] })
    qc.invalidateQueries({ queryKey: ['products'] })
  }

  const draft = d.data?.status === 'draft'
  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-3xl"
      title={t('الجرد', 'Inventaire')}
      description={d.data ? `${counted}/${d.data.items.length} ${t('معدود', 'comptés')} · ${diffs} ${t('فرق', 'écarts')}` : undefined}
      footer={
        draft && (
          <Button onClick={apply} disabled={!counted}>
            <CheckCircle2 />
            {t('اعتماد الجرد', 'Valider')}
          </Button>
        )
      }
    >
      {confirmNode}
      {!d.data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث أو امسح الباركود…', 'Rechercher / scanner…')} autoFocus />
            </div>
            <Button variant={onlyDiff ? 'navy' : 'outline'} onClick={() => setOnlyDiff(!onlyDiff)}>
              {t('الفروقات فقط', 'Écarts')}
            </Button>
          </div>
          <Card className="divide-y divide-border">
            {items.map((i) => {
              const diff = i.counted_qty === null ? null : Number(i.counted_qty) - Number(i.current_qty)
              return (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{pick(i, 'name')}</div>
                    <div className="num text-xs text-muted">
                      {t('في النظام', 'Système')}: {fmtQty(i.current_qty)}
                    </div>
                  </div>
                  {diff !== null && diff !== 0 && <Badge tone={diff > 0 ? 'info' : 'danger'} className="num">{diff > 0 ? '+' : ''}{fmtQty(diff)}</Badge>}
                  <Input defaultValue={i.counted_qty ?? ''} disabled={!draft} onBlur={(e) => e.target.value !== String(i.counted_qty ?? '') && setCount(i, e.target.value)} inputMode="decimal" className="num w-24 text-center" placeholder="—" />
                </div>
              )
            })}
          </Card>
        </div>
      )}
    </Sheet>
  )
}
