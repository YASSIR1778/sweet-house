import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, Trash, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { ServiceCategory } from '@/shared/lib/types'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { ColorPicker, IconPicker } from '@/shared/ui/pickers'
import { DynamicIcon } from '@/shared/ui/icon'

export function ServiceCategoriesDialog({ open, onClose, kind }: { open: boolean; onClose: () => void; kind: 'counter' | 'admin' }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [edit, setEdit] = useState<Partial<ServiceCategory> | null>(null)

  const cats = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => (await sb.from('service_categories').select('*').is('deleted_at', null).order('sort')).data as ServiceCategory[],
  })
  const list = (cats.data ?? []).filter((c) => c.kind === kind)

  const save = async () => {
    if (!edit?.name_ar) return
    const row = { kind, name_ar: edit.name_ar, name_fr: edit.name_fr || edit.name_ar, icon: edit.icon ?? null, color: edit.color ?? '#FF6B35', sort: edit.sort ?? list.length + 1 }
    const { error } = edit.id ? await sb.from('service_categories').update(row).eq('id', edit.id) : await sb.from('service_categories').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    setEdit(null)
    qc.invalidateQueries({ queryKey: ['service-categories'] })
  }

  const remove = async (c: ServiceCategory) => {
    const { error } = await sb.rpc('trash_move', { p_entity: 'service_categories', p_id: c.id })
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['service-categories'] })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="lg" title={t('فئات الخدمات', 'Catégories de services')} description={kind === 'counter' ? t('خدمات المحل', 'En boutique') : t('الخدمات الإدارية', 'Administratifs')}>
      <div className="space-y-2">
        {list.map((c) =>
          edit?.id === c.id ? null : (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: c.color }}>
                <DynamicIcon name={c.icon} className="size-4" />
              </div>
              <div className="flex-1 text-sm font-medium">{pick(c, 'name')}</div>
              <Button variant="ghost" size="icon-sm" onClick={() => setEdit(c)}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => remove(c)}>
                <Trash className="text-danger" />
              </Button>
            </div>
          ),
        )}
        {edit ? (
          <div className="space-y-3 rounded-xl border border-brand/40 bg-brand-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('الاسم بالعربية', 'Nom (ar)')}>
                <Input value={edit.name_ar ?? ''} onChange={(e) => setEdit({ ...edit, name_ar: e.target.value })} autoFocus />
              </Field>
              <Field label={t('الاسم بالفرنسية', 'Nom (fr)')}>
                <Input value={edit.name_fr ?? ''} onChange={(e) => setEdit({ ...edit, name_fr: e.target.value })} dir="ltr" />
              </Field>
            </div>
            <ColorPicker value={edit.color ?? '#FF6B35'} onChange={(color) => setEdit({ ...edit, color })} />
            <IconPicker value={edit.icon ?? null} color={edit.color ?? '#FF6B35'} onChange={(icon) => setEdit({ ...edit, icon })} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setEdit(null)}>
                <X />
                {t('إلغاء', 'Annuler')}
              </Button>
              <Button size="sm" onClick={save} disabled={!edit.name_ar}>
                <Check />
                {t('حفظ', 'Enregistrer')}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="soft" className="w-full" onClick={() => setEdit({ color: '#FF6B35' })}>
            <Plus />
            {t('فئة جديدة', 'Nouvelle catégorie')}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
