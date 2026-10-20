import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import JsBarcode from 'jsbarcode'
import { Barcode, Minus, Plus, Printer, Search, Trash } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import { storage } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Field, Input, SwitchRow } from '@/shared/ui/primitives'
import { EmptyState, PageHeader } from '@/shared/ui/data'
import { PrintArea } from '@/shared/ui/receipt'

type Opt = { key: string; name: string; price: number; barcode: string; stock: number }
type Tpl = { cols: number; rows: number; marginTop: number; marginSide: number; gapX: number; gapY: number; showStore: boolean; showName: boolean; showPrice: boolean; showCode: boolean; skip: number }

const PRESETS: { name: string; tpl: Partial<Tpl> }[] = [
  { name: '3 × 8 (24)', tpl: { cols: 3, rows: 8, marginTop: 13, marginSide: 7, gapX: 2.5, gapY: 0 } },
  { name: '3 × 7 (21)', tpl: { cols: 3, rows: 7, marginTop: 15, marginSide: 7, gapX: 2.5, gapY: 0 } },
  { name: '4 × 10 (40)', tpl: { cols: 4, rows: 10, marginTop: 13, marginSide: 8, gapX: 2, gapY: 0 } },
  { name: '5 × 13 (65)', tpl: { cols: 5, rows: 13, marginTop: 10.5, marginSide: 5, gapX: 2.5, gapY: 0 } },
  { name: '2 × 7 (14)', tpl: { cols: 2, rows: 7, marginTop: 15, marginSide: 4, gapX: 3, gapY: 0 } },
]

const tplStore = storage<Tpl>('sh-labels-tpl', { cols: 3, rows: 8, marginTop: 13, marginSide: 7, gapX: 2.5, gapY: 0, showStore: true, showName: true, showPrice: true, showCode: true, skip: 0 })

function BarcodeSvg({ value, height }: { value: string; height: number }) {
  const ref = useRef<SVGSVGElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ean = /^\d{13}$/.test(value)
    try {
      JsBarcode(ref.current, value, { format: ean ? 'EAN13' : 'CODE128', height, width: 1.4, fontSize: 10, margin: 0, displayValue: true, flat: true })
    } catch {
      JsBarcode(ref.current, value, { format: 'CODE128', height, width: 1.2, fontSize: 10, margin: 0 })
    }
  }, [value, height])
  return <svg ref={ref} style={{ maxWidth: '100%' }} />
}

