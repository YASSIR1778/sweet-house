import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { motion } from 'motion/react'
import { ArrowLeft, Clock, Package, ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import type { Service } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Badge } from '@/shared/ui/primitives'
import { DynamicIcon } from '@/shared/ui/icon'
import { useCart } from './cart'
import { inStock, type ShopProduct } from './data'

export function SectionTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-2 text-sm font-semibold text-brand">{eyebrow}</div>}
        <h2 className="text-3xl font-extrabold tracking-tight md:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-2xl text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function ProductCard({ p, index = 0 }: { p: ShopProduct; index?: number }) {
  const { t, pick } = useLang()
  const cart = useCart()
  const v = p.product_variants[0]
  const multi = p.product_variants.length > 1
  const min = Math.min(...p.product_variants.map((x) => x.price))
  const available = inStock(p)
  const img = p.images[0] ?? v.image_url

  const quickAdd = (e: React.MouseEvent) => {
    if (multi) return
    e.preventDefault()
    cart.add({ variant_id: v.id, product_id: p.id, name_ar: p.name_ar, name_fr: p.name_fr, image: img, price: v.price, qty: 1, max: p.track_stock ? Number(v.stock_qty) : null })
    toast.success(t('أُضيف إلى السلة 🛍️', 'Ajouté au panier 🛍️'), { action: { label: t('السلة', 'Panier'), onClick: () => cart.setOpen(true) } })
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }} transition={{ delay: Math.min(index, 8) * 0.04, duration: 0.4 }}>
      <Link to={`/shop/${p.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:shadow-pop">
        <div className="relative aspect-square overflow-hidden bg-surface-2">
          {img ? <img src={img} alt={pick(p, 'name')} loading="lazy" className="size-full object-cover transition-transform duration-700 group-hover:scale-105" /> : <Package className="absolute inset-0 m-auto size-12 text-subtle/50" />}
          <div className="absolute start-3 top-3 flex flex-col gap-1.5">
            {!available && <Badge tone="danger">{t('نفد', 'Épuisé')}</Badge>}
            {v.compare_at_price && v.compare_at_price > v.price && <Badge tone="brand">-{Math.round(((v.compare_at_price - v.price) / v.compare_at_price) * 100)}%</Badge>}
          </div>
          {available && (
            <button onClick={quickAdd} className="absolute end-3 bottom-3 flex size-11 translate-y-3 items-center justify-center rounded-full bg-brand text-white opacity-0 shadow-lg shadow-brand/30 transition-all group-hover:translate-y-0 group-hover:opacity-100" aria-label="add">
              {multi ? <ArrowLeft className="size-5 ltr:rotate-180" /> : <ShoppingBag className="size-5" />}
            </button>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1 p-4">
          {p.brand && <div className="text-xs text-muted">{p.brand}</div>}
          <div className="line-clamp-2 leading-snug font-medium">{pick(p, 'name')}</div>
          <div className="mt-auto flex items-baseline gap-2 pt-2">
            <span className="num text-lg font-bold text-brand">
              {multi && <span className="text-xs font-normal text-muted">{t('من ', 'dès ')}</span>}
              {money(min)}
            </span>
            {v.compare_at_price && v.compare_at_price > v.price && <span className="num text-sm text-subtle line-through">{money(v.compare_at_price)}</span>}
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

export function ServiceCard({ s, color, index = 0, to }: { s: Service; color?: string; index?: number; to?: string }) {
  const { t, pick } = useLang()
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: Math.min(index, 8) * 0.03 }}>
      <Link to={to ?? `/services/${s.id}`} className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-all hover:-translate-y-1 hover:border-brand/40 hover:shadow-pop">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl text-white transition-transform group-hover:scale-110" style={{ background: color ?? '#FF6B35' }}>
            <DynamicIcon name={s.icon} className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="leading-snug font-semibold">{pick(s, 'name')}</div>
            {pick(s, 'description') && <p className="mt-1 line-clamp-2 text-sm text-muted">{pick(s, 'description')}</p>}
          </div>
        </div>
        <div className="mt-auto flex items-center gap-2 pt-4 text-sm">
          {s.duration_ar && (
            <span className="flex items-center gap-1 text-muted">
              <Clock className="size-3.5" />
              {pick(s, 'duration')}
            </span>
          )}
          <span className={cn('num ms-auto font-bold', s.price ? 'text-brand' : 'text-muted')}>{s.price ? money(s.price) + (s.unit_ar ? ` / ${pick(s, 'unit')}` : '') : t('السعر عند التواصل', 'Sur devis')}</span>
          <ArrowLeft className="size-4 text-subtle transition-transform group-hover:text-brand ltr:rotate-180" />
        </div>
      </Link>
    </motion.div>
  )
}
