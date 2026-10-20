import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Repeat, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { Badge, Button, Card, CardHeader, Field, Input, Switch } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { MoneyInput } from '@/shared/ui/pickers'

type Rec = { id: string; category_id: string | null; amount: number; day_of_month: number; paid_from: 'bank' | 'owner'; note: string | null; is_active: boolean; last_generated: string | null }
type Cat = { id: string; name_ar: string; name_fr: string; color: string }

export function RecurringExpenses({ cats }: { cats: Cat[] }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [edit, setEdit] = useState<Partial<Rec> | null>(null)

  const list = useQuery({ queryKey: ['recurring'], queryFn: async () => (await sb.from('recurring_expenses').select('*').order('day_of_month')).data as Rec[] })
  const refresh = () => (qc.invalidateQueries({ queryKey: ['recurring'] }), qc.invalidateQueries({ queryKey: ['expenses'] }))

  const save = async () => {
    if (!edit?.amount) return
    const row = { category_id: edit.category_id ?? null, amount: edit.amount, day_of_month: edit.day_of_month ?? 1, paid_from: edit.paid_from ?? 'bank', note: edit.note ?? null, is_active: edit.is_active ?? true }
    const { error } = edit.id ? await sb.from('recurring_expenses').update(row).eq('id', edit.id) : await sb.from('recurring_expenses').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    setEdit(null)
    await sb.rpc('generate_recurring_expenses')
    refresh()
  }
  const monthly = (list.data ?? []).filter((r) => r.is_active).reduce((a, r) => a + r.amount, 0)

  return (
    <Card className="mb-5">
      <CardHeader
        title={t('المصاريف المتكررة', 'Dépenses récurrentes')}
        description={t('تُسجَّل تلقائياً كل شهر في اليوم المحدد', 'Enregistrées automatiquement chaque mois')}
        icon={<Repeat />}
        action={
          <Button size="sm" variant="outline" onClick={() => setEdit({ day_of_month: 1, paid_from: 'bank', is_active: true })}>
            <Plus />
            {t('إضافة', 'Ajouter')}
          </Button>
        }
      />
      {!list.data?.length ? (
        <div className="p-5 text-sm text-muted">{t('مثلاً: الكراء، الكهرباء، الإنترنت… أضفها مرة واحدة ولن تحتاج لتسجيلها كل شهر.', 'Ex : loyer, électricité, internet…')}</div>
      ) : (
        <div className="divide-y divide-border">
          {list.data.map((r) => {
            const c = cats.find((x) => x.id === r.category_id)
            return (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="size-2.5 rounded-full" style={{ background: c?.color ?? '#94a3b8' }} />
                <button className="min-w-0 flex-1 text-start" onClick={() => setEdit(r)}>
                  <div className="font-medium">{r.note || (c ? pick(c, 'name') : '—')}</div>
                  <div className="text-xs text-muted">
                    {t(`كل شهر يوم ${r.day_of_month}`, `Le ${r.day_of_month} de chaque mois`)} {c && `· ${pick(c, 'name')}`}
                  </div>
                </button>
                {!r.is_active && <Badge>{t('موقوف', 'Suspendu')}</Badge>}
                <span className="num font-bold">{money(r.amount)}</span>
                <Switch checked={r.is_active} onCheckedChange={async (v) => (await sb.from('recurring_expenses').update({ is_active: v }).eq('id', r.id), refresh())} />
                <Button variant="ghost" size="icon-sm" onClick={async () => (await sb.from('recurring_expenses').delete().eq('id', r.id), refresh())}>
                  <Trash className="text-danger" />
                </Button>
              </div>
            )
          })}
          <div className="flex justify-between px-5 py-3 text-sm font-semibold">
            <span>{t('المجموع الشهري', 'Total mensuel')}</span>
            <span className="num">{money(monthly)}</span>
          </div>
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} size="sm" title={t('مصروف متكرر', 'Dépense récurrente')}>
        {edit && (
          <div className="space-y-4">
            <Field label={t('البيان', 'Libellé')}>
              <Input value={edit.note ?? ''} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder={t('مثلاً: كراء المحل', 'ex : Loyer')} autoFocus />
            </Field>
            <Field label={t('الفئة', 'Catégorie')}>
              <Select value={edit.category_id ?? null} onValueChange={(category_id) => setEdit({ ...edit, category_id })} options={cats.map((c) => ({ value: c.id, label: pick(c, 'name') }))} placeholder={t('اختر…', 'Choisir…')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('المبلغ', 'Montant')}>
                <MoneyInput value={edit.amount} onChange={(amount) => setEdit({ ...edit, amount: amount ?? 0 })} />
              </Field>
              <Field label={t('يوم الشهر', 'Jour du mois')}>
                <Input type="number" min={1} max={28} value={edit.day_of_month ?? 1} onChange={(e) => setEdit({ ...edit, day_of_month: Math.min(28, Math.max(1, Number(e.target.value))) })} className="num" />
              </Field>
            </div>
            <Field label={t('دُفع من', 'Payé par')}>
              <Select value={edit.paid_from ?? 'bank'} onValueChange={(v) => setEdit({ ...edit, paid_from: (v ?? 'bank') as 'bank' | 'owner' })} options={[{ value: 'bank', label: t('البنك', 'Banque') }, { value: 'owner', label: t('المالك', 'Propriétaire') }]} />
            </Field>
            <Button className="w-full" onClick={save} disabled={!edit.amount}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>
    </Card>
  )
}
