import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { qty } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import type { ProductRow } from './Products'

export function StockDialog({ product, onClose }: { product: ProductRow | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [variant, setVariant] = useState<string | null>(null)
  const [mode, setMode] = useState<'add' | 'remove' | 'set'>('add')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setVariant(product?.product_variants[0]?.id ?? null)
    setMode('add')
    setAmount('')
    setNote('')
  }, [product])

  const v = product?.product_variants.find((x) => x.id === variant)
  const n = Number(amount.replace(',', '.'))
  const change = !v || !Number.isFinite(n) ? 0 : mode === 'add' ? n : mode === 'remove' ? -n : n - Number(v.stock_qty)

  const submit = async () => {
    if (!v || !change) return
    setBusy(true)
    const { error } = await sb.rpc('adjust_stock', { p_variant: v.id, p_change: change, p_note: note || null })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم تحديث المخزون', 'Stock mis à jour'))
    qc.invalidateQueries({ queryKey: ['products'] })
    onClose()
  }

  return (
    <Dialog
      open={!!product}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('تعديل المخزون', 'Ajuster le stock')}
      description={product ? pick(product, 'name') : undefined}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('إلغاء', 'Annuler')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!change}>
            {t('تأكيد', 'Confirmer')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {product && product.product_variants.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {product.product_variants.map((x) => (
              <button key={x.id} onClick={() => setVariant(x.id)} className={cn('rounded-lg border px-3 py-1.5 text-sm', variant === x.id ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                {pick(x, 'name') || '—'}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-xl bg-surface-2 p-4 text-center">
          <div className="text-xs text-muted">{t('المخزون الحالي', 'Stock actuel')}</div>
          <div className="num mt-1 text-3xl font-bold">{qty(v?.stock_qty)}</div>
          {change !== 0 && (
            <div className={cn('num mt-1 text-sm font-semibold', change > 0 ? 'text-success' : 'text-danger')}>
              {change > 0 ? '+' : ''}
              {qty(change)} → {qty(Number(v?.stock_qty ?? 0) + change)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['add', t('إضافة', 'Ajouter'), <Plus key="a" />],
              ['remove', t('إنقاص', 'Retirer'), <Minus key="r" />],
              ['set', t('تحديد', 'Définir'), null],
            ] as const
          ).map(([m, label, icon]) => (
            <Button key={m} variant={mode === m ? 'navy' : 'outline'} size="sm" onClick={() => setMode(m)}>
              {icon}
              {label}
            </Button>
          ))}
        </div>
        <Field label={t('الكمية', 'Quantité')}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="num text-center text-lg" autoFocus />
        </Field>
        <Field label={t('السبب', 'Motif')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('مثلاً: سلعة تالفة، وصول طلبية…', 'ex : casse, réception…')} />
        </Field>
      </div>
    </Dialog>
  )
}
