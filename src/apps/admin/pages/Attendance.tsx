import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { addMonths, differenceInMinutes, format } from 'date-fns'
import { AlertTriangle, CalendarClock, Clock, Pencil, Plus, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Card, Field, Input } from '@/shared/ui/primitives'
import { Dialog, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, type Column } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'

type Entry = { id: string; employee_id: string; full_name: string; color: string; check_in: string; check_out: string | null; note: string | null; device: string | null }
type Summary = { employee_id: string; full_name: string; color: string; days: number; hours: number; forgotten: number }
type Edit = { id?: string; employee_id: string | null; check_in: string; check_out: string; note: string }

const local = (d: string | null) => (d ? format(new Date(d), "yyyy-MM-dd'T'HH:mm") : '')
const dur = (a: string, b: string | null) => {
  const m = differenceInMinutes(b ? new Date(b) : new Date(), new Date(a))
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/** 38 · Clock-in / clock-out made by employees from the POS with their PIN. */
export function AttendancePage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [emp, setEmp] = useState<string | null>(null)
  const [edit, setEdit] = useState<Edit | null>(null)

  const range = useMemo(() => {
    const from = new Date(`${month}-01T00:00:00`)
    return { from, to: addMonths(from, 1) }
  }, [month])
  const q = useQuery({
    queryKey: ['attendance', month],
    queryFn: async () => (await sb.rpc('attendance_report', { p_from: range.from.toISOString(), p_to: range.to.toISOString() })).data as { employees: Summary[]; entries: Entry[] },
  })
  const employees = useQuery({ queryKey: ['employees-lite'], queryFn: async () => (await sb.from('employees').select('id, full_name').is('deleted_at', null).eq('is_owner', false)).data ?? [] })
  const entries = (q.data?.entries ?? []).filter((e) => !emp || e.employee_id === emp)
  const refresh = () => qc.invalidateQueries({ queryKey: ['attendance'] })
  const forgotten = (e: Entry) => !e.check_out && Date.now() - new Date(e.check_in).getTime() > 14 * 3600_000

  const save = async () => {
    if (!edit?.employee_id || !edit.check_in) return toast.error(t('اختر الموظف ووقت الدخول', 'Employé et heure d’entrée requis'))
    const row = { employee_id: edit.employee_id, check_in: new Date(edit.check_in).toISOString(), check_out: edit.check_out ? new Date(edit.check_out).toISOString() : null, note: edit.note || null }
    if (row.check_out && row.check_out < row.check_in) return toast.error(t('وقت الخروج قبل وقت الدخول', 'Sortie avant l’entrée'))
    const { error } = edit.id ? await sb.from('attendance').update(row).eq('id', edit.id) : await sb.from('attendance').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم الحفظ', 'Enregistré'))
    setEdit(null)
    refresh()
  }
  const remove = async (e: Entry) => {
    if (!(await confirm({ title: t('حذف هذا التسجيل؟', 'Supprimer ce pointage ?'), danger: true }))) return
    const { error } = await sb.from('attendance').delete().eq('id', e.id)
    if (error) return toast.error(errorMessage(error, lang))
    refresh()
  }

  const cols: Column<Entry>[] = [
    { key: 'e', header: t('الموظف', 'Employé'), cell: (e) => <div className="flex items-center gap-2"><Avatar name={e.full_name} color={e.color} size={28} />{e.full_name}</div> },
    { key: 'd', header: t('اليوم', 'Jour'), sortValue: (e) => e.check_in, cell: (e) => <span className="num">{format(new Date(e.check_in), 'EEE dd/MM')}</span> },
    { key: 'i', header: t('الدخول', 'Entrée'), cell: (e) => <span className="num font-medium">{format(new Date(e.check_in), 'HH:mm')}</span> },
    {
      key: 'o',
      header: t('الخروج', 'Sortie'),
      cell: (e) =>
        e.check_out ? (
          <span className="num font-medium">{format(new Date(e.check_out), 'HH:mm')}</span>
        ) : forgotten(e) ? (
          <Badge tone="danger"><AlertTriangle />{t('نسي تسجيل الخروج', 'Sortie oubliée')}</Badge>
        ) : (
          <Badge tone="success">{t('حاضر الآن', 'Présent')}</Badge>
        ),
    },
    { key: 'h', header: t('المدة', 'Durée'), cell: (e) => <span className={cn('num', forgotten(e) && 'text-subtle line-through')}>{dur(e.check_in, e.check_out)}</span> },
    { key: 'n', header: t('ملاحظة', 'Note'), cell: (e) => <span className="text-xs text-muted">{e.note ?? (e.device ? `${t('جهاز', 'Poste')}: ${e.device}` : '')}</span> },
    {
      key: 'a',
      header: '',
      cell: (e) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon-sm" onClick={(ev) => (ev.stopPropagation(), setEdit({ id: e.id, employee_id: e.employee_id, check_in: local(e.check_in), check_out: local(e.check_out), note: e.note ?? '' }))}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={(ev) => (ev.stopPropagation(), remove(e))}>
            <Trash className="text-danger" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<CalendarClock />}
        title={t('الحضور والانصراف', 'Présences')}
        description={t('يسجّل الموظف حضوره وخروجه من نقطة البيع برمزه السري. يمكنك تصحيح أي تسجيل هنا.', 'Pointage depuis le POS avec le PIN. Corrigez ici si besoin.')}
        actions={
          <Button onClick={() => setEdit({ employee_id: emp, check_in: format(new Date(), "yyyy-MM-dd'T'09:00"), check_out: '', note: '' })}>
            <Plus />
            {t('إضافة يدوياً', 'Ajouter')}
          </Button>
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-3 p-3">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="num w-44" dir="ltr" />
        <div className="w-56">
          <Select value={emp} onValueChange={setEmp} allowEmpty emptyLabel={t('كل الموظفين', 'Tous les employés')} options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.full_name }))} />
        </div>
      </Card>

      {(q.data?.employees.length ?? 0) > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {q.data!.employees.map((s) => (
            <Card key={s.employee_id} className="flex items-center gap-3 p-4">
              <Avatar name={s.full_name} color={s.color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.full_name}</div>
                <div className="num flex items-center gap-3 text-sm text-muted">
                  <span>{s.days} {t('يوم', 'j')}</span>
                  <span className="flex items-center gap-1"><Clock className="size-3.5" />{s.hours} {t('ساعة', 'h')}</span>
                </div>
              </div>
              {s.forgotten > 0 && <Badge tone="danger">{s.forgotten}</Badge>}
            </Card>
          ))}
        </div>
      )}

      <DataTable rows={entries} columns={cols} rowKey={(e) => e.id} loading={q.isLoading} pageSize={50} empty={<EmptyState icon={<CalendarClock />} title={t('لا توجد تسجيلات في هذا الشهر', 'Aucun pointage ce mois')} description={t('في نقطة البيع: زر «الحضور» أعلى الشاشة بعد إدخال الرمز السري.', 'Au POS : bouton « Pointage » en haut après le PIN.')} />} />

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? t('تصحيح التسجيل', 'Corriger le pointage') : t('إضافة تسجيل', 'Ajouter un pointage')} size="sm">
        {edit && (
          <div className="space-y-4">
            <Field label={t('الموظف', 'Employé')}>
              <Select value={edit.employee_id} onValueChange={(v) => setEdit({ ...edit, employee_id: v })} options={(employees.data ?? []).map((e) => ({ value: e.id, label: e.full_name }))} />
            </Field>
            <Field label={t('الدخول', 'Entrée')}>
              <Input type="datetime-local" value={edit.check_in} onChange={(e) => setEdit({ ...edit, check_in: e.target.value })} className="num" dir="ltr" />
            </Field>
            <Field label={t('الخروج', 'Sortie')}>
              <Input type="datetime-local" value={edit.check_out} onChange={(e) => setEdit({ ...edit, check_out: e.target.value })} className="num" dir="ltr" />
            </Field>
            <Field label={t('ملاحظة', 'Note')}>
              <Input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder={t('مثلاً: نسي تسجيل الخروج', 'ex. sortie oubliée')} />
            </Field>
            <Button className="w-full" onClick={save}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  )
}
