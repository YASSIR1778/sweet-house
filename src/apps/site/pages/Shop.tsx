import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { motion } from 'motion/react'
import { ChevronLeft, Minus, Package, Plus, Search, ShoppingBag, SlidersHorizontal, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Input, Skeleton } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { useCart } from '../cart'
import { inStock, useShop } from '../data'
import { ProductCard } from '../components'
import { useSeo } from '../Layout'

export function ShopPage() {
  const { t, pick } = useLang()
  const shop = useShop()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [sort, setSort] = useState<'new' | 'price_asc' | 'price_desc'>('new')
  const [onlyStock, setOnlyStock] = useState(false)
  const cat = params.get('cat')
  useSeo(t('المتجر', 'Boutique'))

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    let xs = (shop.data?.products ?? []).filter((p) => (!cat || p.category_id === cat) && (!onlyStock || inStock(p)) && (!s || p.name_ar.toLowerCase().includes(s) || p.name_fr.toLowerCase().includes(s) || (p.brand ?? '').toLowerCase().includes(s)))
    const price = (p: (typeof xs)[number]) => Math.min(...p.product_variants.map((v) => v.price))
    if (sort === 'price_asc') xs = [...xs].sort((a, b) => price(a) - price(b))
    if (sort === 'price_desc') xs = [...xs].sort((a, b) => price(b) - price(a))
    return xs
  }, [shop.data, q, cat, sort, onlyStock])

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight">{t('المتجر', 'Boutique')}</h1>
        <p className="mt-2 text-muted">{t('أدوات مدرسية ومكتبية بأفضل الأسعار، مع التوصيل لكل المغرب', 'Fournitures scolaires et de bureau, livraison partout au Maroc')}</p>
      </div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث عن منتج…', 'Rechercher un produit…')} className="h-11" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="h-11 rounded-[10px] border border-border bg-surface px-3 text-sm">
          <option value="new">{t('الأحدث', 'Nouveautés')}</option>
          <option value="price_asc">{t('السعر: من الأقل', 'Prix croissant')}</option>
          <option value="price_desc">{t('السعر: من الأعلى', 'Prix décroissant')}</option>
        </select>
        <Button variant={onlyStock ? 'navy' : 'outline'} onClick={() => setOnlyStock(!onlyStock)}>
          <SlidersHorizontal />
          {t('المتوفر فقط', 'En stock')}
        </Button>
      </div>
      <div className="mb-8 flex gap-2 overflow-x-auto pb-1">
        <Chip active={!cat} onClick={() => setParams({})} label={t('الكل', 'Tout')} />
        {shop.data?.categories.map((c) => (
          <Chip key={c.id} active={cat === c.id} color={c.color} onClick={() => setParams({ cat: c.id })} label={pick(c, 'name')} icon={<DynamicIcon name={c.icon} className="size-4" />} />
        ))}
      </div>
      {shop.isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyState icon={<Package />} title={t('لا توجد منتجات', 'Aucun produit')} description={q ? t('جرّب كلمة بحث أخرى', 'Essayez un autre mot') : t('سنضيف منتجاتنا قريباً', 'Bientôt disponible')} />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {list.map((p, i) => (
            <ProductCard key={p.id} p={p} index={i} />
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({ active, onClick, label, icon, color }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode; color?: string }) {
  return (
    <button onClick={onClick} className={cn('flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all', active ? 'border-transparent text-white shadow-md' : 'border-border bg-surface text-muted hover:text-text')} style={active ? { background: color ?? '#0F172A' } : undefined}>
      {icon}
      {label}
    </button>
  )
}

export function ProductPage() {
  const { id } = useParams()
  const { t, pick } = useLang()
  const shop = useShop()
  const cart = useCart()
  const p = shop.data?.products.find((x) => x.id === id)
  const [vid, setVid] = useState<string | null>(null)
  const [img, setImg] = useState(0)
  const [qty, setQty] = useState(1)
  useSeo(p ? pick(p, 'name') : undefined)

  if (shop.isLoading) return <div className="mx-auto max-w-6xl px-4 py-10"><Skeleton className="h-[480px]" /></div>
  if (!p) return <EmptyState className="py-32" icon={<Package />} title={t('المنتج غير موجود', 'Produit introuvable')} action={<Button asChild><Link to="/shop">{t('العودة للمتجر', 'Retour')}</Link></Button>} />

  const v = p.product_variants.find((x) => x.id === vid) ?? p.product_variants[0]
  const images = [...p.images, ...p.product_variants.map((x) => x.image_url).filter(Boolean)] as string[]
  const available = inStock(p, v)
  const max = p.track_stock ? Number(v.stock_qty) : null
  const related = (shop.data?.products ?? []).filter((x) => x.category_id === p.category_id && x.id !== p.id).slice(0, 4)

  const add = () => {
    cart.add({ variant_id: v.id, product_id: p.id, name_ar: p.name_ar + (v.name_ar ? ` - ${v.name_ar}` : ''), name_fr: p.name_fr + (v.name_fr ? ` - ${v.name_fr}` : ''), image: v.image_url ?? images[0] ?? null, price: v.price, qty, max })
    toast.success(t('أُضيف إلى السلة 🛍️', 'Ajouté au panier 🛍️'))
    cart.setOpen(true)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-sm text-muted">
        <Link to="/shop" className="hover:text-brand">
          {t('المتجر', 'Boutique')}
        </Link>
        <ChevronLeft className="size-4 ltr:rotate-180" />
        <span className="truncate text-text">{pick(p, 'name')}</span>
      </nav>
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          <motion.div key={img} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className="aspect-square overflow-hidden rounded-3xl border border-border bg-surface-2">
            {images[img] ? <img src={images[img]} alt="" className="size-full object-cover" /> : <Package className="m-auto size-24 h-full text-subtle/40" />}
          </motion.div>
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((src, i) => (
                <button key={src + i} onClick={() => setImg(i)} className={cn('size-20 overflow-hidden rounded-xl border-2', i === img ? 'border-brand' : 'border-transparent opacity-70')}>
                  <img src={src} alt="" className="size-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          {p.brand && <div className="text-sm font-medium text-muted">{p.brand}</div>}
          <h1 className="mt-1 text-3xl font-extrabold">{pick(p, 'name')}</h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="num text-4xl font-extrabold text-brand">{money(v.price)}</span>
            {v.compare_at_price && v.compare_at_price > v.price && <span className="num text-lg text-subtle line-through">{money(v.compare_at_price)}</span>}
          </div>
          <div className="mt-3">{available ? <Badge tone="success">{t('متوفر', 'En stock')}</Badge> : <Badge tone="danger">{t('غير متوفر حالياً', 'Indisponible')}</Badge>}</div>
          {p.product_variants.length > 1 && (
            <div className="mt-6">
              <div className="mb-2 text-sm font-semibold">{t('اختر النوع', 'Variante')}</div>
              <div className="flex flex-wrap gap-2">
                {p.product_variants.map((x) => (
                  <button key={x.id} onClick={() => (setVid(x.id), setQty(1))} disabled={!inStock(p, x)} className={cn('rounded-xl border-2 px-4 py-2 text-sm font-medium transition-all disabled:opacity-40', x.id === v.id ? 'border-brand bg-brand-50 text-brand' : 'border-border hover:border-brand/40')}>
                    {pick(x, 'name') || '—'}
                  </button>
                ))}
              </div>
            </div>
          )}
          {pick(p, 'description') && <p className="mt-6 leading-relaxed whitespace-pre-line text-muted">{pick(p, 'description')}</p>}
          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-12 items-center rounded-xl border border-border" dir="ltr">
              <button className="flex size-12 items-center justify-center" onClick={() => setQty(Math.max(1, qty - 1))}>
                <Minus className="size-4" />
              </button>
              <span className="num w-10 text-center font-semibold">{qty}</span>
              <button className="flex size-12 items-center justify-center" onClick={() => setQty(max === null ? qty + 1 : Math.min(max, qty + 1))}>
                <Plus className="size-4" />
              </button>
            </div>
            <Button size="lg" className="flex-1" disabled={!available} onClick={add}>
              <ShoppingBag />
              {t('أضف إلى السلة', 'Ajouter au panier')}
            </Button>
          </div>
          <div className="mt-6 flex items-center gap-3 rounded-2xl bg-surface-2 p-4 text-sm">
            <Truck className="size-5 text-brand" />
            {t('توصيل لكل المغرب أو استلام من المحل بتطوان', 'Livraison au Maroc ou retrait à Tétouan')}
          </div>
        </div>
      </div>
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 text-2xl font-bold">{t('منتجات مشابهة', 'Produits similaires')}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r, i) => (
              <ProductCard key={r.id} p={r} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
