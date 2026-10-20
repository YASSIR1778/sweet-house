import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Badge, Button, SwitchRow } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'

type Row = Record<string, string | number | boolean | null>

// Accepted column headers (Arabic, French or technical) → field
const COLUMNS: [string, string[], string, string | number][] = [
  ['name_ar', ['name_ar', 'الاسم بالعربية', 'الاسم', 'المنتج', 'nom_ar'], 'الاسم بالعربية', 'دفتر 96 صفحة'],
  ['name_fr', ['name_fr', 'الاسم بالفرنسية', 'nom', 'nom_fr', 'designation', 'désignation'], 'الاسم بالفرنسية', 'Cahier 96 pages'],
  ['category', ['category', 'الفئة', 'catégorie', 'categorie', 'famille'], 'الفئة', 'دفاتر'],
  ['brand', ['brand', 'العلامة', 'marque'], 'العلامة', 'Selecta'],
  ['price', ['price', 'ثمن البيع', 'السعر', 'prix', 'prix de vente', 'pv'], 'ثمن البيع', 8.5],
  ['cost', ['cost', 'ثمن الشراء', 'prix achat', "prix d'achat", 'pa'], 'ثمن الشراء', 5],
  ['barcode', ['barcode', 'الباركود', 'code barre', 'code-barres', 'ean'], 'الباركود', '6111234567890'],
  ['sku', ['sku', 'المرجع', 'référence', 'reference', 'ref'], 'المرجع', 'C96'],
  ['stock', ['stock', 'المخزون', 'الكمية', 'quantité', 'qte', 'qty'], 'المخزون', 50],
  ['tax_rate', ['tax_rate', 'الضريبة', 'tva'], 'الضريبة', 20],
  ['low_stock_alert', ['low_stock_alert', 'حد التنبيه', 'seuil'], 'حد التنبيه', 5],
  ['online', ['online', 'في الموقع', 'en ligne', 'web'], 'في الموقع', 'نعم'],
]

const norm = (s: string) => s.toString().trim().toLowerCase()
const truthy = (v: unknown) => ['1', 'true', 'yes', 'oui', 'نعم', 'x', 'y'].includes(norm(String(v ?? '')))

function mapRow(raw: Row): Row {
  const out: Row = {}
  const keys = Object.keys(raw)
  for (const [field, aliases] of COLUMNS) {
    const k = keys.find((x) => aliases.map(norm).includes(norm(x)))
    if (k === undefined) continue
    let v = raw[k]
    if (typeof v === 'string') v = v.trim()
    if (['price', 'cost'].includes(field) && typeof v === 'string') v = v.replace(/\s|dh|mad|درهم/gi, '').replace(',', '.')
    if (field === 'online') v = truthy(v)
    if (field === 'barcode' && typeof v === 'number') v = BigInt(Math.round(v)).toString()
    out[field] = v === '' ? null : (v as Row[string])
  }
  return out
}

