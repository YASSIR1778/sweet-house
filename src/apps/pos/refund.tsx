import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Minus, Plus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, qty as fmtQty } from '@/shared/lib/money'
import type { Sale } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import type { DeviceInfo } from './device'

type Item = Sale['items'][number] & { id: string; refunded_qty: number }

export function RefundDialog({ device, sale, onClose, onDone }: { device: DeviceInfo; sale: Sale | null; onClose: () => void; onDone: () => void }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [qtys, setQtys] = useState<Record<string, number>>({})
  const [method, setMethod] = useState<'cash' | 'card' | 'credit'>('cash')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setQtys({})
    setReason('')
    setMethod(sale?.paid_card && !sale.paid_cash ? 'card' : 'cash')
  }, [sale])

  const items = (sale?.items ?? []) as Item[]
  const ratio = sale ? sale.total / Math.max(1, items.reduce((a, i) => a + i.total, 0)) : 1
  const amount = Math.round(items.reduce((a, i) => a + (i.total * (qtys[i.id] ?? 0)) / i.qty, 0) * ratio)

  const submit = async () => {
    if (!sale) return
    setBusy(true)
    const { error } = await sb.rpc('refund_sale', {
      p_device: device.id,
      p_sale: sale.id,
      p_items: Object.entries(qtys).filter(([, q]) => q > 0).map(([sale_item_id, qty]) => ({ sale_item_id, qty })),
      p_method: method,
      p_reason: reason,
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`تم الإرجاع: ${money(amount)}`, `Retour effectué : ${money(amount)}`))
    qc.invalidateQueries({ queryKey: ['shift', device.id] })
    qc.invalidateQueries({ queryKey: ['pos-catalog'] })
    onDone()
  }

  return (
    <Dialog open={!!sale} onOpenChange={(o) => !o && onClose()} size="md" title={t('إرجاع سلع', 'Retour de marchandise')} description={sale?.number}>
      <div className="space-y-4">
        <div className="divide-y divide-border rounded-xl border border-border">
          {items.map((i) => {
            const max = Number(i.qty) - Number(i.refunded_qty ?? 0)
            const q = qtys[i.id] ?? 0
            return (
              <div key={i.id} className={cn('flex items-center gap-3 p-3', max <= 0 && 'opacity-50')}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{pick(i, 'name')}</div>
                  <div className="num text-xs text-muted">
                    {fmtQty(i.qty)} × {money(i.unit_price)}
                    {Number(i.refunded_qty) > 0 && ` · ${t('أُرجع', 'retourné')} ${fmtQty(i.refunded_qty)}`}
                  </div>
                </div>
                {max > 0 && (
                  <div className="flex items-center rounded-lg border border-border" dir="ltr">
                    <button className="flex size-8 items-center justify-center" onClick={() => setQtys({ ...qtys, [i.id]: Math.max(0, q - 1) })}>
                      <Minus className="size-3.5" />
                    </button>
                    <span className="num w-8 text-center text-sm font-semibold">{q}</span>
                    <button className="flex size-8 items-center justify-center" onClick={() => setQtys({ ...qtys, [i.id]: Math.min(max, q + 1) })}>
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['cash', t('نقداً', 'Espèces')],
              ['card', t('بطاقة', 'Carte')],
              ...(sale?.customer ? ([['credit', t('من الدين', 'Sur crédit')]] as const) : []),
            ] as const
          ).map(([m, label]) => (
            <Button key={m} variant={method === m ? 'navy' : 'outline'} onClick={() => setMethod(m)}>
              {label}
            </Button>
          ))}
        </div>
        <Field label={t('سبب الإرجاع', 'Motif')} required>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('مثلاً: منتج معيب', 'ex : produit défectueux')} />
        </Field>
        <div className="flex items-center justify-between rounded-xl bg-surface-2 p-4">
          <span className="font-medium">{t('المبلغ المُرجَع', 'Montant remboursé')}</span>
          <span className="num text-2xl font-bold">{money(amount)}</span>
        </div>
        <Button size="lg" variant="danger" className="w-full" disabled={!amount || !reason.trim()} loading={busy} onClick={submit}>
          <Undo2 />
          {t('تأكيد الإرجاع', 'Confirmer le retour')}
        </Button>
      </div>
    </Dialog>
  )
}
