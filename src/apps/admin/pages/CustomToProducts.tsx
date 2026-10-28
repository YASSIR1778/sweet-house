import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { PackagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { subDays } from 'date-fns'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { parseMoney } from '@/shared/lib/money'
import { cn, uuid } from '@/shared/lib/utils'
import { Badge, Button, Input } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'

type Item = { name: string; count: number; qty: number; revenue: number; avg_price: number }
type Row = { on: boolean; name: string; price: string }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** What was sold by hand («بيع يدوي») in the last 90 days and is not a product yet: tick, fix the name / price, create. */
export function CustomToProductsDialog({ open, onClose, existing, categories }: { open: boolean; onClose: () => void; existing: string[]; categories: { id: string; name_ar: string; name_fr: string }[] }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const report = useQuery({
    queryKey: ['custom-items-90'],
    enabled: open,
    queryFn: async () => {
      const to = new Date()
      const { data, error } = await sb.rpc('custom_items_report', { p_from: subDays(to, 90).toISOString(), p_to: to.toISOString() })
      if (error) throw error
      return data as Item[]
    },
  })
  const known = useMemo(() => new Set(existing.map(norm)), [existing])
  const items = useMemo(() => (report.data ?? []).filter((i) => i.name && !known.has(norm(i.name))), [report.data, known])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [cat, setCat] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setRows(Object.fromEntries(items.map((i) => [i.name, { on: false, name: i.name, price: String(Math.round(i.avg_price) / 100) }])))
  }, [open, items])

  const set = (k: string, patch: Partial<Row>) => setRows((r) => ({ ...r, [k]: { ...r[k], ...patch } }))
  const picked = items.filter((i) => rows[i.name]?.on)

  const create = async () => {
    const list = picked.map((i) => ({ name: rows[i.name].name.trim(), price: parseMoney(rows[i.name].price) ?? 0 }))
    if (list.some((r) => r.name.length < 2 || r.price <= 0)) return toast.error(t('اكتب اسماً وثمناً لكل سطر محدد', 'Nom et prix requis pour chaque ligne cochée'))
    setBusy(true)
    let made = 0
    const failed: string[] = []
    for (const r of list) {
      // till only, stock not followed until the owner counts it (no low-stock alerts for a whole new list)
      const { error } = await sb.rpc('save_product', {
        p: { id: uuid(), category_id: cat, name_ar: r.name, track_stock: false, is_online: false, variants: [{ price: r.price, packs: [] }] },
      })
      if (error) failed.push(`${r.name}: ${errorMessage(error, lang)}`)
      else made++
    }
    setBusy(false)
    qc.invalidateQueries({ queryKey: ['products'] })
    if (made) toast.success(t(`أُنشئ ${made} منتجاً (في نقطة البيع فقط)`, `${made} produits créés (caisse seulement)`))
    if (failed.length) toast.error(failed.join(' · '))
    else onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('من البيع اليدوي إلى منتجات', 'Des ventes libres aux produits')}
      description={t('ما بيع بـ«بيع يدوي» في آخر 90 يوماً وليس في القائمة. حدّد ما هو سلعة (واترك الخدمات مثل الطباعة)، وصحّح الاسم والثمن إن لزم.', 'Articles vendus à la main ces 90 derniers jours et absents du catalogue. Cochez les produits (pas les services), corrigez nom et prix.')}
    >
      {report.isLoading ? (
        <div className="py-10 text-center text-sm text-muted">{t('جارٍ التحميل…', 'Chargement…')}</div>
      ) : !items.length ? (
        <div className="py-10 text-center text-sm text-muted">{t('لا شيء: كل ما بيع يدوياً موجود في القائمة', 'Rien : tout est déjà au catalogue')}</div>
      ) : (
        <div className="space-y-4">
          <div className="max-h-[55vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
            {items.map((i) => {
              const r = rows[i.name]
              if (!r) return null
              return (
                <div key={i.name} className={cn('flex items-center gap-3 px-3 py-2', r.on && 'bg-brand-50/50')}>
                  <input type="checkbox" checked={r.on} onChange={(e) => set(i.name, { on: e.target.checked })} className="size-4 shrink-0 accent-brand" />
                  <Input value={r.name} onChange={(e) => set(i.name, { name: e.target.value, on: true })} className="h-9 min-w-0 flex-1" />
                  <div className="relative w-28 shrink-0">
                    <Input value={r.price} onChange={(e) => set(i.name, { price: e.target.value.replace(/[^\d.,]/g, ''), on: true })} inputMode="decimal" dir="ltr" className="num h-9 pe-9 text-center" />
                    <span className="absolute inset-y-0 end-2 flex items-center text-[11px] text-muted">DH</span>
                  </div>
                  <Badge className="num shrink-0">{t(`بيع ${i.count} مرة`, `${i.count}×`)}</Badge>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-56">
              <Select value={cat} onValueChange={setCat} allowEmpty emptyLabel={t('الفئة: بدون', 'Catégorie : aucune')} options={categories.map((c) => ({ value: c.id, label: pick(c, 'name') }))} />
            </div>
            <Button className="flex-1" disabled={!picked.length} loading={busy} onClick={create}>
              <PackagePlus />
              {t(`إنشاء ${picked.length} منتج`, `Créer ${picked.length} produits`)}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
