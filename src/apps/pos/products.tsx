import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Check, ScanBarcode } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, parseMoney } from '@/shared/lib/money'
import { cn, uuid } from '@/shared/lib/utils'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { findByBarcode, type Catalog, type PosProduct } from './catalog'

export type ProductDialogInit = { mode: 'sell' | 'add'; barcode?: string; name?: string; price?: number; qty?: number; tax?: number }

/**
 * Create a simple product (one variant) and return it ready for the cart. Off the online store; for staff the
 * server also marks it «للمراجعة». Without a quantity, stock is not followed (no low-stock alerts until the owner counts it).
 */
export async function createProduct(sb: SupabaseClient, f: { name: string; price: number; tax: number; category?: string | null; barcode?: string | null; cost?: number | null; stock?: number | null }): Promise<PosProduct> {
  const id = uuid()
  const vid = uuid()
  const track = f.stock != null
  const { error } = await sb.rpc('save_product', {
    p: {
      id,
      category_id: f.category ?? null,
      name_ar: f.name,
      tax_rate: f.tax,
      track_stock: track,
      is_online: false,
      variants: [{ id: vid, barcode: f.barcode ?? null, price: f.price, ...(f.cost != null ? { cost: f.cost } : {}), initial_stock: f.stock ?? 0, packs: [] }],
    },
  })
  if (error) throw error
  return {
    id,
    category_id: f.category ?? null,
    name_ar: f.name,
    name_fr: f.name,
    image: null,
    tax_rate: f.tax,
    track_stock: track,
    low_stock_alert: 5,
    has_variants: false,
    variants: [{ id: vid, name_ar: null, name_fr: null, sku: null, barcode: f.barcode ?? null, price: f.price, stock_qty: f.stock ?? 0, image_url: null, packs: [] }],
  }
}

/**
 * Add a product to the catalog from the till (or fix a simple one).
 * «sell»: an unknown barcode or a hand-typed item — saved, then put in the cart.
 * «add»: walk the shelves — scan, name, price, next.
 * New products are sold at once; the server keeps them off the online store until the owner reviews them.
 */