export function LabelsPage() {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<(Opt & { copies: number })[]>([])
  const [tpl, setTpl] = useState<Tpl>(tplStore.get)
  const [printing, setPrinting] = useState(false)
  useEffect(() => tplStore.set(tpl), [tpl])

  const store = useQuery({ queryKey: ['settings', 'store'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'store').single()).data?.value as { name_fr: string } })
  const options = useQuery({
    queryKey: ['label-options'],
    queryFn: async () => {
      const { data } = await sb.from('products').select('name_ar, name_fr, deleted_at, product_variants(id, name_ar, name_fr, price, barcode, stock_qty, deleted_at, product_packs(id, name_ar, name_fr, price, barcode, deleted_at))').is('deleted_at', null)
      type V = { id: string; name_ar: string | null; name_fr: string | null; price: number; barcode: string | null; stock_qty: number; deleted_at: string | null; product_packs: { id: string; name_ar: string; name_fr: string; price: number; barcode: string | null; deleted_at: string | null }[] }
      const out: (Opt & { name_ar: string; name_fr: string })[] = []
      for (const p of (data ?? []) as { name_ar: string; name_fr: string; product_variants: V[] }[])
        for (const v of p.product_variants.filter((x) => !x.deleted_at)) {
          const base = { name_ar: p.name_ar + (v.name_ar ? ` - ${v.name_ar}` : ''), name_fr: p.name_fr + (v.name_fr ? ` - ${v.name_fr}` : '') }
          if (v.barcode) out.push({ key: v.id, ...base, name: '', price: v.price, barcode: v.barcode, stock: Math.max(0, Math.floor(Number(v.stock_qty))) })
          for (const k of v.product_packs.filter((x) => !x.deleted_at && x.barcode)) out.push({ key: k.id, name_ar: `${base.name_ar} (${k.name_ar})`, name_fr: `${base.name_fr} (${k.name_fr})`, name: '', price: k.price, barcode: k.barcode!, stock: 0 })
        }
      return out
    },
  })
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (options.data ?? []).map((o) => ({ ...o, name: pick(o, 'name') })).filter((o) => !s || o.name.toLowerCase().includes(s) || o.barcode.includes(s)).slice(0, 30)
  }, [options.data, q, pick])

  const add = (o: Opt, copies = 1) => setPicked((xs) => (xs.some((x) => x.key === o.key) ? xs.map((x) => (x.key === o.key ? { ...x, copies: x.copies + copies } : x)) : [...xs, { ...o, copies }]))
  const labels = picked.flatMap((p) => Array.from({ length: p.copies }, () => p))
  const perPage = tpl.cols * tpl.rows
  const slots = [...Array.from({ length: tpl.skip }, () => null), ...labels]
  const pages = Array.from({ length: Math.max(1, Math.ceil(slots.length / perPage)) }, (_, i) => slots.slice(i * perPage, (i + 1) * perPage))

  const W = 210, H = 297
  const lw = (W - 2 * tpl.marginSide - (tpl.cols - 1) * tpl.gapX) / tpl.cols
  const lh = (H - 2 * tpl.marginTop - (tpl.rows - 1) * tpl.gapY) / tpl.rows
  const barH = Math.max(18, Math.min(50, lh * 2.2))

  const Sheet = ({ items }: { items: (typeof slots)[number][] }) => (
    <div style={{ width: `${W}mm`, height: `${H}mm`, padding: `${tpl.marginTop}mm ${tpl.marginSide}mm`, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: `repeat(${tpl.cols}, ${lw}mm)`, gridAutoRows: `${lh}mm`, columnGap: `${tpl.gapX}mm`, rowGap: `${tpl.gapY}mm`, background: '#fff', breakAfter: 'page', fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif", color: '#000' }}>
      {items.map((l, i) => (
        <div key={i} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '1mm', outline: printing ? 'none' : '1px dashed #e2e8f0' }}>
          {l && (
            <>
              {tpl.showStore && <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: 0.5 }}>{store.data?.name_fr ?? 'Sweet House'}</div>}
              {tpl.showName && <div style={{ fontSize: 8, lineHeight: 1.15, maxHeight: '2.3em', overflow: 'hidden' }}>{l.name}</div>}
              {tpl.showCode && <BarcodeSvg value={l.barcode} height={barH} />}
              {tpl.showPrice && <div style={{ fontSize: 12, fontWeight: 800 }}>{money(l.price)}</div>}
            </>
          )}
        </div>
      ))}
    </div>
  )

  return (
    <>
      <PageHeader
        icon={<Barcode />}
        title={t('ملصقات الباركود', 'Étiquettes code-barres')}
        description={t('اطبع ملصقات على أوراق A4 عادية في طابعتك', 'Imprimez sur planches A4 avec votre imprimante')}
        actions={
          <Button onClick={() => setPrinting(true)} disabled={!labels.length}>
            <Printer />
            {t(`طباعة ${labels.length} ملصق`, `Imprimer ${labels.length} étiquettes`)}
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title={t('المنتجات', 'Produits')} />
            <div className="space-y-3 p-4">
              <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث…', 'Rechercher…')} />
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {list.map((o) => (
                  <div key={o.key} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => add(o)}>+1</Button>
                    {o.stock > 0 && <Button size="sm" variant="soft" onClick={() => add(o, o.stock)}>×{o.stock}</Button>}
                  </div>
                ))}
              </div>
              {picked.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  {picked.map((p) => (
                    <div key={p.key} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <div className="flex items-center rounded-lg border border-border" dir="ltr">
                        <button className="flex size-7 items-center justify-center" onClick={() => setPicked(picked.map((x) => (x.key === p.key ? { ...x, copies: Math.max(1, x.copies - 1) } : x)))}><Minus className="size-3" /></button>
                        <input value={p.copies} onChange={(e) => setPicked(picked.map((x) => (x.key === p.key ? { ...x, copies: Math.max(1, Number(e.target.value) || 1) } : x)))} className="num w-10 bg-transparent text-center text-sm" />
                        <button className="flex size-7 items-center justify-center" onClick={() => setPicked(picked.map((x) => (x.key === p.key ? { ...x, copies: x.copies + 1 } : x)))}><Plus className="size-3" /></button>
                      </div>
                      <button onClick={() => setPicked(picked.filter((x) => x.key !== p.key))} className="text-subtle hover:text-danger"><Trash className="size-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title={t('قالب الورقة', 'Planche')} />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <Button key={p.name} size="sm" variant={tpl.cols === p.tpl.cols && tpl.rows === p.tpl.rows ? 'navy' : 'outline'} onClick={() => setTpl({ ...tpl, ...p.tpl })}>
                    <span className="num">{p.name}</span>
                  </Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ['cols', 'الأعمدة', 'Colonnes'],
                    ['rows', 'الصفوف', 'Lignes'],
                    ['marginTop', 'الهامش العلوي (مم)', 'Marge haut (mm)'],
                    ['marginSide', 'الهامش الجانبي (مم)', 'Marge côté (mm)'],
                    ['gapX', 'المسافة الأفقية', 'Espace horiz.'],
                    ['gapY', 'المسافة العمودية', 'Espace vert.'],
                    ['skip', 'تخطّي ملصقات مستعملة', 'Étiquettes à sauter'],
                  ] as const
                ).map(([k, a, f]) => (
                  <Field key={k} label={t(a, f)}>
                    <Input type="number" step="0.5" min={0} value={tpl[k]} onChange={(e) => setTpl({ ...tpl, [k]: Number(e.target.value) })} className="num" />
                  </Field>
                ))}
              </div>
              <SwitchRow label={t('اسم المكتبة', 'Nom du magasin')} checked={tpl.showStore} onCheckedChange={(showStore) => setTpl({ ...tpl, showStore })} />
              <SwitchRow label={t('اسم المنتج', 'Nom du produit')} checked={tpl.showName} onCheckedChange={(showName) => setTpl({ ...tpl, showName })} />
              <SwitchRow label={t('الباركود', 'Code-barres')} checked={tpl.showCode} onCheckedChange={(showCode) => setTpl({ ...tpl, showCode })} />
              <SwitchRow label={t('السعر', 'Prix')} checked={tpl.showPrice} onCheckedChange={(showPrice) => setTpl({ ...tpl, showPrice })} />
              <p className="text-xs text-muted">{t('نصيحة: اطبع أول مرة على ورقة عادية وضعها فوق ورقة الملصقات لتتأكد من الهوامش. في نافذة الطباعة اختر "الحجم الفعلي 100%".', 'Astuce : testez sur papier normal ; imprimez à 100 %.')}</p>
            </div>
          </Card>
        </div>
        <Card className="overflow-auto bg-surface-2 p-6">
          {!labels.length ? (
            <EmptyState icon={<Barcode />} title={t('اختر المنتجات لطباعة ملصقاتها', 'Choisissez des produits')} />
          ) : (
            <div className="mx-auto w-fit origin-top shadow-pop" style={{ transform: 'scale(0.62)', marginBottom: `-${(pages.length * 297 * 0.38).toFixed(0)}mm` }}>
              {pages.map((items, i) => (
                <div key={i} className="mb-4">
                  <Sheet items={[...items, ...Array(Math.max(0, perPage - items.length)).fill(null)]} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      {printing && (
        <PrintArea page="A4" margin="0" onDone={() => setPrinting(false)}>
          {pages.map((items, i) => (
            <Sheet key={i} items={items} />
          ))}
        </PrintArea>
      )}
    </>
  )
}
