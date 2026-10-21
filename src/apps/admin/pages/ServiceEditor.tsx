import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Clock, FileText, HelpCircle, ListPlus, Plus, Sparkles, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { DocReq, GuideStep, Service, ServiceCategory, ServiceField, ServiceGuide } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Button, Card, Checkbox, Field, Input, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Sheet, useConfirm } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { ColorPicker, IconPicker, MoneyInput } from '@/shared/ui/pickers'
import { ImageInput } from '@/shared/ui/media'
import { aiServiceDocs } from '@/shared/lib/ai'

type Tier = { min_qty: number; unit_price: number }
type Form = Omit<Service, 'id' | 'deleted_at' | 'service_price_tiers' | 'system_key'> & { id?: string; system_key?: string | null; tiers: Tier[]; guide: ServiceGuide }

const blankGuide = (): ServiceGuide => ({ tips_ar: '', links: [], images: [], steps: [], video_url: '', templates: [], require_ref: true, require_proof: false })

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
  target_hours: null,
  abroad: kind === 'admin',
  faq: [],
  tiers: [],
  guide: blankGuide(),
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
  const [suggesting, setSuggesting] = useState(false)
  const suggest = async () => {
    if (!f.name_ar.trim()) return toast.error(t('اكتب اسم الخدمة أولاً', 'Saisissez d’abord le nom'))
    setSuggesting(true)
    try {
      const r = await aiServiceDocs(sb, `${f.name_ar} / ${f.name_fr}`)
      setF((x) => ({
        ...x,
        required_documents: x.required_documents.length ? x.required_documents : (r.required_documents ?? []),
        fields: x.fields.length ? x.fields : ((r.fields ?? []) as ServiceField[]),
        duration_ar: x.duration_ar || r.duration_ar || '',
        duration_fr: x.duration_fr || r.duration_fr || '',
        official_url: x.official_url || r.official_url || '',
      }))
      toast.success(t('تمت الاقتراحات ✨ راجعها وعدّلها قبل الحفظ', 'Suggestions ajoutées ✨ vérifiez avant d’enregistrer'))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setSuggesting(false)
    }
  }

  useEffect(() => {
    if (!service) return
    if (service === 'new') setF(blank(defaultKind))
    else {
      const { service_price_tiers, deleted_at: _d, ...rest } = service
      void _d
      setF({ ...rest, guide: blankGuide(), tiers: (service_price_tiers ?? []).map((x) => ({ min_qty: Number(x.min_qty), unit_price: x.unit_price })).sort((a, b) => a.min_qty - b.min_qty) })
      if (service.kind === 'admin')
        sb.from('service_guides')
          .select('tips_ar, links, images, steps, video_url, templates, require_ref, require_proof')
          .eq('service_id', service.id)
          .maybeSingle()
          .then(({ data }) => data && setF((x) => (x.id === service.id ? { ...x, guide: data as ServiceGuide } : x)))
    }
  }, [service, defaultKind, sb])

  const isSystem = !!f.system_key
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))

  const save = async () => {
    if (!f.name_ar.trim()) return toast.error(t('اسم الخدمة مطلوب', 'Nom obligatoire'))
    setBusy(true)
    const { guide, ...svc } = f
    const { data: sid, error } = await sb.rpc('save_service', { p: svc })
    if (!error && f.kind === 'admin') {
      const r = await sb.rpc('save_service_guide', { p_service: sid, p: { ...guide, steps: guide.steps.filter((s) => s.title.trim()) } })
      if (r.error) (setBusy(false), toast.error(errorMessage(r.error, lang)))
    }
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
  const g = f.guide
  const setGuide = (p: Partial<ServiceGuide>) => set('guide', { ...g, ...p })
  const setStep = (i: number, p: Partial<GuideStep>) => setGuide({ steps: g.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const move = <T,>(arr: T[], i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= arr.length) return arr
    const c = [...arr]
    ;[c[i], c[j]] = [c[j], c[i]]
    return c
  }
  const suggestions = useQuery({
    queryKey: ['guide-suggestions', f.id],
    enabled: !!f.id && f.kind === 'admin',
    queryFn: async () => (await sb.from('guide_suggestions').select('id, text, created_at, status, employees(full_name)').eq('service_id', f.id!).eq('status', 'pending').order('created_at')).data as unknown as { id: string; text: string; created_at: string; employees: { full_name: string } | null }[],
  })
  const closeSuggestion = async (id: string, status: 'applied' | 'dismissed') => {
    await sb.from('guide_suggestions').update({ status }).eq('id', id)
    suggestions.refetch()
  }

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
            {(!docs.length || !fields.length) && (
              <button onClick={suggest} disabled={suggesting} className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-brand/40 bg-brand-50/50 p-3 text-start text-sm transition-colors hover:border-brand">
                <Sparkles className={cn('size-5 shrink-0 text-brand', suggesting && 'animate-spin')} />
                <span>
                  <span className="block font-semibold">{t('اقترح الوثائق والحقول تلقائياً', 'Suggérer documents et champs')}</span>
                  <span className="block text-xs text-muted">{t('يملأ ما هو فارغ فقط، وتراجعه أنت قبل الحفظ', 'Remplit seulement les sections vides')}</span>
                </span>
              </button>
            )}
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
                <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_8rem_auto_auto_auto]">
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
                  <span className="flex">
                    <Button variant="ghost" size="icon-sm" title={t('رتّب الخانات كما في البوابة الرسمية', 'Même ordre que le portail')} onClick={() => set('fields', move(fields, i, -1))}>↑</Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => set('fields', move(fields, i, 1))}>↓</Button>
                  </span>
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
                  <div className="flex items-center gap-2 sm:col-span-5">
                    <Input value={fl.hint_ar ?? ''} onChange={(e) => setFld(i, { hint_ar: e.target.value })} placeholder={t('شرح صغير تحت الخانة (اختياري): مثلاً «تجده في ظهر البطاقة»', 'Aide sous le champ (optionnel)')} className="text-xs" />
                    <div className="w-20 shrink-0">
                      <ImageInput sb={sb} folder="hints" value={fl.hint_image ?? null} aspect="aspect-video" onChange={(u) => setFld(i, { hint_image: u })} />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set('fields', [...fields, { key: `f${Date.now()}`, label_ar: '', label_fr: '', type: 'text', required: true }])}>
                <Plus />
                {t('إضافة حقل', 'Ajouter un champ')}
              </Button>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <HelpCircle className="size-4 text-brand" />
                {t('أسئلة شائعة عن هذه الخدمة (تظهر في الموقع)', 'FAQ du service (visible sur le site)')}
              </div>
              {(f.faq ?? []).map((q, i) => (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex gap-2">
                    <Input value={q.q_ar} onChange={(e) => set('faq', (f.faq ?? []).map((x, j) => (j === i ? { ...x, q_ar: e.target.value } : x)))} placeholder={t('السؤال، مثلاً: هل يجب أن أحضر بنفسي؟', 'Question')} />
                    <Button variant="ghost" size="icon-sm" onClick={() => set('faq', (f.faq ?? []).filter((_, j) => j !== i))}>
                      <Trash className="text-danger" />
                    </Button>
                  </div>
                  <Textarea rows={2} value={q.a_ar} onChange={(e) => set('faq', (f.faq ?? []).map((x, j) => (j === i ? { ...x, a_ar: e.target.value } : x)))} placeholder={t('الجواب', 'Réponse')} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={q.q_fr} onChange={(e) => set('faq', (f.faq ?? []).map((x, j) => (j === i ? { ...x, q_fr: e.target.value } : x)))} placeholder="Question (fr)" dir="ltr" />
                    <Input value={q.a_fr} onChange={(e) => set('faq', (f.faq ?? []).map((x, j) => (j === i ? { ...x, a_fr: e.target.value } : x)))} placeholder="Réponse (fr)" dir="ltr" />
                  </div>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => set('faq', [...(f.faq ?? []), { q_ar: '', q_fr: '', a_ar: '', a_fr: '' }])}>
                <Plus />
                {t('إضافة سؤال', 'Ajouter une question')}
              </Button>
            </Card>

            <Card className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Clock className="size-4 text-brand" />
                {t('المدة المستهدفة للإنجاز', 'Délai cible de traitement')}
              </div>
              <p className="text-xs text-muted">{t('إذا تجاوز الطلب هذه المدة دون أن يصبح جاهزاً، يظهر بالأحمر كطلب متأخر. اتركه فارغاً إن لم تكن هناك مدة.', 'Au-delà de ce délai sans être prête, la demande apparaît en retard. Laissez vide si aucun délai.')}</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input type="number" min={1} value={f.target_hours ?? ''} onChange={(e) => set('target_hours', e.target.value ? Math.max(1, Number(e.target.value)) : null)} className="num w-24" />
                <span className="text-sm text-muted">{t('ساعة', 'heures')}</span>
                {[2, 24, 48, 72].map((h) => (
                  <button key={h} onClick={() => set('target_hours', h)} className={cn('num rounded-lg border px-3 py-1.5 text-sm', f.target_hours === h ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                    {h < 24 ? `${h} ${t('س', 'h')}` : `${h / 24} ${t('يوم', 'j')}`}
                  </button>
                ))}
                {f.target_hours != null && (
                  <Button variant="ghost" size="sm" onClick={() => set('target_hours', null)}>
                    {t('بدون مدة', 'Aucun')}
                  </Button>
                )}
              </div>
            </Card>

            <SwitchRow
              label={t('🌍 متاحة لمغاربة العالم', '🌍 Disponible pour les MRE')}
              description={t('تظهر في صفحة «أنا خارج المغرب»: طلب عن بُعد، أداء بالتحويل، استلام بالإيميل أو بالبريد', 'Visible dans « Je suis à l’étranger » : demande à distance, virement, envoi par e-mail ou poste')}
              checked={f.abroad}
              onCheckedChange={(v) => set('abroad', v)}
            />

            <Card className="space-y-3 border-brand/30 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4 text-brand" />
                {t('دليل الموظف (داخلي)', 'Guide interne pour l’employé')}
              </div>
              <p className="text-xs text-muted">{t('يظهر للموظف داخل صفحة الطلب فقط، ولا يظهر أبداً في الموقع.', 'Affiché à l’employé dans la demande, jamais sur le site.')}</p>
              {(suggestions.data?.length ?? 0) > 0 && (
                <div className="space-y-2 rounded-xl bg-info/5 p-3">
                  <div className="text-xs font-semibold text-info">{t('اقتراحات الموظفين لتحسين هذا الدليل', 'Suggestions de l’équipe')}</div>
                  {suggestions.data!.map((s) => (
                    <div key={s.id} className="flex items-start gap-2 text-sm">
                      <span className="flex-1">
                        «{s.text}» <span className="text-xs text-muted">— {s.employees?.full_name}</span>
                      </span>
                      <Button size="sm" variant="ghost" onClick={() => closeSuggestion(s.id, 'applied')}>{t('طُبّق', 'Appliqué')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => closeSuggestion(s.id, 'dismissed')}>{t('تجاهل', 'Ignorer')}</Button>
                    </div>
                  ))}
                </div>
              )}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted">{t('خطوات الإنجاز: يضغطها الموظف واحدة واحدة داخل الطلب', 'Étapes : cochées une à une par l’employé')}</div>
                {g.steps.map((st, i) => (
                  <div key={i} className="space-y-2 rounded-xl border border-border p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <Input value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder={t('مثلاً: افتح البوابة واختر «طلب جديد»', 'ex. Ouvrir le portail')} />
                      <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ steps: move(g.steps, i, -1) })}>↑</Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ steps: move(g.steps, i, 1) })}>↓</Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ steps: g.steps.filter((_, j) => j !== i) })}>
                        <Trash className="text-danger" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 ps-8">
                      <Input value={st.url ?? ''} onChange={(e) => setStep(i, { url: e.target.value })} placeholder={t('رابط هذه الخطوة (اختياري) https://', 'Lien (optionnel)')} dir="ltr" className="min-w-48 flex-1 text-xs" />
                      <Input value={st.url_label ?? ''} onChange={(e) => setStep(i, { url_label: e.target.value })} placeholder={t('اسم الزر', 'Texte du bouton')} className="w-36 text-xs" />
                      <label className="flex items-center gap-1.5 text-xs text-muted">
                        <Checkbox checked={st.required} onCheckedChange={(required) => setStep(i, { required })} />
                        {t('إلزامية', 'Obligatoire')}
                      </label>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setGuide({ steps: [...g.steps, { title: '', url: '', url_label: '', required: true }] })}>
                  <Plus />
                  {t('إضافة خطوة', 'Ajouter une étape')}
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <SwitchRow label={t('رقم الطلب في البوابة إلزامي قبل «جاهز»', 'N° du portail obligatoire avant « Prêt »')} checked={g.require_ref} onCheckedChange={(require_ref) => setGuide({ require_ref })} />
                <SwitchRow label={t('لقطة شاشة للتأكيد إلزامية', 'Capture d’écran obligatoire')} checked={g.require_proof} onCheckedChange={(require_proof) => setGuide({ require_proof })} />
              </div>
              <Field label={t('فيديو الشرح (رابط YouTube أو Google Drive)', 'Vidéo explicative (lien)')}>
                <Input value={g.video_url ?? ''} onChange={(e) => setGuide({ video_url: e.target.value })} dir="ltr" placeholder="https://youtu.be/..." />
              </Field>
              <Field label={t('أخطاء شائعة وملاحظات', 'Erreurs fréquentes et remarques')}>
                <Textarea rows={3} value={g.tips_ar ?? ''} onChange={(e) => setGuide({ tips_ar: e.target.value })} />
              </Field>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted">{t('روابط مفيدة', 'Liens utiles')}</div>
                {g.links.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input value={l.label} onChange={(e) => setGuide({ links: g.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={t('الاسم', 'Libellé')} />
                    <Input value={l.url} onChange={(e) => setGuide({ links: g.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} placeholder="https://" dir="ltr" />
                    <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ links: g.links.filter((_, j) => j !== i) })}>
                      <Trash className="text-danger" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setGuide({ links: [...g.links, { label: '', url: '' }] })}>
                  <Plus />
                  {t('إضافة رابط', 'Ajouter un lien')}
                </Button>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted">{t('صور توضيحية', 'Captures d’écran')}</div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {g.images.map((url, i) => (
                    <ImageInput key={url} sb={sb} folder="guides" value={url} aspect="aspect-video" onChange={(u) => setGuide({ images: u ? g.images.map((x, j) => (j === i ? u : x)) : g.images.filter((_, j) => j !== i) })} />
                  ))}
                  <ImageInput key={`new-${g.images.length}`} sb={sb} folder="guides" value={null} aspect="aspect-video" onChange={(u) => u && setGuide({ images: [...g.images, u] })} />
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted">{t('رسائل واتساب جاهزة لهذه الخدمة — {name} {number} {link} {service}', 'Messages WhatsApp prêts — {name} {number} {link} {service}')}</div>
                {g.templates.map((tp, i) => (
                  <div key={i} className="space-y-1.5 rounded-xl border border-border p-2.5">
                    <div className="flex gap-2">
                      <Input value={tp.label} onChange={(e) => setGuide({ templates: g.templates.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={t('اسم الرسالة، مثلاً: صورة غير واضحة', 'Titre')} />
                      <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ templates: g.templates.filter((_, j) => j !== i) })}>
                        <Trash className="text-danger" />
                      </Button>
                    </div>
                    <Textarea rows={3} value={tp.text} onChange={(e) => setGuide({ templates: g.templates.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setGuide({ templates: [...g.templates, { label: '', text: 'مرحباً {name} 👋\nبخصوص طلبكم {number} ({service}): ' }] })}>
                  <Plus />
                  {t('إضافة رسالة', 'Ajouter un message')}
                </Button>
              </div>
            </Card>
          </>
        )}

        <SwitchRow label={t('تظهر في الموقع', 'Visible sur le site')} checked={f.is_online} onCheckedChange={(v) => set('is_online', v)} />
        <SwitchRow label={t('الخدمة مفعّلة', 'Service actif')} description={t('الخدمة المعطلة لا تظهر في نقطة البيع ولا في الموقع', 'Un service inactif est masqué partout')} checked={f.is_active} onCheckedChange={(v) => set('is_active', v)} />
      </div>
    </Sheet>
  )
}