export function ImportProductsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const ref = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [fileName, setFileName] = useState('')
  const [update, setUpdate] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ created: number; updated: number; errors: { row: number; name: string; error: string }[] } | null>(null)

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c[2]), COLUMNS.map((c) => c[3])])
    ws['!cols'] = COLUMNS.map(() => ({ wch: 18 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Produits')
    XLSX.writeFile(wb, 'sweet-house-produits.xlsx')
  }

  const read = async (f?: File | null) => {
    if (!f) return
    setResult(null)
    setFileName(f.name)
    const wb = XLSX.read(await f.arrayBuffer())
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json<Row>(ws, { defval: null })
    const mapped = data.map(mapRow).filter((r) => r.name_ar || r.name_fr)
    setRows(mapped)
    if (!mapped.length) toast.error(t('لم نجد أي منتج. تأكد من أن السطر الأول فيه أسماء الأعمدة.', 'Aucun produit trouvé : vérifiez la ligne d’en-tête.'))
  }

  const run = async () => {
    setBusy(true)
    const total = { created: 0, updated: 0, errors: [] as { row: number; name: string; error: string }[] }
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await sb.rpc('import_products', { p_rows: rows.slice(i, i + 100), p_update_existing: update })
        if (error) throw error
        total.created += data.created
        total.updated += data.updated
        total.errors.push(...(data.errors as typeof total.errors).map((e) => ({ ...e, row: e.row + i + 1 })))
      }
      setResult(total)
      qc.invalidateQueries({ queryKey: ['products'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  const close = () => (setRows([]), setResult(null), setFileName(''), onClose())

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} size="lg" title={t('استيراد المنتجات من Excel', 'Importer depuis Excel')} description={t('أضف مئات المنتجات دفعة واحدة', 'Ajoutez des centaines de produits d’un coup')}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <button onClick={template} className="flex items-center gap-3 rounded-2xl border border-border p-4 text-start hover:bg-surface-2">
            <Download className="size-6 text-success" />
            <div>
              <div className="text-sm font-semibold">{t('1. حمّل النموذج', '1. Télécharger le modèle')}</div>
              <div className="text-xs text-muted">{t('املأه في Excel: سطر لكل منتج', 'Une ligne par produit')}</div>
            </div>
          </button>
          <button onClick={() => ref.current?.click()} className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-brand/40 p-4 text-start hover:bg-brand-50">
            <Upload className="size-6 text-brand" />
            <div>
              <div className="text-sm font-semibold">{t('2. ارفع الملف', '2. Envoyer le fichier')}</div>
              <div className="text-xs text-muted">{fileName || 'Excel (.xlsx) / CSV'}</div>
            </div>
          </button>
          <input ref={ref} type="file" hidden accept=".xlsx,.xls,.csv" onChange={(e) => (read(e.target.files?.[0]), (e.target.value = ''))} />
        </div>

        <div className="rounded-xl bg-info/5 p-3 text-xs leading-relaxed text-muted">
          {t('الأعمدة المقبولة: ', 'Colonnes : ')}
          {COLUMNS.map((c) => c[2]).join(' · ')}. {t('الاسم وثمن البيع يكفيان. الفئات غير الموجودة تُنشأ تلقائياً، والباركود الفارغ يُولَّد تلقائياً.', 'Nom et prix suffisent. Catégories créées automatiquement, code-barres généré si vide.')}
        </div>

        {rows.length > 0 && !result && (
          <>
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="size-4 text-success" />
              <span className="num font-semibold">{rows.length}</span> {t('منتج جاهز للاستيراد', 'produits prêts')}
            </div>
            <div className="max-h-64 overflow-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-2">
                  <tr>
                    {['name_ar', 'category', 'price', 'cost', 'barcode', 'stock'].map((k) => (
                      <th key={k} className="px-3 py-2 text-start font-semibold">{COLUMNS.find((c) => c[0] === k)?.[2]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 30).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5">{String(r.name_ar ?? r.name_fr ?? '')}</td>
                      <td className="px-3 py-1.5">{String(r.category ?? '')}</td>
                      <td className="num px-3 py-1.5">{String(r.price ?? '')}</td>
                      <td className="num px-3 py-1.5">{String(r.cost ?? '')}</td>
                      <td className="num px-3 py-1.5">{String(r.barcode ?? '')}</td>
                      <td className="num px-3 py-1.5">{String(r.stock ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SwitchRow label={t('تحديث المنتجات الموجودة بنفس الباركود', 'Mettre à jour les produits existants (même code-barres)')} description={t('وإلا تُضاف كمنتجات جديدة', 'Sinon ils sont ajoutés')} checked={update} onCheckedChange={setUpdate} />
            <Button size="lg" className="w-full" onClick={run} loading={busy}>
              {t(`استيراد ${rows.length} منتج`, `Importer ${rows.length} produits`)}
            </Button>
          </>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-success/10 p-4">
              <CheckCircle2 className="size-8 text-success" />
              <div className="text-sm">
                <div className="font-semibold">{t('انتهى الاستيراد', 'Import terminé')}</div>
                <div className="num text-muted">
                  {t('جديد', 'Créés')}: {result.created} · {t('محدَّث', 'Mis à jour')}: {result.updated} · {t('أخطاء', 'Erreurs')}: {result.errors.length}
                </div>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="max-h-48 space-y-1 overflow-auto rounded-xl border border-danger/30 p-3 text-xs">
                {result.errors.map((e) => (
                  <div key={e.row} className="flex gap-2">
                    <AlertTriangle className="size-3.5 shrink-0 text-danger" />
                    <Badge className="num">#{e.row}</Badge>
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted">{errorMessage(e.error, lang)}</span>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" className="w-full" onClick={close}>
              {t('إغلاق', 'Fermer')}
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
