import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, Megaphone, Plus, Save, Sparkles, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { SITES } from '@/shared/lib/brand'
import { Button, Field, Input, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'
import { MoneyInput } from '@/shared/ui/pickers'
import type { Landing } from '@/apps/site/data'

type Row = { id: string; name_ar: string; name_fr: string; description_ar: string | null; images: string[]; is_online: boolean; landing: Landing; product_variants: { price: number }[] }

function List<T>({ items, onChange, blank, render, addLabel }: { items: T[]; onChange: (v: T[]) => void; blank: T; render: (it: T, set: (p: Partial<T>) => void) => React.ReactNode; addLabel: string }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 rounded-xl border border-border p-2">
          <div className="min-w-0 flex-1 space-y-2">{render(it, (p) => onChange(items.map((x, j) => (j === i ? { ...x, ...p } : x))))}</div>
          <Button size="icon-sm" variant="ghost" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <Trash className="text-danger" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" onClick={() => onChange([...items, blank])}>
        <Plus />
        {addLabel}
      </Button>
    </div>
  )
}

/** Dashboard: turn a product into an ad landing page (/p/:id on the store). */
export function LandingEditor({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['landing', productId],
    enabled: !!productId,
    queryFn: async () => (await sb.from('products').select('id, name_ar, name_fr, description_ar, images, is_online, landing, product_variants(price)').eq('id', productId!).single()).data as Row,
  })
  const [L, setL] = useState<Landing>({})
  const [busy, setBusy] = useState<'save' | 'ai' | null>(null)
  useEffect(() => {
    if (q.data) setL({ enabled: true, ...(q.data.landing ?? {}) })
  }, [q.data])
  const p = q.data
  const url = p ? `${SITES.store}/p/${p.id}` : ''
  const price = p?.product_variants?.[0]?.price ?? 0

  const save = async () => {
    if (!p) return
    setBusy('save')
    const { error } = await sb.from('products').update({ landing: L }).eq('id', p.id)
    setBusy(null)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظت صفحة الهبوط ✅', 'Page enregistrée ✅'))
    qc.invalidateQueries({ queryKey: ['landing', p.id] })
  }
  const ai = async () => {
    if (!p) return
    setBusy('ai')
    try {
      const r = await callFn<Landing>(sb, 'ai', { action: 'landing', name: p.name_ar, description: p.description_ar ?? '', price: price / 100 })
      setL((x) => ({ ...x, ...r, offers: x.offers?.length ? x.offers : r.offers, reviews: x.reviews }))
      toast.success(t('✨ كُتبت الصفحة: راجعها وعدّل ما تريد ثم احفظ', '✨ Rédigée : relisez puis enregistrez'))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(null)
    }
  }
  const adLink = async (channel: 'facebook' | 'instagram' | 'tiktok') => {
    if (!p) return
    const code = `${{ facebook: 'fa', instagram: 'ia', tiktok: 'ta' }[channel]}${crypto.randomUUID().replace(/-/g, '').slice(0, 5)}`
    const { error } = await sb.from('campaign_links').insert({ code, channel, path: `/p/${p.id}`, label: `إعلان: ${p.name_ar}` })
    if (error) return toast.error(errorMessage(error, lang))
    await navigator.clipboard.writeText(`${url}?src=${code}`)
    toast.success(t('نُسخ رابط الإعلان ✅ الصقه في Ads Manager. كل طلبية منه تُحسب له في «التسويق».', 'Lien publicitaire copié ✅'))
  }

  return (
    <Sheet open={!!productId} onOpenChange={(o) => !o && onClose()} width="max-w-2xl" title={t('صفحة الهبوط (للإعلانات)', 'Page de destination (pub)')} description={p?.name_ar}>
      {p && (
        <div className="space-y-6">
          {!p.is_online && (
            <div className="rounded-xl bg-danger/10 p-3 text-sm text-danger">
              {t('⚠️ هذا المنتج مخفي من المتجر: صفحة الهبوط لن تفتح للزوار. فعّل «يظهر في متجر الموقع» في المنتج.', '⚠️ Produit masqué : la page ne s’ouvrira pas. Activez « Visible sur la boutique ».')}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={ai} loading={busy === 'ai'}>
              <Sparkles />
              {t('✨ اكتبها لي بالذكاء الاصطناعي', '✨ Rédiger avec l’IA')}
            </Button>
            <Button variant="ghost" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                <ExternalLink />
                {t('معاينة', 'Aperçu')}
              </a>
            </Button>
          </div>
          <div className="rounded-2xl bg-surface-2 p-3 text-sm">
            <div className="mb-2 font-medium">
              <Megaphone className="me-1 inline size-4" />
              {t('رابط الإعلان (يحسب الطلبيات لكل إعلان):', 'Lien de la pub (suivi des commandes) :')}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => adLink('facebook')}>📘 {t('فيسبوك / إنستغرام', 'Facebook / Instagram')}</Button>
              <Button size="sm" variant="outline" onClick={() => adLink('tiktok')}>🎵 TikTok</Button>
              <Button size="sm" variant="ghost" onClick={() => (navigator.clipboard.writeText(url), toast.success(t('نُسخ', 'Copié')))}>
                <Copy />
                {t('الرابط العادي', 'Lien simple')}
              </Button>
            </div>
          </div>

          <section className="space-y-3">
            <h3 className="font-bold">{t('1 · الوعد (أول ما يراه الزائر)', '1 · La promesse')}</h3>
            <Field label={t('العنوان الكبير', 'Titre')} hint={t('الفائدة لا اسم المنتج. مثلاً: «نظّم مطبخك فـ 5 دقايق»', 'Le bénéfice, pas le nom')}>
              <Input value={L.headline_ar ?? ''} onChange={(e) => setL({ ...L, headline_ar: e.target.value })} placeholder={p.name_ar} />
            </Field>
            <Field label={t('جملة تحت العنوان', 'Sous-titre')}>
              <Textarea value={L.sub_ar ?? ''} onChange={(e) => setL({ ...L, sub_ar: e.target.value })} rows={2} />
            </Field>
            <Field label={t('المميزات (تظهر بعلامة ✓)', 'Avantages')}>
              <List items={L.benefits ?? []} onChange={(benefits) => setL({ ...L, benefits })} blank={{ text_ar: '' }} addLabel={t('ميزة', 'Avantage')} render={(b, set) => <Input value={b.text_ar} onChange={(e) => set({ text_ar: e.target.value })} />} />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold">{t('2 · العروض حسب الكمية', '2 · Offres par quantité')}</h3>
            <p className="text-xs text-muted">{t(`الثمن العادي: ${price / 100} درهم للقطعة. مثلاً: 1 قطعة، 2 قطع بثمن أقل «الأكثر طلباً»…`, `Prix normal : ${price / 100} DH`)}</p>
            <List
              items={L.offers ?? []}
              onChange={(offers) => setL({ ...L, offers })}
              blank={{ qty: (L.offers?.length ?? 0) + 1, price: price * ((L.offers?.length ?? 0) + 1) }}
              addLabel={t('عرض', 'Offre')}
              render={(o, set) => (
                <div className="grid grid-cols-[4rem_1fr] gap-2 sm:grid-cols-[4rem_8rem_1fr_8rem]">
                  <Input type="number" min={1} value={o.qty} onChange={(e) => set({ qty: Number(e.target.value) })} className="num" title={t('الكمية', 'Qté')} />
                  <MoneyInput value={o.price} onChange={(v) => set({ price: v ?? 0 })} />
                  <Input value={o.label_ar ?? ''} onChange={(e) => set({ label_ar: e.target.value })} placeholder={t('النص (اختياري)', 'Libellé')} />
                  <Input value={o.badge_ar ?? ''} onChange={(e) => set({ badge_ar: e.target.value })} placeholder={t('شارة: الأكثر طلباً', 'Badge')} />
                </div>
              )}
            />
            <SwitchRow label={t('🚚 التوصيل مجاني لهذا المنتج', 'Livraison offerte pour ce produit')} checked={!!L.free_delivery} onCheckedChange={(free_delivery) => setL({ ...L, free_delivery })} />
            <SwitchRow label={t('🔥 إظهار «باقي غير X فالمخزون» حين يقلّ', 'Afficher le stock restant')} checked={!!L.urgency} onCheckedChange={(urgency) => setL({ ...L, urgency })} />
            <Field label={t('الضمان / الاستبدال (اختياري)', 'Garantie')}>
              <Input value={L.guarantee_ar ?? ''} onChange={(e) => setL({ ...L, guarantee_ar: e.target.value })} placeholder={t('مثلاً: إرجاع أو استبدال خلال 7 أيام', 'ex. Retour ou échange sous 7 jours')} />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="font-bold">{t('3 · الإقناع', '3 · Convaincre')}</h3>
            <Field label={t('فيديو (YouTube أو رابط mp4)', 'Vidéo (YouTube ou mp4)')}>
              <Input value={L.video_url ?? ''} onChange={(e) => setL({ ...L, video_url: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t('فقرات بصورة', 'Sections illustrées')}>
              <List
                items={L.sections ?? []}
                onChange={(sections) => setL({ ...L, sections })}
                blank={{ title_ar: '', text_ar: '', image: p.images[0] }}
                addLabel={t('فقرة', 'Section')}
                render={(s, set) => (
                  <>
                    <Input value={s.title_ar} onChange={(e) => set({ title_ar: e.target.value })} placeholder={t('العنوان', 'Titre')} />
                    <Textarea value={s.text_ar} onChange={(e) => set({ text_ar: e.target.value })} rows={2} placeholder={t('النص', 'Texte')} />
                    <select value={s.image ?? ''} onChange={(e) => set({ image: e.target.value || undefined })} className="h-9 w-full rounded-[10px] border border-border bg-surface px-2 text-sm">
                      <option value="">{t('بدون صورة', 'Sans image')}</option>
                      {p.images.map((img, i) => (
                        <option key={img} value={img}>
                          {t('صورة', 'Image')} {i + 1}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              />
            </Field>
            <Field label={t('آراء الزبائن', 'Avis clients')} hint={t('فقط آراء حقيقية (مثلاً من واتساب، بإذن الزبون). الآراء المزيفة ممنوعة وتضر الثقة والحساب الإعلاني.', 'Uniquement de vrais avis, avec accord du client.')}>
              <List
                items={L.reviews ?? []}
                onChange={(reviews) => setL({ ...L, reviews })}
                blank={{ name: '', text: '', rating: 5 }}
                addLabel={t('رأي', 'Avis')}
                render={(r, set) => (
                  <>
                    <div className="grid grid-cols-[1fr_1fr_4rem] gap-2">
                      <Input value={r.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('الاسم', 'Nom')} />
                      <Input value={r.city ?? ''} onChange={(e) => set({ city: e.target.value })} placeholder={t('المدينة', 'Ville')} />
                      <Input type="number" min={1} max={5} value={r.rating ?? 5} onChange={(e) => set({ rating: Number(e.target.value) })} className="num" />
                    </div>
                    <Textarea value={r.text} onChange={(e) => set({ text: e.target.value })} rows={2} placeholder={t('ماذا قال', 'Avis')} />
                  </>
                )}
              />
            </Field>
            <Field label={t('أسئلة شائعة', 'FAQ')}>
              <List
                items={L.faq ?? []}
                onChange={(faq) => setL({ ...L, faq })}
                blank={{ q_ar: '', a_ar: '' }}
                addLabel={t('سؤال', 'Question')}
                render={(f, set) => (
                  <>
                    <Input value={f.q_ar} onChange={(e) => set({ q_ar: e.target.value })} placeholder={t('السؤال', 'Question')} />
                    <Textarea value={f.a_ar} onChange={(e) => set({ a_ar: e.target.value })} rows={2} placeholder={t('الجواب', 'Réponse')} />
                  </>
                )}
              />
            </Field>
          </section>

          <div className="sticky bottom-0 -mx-1 bg-bg py-3">
            <Button className="w-full" size="lg" onClick={save} loading={busy === 'save'}>
              <Save />
              {t('حفظ صفحة الهبوط', 'Enregistrer')}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
