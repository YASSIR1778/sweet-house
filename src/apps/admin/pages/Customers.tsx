import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Building2, MessageCircle, Phone, Plus, Search, Trash, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { Customer } from '@/shared/lib/types'
import { normalizePhone, whatsappLink } from '@/shared/lib/utils'
import { Avatar, Button, Card, Field, Input, Textarea } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { DataTable, PageHeader, type Column } from '@/shared/ui/data'

const blank: Partial<Customer> = { full_name: '', phone: '', email: '', company_name: '', ice: '', address: '', city: 'Tétouan', notes: '' }

export function CustomersPage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [search, setSearch] = useState('')
  const [edit, setEdit] = useState<Partial<Customer> | null>(null)
  const [busy, setBusy] = useState(false)

  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await sb.from('customers').select('*').is('deleted_at', null).order('created_at', { ascending: false })
      if (error) throw error
      return data as Customer[]
    },
  })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (customers.data ?? []).filter((c) => !q || c.full_name.toLowerCase().includes(q) || c.phone?.includes(q) || c.company_name?.toLowerCase().includes(q))
  }, [customers.data, search])

  const save = async () => {
    if (!edit?.full_name?.trim()) return toast.error(t('الاسم مطلوب', 'Nom obligatoire'))
    setBusy(true)
    const row = { ...edit, phone: edit.phone ? normalizePhone(edit.phone) : null }
    delete row.id
    delete row.created_at
    delete row.deleted_at
    const { error } = edit.id ? await sb.from('customers').update(row).eq('id', edit.id) : await sb.from('customers').insert(row)
    setBusy(false)
    if (error) return toast.error(error.code === '23505' ? t('رقم الهاتف مستعمل لزبون آخر', 'Ce numéro existe déjà') : errorMessage(error, lang))
    toast.success(t('تم الحفظ', 'Enregistré'))
    setEdit(null)
    qc.invalidateQueries({ queryKey: ['customers'] })
  }

  const remove = async () => {
    if (!edit?.id) return
    if (!(await confirm({ title: t('حذف الزبون؟', 'Supprimer le client ?'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'customers', p_id: edit.id })
    if (error) return toast.error(errorMessage(error, lang))
    setEdit(null)
    qc.invalidateQueries({ queryKey: ['customers'] })
  }

  const columns: Column<Customer>[] = [
    {
      key: 'name',
      header: t('الزبون', 'Client'),
      sortValue: (c) => c.full_name,
      cell: (c) => (
        <div className="flex items-center gap-3">
          <Avatar name={c.full_name} color="#475569" size={36} />
          <div>
            <div className="font-medium">{c.full_name}</div>
            {c.company_name && (
              <div className="flex items-center gap-1 text-xs text-muted">
                <Building2 className="size-3" />
                {c.company_name}
              </div>
            )}
          </div>
        </div>
      ),
    },
    { key: 'phone', header: t('الهاتف', 'Téléphone'), cell: (c) => (c.phone ? <span className="num" dir="ltr">+{c.phone}</span> : '—') },
    { key: 'city', header: t('المدينة', 'Ville'), cell: (c) => c.city ?? '—' },
    { key: 'date', header: t('تاريخ الإضافة', 'Ajouté le'), sortValue: (c) => c.created_at, cell: (c) => <span className="num text-muted">{format(new Date(c.created_at), 'dd/MM/yyyy')}</span> },
    {
      key: 'wa',
      header: '',
      className: 'w-12',
      cell: (c) =>
        c.phone ? (
          <a href={whatsappLink(c.phone, '')} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex size-8 items-center justify-center rounded-lg text-success hover:bg-success/10">
            <MessageCircle className="size-4" />
          </a>
        ) : null,
    },
  ]

  const set = (k: keyof Customer) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setEdit({ ...edit, [k]: e.target.value })

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<UserRound />}
        title={t('الزبائن', 'Clients')}
        description={t('قاعدة زبائنك. الديون وكشوف الحساب في المرحلة 2', 'Votre fichier clients. Crédits et relevés en phase 2')}
        actions={
          <Button onClick={() => setEdit({ ...blank })}>
            <Plus />
            {t('زبون جديد', 'Nouveau client')}
          </Button>
        }
      />
      <Card className="mb-4 p-3">
        <Input icon={<Search />} placeholder={t('ابحث بالاسم أو الهاتف أو الشركة…', 'Nom, téléphone ou société…')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>
      <DataTable rows={rows} columns={columns} rowKey={(c) => c.id} loading={customers.isLoading} onRowClick={(c) => setEdit(c)} />

      <Sheet
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? t('تعديل الزبون', 'Modifier le client') : t('زبون جديد', 'Nouveau client')}
        footer={
          <>
            {edit?.id && (
              <Button variant="danger-soft" className="me-auto" onClick={remove}>
                <Trash />
                {t('حذف', 'Supprimer')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t('إلغاء', 'Annuler')}
            </Button>
            <Button onClick={save} loading={busy}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <Field label={t('الاسم الكامل', 'Nom complet')} required>
              <Input value={edit.full_name ?? ''} onChange={set('full_name')} autoFocus />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('الهاتف', 'Téléphone')}>
                <Input icon={<Phone />} value={edit.phone ?? ''} onChange={set('phone')} dir="ltr" placeholder="06 XX XX XX XX" />
              </Field>
              <Field label={t('البريد الإلكتروني', 'E-mail')}>
                <Input value={edit.email ?? ''} onChange={set('email')} dir="ltr" />
              </Field>
              <Field label={t('الشركة', 'Société')}>
                <Input value={edit.company_name ?? ''} onChange={set('company_name')} />
              </Field>
              <Field label="ICE">
                <Input value={edit.ice ?? ''} onChange={set('ice')} dir="ltr" className="num" />
              </Field>
              <Field label={t('العنوان', 'Adresse')}>
                <Input value={edit.address ?? ''} onChange={set('address')} />
              </Field>
              <Field label={t('المدينة', 'Ville')}>
                <Input value={edit.city ?? ''} onChange={set('city')} />
              </Field>
            </div>
            <Field label={t('ملاحظات', 'Notes')}>
              <Textarea value={edit.notes ?? ''} onChange={set('notes')} />
            </Field>
          </div>
        )}
      </Sheet>
    </>
  )
}
