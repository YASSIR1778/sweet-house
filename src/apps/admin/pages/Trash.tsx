import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArchiveRestore, Trash, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Badge, Button } from '@/shared/ui/primitives'
import { useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, type Column } from '@/shared/ui/data'

type Item = { entity: string; id: string; label: string; deleted_at: string }

const NAMES: Record<string, [string, string]> = {
  products: ['منتج', 'Produit'],
  categories: ['فئة', 'Catégorie'],
  services: ['خدمة', 'Service'],
  service_categories: ['فئة خدمات', 'Catégorie service'],
  customers: ['زبون', 'Client'],
  employees: ['موظف', 'Employé'],
  roles: ['دور', 'Rôle'],
}

export function TrashPage() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()

  const items = useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const { data, error } = await sb.rpc('trash_list')
      if (error) throw error
      return (data ?? []) as Item[]
    },
  })

  const restore = async (it: Item) => {
    const { error } = await sb.rpc('trash_restore', { p_entity: it.entity, p_id: it.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`تم استرجاع «${it.label}»`, `« ${it.label} » restauré`))
    qc.invalidateQueries()
  }

  const purge = async (it: Item) => {
    if (!(await confirm({ title: t('حذف نهائي؟', 'Supprimer définitivement ?'), description: t('لا يمكن التراجع عن هذه العملية.', 'Cette action est irréversible.'), danger: true, confirmLabel: t('حذف نهائي', 'Supprimer') }))) return
    const { error } = await sb.rpc('trash_purge', { p_entity: it.entity, p_id: it.id })
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['trash'] })
  }

  const columns: Column<Item>[] = [
    { key: 'label', header: t('العنصر', 'Élément'), cell: (it) => <span className="font-medium">{it.label}</span> },
    { key: 'type', header: t('النوع', 'Type'), cell: (it) => <Badge>{t(...(NAMES[it.entity] ?? [it.entity, it.entity]))}</Badge> },
    { key: 'date', header: t('تاريخ الحذف', 'Supprimé le'), sortValue: (it) => it.deleted_at, cell: (it) => <span className="num text-muted">{format(new Date(it.deleted_at), 'dd/MM/yyyy HH:mm')}</span> },
    {
      key: 'actions',
      header: '',
      cell: (it) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="soft" onClick={() => restore(it)}>
            <ArchiveRestore />
            {t('استرجاع', 'Restaurer')}
          </Button>
          {me?.is_owner && it.entity !== 'employees' && (
            <Button size="sm" variant="ghost" onClick={() => purge(it)}>
              <X className="text-danger" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  return (
    <>
      {confirmNode}
      <PageHeader icon={<Trash />} title={t('سلة المهملات', 'Corbeille')} description={t('كل ما تحذفه يأتي هنا ويمكنك استرجاعه', 'Tout ce que vous supprimez arrive ici')} />
      <DataTable rows={items.data ?? []} columns={columns} rowKey={(it) => it.entity + it.id} loading={items.isLoading} empty={<EmptyState icon={<Trash />} title={t('السلة فارغة 🎉', 'Corbeille vide 🎉')} />} />
    </>
  )
}
