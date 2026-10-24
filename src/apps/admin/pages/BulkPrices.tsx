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
import { Tabs } from '@/shared/ui/data'
import { money } from '@/shared/lib/money'
import { Sheet } from '@/shared/ui/overlay'
import { MoneyInput } from '@/shared/ui/pickers'

type Row = Pick<Service, 'id' | 'price' | 'unit_cost' | 'duration_ar' | 'target_hours' | 'is_online'>

/** Edit prices, costs, durations and the online flag of many services in one table (admin or counter services). */
export function BulkPricesSheet({ open, onClose, services }: { open: boolean; onClose: () => void; services: Service[] }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [kind, setKind] = useState<'admin' | 'counter'>('admin')
  const list = useMemo(() => services.filter((s) => s.kind === kind && s.pricing_mode !== 'open'), [services, kind])
  const [rows, setRows] = useState<Record<string, Row>>({})
  const [q, setQ] = useState('')
  const [onlyZero, setOnlyZero] = useState(false)
  const [onlyHidden, setOnlyHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setRows(Object.fromEntries(list.map((s) => [s.id, { id: s.id, price: s.price, unit_cost: s.unit_cost ?? 0, duration_ar: s.duration_ar, target_hours: s.target_hours, is_online: s.is_online }])))
  }, [open, list])

  const changed = list.filter((s) => {
    const r = rows[s.id]
    return r && (r.price !== s.price || (r.unit_cost ?? 0) !== (s.unit_cost ?? 0) || (r.duration_ar ?? '') !== (s.duration_ar ?? '') || r.target_hours !== s.target_hours || r.is_online !== s.is_online)
  })
  const shown = list.filter(
    (s) =>
      (!q || s.name_ar.includes(q) || s.name_fr.toLowerCase().includes(q.toLowerCase())) &&
      (!onlyZero || (rows[s.id]?.price ?? 0) === 0) &&
      (!onlyHidden || kind !== 'admin' || !s.is_online),
  )
  const set = (id: string, patch: Partial<Row>) => setRows((x) => ({ ...x, [id]: { ...x[id], ...patch } }))

  const save = async () => {
    setBusy(true)
    for (const s of changed) {
      const { id, ...v } = rows[s.id]
      const { error } = await sb.from('services').update(kind === 'counter' ? { price: v.price, unit_cost: v.unit_cost ?? 0 } : { ...v, duration_ar: v.duration_ar || null }).eq('id', id)
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
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="max-w-4xl" title={t('تعديل الأسعار دفعة واحدة', 'Modifier les prix en masse')} description={t('السعر والتكلفة (لحساب الربح الحقيقي)، والمدة والظهور في الموقع للخدمات الإدارية', 'Prix et coût (pour la vraie marge), délai et mise en ligne')}>
      <div className="space-y-3">
        <Tabs value={kind} onChange={(v) => setKind(v as 'admin' | 'counter')} items={[{ value: 'admin', label: t('الخدمات الإدارية', 'Services administratifs') }, { value: 'counter', label: t('خدمات الشبّاك (طباعة، نسخ…)', 'Guichet (impression, copie…)') }]} />
        <div className="flex flex-wrap items-center gap-3">
          <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('بحث…', 'Rechercher…')} className="max-w-64" />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={onlyZero} onCheckedChange={setOnlyZero} />
            {t('بدون سعر فقط', 'Sans prix seulement')}
          </label>
          {kind === 'admin' && (
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={onlyHidden} onCheckedChange={setOnlyHidden} />
              {t('غير الظاهرة في الموقع فقط', 'Hors ligne seulement')}
            </label>
          )}
        </div>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-3 py-2 text-start">{t('الخدمة', 'Service')}</th>
                <th className="px-2 py-2 text-start">{t('السعر', 'Prix')}</th>
                <th className="px-2 py-2 text-start">{kind === 'counter' ? t('التكلفة (ورق + حبر)', 'Coût (papier + encre)') : t('التكلفة (رسوم داخلة في الثمن)', 'Coût (frais inclus)')}</th>
                <th className="px-2 py-2 text-start">{t('الربح', 'Marge')}</th>
                {kind === 'admin' && (
                  <>
                    <th className="px-2 py-2 text-start">{t('المدة (للزبون)', 'Délai affiché')}</th>
                    <th className="px-2 py-2 text-start">{t('الهدف (ساعات)', 'Objectif (h)')}</th>
                    <th className="px-2 py-2">{t('في الموقع', 'En ligne')}</th>
                  </>
                )}
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
                    <td className="w-32 px-2 py-1.5">
                      <MoneyInput value={r.unit_cost ?? 0} onChange={(v) => set(s.id, { unit_cost: v ?? 0 })} />
                    </td>
                    <td className={cn('num px-2 py-1.5 text-xs whitespace-nowrap', (r.unit_cost ?? 0) > r.price ? 'text-danger' : 'text-success')}>
                      {r.price > 0 ? `${money(r.price - (r.unit_cost ?? 0))} · ${Math.round(((r.price - (r.unit_cost ?? 0)) / r.price) * 100)}%` : '—'}
                    </td>
                    {kind === 'admin' && (
                    <>
                    <td className="w-40 px-2 py-1.5">
                      <Input value={r.duration_ar ?? ''} onChange={(e) => set(s.id, { duration_ar: e.target.value })} placeholder={t('مثلاً: 24 ساعة', 'ex. 24 h')} />
                    </td>
                    <td className="w-24 px-2 py-1.5">
                      <Input type="number" min={0} value={r.target_hours ?? ''} onChange={(e) => set(s.id, { target_hours: e.target.value === '' ? null : Number(e.target.value) })} className="num" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Switch checked={r.is_online} onCheckedChange={(is_online) => set(s.id, { is_online })} />
                    </td>
                    </>
                    )}
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
