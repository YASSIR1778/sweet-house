import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileText, ListPlus, Plus, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { DocReq, Service, ServiceCategory, ServiceField } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Button, Card, Checkbox, Field, Input, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { ColorPicker, IconPicker, MoneyInput } from '@/shared/ui/pickers'

type Tier = { min_qty: number; unit_price: number }
type Form = Omit<Service, 'id' | 'deleted_at' | 'service_price_tiers' | 'system_key'> & { id?: string; system_key?: string | null; tiers: Tier[] }

const blank = (kind: 'counter' | 'admin'): Form => ({
  category_id: null,
  kind,
  name_ar: '',
  name_fr: '',
  description_ar: '',
  description_fr: '',
  pricing_mode: 'fixed',
  price: 0,
  unit_ar: kind === 'counter' ? 'صفحة' : '',
  unit_fr: kind === 'counter' ? 'page' : '',
  tax_rate: 20,
  icon: null,
  image_url: null,
  pos_quick: kind === 'counter',
  pos_color: '#0F172A',
  pos_sort: 0,
  is_online: true,
  duration_ar: '',
  duration_fr: '',
  official_url: '',
  required_documents: [],
  fields: [],
  sort: 0,
  is_active: true,
  tiers: [],
})

export function ServiceEditor({
  service,
  defaultKind,
  categories,
  onClose,
}: {
  service: Service | 'new' | null
  defaultKind: 'counter' | 'admin'
  categories: ServiceCategory[]
  onClose: () => void
}) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [f, setF] = useState<Form>(blank(defaultKind))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!service) return
    if (service === 'new') setF(blank(defaultKind))
    else {
      const { service_price_tiers, deleted_at: _d, ...rest } = service
      void _d
      setF({ ...rest, tiers: (service_price_tiers ?? []).map((x) => ({ min_qty: Number(x.min_qty), unit_price: x.unit_price })).sort((a, b) => a.min_qty - b.min_qty) })
    }
  }, [service, defaultKind])

  const isSystem = !!f.system_key
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    if (!f.name_ar.trim()) return toast.error(t('اسم الخدمة مطلوب', 'Nom obligatoire'))
    setBusy(true)
    const { error } = await sb.rpc('save_service', { p: f })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم الحفظ', 'Enregistré'))
    qc.invalidateQueries({ queryKey: ['services'] })
    onClose()
  }

  const remove = async () => {
    if (!f.id) return
    if (!(await confirm({ title: t('حذف الخدمة؟', 'Supprimer le service ?'), description: t('ستنقل إلى سلة المهملات', 'Elle ira à la corbeille'), danger: true }))) return
    const { error } = await sb.rpc('trash_move', { p_entity: 'services', p_id: f.id })
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['services'] })
    onClose()
  }

  const docs = f.required_documents
  const fields = f.fields
  const setDoc = (i: number, p: Partial<DocReq>) => set('required_documents', docs.map((d, j) => (j === i ? { ...d, ...p } : d)))
  const setFld = (i: number, p: Partial<ServiceField>) => set('fields', fields.map((d, j) => (j === i ? { ...d, ...p } : d)))

  const modes = [
    { v: 'fixed', ar: 'سعر ثابت', fr: 'Prix fixe', d_ar: 'نفس السعر لكل وحدة', d_fr: 'Même prix par unité' },
    { v: 'tiered', ar: 'حسب الكمية', fr: 'Par paliers', d_ar: 'السعر ينخفض كلما زادت الكمية', d_fr: 'Le prix baisse avec la quantité' },
    { v: 'open', ar: 'مبلغ حر', fr: 'Montant libre', d_ar: 'الموظف يكتب المبلغ عند البيع', d_fr: 'Saisi à la vente' },
  ] as const

  return (
    <Sheet
      open={!!service}
      onOpenChange={(o) => !o && onClose()}
      width="max-w-2xl"
      title={f.id ? t('تعديل الخدمة', 'Modifier le service') : t('خدمة جديدة', 'Nouveau service')}
      description={f.kind === 'counter' ? t('خدمة في المحل', 'Service en boutique') : t('خدمة إدارية / إلكترونية', 'Service administratif')}
      footer={
        <>
          {f.id && !isSystem && (
            <Button variant="danger-soft" className="me-auto" onClick={remove}>
              <Trash />
              {t('حذف', 'Supprimer')}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('إلغاء', 'Annuler')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('حفظ', 'Enregistrer')}
          </Button>
        </>
      }
    >
      {confirmNode}
      <div className="space-y-5">
        {!f.id && (
          <div className="grid grid-cols-2 gap-2">
            {(['counter', 'admin'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setF({ ...blank(k), name_ar: f.name_ar, name_fr: f.name_fr })}
                className={cn('rounded-xl border p-3 text-start text-sm transition-colors', f.kind === k ? 'border-brand bg-brand-50' : 'border-border hover:bg-surface-2')}
              >
                <div className="font-semibold">{k === 'counter' ? t('خدمة في المحل', 'En boutique') : t('خدمة إدارية', 'Administratif')}</div>
                <div className="mt-0.5 text-xs text-muted">{k === 'counter' ? t('نسخ، طباعة، سكانر…', 'Copie, impression…') : t('السجل العدلي، المواعيد…', 'Casier, RDV…')}</div>
              </button>
            ))}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الاسم بالعربية', 'Nom (arabe)')} required>
            <Input value={f.name_ar} onChange={(e) => set('name_ar', e.target.value)} autoFocus />
          </Field>
          <Field label={t('الاسم بالفرنسية', 'Nom (français)')}>
            <Input value={f.name_fr} onChange={(e) => set('name_fr', e.target.value)} dir="ltr" />
          </Field>
          <Field label={t('الفئة', 'Catégorie')} className="sm:col-span-2">
            <Select
              value={f.category_id}
              onValueChange={(v) => set('category_id', v)}
              allowEmpty
              emptyLabel={t('بدون فئة', 'Sans catégorie')}
              options={categories.filter((c) => c.kind === f.kind).map((c) => ({ value: c.id, label: pick(c, 'name') }))}
            />
          </Field>
        </div>

        <Card className="space-y-4 p-4">
          <div className="text-sm font-semibold">{t('التسعير', 'Tarification')}</div>
          {!isSystem && (
            <div className="grid gap-2 sm:grid-cols-3">
              {modes.map((m) => (
                <button key={m.v} onClick={() => set('pricing_mode', m.v)} className={cn('rounded-xl border p-3 text-start transition-colors', f.pricing_mode === m.v ? 'border-brand bg-brand-50' : 'border-border hover:bg-surface-2')}>
                  <div className="text-sm font-semibold">{t(m.ar, m.fr)}</div>
                  <div className="mt-0.5 text-xs text-muted">{t(m.d_ar, m.d_fr)}</div>
                </button>
              ))}
            </div>
          )}
          {f.pricing_mode !== 'open' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={f.pricing_mode === 'tiered' ? t('السعر الأساسي', 'Prix de base') : t('السعر', 'Prix')}>
                <MoneyInput value={f.price} onChange={(v) => set('price', v ?? 0)} />
              </Field>
              <Field label={t('الوحدة (ع)', 'Unité (ar)')}>
                <Input value={f.unit_ar ?? ''} onChange={(e) => set('unit_ar', e.target.value)} placeholder={t('صفحة', 'page')} />
              </Field>
              <Field label={t('الوحدة (ف)', 'Unité (fr)')}>
                <Input value={f.unit_fr ?? ''} onChange={(e) => set('unit_fr', e.target.value)} dir="ltr" />
              </Field>
            </div>
          )}
          {f.pricing_mode === 'tiered' && (
            <div className="space-y-2">
              <div className="text-xs text-muted">{t('ابتداءً من الكمية ← سعر الوحدة', 'À partir de la quantité → prix unitaire')}</div>
              {f.tiers.map((tier, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-muted">{t('من', 'Dès')}</span>
                  <Input type="number" min={1} value={tier.min_qty} onChange={(e) => set('tiers', f.tiers.map((x, j) => (j === i ? { ...x, min_qty: Number(e.target.value) } : x)))} className="num w-24" />
                  <span className="text-sm text-muted">{t('فما فوق', 'et plus')}</span>
                  <MoneyInput className="w-36" value={tier.unit_price} onChange={(v) => set('tiers', f.tiers.map((x, j) => (j === i ? { ...x, unit_price: v ?? 0 } : x)))} />
                  <Button variant="ghost" size="icon-sm" onClick={() => set('tiers', f.tiers.filter((_, j) => j !== i))}>
                    <Trash className="text-danger" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set('tiers', [...f.tiers, { min_qty: (f.tiers.at(-1)?.min_qty ?? 0) + 50, unit_price: f.price }])}>
                <Plus />
                {t('إضافة شريحة', 'Ajouter un palier')}
              </Button>
              {f.tiers.length > 0 && (
                <div className="num rounded-lg bg-surface-2 p-3 text-xs text-muted">
                  {t('مثال', 'Exemple')}: 10 → {money(10 * f.price)} · 100 → {money(100 * ([...f.tiers].reverse().find((x) => x.min_qty <= 100)?.unit_price ?? f.price))}
                </div>
              )}
            </div>
          )}
          <Field label={t('نسبة الضريبة', 'TVA')}>
            <div className="flex gap-2">
              {[0, 7, 10, 14, 20].map((r) => (
                <button key={r} onClick={() => set('tax_rate', r)} className={cn('num rounded-lg border px-3 py-1.5 text-sm', f.tax_rate === r ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                  {r}%
                </button>
              ))}
            </div>
          </Field>
        </Card>

        {f.kind === 'counter' && (
          <Card className="space-y-4 p-4">
            <div className="text-sm font-semibold">{t('نقطة البيع', 'Point de vente')}</div>
            <SwitchRow label={t('زر سريع في نقطة البيع', 'Bouton rapide au POS')} checked={f.pos_quick} onCheckedChange={(v) => set('pos_quick', v)} />
            {f.pos_quick && (
              <>
                <Field label={t('لون الزر', 'Couleur du bouton')}>
                  <ColorPicker value={f.pos_color ?? '#0F172A'} onChange={(c) => set('pos_color', c)} />
                </Field>
                <Field label={t('الترتيب', 'Ordre')}>
                  <Input type="number" value={f.pos_sort} onChange={(e) => set('pos_sort', Number(e.target.value))} className="num w-24" />
                </Field>
              </>
            )}
          </Card>
        )}

        <Field label={t('الأيقونة', 'Icône')}>
          <IconPicker value={f.icon} onChange={(v) => set('icon', v)} color={f.pos_color ?? '#FF6B35'} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('الوصف بالعربية', 'Description (ar)')}>
            <Textarea value={f.description_ar ?? ''} onChange={(e) => set('description_ar', e.target.value)} />
          </Field>
          <Field label={t('الوصف بالفرنسية', 'Description (fr)')}>
            <Textarea value={f.description_fr ?? ''} onChange={(e) => set('description_fr', e.target.value)} dir="ltr" />
          </Field>
        </div>

        {f.kind === 'admin' && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t('المدة (ع)', 'Délai (ar)')}>
                <Input value={f.duration_ar ?? ''} onChange={(e) => set('duration_ar', e.target.value)} placeholder="24 - 48 ساعة" />
              </Field>
              <Field label={t('المدة (ف)', 'Délai (fr)')}>
                <Input value={f.duration_fr ?? ''} onChange={(e) => set('duration_fr', e.target.value)} dir="ltr" placeholder="24 - 48 h" />
              </Field>
              <Field label={t('الرابط الرسمي', 'Lien officiel')}>
                <Input value={f.official_url ?? ''} onChange={(e) => set('official_url', e.target.value)} dir="ltr" placeholder="https://" />
              </Field>
            </div>

            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="size-4 text-brand" />
                {t('الوثائق المطلوبة من الزبون', 'Documents requis')}
              </div>
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={d.name_ar} onChange={(e) => setDoc(i, { name_ar: e.target.value })} placeholder={t('الاسم بالعربية', 'Nom (ar)')} />
                  <Input value={d.name_fr} onChange={(e) => setDoc(i, { name_fr: e.target.value })} placeholder={t('بالفرنسية', 'Nom (fr)')} dir="ltr" />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    <Checkbox checked={d.required} onCheckedChange={(v) => setDoc(i, { required: v })} />
                    {t('إلزامية', 'Requis')}
                  </label>
                  <Button variant="ghost" size="icon-sm" onClick={() => set('required_documents', docs.filter((_, j) => j !== i))}>
                    <Trash className="text-danger" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set('required_documents', [...docs, { name_ar: '', name_fr: '', required: true }])}>
                <Plus />
                {t('إضافة وثيقة', 'Ajouter un document')}
              </Button>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ListPlus className="size-4 text-brand" />
                {t('المعلومات التي يملؤها الزبون', 'Champs à remplir par le client')}
              </div>
              {fields.map((fl, i) => (
                <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_8rem_auto_auto]">
                  <Input value={fl.label_ar} onChange={(e) => setFld(i, { label_ar: e.target.value, key: fl.key || `f${Date.now()}` })} placeholder={t('العنوان بالعربية', 'Libellé (ar)')} />
                  <Input value={fl.label_fr} onChange={(e) => setFld(i, { label_fr: e.target.value })} placeholder={t('بالفرنسية', 'Libellé (fr)')} dir="ltr" />
                  <Select
                    value={fl.type}
                    onValueChange={(v) => setFld(i, { type: (v ?? 'text') as ServiceField['type'] })}
                    options={[
                      { value: 'text', label: t('نص', 'Texte') },
                      { value: 'textarea', label: t('نص طويل', 'Paragraphe') },
                      { value: 'number', label: t('رقم', 'Nombre') },
                      { value: 'date', label: t('تاريخ', 'Date') },
                      { value: 'select', label: t('اختيار', 'Choix') },
                    ]}
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    <Checkbox checked={fl.required} onCheckedChange={(v) => setFld(i, { required: v })} />
                    {t('إلزامي', 'Requis')}
                  </label>
                  <Button variant="ghost" size="icon-sm" onClick={() => set('fields', fields.filter((_, j) => j !== i))}>
                    <Trash className="text-danger" />
                  </Button>
                  {fl.type === 'select' && (
                    <Input
                      className="sm:col-span-5"
                      value={(fl.options ?? []).join('، ')}
                      onChange={(e) => setFld(i, { options: e.target.value.split(/[،,]/).map((s) => s.trim()).filter(Boolean) })}
                      placeholder={t('الاختيارات مفصولة بفاصلة', 'Options séparées par des virgules')}
                    />
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set('fields', [...fields, { key: `f${Date.now()}`, label_ar: '', label_fr: '', type: 'text', required: true }])}>
                <Plus />
                {t('إضافة حقل', 'Ajouter un champ')}
              </Button>
            </Card>
          </>
        )}

        <SwitchRow label={t('تظهر في الموقع', 'Visible sur le site')} checked={f.is_online} onCheckedChange={(v) => set('is_online', v)} />
        <SwitchRow label={t('الخدمة مفعّلة', 'Service actif')} description={t('الخدمة المعطلة لا تظهر في نقطة البيع ولا في الموقع', 'Un service inactif est masqué partout')} checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} />
      </div>
    </Sheet>
  )
}
