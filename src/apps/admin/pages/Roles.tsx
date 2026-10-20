import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Pencil, Plus, ShieldCheck, Trash, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { Role } from '@/shared/lib/types'
import { Badge, Button, Card, Field, Input, Skeleton } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { PageHeader } from '@/shared/ui/data'
import { ColorPicker } from '@/shared/ui/pickers'
import { PermissionMatrix, usePermissions } from './PermissionMatrix'

export function RolesPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const perms = usePermissions()
  const { confirm, confirmNode } = useConfirm()
  const [edit, setEdit] = useState<Partial<Role> | null>(null)
  const [busy, setBusy] = useState(false)

  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await sb.from('roles').select('*, employees(count)').is('deleted_at', null).order('is_owner', { ascending: false }).order('created_at')
      if (error) throw error
      return data as (Role & { employees: { count: number }[] })[]
    },
  })

  const save = async () => {
    if (!edit?.name_ar) return toast.error(t('الاسم مطلوب', 'Nom obligatoire'))
    setBusy(true)
    const row = {
      name_ar: edit.name_ar,
      name_fr: edit.name_fr || edit.name_ar,
      description: edit.description ?? null,
      color: edit.color ?? '#475569',
      permissions: edit.permissions ?? [],
      max_discount_percent: edit.max_discount_percent ?? 0,
    }
    const { error } = edit.id ? await sb.from('roles').update(row).eq('id', edit.id) : await sb.from('roles').insert(row)
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم حفظ الدور', 'Rôle enregistré'))
    setEdit(null)
    qc.invalidateQueries({ queryKey: ['roles'] })
  }

  const remove = async (r: Role) => {
    if (!(await confirm({ title: t('حذف هذا الدور؟', 'Supprimer ce rôle ?'), description: t('الموظفون المرتبطون به سيفقدون صلاحياته', 'Les employés concernés perdront ces permissions'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'roles', p_id: r.id })
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['roles'] })
  }

  const total = perms.data?.length ?? 0

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<ShieldCheck />}
        title={t('الأدوار والصلاحيات', 'Rôles & permissions')}
        description={t('حدد ما يستطيع كل دور فعله. يمكنك أيضاً تخصيص صلاحيات موظف بعينه.', 'Définissez ce que chaque rôle peut faire.')}
        actions={
          <Button onClick={() => setEdit({ name_ar: '', name_fr: '', color: '#2563EB', permissions: ['pos.sell'], max_discount_percent: 0 })}>
            <Plus />
            {t('دور جديد', 'Nouveau rôle')}
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {roles.isLoading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-44" />)
          : roles.data?.map((r, i) => (
              <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                <Card className="relative h-full overflow-hidden p-5">
                  <div className="absolute inset-x-0 top-0 h-1" style={{ background: r.color }} />
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-xl text-white" style={{ background: r.color }}>
                        {r.is_owner ? <Crown className="size-5" /> : <ShieldCheck className="size-5" />}
                      </div>
                      <div>
                        <div className="font-semibold">{pick(r, 'name')}</div>
                        <div className="flex items-center gap-1 text-xs text-muted">
                          <Users className="size-3" />
                          <span className="num">{r.employees?.[0]?.count ?? 0}</span>
                        </div>
                      </div>
                    </div>
                    {!r.is_owner && (
                      <div className="flex">
                        <Button variant="ghost" size="icon-sm" onClick={() => setEdit(r)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(r)}>
                          <Trash className="text-danger" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {r.description && <p className="mt-3 text-sm text-muted">{r.description}</p>}
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs text-muted">
                      <span>{t('الصلاحيات', 'Permissions')}</span>
                      <span className="num">{r.is_owner ? total : r.permissions.length} / {total}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full" style={{ width: `${total ? ((r.is_owner ? total : r.permissions.length) / total) * 100 : 0}%`, background: r.color }} />
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {r.is_owner ? <Badge tone="brand">{t('كل الصلاحيات دائماً', 'Toujours tout')}</Badge> : <Badge>{t(`تخفيض حتى ${r.max_discount_percent}%`, `Remise max ${r.max_discount_percent}%`)}</Badge>}
                  </div>
                </Card>
              </motion.div>
            ))}
      </div>

      <Sheet
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        width="max-w-4xl"
        title={edit?.id ? t('تعديل الدور', 'Modifier le rôle') : t('دور جديد', 'Nouveau rôle')}
        footer={
          <>
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
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('الاسم بالعربية', 'Nom (ar)')} required>
                <Input value={edit.name_ar ?? ''} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} />
              </Field>
              <Field label={t('الاسم بالفرنسية', 'Nom (fr)')}>
                <Input value={edit.name_fr ?? ''} onChange={(e) => setEdit({ ...edit, name_fr: e.target.value })} dir="ltr" />
              </Field>
              <Field label={t('أقصى تخفيض مسموح %', 'Remise max %')}>
                <Input type="number" min={0} max={100} value={edit.max_discount_percent ?? 0} onChange={(e) => setEdit({ ...edit, max_discount_percent: Number(e.target.value) })} className="num" />
              </Field>
            </div>
            <Field label={t('الوصف', 'Description')}>
              <Input value={edit.description ?? ''} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </Field>
            <Field label={t('اللون', 'Couleur')}>
              <ColorPicker value={edit.color ?? '#475569'} onChange={(color) => setEdit({ ...edit, color })} />
            </Field>
            <PermissionMatrix value={edit.permissions ?? []} onChange={(permissions) => setEdit({ ...edit, permissions })} />
          </div>
        )}
      </Sheet>
    </>
  )
}