export function ProductDialog({ init, catalog, taxRates, defaultTax, onClose, onSell }: { init: ProductDialogInit | null; catalog: Catalog | undefined; taxRates: number[]; defaultTax: number; onClose: () => void; onSell: (p: PosProduct, qty: number) => void }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [barcode, setBarcode] = useState('')
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [stock, setStock] = useState('')
  const [cost, setCost] = useState('')
  const [tax, setTax] = useState(defaultTax)
  // an existing simple product found by its barcode: the form fixes it instead of adding
  const [editing, setEditing] = useState<{ product: PosProduct; variantId: string } | null>(null)
  const [added, setAdded] = useState<{ name: string; price: number; barcode: string | null }[]>([])
  const [busy, setBusy] = useState(false)
  const changed = useRef(false)
  const barcodeRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const mode = init?.mode ?? 'add'
  const canCost = can('products.view_cost')

  const reset = (keep: boolean) => {
    setBarcode('')
    setName('')
    setPrice('')
    setStock('')
    setCost('')
    setEditing(null)
    if (!keep) (setCat(null), setTax(init?.tax ?? defaultTax))
  }

  useEffect(() => {
    if (!init) return
    reset(false)
    setAdded([])
    changed.current = false
    setBarcode(init.barcode ?? '')
    setName(init.name ?? '')
    setPrice(init.price ? String(init.price / 100) : '')
    setTimeout(() => (init.barcode || init.mode === 'sell' ? nameRef : barcodeRef).current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init])

  const close = () => {
    if (changed.current) qc.invalidateQueries({ queryKey: ['pos-catalog'] })
    onClose()
  }

  // Enter in the barcode box: a known product opens for editing, otherwise go on to the name
  const lookup = () => {
    const code = barcode.trim()
    if (code) {
      if (added.some((a) => a.barcode === code)) return toast.info(t('أضفتِ هذا المنتج قبل قليل', 'Produit déjà ajouté à l’instant'))
      const hit = findByBarcode(catalog, code)
      if (hit) {
        if (hit.pack || hit.product.variants.length > 1 || hit.variant.packs.length) return toast.error(t('هذا الباركود لمنتج له أنواع أو علب: يُعدَّل من لوحة التحكم', 'Produit à variantes ou lots : à modifier depuis le tableau de bord'))
        setEditing({ product: hit.product, variantId: hit.variant.id })
        setName(hit.product.name_ar)
        setPrice(String(hit.variant.price / 100))
        setCat(hit.product.category_id)
        setTax(hit.product.tax_rate)
        toast.info(t('موجود في القائمة: يمكنك تعديل اسمه أو ثمنه', 'Déjà au catalogue : vous pouvez le modifier'))
      }
    }
    nameRef.current?.focus()
  }

  const cents = parseMoney(price) ?? 0
  const costCents = parseMoney(cost)
  const stockQty = stock.trim() === '' ? null : Number(stock.replace(',', '.'))
  const ok = name.trim().length >= 2 && cents > 0 && (stockQty === null || Number.isFinite(stockQty)) && (costCents === null || costCents >= 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    if (!navigator.onLine) return toast.error(t('يلزم الاتصال بالإنترنت لحفظ منتج', 'Connexion requise pour enregistrer un produit'))
    setBusy(true)
    try {
      if (editing) {
        const { error } = await sb.rpc('pos_update_product', { p_variant: editing.variantId, p_name: name.trim(), p_price: cents, p_category: cat, p_cost: canCost ? costCents : null })
        if (error) throw error
        changed.current = true
        toast.success(t(`عُدِّل: ${name.trim()}`, `Modifié : ${name.trim()}`))
        reset(true)
        barcodeRef.current?.focus()
        return
      }
      const code = barcode.trim() || null
      const product = await createProduct(sb, { name: name.trim(), price: cents, tax, category: cat, barcode: code, cost: canCost ? costCents : null, stock: stockQty })
      changed.current = true
      // without a barcode the server gives an internal code: read it back to show it
      const saved = code ?? ((await sb.from('product_variants').select('barcode').eq('id', product.variants[0].id).maybeSingle()).data?.barcode as string | null) ?? null
      product.variants[0].barcode = saved
      if (mode === 'sell') {
        onSell(product, init?.qty ?? 1)
        close()
        return
      }
      setAdded((a) => [{ name: product.name_ar, price: cents, barcode: saved }, ...a])
      toast.success(t(`أُضيف: ${product.name_ar}`, `Ajouté : ${product.name_ar}`))
      reset(true)
      barcodeRef.current?.focus()
    } catch (err) {
      toast.error(errorMessage(err, lang))
    } finally {
      setBusy(false)
    }
  }

  const title = editing ? t('تعديل منتج', 'Modifier le produit') : mode === 'add' ? t('إضافة منتجات للقائمة', 'Ajouter des produits') : t('منتج جديد', 'Nouveau produit')
  return (
    <Dialog
      open={!!init}
      onOpenChange={(o) => !o && close()}
      size="md"
      title={title}
      description={t('يُحفظ في نقطة البيع فوراً، ولا يظهر في المتجر الإلكتروني إلا بعد مراجعة المالك', 'Enregistré tout de suite à la caisse ; visible sur la boutique en ligne après vérification')}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('الباركود', 'Code-barres')} hint={editing ? undefined : t('امسحه، أو اتركه فارغاً لسلعة بلا باركود (يُعطى رمزاً داخلياً)', 'Scannez-le, ou laissez vide (code interne)')}>
          <Input
            ref={barcodeRef}
            icon={<ScanBarcode />}
            value={barcode}
            onChange={(e) => (setBarcode(e.target.value.trim()), editing && (setEditing(null), setName(''), setPrice('')))}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookup())}
            dir="ltr"
            className="num"
            disabled={mode === 'sell' && !!init?.barcode}
          />
        </Field>
        <Field label={t('الاسم', 'Désignation')} required>
          <Input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('مثلاً: دفتر 100 ورقة مربعات', 'ex : cahier 100 pages')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('ثمن البيع', 'Prix de vente')} required>
            <div className="relative">
              <Input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" dir="ltr" className="num h-12 pe-12 text-center text-xl font-bold" />
              <span className="absolute inset-y-0 end-3 flex items-center text-xs text-muted">DH</span>
            </div>
          </Field>
          {editing ? (
            <Field label={t('في المخزون', 'En stock')}>
              <div className="num flex h-12 items-center justify-center rounded-[10px] bg-surface-2 text-lg">{editing.product.track_stock ? editing.product.variants[0].stock_qty : '—'}</div>
            </Field>
          ) : (
            <Field label={t('الكمية الموجودة', 'Quantité en stock')} hint={t('اختياري', 'Facultatif')}>
              <Input value={stock} onChange={(e) => setStock(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" dir="ltr" className="num h-12 text-center text-xl" />
            </Field>
          )}
        </div>
        <div className={cn('grid gap-3', canCost && 'grid-cols-2')}>
          <Field label={t('الفئة', 'Catégorie')}>
            <Select value={cat} onValueChange={setCat} allowEmpty emptyLabel={t('بدون فئة', 'Sans catégorie')} options={(catalog?.categories ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} />
          </Field>
          {canCost && (
            <Field label={t('ثمن الشراء', 'Prix d’achat')} hint={editing ? t('اتركه فارغاً إن لم يتغير', 'Vide = inchangé') : t('اختياري', 'Facultatif')}>
              <Input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" dir="ltr" className="num" />
            </Field>
          )}
        </div>
        {!editing && (
          <Field label={t('الضريبة', 'TVA')}>
            <div className="flex gap-1.5">
              {taxRates.map((r) => (
                <button key={r} type="button" onClick={() => setTax(r)} className={cn('num flex-1 rounded-lg border py-1.5 text-sm', tax === r ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                  {r}%
                </button>
              ))}
            </div>
          </Field>
        )}
        <div className="flex gap-2">
          <Button type="submit" size="lg" className="flex-1" disabled={!ok} loading={busy}>
            <Check />
            {editing ? t('حفظ التعديل', 'Enregistrer') : mode === 'sell' ? t('حفظ وإضافة إلى السلة', 'Enregistrer et ajouter') : t('حفظ ومنتج آخر', 'Enregistrer et suivant')}
          </Button>
          {mode === 'add' && (
            <Button type="button" size="lg" variant="outline" onClick={close}>
              {t('إنهاء', 'Terminer')}
            </Button>
          )}
        </div>
        {added.length > 0 && (
          <div className="rounded-xl border border-border">
            <div className="border-b border-border px-3 py-2 text-xs text-muted">{t(`أضفتِ ${added.length} منتجاً في هذه الجلسة`, `${added.length} produits ajoutés`)}</div>
            <div className="max-h-36 divide-y divide-border overflow-y-auto">
              {added.map((a, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="num text-xs text-subtle" dir="ltr">{a.barcode}</span>
                  <span className="num font-semibold">{money(a.price)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </form>
    </Dialog>
  )
}
