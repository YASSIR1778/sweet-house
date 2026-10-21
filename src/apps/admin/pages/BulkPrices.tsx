import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { Service } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Button, Input, Switch } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { MoneyInput } from '@/shared/ui/pickers'

type Row = Pick<Service, 'id' | 'price' | 'duration_ar' | 'target_hours' | 'is_online'>

/** Edit the prices, durations and online flag of all administrative services in one table. */
export function BulkPricesSheet({ open, onClose, services }: { open: boolean; onClose: () => void; services: Service[] }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const list = useMemo(() => services.filter((s) => s.kind === 'admin' && s.pricing_mode !== 'open'), [services])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [q, setQ] = useState('')
  const [onlyZero, setOnlyZero] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setRows(Object.fromEntries(list.map((s) => [s.id, { id: s.id, price: s.price, duration_ar: s.duration_ar, target_hours: s.target_hours, is_online: s.is_online }])))
  }, [open, list])

  const changed = list.filter((s) => {
    const r = rows[s.id]
    return r && (r.price !== s.price || (r.duration_ar ?? '') !== (s.duration_ar ?? '') || r.target_hours !== s.target_hours || r.is_online !== s.is_online)
  })
  const shown = list.filter((s) => (!q || s.name_ar.includes(q) || s.name_fr.toLowerCase().includes(q.toLowerCase())) && (!onlyZero || (rows[s.id]?.price ?? 0) === 0))
  const set = (id: string, patch: Partial<Row>) => setRows((x) => ({ ...x, [id]: { ...x[id], ...patch } }))

  const save = async () => {
    setBusy(true)
    for (const s of changed) {
      const { id, ...v } = rows[s.id]
      const { error } = await sb.from('services').update({ ...v, duration_ar: v.duration_ar || null }).eq('id', id)
      if (error) {
        setBusy(false)
        return toast.error(`${s.name_ar}: ${errorMessage(error, lang)}`)
      }
    }
    setBusy(false)
    toast.success(t(`حُفظت ${changed.length} خدمة`, `${changed.length} services enregistrés`))
    qc.invalidateQueries({ queryKey: ['services'] })
    qc.invalidateQueries({ queryKey: ['launch-checklist'] })
    onClose()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="max-w-4xl" title={t('تعديل الأسعار دفعة واحدة', 'Modifier les prix en masse')} description={t('الخدمات الإدارية: السعر، المدة الظاهرة للزبون، الوقت المستهدف، والظهور في الموقع', 'Services administratifs : prix, délai, objectif, en ligne')}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث…', 'Rechercher…')} className="max-w-64" />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyZero} onCheckedChange={setOnlyZero} />
            {t('بدون سعر فقط', 'Sans prix seulement')}
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start">{t('الخدمة', 'Service')}</th>
                <th className="px-2 py-2 text-start">{t('السعر', 'Prix')}</th>
                <th className="px-2 py-2 text-start">{t('المدة (للزبون)', 'Délai affiché')}</th>
                <th className="px-2 py-2 text-start">{t('الهدف (ساعات)', 'Objectif (h)')}</th>
                <th className="px-2 py-2">{t('في الموقع', 'En ligne')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((s) => {
                const r = rows[s.id]
                if (!r) return null
                return (
                  <tr key={s.id} className={cn(changed.includes(s) && 'bg-brand-50/60')}>
                    <td className="px-3 py-1.5">{pick(s, 'name')}</td>
                    <td className="w-32 px-2 py-1.5">
                      <MoneyInput value={r.price} onChange={(v) => set(s.id, { price: v ?? 0 })} />
                    </td>
                    <td className="w-40 px-2 py-1.5">
                      <Input value={r.duration_ar ?? ''} onChange={(e) => set(s.id, { duration_ar: e.target.value })} placeholder={t('مثلاً: 24 ساعة', 'ex. 24 h')} />
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      <Input type="number" min={0} value={r.target_hours ?? ''} onChange={(e) => set(s.id, { target_hours: e.target.value === '' ? null : Number(e.target.value) })} className="num" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Switch checked={r.is_online} onCheckedChange={(is_online) => set(s.id, { is_online })} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 bg-surface py-3">
          <span className="text-sm text-muted">{changed.length ? t(`${changed.length} تعديل غير محفوظ`, `${changed.length} modifications`) : t('لا تعديلات', 'Aucune modification')}</span>
          <Button onClick={save} loading={busy} disabled={!changed.length}>
            <Save />
            {t('حفظ الكل', 'Tout enregistrer')}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
