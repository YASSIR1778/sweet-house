import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { GuideStep, ServiceGuide } from '@/shared/lib/types'
import { Button, Checkbox, Field, Input, Spinner, SwitchRow, Textarea } from './primitives'
import { Dialog } from './overlay'
import { ImageInput } from './media'

export const blankGuide = (): ServiceGuide => ({ tips_ar: '', links: [], images: [], steps: [], video_url: '', templates: [], require_ref: true, require_proof: false })

const move = <T,>(arr: T[], i: number, d: number) => {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const c = [...arr]
  ;[c[i], c[j]] = [c[j], c[i]]
  return c
}

/**
 * Staff guide fields: steps, video, tips, links, pictures and WhatsApp messages,
 * with the team's pending suggestions on top. Request-only options are hidden for counter services.
 */
export function GuideEditor({ value: g, onChange, serviceId, kind = 'admin' }: { value: ServiceGuide; onChange: (g: ServiceGuide) => void; serviceId?: string; kind?: 'admin' | 'counter' }) {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const setGuide = (p: Partial<ServiceGuide>) => onChange({ ...g, ...p })
  const setStep = (i: number, p: Partial<GuideStep>) => setGuide({ steps: g.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const suggestions = useQuery({
    queryKey: ['guide-suggestions', serviceId],
    enabled: !!serviceId && can('services.manage'),
    queryFn: async () =>
      (await sb.from('guide_suggestions').select('id, text, created_at, status, employees(full_name)').eq('service_id', serviceId!).eq('status', 'pending').order('created_at')).data as unknown as {
        id: string
        text: string
        created_at: string
        employees: { full_name: string } | null
      }[],
  })
  const closeSuggestion = async (id: string, status: 'applied' | 'dismissed') => {
    await sb.from('guide_suggestions').update({ status }).eq('id', id)
    suggestions.refetch()
  }

  return (
    <div className="space-y-3">
      {(suggestions.data?.length ?? 0) > 0 && (
        <div className="space-y-2 rounded-xl bg-info/5 p-3">
          <div className="text-xs font-semibold text-info">{t('اقتراحات الموظفين لتحسين هذا الدليل', 'Suggestions de l’équipe')}</div>
          {suggestions.data!.map((s) => (
            <div key={s.id} className="flex items-start gap-2 text-sm">
              <span className="flex-1">
                «{s.text}» <span className="text-xs text-muted">— {s.employees?.full_name}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => closeSuggestion(s.id, 'applied')}>
                {t('طُبّق', 'Appliqué')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => closeSuggestion(s.id, 'dismissed')}>
                {t('تجاهل', 'Ignorer')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted">
          {kind === 'admin' ? t('خطوات الإنجاز: يضغطها الموظف واحدة واحدة داخل الطلب', 'Étapes : cochées une à une par l’employé') : t('خطوات الإنجاز', 'Étapes')}
        </div>
        {g.steps.map((st, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border p-2.5">
            <div className="flex items-center gap-2">
              <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
              <Input value={st.title} onChange={(e) => setStep(i, { title: e.target.value })} placeholder={t('مثلاً: افتح البوابة واختر «طلب جديد»', 'ex. Ouvrir le portail')} />
              <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ steps: move(g.steps, i, -1) })}>
                ↑
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => setGuide({ steps: move(g.steps, i, 1) })}>
                ↓
              </Button>
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
      {kind === 'admin' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <SwitchRow label={t('رقم الطلب في البوابة إلزامي قبل «جاهز»', 'N° du portail obligatoire avant « Prêt »')} checked={g.require_ref} onCheckedChange={(require_ref) => setGuide({ require_ref })} />
          <SwitchRow label={t('لقطة شاشة للتأكيد إلزامية', 'Capture d’écran obligatoire')} checked={g.require_proof} onCheckedChange={(require_proof) => setGuide({ require_proof })} />
        </div>
      )}
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
      {kind === 'admin' && (
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
      )}
    </div>
  )
}

/** Edit one service's guide on its own (guides page, POS). */
export function GuideEditDialog({ service, onClose }: { service: { id: string; name_ar: string; name_fr: string; kind?: 'admin' | 'counter' } | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [g, setG] = useState<ServiceGuide | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    setG(null)
    if (!service) return
    sb.from('service_guides')
      .select('tips_ar, links, images, steps, video_url, templates, require_ref, require_proof')
      .eq('service_id', service.id)
      .maybeSingle()
      .then(({ data, error }) => (error ? toast.error(errorMessage(error, lang)) : setG(data ? { ...blankGuide(), ...(data as ServiceGuide) } : blankGuide())))
  }, [service, sb, lang])

  const save = async () => {
    if (!service || !g) return
    setBusy(true)
    const { error } = await sb.rpc('save_service_guide', { p_service: service.id, p: { ...g, steps: g.steps.filter((s) => s.title.trim()) } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظ الدليل', 'Guide enregistré'))
    qc.invalidateQueries({ queryKey: ['service-guides'] })
    qc.invalidateQueries({ queryKey: ['request'] })
    onClose()
  }

  return (
    <Dialog
      open={!!service}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={t('تعديل الدليل', 'Modifier le guide')}
      description={service ? pick(service, 'name') : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('إلغاء', 'Annuler')}
          </Button>
          <Button onClick={save} loading={busy} disabled={!g}>
            <Save />
            {t('حفظ الدليل', 'Enregistrer')}
          </Button>
        </>
      }
    >
      {g ? (
        <GuideEditor value={g} onChange={setG} serviceId={service?.id} kind={service?.kind} />
      ) : (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      )}
    </Dialog>
  )
}
