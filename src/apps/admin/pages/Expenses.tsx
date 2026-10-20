import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth } from 'date-fns'
import { Download, FileText, FolderCog, Plus, Trash } from 'lucide-react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import { Badge, Button, Card, CardHeader, Field, Input } from '@/shared/ui/primitives'
import { Dialog, useConfirm } from '@/shared/ui/overlay'
import { DataTable, PageHeader, StatCard, type Column } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { ColorPicker, MoneyInput } from '@/shared/ui/pickers'
import { DynamicIcon } from '@/shared/ui/icon'

type Cat = { id: string; name_ar: string; name_fr: string; icon: string | null; color: string; sort: number }
type Exp = { id: string; category_id: string | null; amount: number; spent_on: string; paid_from: 'drawer' | 'bank' | 'owner'; note: string | null; employees: { full_name: string } | null }

export function ExpensesPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [form, setForm] = useState<{ category_id: string | null; amount: number | null; spent_on: string; paid_from: 'bank' | 'owner'; note: string } | null>(null)
  const [catsOpen, setCatsOpen] = useState(false)
  const [newCat, setNewCat] = useState({ name_ar: '', color: '#475569' })
  const [busy, setBusy] = useState(false)

  const from = startOfMonth(new Date(`${month}-01T00:00:00`))
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1)

  const cats = useQuery({ queryKey: ['expense-cats'], queryFn: async () => (await sb.from('expense_categories').select('*').is('deleted_at', null).order('sort')).data as Cat[] })
  const list = useQuery({
    queryKey: ['expenses', month],
    queryFn: async () => {
      const { data, error } = await sb
        .from('expenses')
        .select('id, category_id, amount, spent_on, paid_from, note, employees(full_name)')
        .is('deleted_at', null)
        .gte('spent_on', format(from, 'yyyy-MM-dd'))
        .lt('spent_on', format(to, 'yyyy-MM-dd'))
        .order('spent_on', { ascending: false })
      if (error) throw error
      return data as unknown as Exp[]
    },
  })
  const cat = (id: string | null) => cats.data?.find((c) => c.id === id)

  const byCat = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of list.data ?? []) m.set(e.category_id ?? '-', (m.get(e.category_id ?? '-') ?? 0) + e.amount)
    return [...m.entries()].map(([id, amount]) => ({ id, amount, cat: cat(id === '-' ? null : id) })).sort((a, b) => b.amount - a.amount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.data, cats.data])
  const total = (list.data ?? []).reduce((a, e) => a + e.amount, 0)

  const save = async () => {
    if (!form?.amount) return
    setBusy(true)
    const { error } = await sb.rpc('add_expense', { p: { ...form } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تمت إضافة المصروف', 'Dépense ajoutée'))
    setForm(null)
    qc.invalidateQueries({ queryKey: ['expenses'] })
  }

  const remove = async (e: Exp) => {
    if (e.paid_from === 'drawer') return toast.error(t('مصاريف الدرج مرتبطة بالوردية ولا تُحذف', 'Les dépenses de caisse ne peuvent pas être supprimées'))
    if (!(await confirm({ title: t('حذف المصروف؟', 'Supprimer ?'), danger: true }))) return
    const { error } = await sb.from('expenses').update({ deleted_at: new Date().toISOString() }).eq('id', e.id)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['expenses'] })
  }

  const addCat = async () => {
    if (!newCat.name_ar.trim()) return
    const { error } = await sb.from('expense_categories').insert({ name_ar: newCat.name_ar, name_fr: newCat.name_ar, color: newCat.color, sort: (cats.data?.length ?? 0) + 1 })
    if (error) return toast.error(errorMessage(error, lang))
    setNewCat({ name_ar: '', color: '#475569' })
    qc.invalidateQueries({ queryKey: ['expense-cats'] })
  }

  const FROM: Record<string, [string, string]> = { drawer: ['من الدرج', 'Caisse'], bank: ['من البنك', 'Banque'], owner: ['من المالك', 'Propriétaire'] }

  const columns: Column<Exp>[] = [
    { key: 'date', header: t('التاريخ', 'Date'), sortValue: (e) => e.spent_on, cell: (e) => <span className="num text-muted">{format(new Date(e.spent_on), 'dd/MM/yyyy')}</span> },
    {
      key: 'cat',
      header: t('الفئة', 'Catégorie'),
      cell: (e) => {
        const c = cat(e.category_id)
        return c ? (
          <span className="inline-flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg text-white" style={{ background: c.color }}>
              <DynamicIcon name={c.icon} className="size-3.5" />
            </span>
            {pick(c, 'name')}
          </span>
        ) : (
          '—'
        )
      },
    },
    { key: 'note', header: t('البيان', 'Libellé'), cell: (e) => e.note ?? '—' },
    { key: 'from', header: t('الأداء', 'Payé'), cell: (e) => <Badge tone={e.paid_from === 'drawer' ? 'warning' : 'neutral'}>{t(...FROM[e.paid_from])}</Badge> },
    { key: 'amount', header: t('المبلغ', 'Montant'), sortValue: (e) => e.amount, cell: (e) => <span className="num font-bold">{money(e.amount)}</span> },
    {
      key: 'x',
      header: '',
      cell: (e) => (
        <Button variant="ghost" size="icon-sm" onClick={() => remove(e)}>
          <Trash className="text-danger" />
        </Button>
      ),
    },
  ]

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<FileText />}
        title={t('المصاريف', 'Dépenses')}
        description={t('كل ما تصرفه على المكتبة، لحساب الربح الصافي', 'Toutes les dépenses, pour le bénéfice net')}
        actions={
          <>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="num w-44" dir="ltr" />
            <Button variant="outline" onClick={() => setCatsOpen(true)}>
              <FolderCog />
              {t('الفئات', 'Catégories')}
            </Button>
            <Button variant="outline" onClick={() => downloadCsv(`depenses-${month}`, ['Date', 'Catégorie', 'Libellé', 'Payé', 'Montant'], (list.data ?? []).map((e) => [e.spent_on, cat(e.category_id)?.name_fr, e.note, e.paid_from, csvMoney(e.amount)]))}>
              <Download />
            </Button>
            <Button onClick={() => setForm({ category_id: null, amount: null, spent_on: format(new Date(), 'yyyy-MM-dd'), paid_from: 'bank', note: '' })}>
              <Plus />
              {t('مصروف جديد', 'Nouvelle dépense')}
            </Button>
          </>
        }
      />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <StatCard index={0} tone="danger" label={t('مجموع مصاريف الشهر', 'Total du mois')} value={money(total)} icon={<FileText />} loading={list.isLoading} hint={`${list.data?.length ?? 0} ${t('عملية', 'opérations')}`} />
        <Card className="lg:col-span-2">
          <CardHeader title={t('حسب الفئة', 'Par catégorie')} />
          <div className="flex items-center gap-6 p-4">
            <div className="size-36 shrink-0" dir="ltr">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={byCat} dataKey="amount" innerRadius={40} outerRadius={64} paddingAngle={2}>
                    {byCat.map((b) => (
                      <Cell key={b.id} fill={b.cat?.color ?? '#94a3b8'} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(v) => money(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              {byCat.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: b.cat?.color ?? '#94a3b8' }} />
                  <span className="flex-1 truncate">{b.cat ? pick(b.cat, 'name') : t('بدون فئة', 'Sans catégorie')}</span>
                  <span className="num font-semibold">{money(b.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
      <DataTable rows={list.data ?? []} columns={columns} rowKey={(e) => e.id} loading={list.isLoading} />

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)} size="sm" title={t('مصروف جديد', 'Nouvelle dépense')} description={t('مصاريف الدرج تُسجَّل من نقطة البيع', 'Les dépenses de caisse se saisissent au POS')}>
        {form && (
          <div className="space-y-4">
            <Field label={t('الفئة', 'Catégorie')}>
              <Select value={form.category_id} onValueChange={(category_id) => setForm({ ...form, category_id })} options={(cats.data ?? []).map((c) => ({ value: c.id, label: pick(c, 'name') }))} placeholder={t('اختر…', 'Choisir…')} />
            </Field>
            <Field label={t('المبلغ', 'Montant')} required>
              <MoneyInput value={form.amount} onChange={(amount) => setForm({ ...form, amount })} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('التاريخ', 'Date')}>
                <Input type="date" value={form.spent_on} onChange={(e) => setForm({ ...form, spent_on: e.target.value })} dir="ltr" />
              </Field>
              <Field label={t('دُفع من', 'Payé par')}>
                <Select value={form.paid_from} onValueChange={(v) => setForm({ ...form, paid_from: (v ?? 'bank') as 'bank' | 'owner' })} options={[{ value: 'bank', label: t('البنك', 'Banque') }, { value: 'owner', label: t('المالك', 'Propriétaire') }]} />
              </Field>
            </div>
            <Field label={t('البيان', 'Libellé')}>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <Button className="w-full" onClick={save} loading={busy} disabled={!form.amount}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>

      <Dialog open={catsOpen} onOpenChange={setCatsOpen} size="sm" title={t('فئات المصاريف', 'Catégories de dépenses')}>
        <div className="space-y-2">
          {cats.data?.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: c.color }} />
              <span className="flex-1">{pick(c, 'name')}</span>
              <Button variant="ghost" size="icon-sm" onClick={async () => (await sb.from('expense_categories').update({ deleted_at: new Date().toISOString() }).eq('id', c.id), qc.invalidateQueries({ queryKey: ['expense-cats'] }))}>
                <Trash className="text-danger" />
              </Button>
            </div>
          ))}
          <div className="space-y-2 rounded-xl bg-surface-2 p-3">
            <Input value={newCat.name_ar} onChange={(e) => setNewCat({ ...newCat, name_ar: e.target.value })} placeholder={t('اسم الفئة', 'Nom')} />
            <ColorPicker value={newCat.color} onChange={(color) => setNewCat({ ...newCat, color })} />
            <Button size="sm" onClick={addCat} disabled={!newCat.name_ar.trim()}>
              <Plus />
              {t('إضافة', 'Ajouter')}
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
