import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Barcode, Boxes, ImagePlus, Layers, Package, Plus, Trash, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { Pack, Variant } from '@/shared/lib/types'
import { Badge, Button, Card, Field, Input, Spinner, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { MoneyInput } from '@/shared/ui/pickers'
import { ImageInput } from '@/shared/ui/media'
import { Tabs } from '@/shared/ui/data'

type Form = {
  id?: string
  category_id: string | null
  name_ar: string
  name_fr: string
  description_ar: string
  description_fr: string
  brand: string
  images: string[]
  tax_rate: number
  track_stock: boolean
  low_stock_alert: number
  is_online: boolean
  is_featured: boolean
  variants: Variant[]
}

const blankVariant = (): Variant => ({ name_ar: '', name_fr: '', sku: '', barcode: '', price: 0, cost: 0, initial_stock: 0, packs: [] })

const blank = (): Form => ({
  category_id: null,
  name_ar: '',
  name_fr: '',
  description_ar: '',
  description_fr: '',
  brand: '',
  images: [],
  tax_rate: 20,
  track_stock: true,
  low_stock_alert: 5,
  is_online: false,
  is_featured: false,
  variants: [blankVariant()],
})

export function ProductEditor({ id, duplicateOf, onClose }: { id: string | 'new' | null; duplicateOf?: string | null; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [form, setForm] = useState<Form>(blank)
  const [tab, setTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const canCost = can('products.view_cost')
  const loadId = id === 'new' ? duplicateOf : id

  const categories = useQuery({
    queryKey: ['categories-lite'],
    queryFn: async () => (await sb.from('categories').select('id, name_ar, name_fr').is('deleted_at', null).order('sort')).data ?? [],
  })
  const legal = useQuery({
    queryKey: ['settings', 'legal'],
    queryFn: async () => (await sb.from('settings').select('value').eq('key', 'legal').single()).data?.value as { tax_rates: number[]; default_tax_rate: number },
  })

  const existing = useQuery({
    queryKey: ['product-edit', loadId],
    enabled: !!loadId,
    gcTime: 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from('products')
        .select('*, product_variants(*, product_packs(*))')
        .eq('id', loadId!)
        .single()
      if (error) throw error
      let costs: Record<string, number> = {}
      if (canCost) {
        const ids = data.product_variants.map((v: { id: string }) => v.id)
        const { data: c } = await sb.from('product_costs').select('variant_id, cost').in('variant_id', ids)
        costs = Object.fromEntries((c ?? []).map((r) => [r.variant_id, r.cost]))
      }
      return { data, costs }
    },
  })

  useEffect(() => {
    if (!id) return
    setTab('general')
    if (!loadId) {
      setForm({ ...blank(), tax_rate: legal.data?.default_tax_rate ?? 20 })
      return
    }
    const d = existing.data?.data
    if (!d) return
    const isDup = id === 'new'
    type V = Variant & { id: string; deleted_at: string | null; sort: number; product_packs: (Pack & { deleted_at: string | null; sort: number })[] }
    setForm({
      id: isDup ? undefined : d.id,
      category_id: d.category_id,
      name_ar: isDup ? `${d.name_ar} (نسخة)` : d.name_ar,
      name_fr: isDup ? `${d.name_fr} (copie)` : d.name_fr,
      description_ar: d.description_ar ?? '',
      description_fr: d.description_fr ?? '',
      brand: d.brand ?? '',
      images: d.images ?? [],
      tax_rate: Number(d.tax_rate),
      track_stock: d.track_stock,
      low_stock_alert: Number(d.low_stock_alert),
      is_online: d.is_online,
      is_featured: d.is_featured,
      variants: (d.product_variants as V[])
        .filter((v) => !v.deleted_at)
        .sort((a, b) => a.sort - b.sort)
        .map((v) => ({
          id: isDup ? undefined : v.id,
          name_ar: v.name_ar ?? '',
          name_fr: v.name_fr ?? '',
          sku: v.sku ?? '',
          barcode: isDup ? '' : (v.barcode ?? ''),
          price: v.price,
          compare_at_price: v.compare_at_price,
          stock_qty: Number(v.stock_qty),
          cost: existing.data?.costs[v.id] ?? 0,
          initial_stock: 0,
          packs: v.product_packs
            .filter((k) => !k.deleted_at)
            .sort((a, b) => a.sort - b.sort)
            .map((k) => ({ id: isDup ? undefined : k.id, name_ar: k.name_ar, name_fr: k.name_fr, factor: Number(k.factor), barcode: isDup ? '' : k.barcode, price: k.price })),
        })),
    })
  }, [id, loadId, existing.data, legal.data])

  const multi = form.variants.length > 1
  const setV = (i: number, patch: Partial<Variant>) => setForm((f) => ({ ...f, variants: f.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }))
  const setPack = (vi: number, pi: number, patch: Partial<Pack>) =>
    setV(vi, { packs: form.variants[vi].packs.map((p, j) => (j === pi ? { ...p, ...patch } : p)) })

  const save = async () => {
    if (!form.name_ar.trim()) {
      setTab('general')
      return toast.error(t('اسم المنتج مطلوب', 'Le nom est obligatoire'))
    }
    if (multi && form.variants.some((v) => !v.name_ar?.trim())) {
      setTab('variants')
      return toast.error(t('أعط اسماً لكل نوع (مثلاً: أزرق، أحمر)', 'Nommez chaque variante'))
    }
    setSaving(true)
    const payload = {
      ...form,
      variants: form.variants.map((v) => ({
        ...v,
        ...(canCost ? {} : { cost: undefined }),
        packs: v.packs.filter((p) => p.name_ar.trim() && p.factor > 0),
      })),
    }
    if (!canCost) payload.variants.forEach((v) => delete (v as Partial<Variant>).cost)
    const { error } = await sb.rpc('save_product', { p: payload })
    setSaving(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(form.id ? t('تم حفظ التعديلات', 'Modifications enregistrées') : t('تمت إضافة المنتج 🎉', 'Produit ajouté 🎉'))
    qc.invalidateQueries({ queryKey: ['products'] })
    onClose()
  }

  const margin = (v: Variant) => (v.price > 0 && (v.cost ?? 0) > 0 ? ((v.price - (v.cost ?? 0)) / v.price) * 100 : null)
  const loading = !!loadId && existing.isLoading

  return (
    <Sheet
      open={!!id}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-3xl"
      title={form.id ? t('تعديل المنتج', 'Modifier le produit') : t('منتج جديد', 'Nouveau produit')}
      description={form.id ? pick(form as unknown as Record<string, unknown>, 'name') : t('املأ المعلومات ثم احفظ', 'Remplissez puis enregistrez')}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('إلغاء', 'Annuler')}
          </Button>
          <Button onClick={save} loading={saving}>
            {t('حفظ المنتج', 'Enregistrer')}
          </Button>
        </>
      }
    >
      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'general', label: t('المعلومات', 'Infos') },
              { value: 'variants', label: t('السعر والأنواع', 'Prix & variantes'), count: form.variants.length },
              { value: 'packs', label: t('العلب', 'Conditionnements') },
              { value: 'stock', label: t('المخزون والموقع', 'Stock & site') },
            ]}
          />

          {tab === 'general' && (
            <div className="space-y-4">
              <Field label={t('الصور', 'Images')} hint={t('حتى 4 صور. الأولى هي الرئيسية.', "Jusqu'à 4 images. La 1ʳᵉ est principale.")}>
                <div className="grid grid-cols-4 gap-3">
                  {form.images.map((img, i) => (
                    <div key={img} className="group relative aspect-square overflow-hidden rounded-xl border border-border">
                      <img src={img} alt="" className="size-full object-cover" />
                      {i === 0 && <Badge tone="brand" className="absolute start-1.5 top-1.5">{t('رئيسية', 'Principale')}</Badge>}
                      <button type="button" onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== img) })} className="absolute end-1.5 top-1.5 rounded-full bg-navy/70 p-1 text-white opacity-0 group-hover:opacity-100">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  {form.images.length < 4 && <ImageInput sb={sb} value={null} folder="products" onChange={(url) => url && setForm((f) => ({ ...f, images: [...f.images, url] }))} />}
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('الاسم بالعربية', 'Nom en arabe')} required>
                  <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl" autoFocus />
                </Field>
                <Field label={t('الاسم بالفرنسية', 'Nom en français')}>
                  <Input value={form.name_fr} onChange={(e) => setForm({ ...form, name_fr: e.target.value })} dir="ltr" />
                </Field>
                <Field label={t('الفئة', 'Catégorie')}>
                  <Select
                    value={form.category_id}
                    onValueChange={(category_id) => setForm({ ...form, category_id })}
                    allowEmpty
                    emptyLabel={t('بدون فئة', 'Sans catégorie')}
                    options={(categories.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))}
                  />
                </Field>
                <Field label={t('العلامة التجارية', 'Marque')}>
                  <Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('الوصف بالعربية', 'Description (arabe)')}>
                  <Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} dir="rtl" />
                </Field>
                <Field label={t('الوصف بالفرنسية', 'Description (français)')}>
                  <Textarea value={form.description_fr} onChange={(e) => setForm({ ...form, description_fr: e.target.value })} dir="ltr" />
                </Field>
              </div>
              <Field label={t('نسبة الضريبة (TVA)', 'Taux de TVA')} hint={t('الأسعار شاملة للضريبة (TTC)', 'Les prix sont TTC')}>
                <div className="flex flex-wrap gap-2">
                  {(legal.data?.tax_rates ?? [0, 7, 10, 14, 20]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setForm({ ...form, tax_rate: r })}
                      className={`num rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${form.tax_rate === r ? 'border-brand bg-brand-50 text-brand' : 'border-border hover:bg-surface-2'}`}
                    >
                      {r}%
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          )}

          {tab === 'variants' && (
            <div className="space-y-4">
              <SwitchRow
                label={t('لهذا المنتج أنواع (ألوان، أحجام…)', 'Ce produit a des variantes (couleurs, tailles…)')}
                description={t('كل نوع له سعره وباركوده ومخزونه', 'Chaque variante a son prix, code-barres et stock')}
                checked={multi}
                onCheckedChange={(on) =>
                  setForm({ ...form, variants: on ? [...form.variants, { ...blankVariant(), price: form.variants[0].price, cost: form.variants[0].cost }] : [form.variants[0]] })
                }
              />
              {form.variants.map((v, i) => (
                <Card key={v.id ?? i} className="p-4">
                  {multi && (
                    <div className="mb-3 flex items-center justify-between">
                      <Badge tone="navy" className="num">
                        #{i + 1}
                      </Badge>
                      <Button variant="ghost" size="icon-sm" disabled={form.variants.length <= 1} onClick={() => setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })}>
                        <Trash className="text-danger" />
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {multi && (
                      <>
                        <Field label={t('اسم النوع (ع)', 'Nom variante (ar)')} required>
                          <Input value={v.name_ar ?? ''} onChange={(e) => setV(i, { name_ar: e.target.value })} placeholder={t('مثلاً: أزرق', 'ex : Bleu')} />
                        </Field>
                        <Field label={t('اسم النوع (ف)', 'Nom variante (fr)')}>
                          <Input value={v.name_fr ?? ''} onChange={(e) => setV(i, { name_fr: e.target.value })} dir="ltr" />
                        </Field>
                      </>
                    )}
                    <Field label={t('ثمن البيع', 'Prix de vente')} required>
                      <MoneyInput value={v.price} onChange={(price) => setV(i, { price: price ?? 0 })} />
                    </Field>
                    {canCost && (
                      <Field
                        label={t('ثمن الشراء', "Prix d'achat")}
                        hint={
                          margin(v) !== null ? (
                            <span className={margin(v)! < 0 ? 'text-danger' : 'text-success'}>
                              {t('الهامش', 'Marge')}: <span className="num">{margin(v)!.toFixed(1)}%</span> ({money(v.price - (v.cost ?? 0))})
                            </span>
                          ) : undefined
                        }
                      >
                        <MoneyInput value={v.cost} onChange={(cost) => setV(i, { cost: cost ?? 0 })} />
                      </Field>
                    )}
                    <Field label={t('الباركود', 'Code-barres')} hint={t('اتركه فارغاً ليُولَّد تلقائياً', 'Laissez vide pour en générer un')}>
                      <Input icon={<Barcode />} value={v.barcode ?? ''} onChange={(e) => setV(i, { barcode: e.target.value })} dir="ltr" className="num" />
                    </Field>
                    <Field label={t('المرجع (SKU)', 'Référence (SKU)')}>
                      <Input value={v.sku ?? ''} onChange={(e) => setV(i, { sku: e.target.value })} dir="ltr" />
                    </Field>
                  </div>
                </Card>
              ))}
              {multi && (
                <Button variant="soft" className="w-full" onClick={() => setForm({ ...form, variants: [...form.variants, blankVariant()] })}>
                  <Plus />
                  {t('إضافة نوع', 'Ajouter une variante')}
                </Button>
              )}
            </div>
          )}

          {tab === 'packs' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-xl border border-info/20 bg-info/5 p-4 text-sm">
                <Boxes className="mt-0.5 size-5 shrink-0 text-info" />
                <div>
                  <div className="font-medium">{t('البيع بالعلبة', 'Vente par conditionnement')}</div>
                  <div className="mt-0.5 text-muted">
                    {t('مثلاً: علبة من 12 قلماً بسعر خاص وباركود خاص. المخزون يُخصم بالوحدة تلقائياً.', 'Ex : boîte de 12 stylos avec prix et code-barres propres. Le stock est déduit à l’unité.')}
                  </div>
                </div>
              </div>
              {form.variants.map((v, vi) => (
                <Card key={v.id ?? vi} className="p-4">
                  {multi && <div className="mb-3 text-sm font-semibold">{v.name_ar || `#${vi + 1}`}</div>}
                  <div className="space-y-3">
                    {v.packs.map((p, pi) => (
                      <div key={p.id ?? pi} className="grid items-end gap-2 sm:grid-cols-[1.4fr_0.7fr_1fr_1.2fr_auto]">
                        <Field label={t('الاسم', 'Nom')}>
                          <Input value={p.name_ar} onChange={(e) => setPack(vi, pi, { name_ar: e.target.value, name_fr: p.name_fr || e.target.value })} placeholder={t('علبة 12', 'Boîte de 12')} />
                        </Field>
                        <Field label={t('عدد الوحدات', 'Unités')}>
                          <Input type="number" min={1} value={p.factor} onChange={(e) => setPack(vi, pi, { factor: Number(e.target.value) })} className="num" />
                        </Field>
                        <Field label={t('السعر', 'Prix')} hint={p.factor > 0 && v.price > 0 ? <span className="num">{money(Math.round(p.price / p.factor))} / {t('وحدة', 'u.')}</span> : undefined}>
                          <MoneyInput value={p.price} onChange={(price) => setPack(vi, pi, { price: price ?? 0 })} />
                        </Field>
                        <Field label={t('الباركود', 'Code-barres')}>
                          <Input value={p.barcode ?? ''} onChange={(e) => setPack(vi, pi, { barcode: e.target.value })} dir="ltr" className="num" />
                        </Field>
                        <Button variant="ghost" size="icon" onClick={() => setV(vi, { packs: v.packs.filter((_, j) => j !== pi) })}>
                          <Trash className="text-danger" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setV(vi, { packs: [...v.packs, { name_ar: '', name_fr: '', factor: 12, barcode: '', price: v.price * 12 }] })}
                    >
                      <Layers />
                      {t('إضافة علبة', 'Ajouter un conditionnement')}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {tab === 'stock' && (
            <div className="space-y-4">
              <SwitchRow label={t('تتبع المخزون', 'Suivre le stock')} description={t('يُخصم المخزون تلقائياً عند كل بيع', 'Le stock est déduit à chaque vente')} checked={form.track_stock} onCheckedChange={(track_stock) => setForm({ ...form, track_stock })} />
              {form.track_stock && (
                <>
                  <Field label={t('حد التنبيه', "Seuil d'alerte")} hint={t('تنبيه عندما يصل المخزون إلى هذا الرقم', 'Alerte quand le stock atteint ce nombre')}>
                    <Input type="number" min={0} value={form.low_stock_alert} onChange={(e) => setForm({ ...form, low_stock_alert: Number(e.target.value) })} className="num w-32" />
                  </Field>
                  <Card className="divide-y divide-border">
                    {form.variants.map((v, i) => (
                      <div key={v.id ?? i} className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3">
                          <Package className="size-4 text-muted" />
                          <span className="text-sm font-medium">{multi ? v.name_ar || `#${i + 1}` : t('الكمية', 'Quantité')}</span>
                        </div>
                        {v.id ? (
                          <div className="text-sm text-muted">
                            {t('المخزون الحالي', 'Stock actuel')}: <span className="num font-semibold text-text">{v.stock_qty}</span>
                            <div className="text-xs">{t('عدّله من زر "تعديل المخزون"', 'Ajustez via « Ajuster le stock »')}</div>
                          </div>
                        ) : (
                          <Field label={t('الكمية الأولية', 'Stock initial')} className="w-36">
                            <Input type="number" value={v.initial_stock ?? 0} onChange={(e) => setV(i, { initial_stock: Number(e.target.value) })} className="num" />
                          </Field>
                        )}
                      </div>
                    ))}
                  </Card>
                </>
              )}
              <SwitchRow label={t('يظهر في الموقع والمتجر', 'Visible sur le site et la boutique')} checked={form.is_online} onCheckedChange={(is_online) => setForm({ ...form, is_online })} />
              <SwitchRow label={t('منتج مميز', 'Produit vedette')} description={t('يظهر في الصفحة الرئيسية للموقع', 'Affiché en page d’accueil')} checked={form.is_featured} onCheckedChange={(is_featured) => setForm({ ...form, is_featured })} />
              {!form.images.length && (
                <div className="flex items-center gap-2 text-xs text-warning">
                  <ImagePlus className="size-4" />
                  {t('نصيحة: أضف صورة ليظهر المنتج بشكل أجمل في الموقع', 'Astuce : ajoutez une image pour le site')}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  )
}
