import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, KeyRound, LayoutDashboard, MonitorPlay, Plus, Search, Trash, User, Users } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { money } from '@/shared/lib/money'
import type { Employee, Role } from '@/shared/lib/types'
import { Avatar, Badge, Button, Card, Field, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'
import { ColorPicker, MoneyInput } from '@/shared/ui/pickers'
import { PermissionMatrix } from './PermissionMatrix'

type Form = Partial<Employee> & { password?: string; pin?: string }

export function EmployeesPage() {
  const { sb, me } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [edit, setEdit] = useState<Form | null>(null)
  const [tab, setTab] = useState('info')
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

  const employees = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await sb.from('employees').select('*').is('deleted_at', null).order('is_owner', { ascending: false }).order('full_name')
      if (error) throw error
      return data as Employee[]
    },
  })
  const roles = useQuery({
    queryKey: ['roles'],
    queryFn: async () => (await sb.from('roles').select('*').is('deleted_at', null)).data as Role[],
  })
  const roleOf = (e: Partial<Employee>) => roles.data?.find((r) => r.id === e.role_id)

  const list = useMemo(() => (employees.data ?? []).filter((e) => !search || e.full_name.toLowerCase().includes(search.toLowerCase())), [employees.data, search])

  const open = (e?: Employee) => {
    setTab('info')
    setEdit(
      e
        ? { ...e, password: '', pin: '' }
        : { full_name: '', username: '', color: '#2563EB', role_id: roles.data?.find((r) => !r.is_owner && r.name_fr === 'Vendeur')?.id ?? null, can_use_pos: true, can_use_admin: false, is_active: true, monthly_salary: 0, extra_permissions: [], revoked_permissions: [], password: '', pin: '' },
    )
  }

  const save = async () => {
    if (!edit?.full_name?.trim()) return toast.error(t('الاسم مطلوب', 'Nom obligatoire'))
    if (edit.pin && !/^\d{4}$/.test(edit.pin)) return toast.error(errorMessage('pin_must_be_4_digits', lang))
    if (edit.can_use_admin && !edit.id && !edit.password) return toast.error(t('حدد كلمة سر للدخول إلى لوحة التحكم', 'Définissez un mot de passe pour le tableau de bord'))
    if (edit.can_use_admin && !edit.username) return toast.error(t('حدد اسم مستخدم للدخول إلى لوحة التحكم', "Définissez un nom d'utilisateur"))
    setBusy(true)
    try {
      const res = await callFn<{ id: string }>(sb, 'staff-account', {
        id: edit.id,
        full_name: edit.full_name,
        username: edit.username || null,
        password: edit.password || null,
        phone: edit.phone || null,
        avatar_url: edit.avatar_url ?? null,
        color: edit.color,
        role_id: edit.role_id ?? null,
        extra_permissions: edit.extra_permissions ?? [],
        revoked_permissions: edit.revoked_permissions ?? [],
        max_discount_percent: edit.max_discount_percent ?? null,
        can_use_pos: edit.can_use_pos,
        can_use_admin: edit.can_use_admin,
        monthly_salary: edit.monthly_salary ?? 0,
        hire_date: edit.hire_date || null,
        is_active: edit.is_active,
        notes: edit.notes || null,
      })
      if (edit.pin) {
        const { error } = await sb.rpc('set_employee_pin', { p_employee: res.id, p_pin: edit.pin })
        if (error) throw error
      }
      toast.success(edit.id ? t('تم حفظ التعديلات', 'Modifications enregistrées') : t('تمت إضافة الموظف 🎉', 'Employé ajouté 🎉'))
      setEdit(null)
      qc.invalidateQueries({ queryKey: ['employees'] })
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!edit?.id) return
    if (!(await confirm({ title: t(`حذف ${edit.full_name}؟`, `Supprimer ${edit.full_name} ?`), description: t('لن يستطيع الدخول بعد الآن. سجل مبيعاته يبقى محفوظاً.', 'Il ne pourra plus se connecter. Son historique est conservé.'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'employees', p_id: edit.id })
    if (error) return toast.error(errorMessage(error, lang))
    setEdit(null)
    qc.invalidateQueries({ queryKey: ['employees'] })
  }

  // Effective permissions = role + extra − revoked. The matrix edits the effective set.
  const rolePerms = edit ? (roleOf(edit)?.permissions ?? []) : []
  const effective = edit ? [...new Set([...rolePerms, ...(edit.extra_permissions ?? [])])].filter((p) => !(edit.revoked_permissions ?? []).includes(p)) : []
  const setEffective = (next: string[]) =>
    edit &&
    setEdit({
      ...edit,
      extra_permissions: next.filter((p) => !rolePerms.includes(p)),
      revoked_permissions: rolePerms.filter((p) => !next.includes(p)),
    })

  const ownerLocked = !!edit?.is_owner && !me?.is_owner

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<Users />}
        title={t('الموظفون', 'Employés')}
        description={t('أضف موظفيك، رموزهم السرية، أدوارهم وصلاحياتهم ورواتبهم', 'Employés, codes PIN, rôles, permissions et salaires')}
        actions={
          <Button onClick={() => open()}>
            <Plus />
            {t('موظف جديد', 'Nouvel employé')}
          </Button>
        }
      />
      <Card className="mb-4 p-3">
        <Input icon={<Search />} placeholder={t('ابحث عن موظف…', 'Rechercher…')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </Card>

      {employees.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<Users />} title={t('لا يوجد موظفون', 'Aucun employé')} />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((e, i) => {
            const role = roleOf(e)
            return (
              <motion.div key={e.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <Card onClick={() => open(e)} className={`group cursor-pointer p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop ${!e.is_active ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Avatar name={e.full_name} color={e.color} src={e.avatar_url} size={52} />
                      {e.is_owner && (
                        <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand text-white ring-2 ring-surface">
                          <Crown className="size-3" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.full_name}</div>
                      <div className="truncate text-sm text-muted" dir="ltr">
                        {e.username ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {role && (
                      <Badge style={{ background: `${role.color}18`, color: role.color }}>
                        {pick(role, 'name')}
                      </Badge>
                    )}
                    {e.can_use_pos && (
                      <Badge tone="neutral">
                        <MonitorPlay />
                        POS
                      </Badge>
                    )}
                    {(e.can_use_admin || e.is_owner) && (
                      <Badge tone="neutral">
                        <LayoutDashboard />
                        {t('اللوحة', 'Admin')}
                      </Badge>
                    )}
                    {!e.is_active && <Badge tone="danger">{t('معطل', 'Inactif')}</Badge>}
                  </div>
                  {e.monthly_salary > 0 && (
                    <div className="mt-3 border-t border-border pt-3 text-xs text-muted">
                      {t('الراتب الشهري', 'Salaire mensuel')}: <span className="num font-semibold text-text">{money(e.monthly_salary)}</span>
                    </div>
                  )}
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      <Sheet
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        width="max-w-3xl"
        title={edit?.id ? edit.full_name ?? '' : t('موظف جديد', 'Nouvel employé')}
        description={edit?.is_owner ? t('حساب المالك', 'Compte propriétaire') : undefined}
        footer={
          <>
            {edit?.id && !edit.is_owner && (
              <Button variant="danger-soft" className="me-auto" onClick={remove}>
                <Trash />
                {t('حذف', 'Supprimer')}
              </Button>
            )}
            <Button variant="outline" onClick={() => setEdit(null)}>
              {t('إلغاء', 'Annuler')}
            </Button>
            <Button onClick={save} loading={busy} disabled={ownerLocked}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="space-y-5">
            <Tabs
              value={tab}
              onChange={setTab}
              items={[
                { value: 'info', label: t('المعلومات', 'Infos') },
                { value: 'access', label: t('الدخول', 'Accès') },
                ...(edit.is_owner ? [] : [{ value: 'perms', label: t('الصلاحيات', 'Permissions') }]),
                { value: 'pay', label: t('الراتب', 'Salaire') },
              ]}
            />

            {tab === 'info' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('الاسم الكامل', 'Nom complet')} required>
                    <Input icon={<User />} value={edit.full_name ?? ''} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} autoFocus />
                  </Field>
                  <Field label={t('الهاتف', 'Téléphone')}>
                    <Input value={edit.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} dir="ltr" />
                  </Field>
                  {!edit.is_owner && (
                    <Field label={t('الدور', 'Rôle')}>
                      <Select
                        value={edit.role_id}
                        onValueChange={(role_id) => setEdit({ ...edit, role_id })}
                        allowEmpty
                        emptyLabel={t('بدون دور', 'Aucun rôle')}
                        options={(roles.data ?? []).filter((r) => !r.is_owner).map((r) => ({ value: r.id, label: pick(r, 'name') }))}
                      />
                    </Field>
                  )}
                  <Field label={t('تاريخ التوظيف', "Date d'embauche")}>
                    <Input type="date" value={edit.hire_date ?? ''} onChange={(e) => setEdit({ ...edit, hire_date: e.target.value })} dir="ltr" />
                  </Field>
                </div>
                <Field label={t('اللون (يظهر في نقطة البيع)', 'Couleur (POS)')}>
                  <ColorPicker value={edit.color ?? '#2563EB'} onChange={(color) => setEdit({ ...edit, color })} />
                </Field>
                <Field label={t('ملاحظات', 'Notes')}>
                  <Textarea value={edit.notes ?? ''} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                </Field>
                {!edit.is_owner && <SwitchRow label={t('الحساب مفعّل', 'Compte actif')} description={t('الحساب المعطل لا يستطيع الدخول', 'Un compte inactif ne peut pas se connecter')} checked={edit.is_active ?? true} onCheckedChange={(is_active) => setEdit({ ...edit, is_active })} />}
              </div>
            )}

            {tab === 'access' && (
              <div className="space-y-4">
                <Card className="space-y-4 p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <MonitorPlay className="size-4 text-brand" />
                    {t('نقطة البيع', 'Point de vente')}
                  </div>
                  <SwitchRow label={t('يستعمل نقطة البيع', 'Utilise le POS')} checked={edit.can_use_pos ?? true} onCheckedChange={(can_use_pos) => setEdit({ ...edit, can_use_pos })} />
                  <Field label={t('الرمز السري PIN (4 أرقام)', 'Code PIN (4 chiffres)')} hint={edit.id ? t('اتركه فارغاً للإبقاء على الرمز الحالي', 'Laissez vide pour garder le PIN actuel') : undefined}>
                    <Input icon={<KeyRound />} value={edit.pin ?? ''} onChange={(e) => setEdit({ ...edit, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} inputMode="numeric" dir="ltr" className="num w-40 tracking-[0.5em]" placeholder="••••" />
                  </Field>
                </Card>
                <Card className="space-y-4 p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    <LayoutDashboard className="size-4 text-brand" />
                    {t('لوحة التحكم', 'Tableau de bord')}
                  </div>
                  {!edit.is_owner && <SwitchRow label={t('يدخل إلى لوحة التحكم', 'Accède au tableau de bord')} description={t('سيرى فقط الأقسام المسموح له بها', 'Il ne verra que les sections autorisées')} checked={edit.can_use_admin ?? false} onCheckedChange={(can_use_admin) => setEdit({ ...edit, can_use_admin })} />}
                  {(edit.can_use_admin || edit.is_owner) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={edit.is_owner ? t('البريد الإلكتروني', 'E-mail') : t('اسم المستخدم', "Nom d'utilisateur")} hint={!edit.is_owner ? t('أحرف لاتينية وأرقام فقط', 'Lettres latines et chiffres') : undefined}>
                        <Input value={edit.username ?? ''} onChange={(e) => setEdit({ ...edit, username: e.target.value.toLowerCase().trim() })} dir="ltr" disabled={!!edit.is_owner} />
                      </Field>
                      <Field label={edit.id ? t('كلمة سر جديدة', 'Nouveau mot de passe') : t('كلمة السر', 'Mot de passe')} hint={edit.id ? t('اتركها فارغة للإبقاء عليها', 'Laissez vide pour garder') : t('8 أحرف على الأقل', '8 caractères min.')}>
                        <Input type="password" value={edit.password ?? ''} onChange={(e) => setEdit({ ...edit, password: e.target.value })} dir="ltr" autoComplete="new-password" />
                      </Field>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {tab === 'perms' && !edit.is_owner && (
              <div className="space-y-4">
                <div className="rounded-xl bg-info/5 p-3 text-sm text-muted">
                  {t('الصلاحيات تأتي من الدور. أي تغيير هنا يخص هذا الموظف فقط.', 'Les permissions viennent du rôle. Les changements ici ne concernent que cet employé.')}
                </div>
                <Field label={t('أقصى تخفيض لهذا الموظف % (اتركه فارغاً لاستعمال حد الدور)', 'Remise max % (vide = celle du rôle)')}>
                  <Input type="number" min={0} max={100} value={edit.max_discount_percent ?? ''} onChange={(e) => setEdit({ ...edit, max_discount_percent: e.target.value === '' ? null : Number(e.target.value) })} className="num w-32" placeholder={String(roleOf(edit)?.max_discount_percent ?? 0)} />
                </Field>
                <PermissionMatrix value={effective} onChange={setEffective} inherited={rolePerms} />
              </div>
            )}

            {tab === 'pay' && (
              <div className="space-y-4">
                <Field label={t('الراتب الشهري الثابت', 'Salaire mensuel fixe')}>
                  <MoneyInput value={edit.monthly_salary ?? 0} onChange={(v) => setEdit({ ...edit, monthly_salary: v ?? 0 })} className="w-56" />
                </Field>
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">
                  {t('التسبيقات والعمولات والمكافآت وكشف الأداء الشهري ستكون متاحة في المرحلة 2.', 'Avances, commissions, primes et fiche mensuelle : phase 2.')}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    </>
  )
}
