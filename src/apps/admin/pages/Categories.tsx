import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, MoreVertical, Pencil, Plus, Tags, Trash } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { Category } from '@/shared/lib/types'
import { Badge, Button, Card, Field, Input, Skeleton, SwitchRow } from '@/shared/ui/primitives'
import { Dialog, Dropdown, DropdownContent, DropdownItem, DropdownTrigger, useConfirm } from '@/shared/ui/overlay'
import { EmptyState, PageHeader } from '@/shared/ui/data'
import { ColorPicker, IconPicker } from '@/shared/ui/pickers'
import { DynamicIcon } from '@/shared/ui/icon'

const blank = { name_ar: '', name_fr: '', icon: 'book-open', color: '#FF6B35', is_online: true, sort: 0 }

export function CategoriesPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [edit, setEdit] = useState<(Partial<Category> & typeof blank) | null>(null)

  const cats = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await sb.from('categories').select('*, products(count)').is('deleted_at', null).order('sort').order('name_ar')
      if (error) throw error
      return data as (Category & { products: { count: number }[] })[]
    },
  })

  const save = useMutation({
    mutationFn: async (c: Partial<Category>) => {
      const row = { name_ar: c.name_ar, name_fr: c.name_fr || c.name_ar, icon: c.icon, color: c.color, is_online: c.is_online, sort: c.sort ?? 0 }
      const { error } = c.id ? await sb.from('categories').update(row).eq('id', c.id) : await sb.from('categories').insert(row)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success(t('تم الحفظ', 'Enregistré'))
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['categories'] })
    },
    onError: (e) => toast.error(errorMessage(e, lang)),
  })

  const remove = async (c: Category) => {
    if (!(await confirm({ title: t('نقل الفئة إلى سلة المهملات؟', 'Mettre la catégorie à la corbeille ?'), description: t('المنتجات المرتبطة بها ستبقى بدون فئة. يمكنك استرجاعها لاحقاً.', 'Les produits resteront sans catégorie. Restauration possible.'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'categories', p_id: c.id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم النقل إلى سلة المهملات', 'Déplacé vers la corbeille'))
    qc.invalidateQueries({ queryKey: ['categories'] })
  }

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<Tags />}
        title={t('فئات المنتجات', 'Catégories de produits')}
        description={t('نظّم منتجاتك في فئات تظهر في نقطة البيع والموقع', 'Organisez vos produits en catégories (POS et site)')}
        actions={
          <Button onClick={() => setEdit({ ...blank })}>
            <Plus />
            {t('فئة جديدة', 'Nouvelle catégorie')}
          </Button>
        }
      />

      {cats.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : !cats.data?.length ? (
        <Card>
          <EmptyState
            icon={<Tags />}
            title={t('لا توجد فئات بعد', 'Aucune catégorie')}
            description={t('ابدأ بإنشاء فئات مثل: أدوات مدرسية، كتب، ورق…', 'Commencez par : fournitures, livres, papeterie…')}
            action={
              <Button onClick={() => setEdit({ ...blank })}>
                <Plus />
                {t('فئة جديدة', 'Nouvelle catégorie')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cats.data.map((c, i) => (
            <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
              <Card className="group relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop">
                <div className="absolute -end-6 -top-6 size-24 rounded-full opacity-10 transition-transform duration-500 group-hover:scale-150" style={{ background: c.color }} />
                <div className="relative flex items-start justify-between">
                  <div className="flex size-12 items-center justify-center rounded-xl text-white shadow-md" style={{ background: c.color }}>
                    <DynamicIcon name={c.icon} className="size-5" />
                  </div>
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="icon-sm">
                        <MoreVertical />
                      </Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem icon={<Pencil />} onSelect={() => setEdit({ ...blank, ...c })}>
                        {t('تعديل', 'Modifier')}
                      </DropdownItem>
                      <DropdownItem icon={<Trash />} danger onSelect={() => remove(c)}>
                        {t('حذف', 'Supprimer')}
                      </DropdownItem>
                    </DropdownContent>
                  </Dropdown>
                </div>
                <div className="relative mt-4">
                  <div className="font-semibold">{pick(c, 'name')}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                    <span className="num">
                      {c.products?.[0]?.count ?? 0} {t('منتج', 'produits')}
                    </span>
                    {c.is_online ? (
                      <Badge tone="success">
                        <Eye />
                        {t('في الموقع', 'En ligne')}
                      </Badge>
                    ) : (
                      <Badge>
                        <EyeOff />
                        {t('مخفية', 'Masquée')}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? t('تعديل الفئة', 'Modifier la catégorie') : t('فئة جديدة', 'Nouvelle catégorie')}
        footer={
          <>
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t('إلغاء', 'Annuler')}
            </Button>
            <Button loading={save.isPending} disabled={!edit?.name_ar} onClick={() => edit && save.mutate(edit)}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('الاسم بالعربية', 'Nom en arabe')} required>
                <Input value={edit.name_ar} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} dir="rtl" autoFocus />
              </Field>
              <Field label={t('الاسم بالفرنسية', 'Nom en français')}>
                <Input value={edit.name_fr} onChange={(e) => setEdit({ ...edit, name_fr: e.target.value })} dir="ltr" />
              </Field>
            </div>
            <Field label={t('اللون', 'Couleur')}>
              <ColorPicker value={edit.color} onChange={(color) => setEdit({ ...edit, color })} />
            </Field>
            <Field label={t('الأيقونة', 'Icône')}>
              <IconPicker value={edit.icon} color={edit.color} onChange={(icon) => setEdit({ ...edit, icon })} />
            </Field>
            <Field label={t('الترتيب', 'Ordre')}>
              <Input type="number" value={edit.sort} onChange={(e) => setEdit({ ...edit, sort: Number(e.target.value) })} className="num w-28" />
            </Field>
            <SwitchRow label={t('تظهر في الموقع', 'Visible sur le site')} checked={edit.is_online} onCheckedChange={(is_online) => setEdit({ ...edit, is_online })} />
          </div>
        )}
      </Dialog>
    </>
  )
}
