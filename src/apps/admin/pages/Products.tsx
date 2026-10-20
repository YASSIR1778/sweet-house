import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, MoreVertical, Package, Pencil, Plus, Search, SlidersHorizontal, Star, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, qty } from '@/shared/lib/money'
import type { Category, Product } from '@/shared/lib/types'
import { Badge, Button, Card, Input } from '@/shared/ui/primitives'
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, StatCard, type Column } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { ProductEditor } from './ProductEditor'
import { StockDialog } from './StockDialog'

export type ProductRow = Product & {
  categories: Pick<Category, 'id' | 'name_ar' | 'name_fr' | 'color'> | null
  product_variants: { id: string; name_ar: string | null; name_fr: string | null; price: number; stock_qty: number; barcode: string | null; deleted_at: string | null }[]
}

export function ProductsPage() {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [stockFilter, setStockFilter] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [duplicateOf, setDuplicateOf] = useState<string | null>(null)
  const [stockFor, setStockFor] = useState<ProductRow | null>(null)

  const products = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('products')
        .select('*, categories(id, name_ar, name_fr, color), product_variants(id, name_ar, name_fr, price, stock_qty, barcode, deleted_at)')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data as ProductRow[]).map((p) => ({ ...p, product_variants: p.product_variants.filter((v) => !v.deleted_at) }))
    },
  })

  const categories = useQuery({
    queryKey: ['categories-lite'],
    queryFn: async () => {
      const { data } = await sb.from('categories').select('id, name_ar, name_fr').is('deleted_at', null).order('sort')
      return data ?? []
    },
  })

  const stock = (p: ProductRow) => p.product_variants.reduce((s, v) => s + Number(v.stock_qty), 0)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (products.data ?? []).filter((p) => {
      if (cat && p.category_id !== cat) return false
      if (stockFilter === 'low' && !(p.track_stock && stock(p) <= p.low_stock_alert)) return false
      if (stockFilter === 'out' && !(p.track_stock && stock(p) <= 0)) return false
      if (stockFilter === 'online' && !p.is_online) return false
      if (!q) return true
      return (
        p.name_ar.toLowerCase().includes(q) ||
        p.name_fr.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        p.product_variants.some((v) => v.barcode?.includes(q))
      )
    })
  }, [products.data, search, cat, stockFilter])

  const stats = useMemo(() => {
    const all = products.data ?? []
    return {
      total: all.length,
      online: all.filter((p) => p.is_online).length,
      low: all.filter((p) => p.track_stock && stock(p) <= p.low_stock_alert).length,
      value: all.reduce((s, p) => s + p.product_variants.reduce((a, v) => a + v.price * Math.max(0, Number(v.stock_qty)), 0), 0),
    }
  }, [products.data])

  const toggleOnline = async (p: ProductRow) => {
    const { error } = await sb.from('products').update({ is_online: !p.is_online }).eq('id', p.id)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['products'] })
  }

  const remove = async (p: ProductRow) => {
    if (!(await confirm({ title: t(`حذف "${p.name_ar}"؟`, `Supprimer « ${p.name_fr} » ?`), description: t('سينقل المنتج إلى سلة المهملات ويمكنك استرجاعه.', 'Le produit ira à la corbeille (restauration possible).'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'products', p_id: p.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم النقل إلى سلة المهملات', 'Déplacé vers la corbeille'))
    qc.invalidateQueries({ queryKey: ['products'] })
  }

  const priceRange = (p: ProductRow) => {
    const prices = p.product_variants.map((v) => v.price)
    if (!prices.length) return '—'
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    return min === max ? money(min) : `${money(min, { currency: false })} – ${money(max)}`
  }

  const columns: Column<ProductRow>[] = [
    {
      key: 'name',
      header: t('المنتج', 'Produit'),
      sortValue: (p) => pick(p, 'name'),
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2">
            {p.images[0] ? <img src={p.images[0]} alt="" className="size-full object-cover" /> : <Package className="size-5 text-subtle" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{pick(p, 'name')}</span>
              {p.is_featured && <Star className="size-3.5 shrink-0 fill-warning text-warning" />}
            </div>
            <div className="text-xs text-muted">
              {p.brand && <span>{p.brand} · </span>}
              {p.has_variants ? t(`${p.product_variants.length} أنواع`, `${p.product_variants.length} variantes`) : <span className="num">{p.product_variants[0]?.barcode}</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'cat',
      header: t('الفئة', 'Catégorie'),
      cell: (p) =>
        p.categories ? (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <span className="size-2 rounded-full" style={{ background: p.categories.color }} />
            {pick(p.categories, 'name')}
          </span>
        ) : (
          <span className="text-subtle">—</span>
        ),
    },
    { key: 'price', header: t('السعر', 'Prix'), sortValue: (p) => p.product_variants[0]?.price ?? 0, cell: (p) => <span className="num font-semibold">{priceRange(p)}</span> },
    {
      key: 'stock',
      header: t('المخزون', 'Stock'),
      sortValue: (p) => stock(p),
      cell: (p) => {
        if (!p.track_stock) return <Badge>{t('غير متتبع', 'Non suivi')}</Badge>
        const s = stock(p)
        return (
          <button onClick={(e) => (e.stopPropagation(), can('stock.adjust') && setStockFor(p))} className="disabled:cursor-default" disabled={!can('stock.adjust')}>
            <Badge tone={s <= 0 ? 'danger' : s <= p.low_stock_alert ? 'warning' : 'success'} className="num">
              {qty(s)}
            </Badge>
          </button>
        )
      },
    },
    {
      key: 'online',
      header: t('الموقع', 'Site'),
      cell: (p) => (
        <button onClick={(e) => (e.stopPropagation(), toggleOnline(p))}>
          {p.is_online ? <Badge tone="success">{t('ظاهر', 'Visible')}</Badge> : <Badge>{t('مخفي', 'Masqué')}</Badge>}
        </button>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12',
      cell: (p) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreVertical />
              </Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem icon={<Pencil />} onSelect={() => setEditing(p.id)}>
                {t('تعديل', 'Modifier')}
              </DropdownItem>
              <DropdownItem
                icon={<Copy />}
                onSelect={() => {
                  setDuplicateOf(p.id)
                  setEditing('new')
                }}
              >
                {t('نسخ', 'Dupliquer')}
              </DropdownItem>
              {can('stock.adjust') && p.track_stock && (
                <DropdownItem icon={<SlidersHorizontal />} onSelect={() => setStockFor(p)}>
                  {t('تعديل المخزون', 'Ajuster le stock')}
                </DropdownItem>
              )}
              <DropdownItem icon={<Eye />} onSelect={() => toggleOnline(p)}>
                {p.is_online ? t('إخفاء من الموقع', 'Masquer du site') : t('إظهار في الموقع', 'Afficher sur le site')}
              </DropdownItem>
              {can('products.delete') && (
                <DropdownItem icon={<Trash />} danger onSelect={() => remove(p)}>
                  {t('حذف', 'Supprimer')}
                </DropdownItem>
              )}
            </DropdownContent>
          </Dropdown>
        </div>
      ),
    },
  ]

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<Package />}
        title={t('المنتجات', 'Produits')}
        description={t('أضف وعدّل منتجاتك، أسعارها، أنواعها ومخزونها', 'Gérez produits, prix, variantes et stock')}
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus />
            {t('منتج جديد', 'Nouveau produit')}
          </Button>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard index={0} label={t('عدد المنتجات', 'Produits')} value={stats.total} icon={<Package />} loading={products.isLoading} />
        <StatCard index={1} tone="success" label={t('ظاهرة في الموقع', 'En ligne')} value={stats.online} icon={<Eye />} loading={products.isLoading} />
        <StatCard index={2} tone="warning" label={t('مخزون منخفض', 'Stock faible')} value={stats.low} icon={<SlidersHorizontal />} loading={products.isLoading} />
        <StatCard index={3} tone="navy" label={t('قيمة المخزون (بثمن البيع)', 'Valeur du stock (prix de vente)')} value={money(stats.value)} icon={<Star />} loading={products.isLoading} />
      </div>

      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} placeholder={t('ابحث بالاسم أو العلامة أو الباركود…', 'Rechercher par nom, marque ou code-barres…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-48">
          <Select
            value={cat}
            onValueChange={setCat}
            allowEmpty
            emptyLabel={t('كل الفئات', 'Toutes les catégories')}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))}
          />
        </div>
        <div className="w-44">
          <Select
            value={stockFilter}
            onValueChange={setStockFilter}
            allowEmpty
            emptyLabel={t('كل الحالات', 'Tous')}
            options={[
              { value: 'low', label: t('مخزون منخفض', 'Stock faible') },
              { value: 'out', label: t('نفد المخزون', 'Rupture') },
              { value: 'online', label: t('ظاهر في الموقع', 'En ligne') },
            ]}
          />
        </div>
      </Card>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        loading={products.isLoading}
        onRowClick={(p) => setEditing(p.id)}
        empty={
          <EmptyState
            icon={<Package />}
            title={search || cat ? t('لا نتائج', 'Aucun résultat') : t('لا توجد منتجات بعد', 'Aucun produit')}
            description={search || cat ? undefined : t('أضف أول منتج لتبدأ البيع', 'Ajoutez votre premier produit')}
            action={
              !search && !cat ? (
                <Button onClick={() => setEditing('new')}>
                  <Plus />
                  {t('منتج جديد', 'Nouveau produit')}
                </Button>
              ) : undefined
            }
          />
        }
      />

      <ProductEditor
        id={editing}
        duplicateOf={duplicateOf}
        onClose={() => {
          setEditing(null)
          setDuplicateOf(null)
        }}
      />
      <StockDialog product={stockFor} onClose={() => setStockFor(null)} />
    </>
  )
}
