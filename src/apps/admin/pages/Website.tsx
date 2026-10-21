import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Globe, Globe2, Image as ImageIcon, LayoutTemplate, ListChecks, MessageCircle, Plus, Save, Scale, Trash, Truck, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import type { RequestStatus } from '@/shared/lib/online'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Field, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { PageHeader } from '@/shared/ui/data'
import { ColorPicker, IconPicker, MoneyInput } from '@/shared/ui/pickers'
import { ImageInput } from '@/shared/ui/media'
import { resetWhatsAppMode } from '@/shared/lib/whatsapp'
import { SITES } from '@/shared/lib/brand'
import { StoreSiteEditor } from './StoreSiteEditor'

type W = {
  announcement: { enabled: boolean; text_ar: string; text_fr: string }
  hero: { title_ar: string; title_fr: string; subtitle_ar: string; subtitle_fr: string; image_url: string | null }
  features: { icon: string; title_ar: string; title_fr: string; text_ar: string; text_fr: string }[]
  about: { title_ar: string; title_fr: string; text_ar: string; text_fr: string }
  faq: { q_ar: string; q_fr: string; a_ar: string; a_fr: string }[]
  sections: Record<string, boolean>
  seo: { description_ar: string; description_fr: string }
  legal: { privacy_ar: string; privacy_fr: string; terms_ar: string; terms_fr: string }
}
type D = { enabled: boolean; cod: boolean; default_price: number; free_above: number | null; zones: { city: string; city_ar: string; price: number }[] }
type P = { cod: boolean; in_store: boolean; bank_transfer: boolean; bank_name: string; rib: string; account_holder: string }
type AB = { enabled: boolean; post_note_ar: string; post_note_fr: string; payment_note_ar: string; payment_note_fr: string }
type WA = { mode: string; number: string; templates: Record<string, string>; template_name?: string; template_lang?: string }

type Site = 'services' | 'store' | 'shared'
const TABS = [
  { id: 'home', site: 'services', ar: 'الصفحة الرئيسية', fr: "Page d'accueil", icon: LayoutTemplate },
  { id: 'faq', site: 'services', ar: 'الأسئلة الشائعة', fr: 'FAQ', icon: ListChecks },
  { id: 'abroad', site: 'services', ar: 'مغاربة العالم', fr: 'Marocains du monde', icon: Globe2 },
  { id: 'statuses', site: 'services', ar: 'مراحل الطلبات', fr: 'Étapes des demandes', icon: ListChecks },
  { id: 'delivery', site: 'shared', ar: 'التوصيل (طلبيات المتجر)', fr: 'Livraison (boutique)', icon: Truck },
  { id: 'payments', site: 'shared', ar: 'الأداء الأونلاين', fr: 'Paiements', icon: Wallet },
  { id: 'whatsapp', site: 'shared', ar: 'رسائل واتساب', fr: 'Messages WhatsApp', icon: MessageCircle },
  { id: 'legal', site: 'shared', ar: 'الخصوصية والشروط', fr: 'Pages légales', icon: Scale },
] as const
const SITE_TABS: { id: Site; ar: string; fr: string; icon: string; color: string }[] = [
  { id: 'services', ar: 'موقع الخدمات', fr: 'Site Services', icon: '🗂️', color: '#2563EB' },
  { id: 'store', ar: 'موقع المتجر', fr: 'Site Boutique', icon: '🛍️', color: '#FF6B35' },
  { id: 'shared', ar: 'مشترك بين الموقعين', fr: 'Commun aux deux', icon: '⚙️', color: '#475569' },
]

const TPL: [string, string, string][] = [
  ['order_received', 'استلام طلب المتجر', 'Commande reçue'],
  ['order_confirmed', 'تأكيد طلب المتجر', 'Commande confirmée'],
  ['order_shipped', 'الطلب في الطريق', 'Commande expédiée'],
  ['order_ready', 'الطلب جاهز للاستلام', 'Prête au retrait'],
  ['debt_reminder', 'تذكير بالدَّين', 'Rappel de crédit'],
]

export function WebsitePage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [site, setSite] = useState<Site>('services')
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('home')
  const pickSite = (x: Site) => (setSite(x), x !== 'store' && setTab(TABS.find((y) => y.site === x)!.id))
  const [w, setW] = useState<W | null>(null)
  const [d, setD] = useState<D | null>(null)
  const [p, setP] = useState<P | null>(null)
  const [wa, setWa] = useState<WA | null>(null)
  const [ab, setAb] = useState<AB | null>(null)
  const [st, setSt] = useState<RequestStatus[]>([])
  const [busy, setBusy] = useState(false)

  const data = useQuery({
    queryKey: ['website-editor'],
    queryFn: async () => {
      const { data } = await sb.from('settings').select('key, value').in('key', ['website', 'delivery', 'online_payments', 'whatsapp', 'abroad'])
      const { data: statuses } = await sb.from('request_statuses').select('*').order('sort')
      return { m: Object.fromEntries((data ?? []).map((r) => [r.key, r.value])), statuses: (statuses ?? []) as RequestStatus[] }
    },
  })
  useEffect(() => {
    if (!data.data) return
    setW(data.data.m.website as W)
    setD(data.data.m.delivery as D)
    setP(data.data.m.online_payments as P)
    setAb((data.data.m.abroad as AB) ?? { enabled: true, post_note_ar: '', post_note_fr: '', payment_note_ar: '', payment_note_fr: '' })
    setWa((() => { const x = data.data.m.whatsapp as WA; return { ...x, templates: x.templates ?? {} } })())
    setSt(data.data.statuses)
  }, [data.data])

  const save = async () => {
    setBusy(true)
    try {
      const up = async (key: string, value: unknown) => {
        const { error } = await sb.from('settings').update({ value }).eq('key', key)
        if (error) throw error
      }
      if (['home', 'faq', 'legal'].includes(tab)) await up('website', w)
      if (tab === 'delivery') await up('delivery', d)
      if (tab === 'payments') await up('online_payments', p)
      if (tab === 'abroad' && ab) await up('abroad', ab)
      if (tab === 'whatsapp') (await up('whatsapp', wa), resetWhatsAppMode())
      if (tab === 'statuses')
        for (const s of st) {
          const { error } = await sb.from('request_statuses').update({ name_ar: s.name_ar, name_fr: s.name_fr, color: s.color, sort: s.sort, allow_download: s.allow_download, template_ar: s.template_ar, template_fr: s.template_fr }).eq('key', s.key)
          if (error) throw error
        }
      toast.success(t('تم الحفظ. التغييرات ظاهرة في الموقع الآن ✨', 'Enregistré. Visible sur le site ✨'))
      qc.invalidateQueries({ queryKey: ['website-editor'] })
      qc.invalidateQueries({ queryKey: ['request-statuses'] })
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }


  if (!w || !d || !p || !wa)
    return (
      <>
        <PageHeader icon={<Globe />} title={t('محرر الموقع', 'Éditeur du site')} />
        <Skeleton className="h-96" />
      </>
    )

  const setHero = (k: keyof W['hero'], v: string | null) => setW({ ...w, hero: { ...w.hero, [k]: v } })

  return (
    <>
      <PageHeader
        icon={<Globe />}
        title={t('محرر الموقع', 'Éditeur du site')}
        description={t('غيّر نصوص الموقع وصوره وإعدادات الطلبات دون أي كود', 'Modifiez le site sans code')}
        actions={
          site !== 'store' && (
            <>
              {site === 'services' && (
                <Button asChild variant="outline">
                  <a href={SITES.services} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    {t('فتح موقع الخدمات', 'Voir le site Services')}
                  </a>
                </Button>
              )}
              <Button onClick={save} loading={busy}>
                <Save />
                {t('حفظ', 'Enregistrer')}
              </Button>
            </>
          )
        }
      />
      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        {SITE_TABS.map((x) => (
          <button key={x.id} onClick={() => pickSite(x.id)} className={cn('flex items-center gap-3 rounded-2xl border-2 p-3 text-start transition-all', site === x.id ? 'bg-surface shadow-card' : 'border-transparent bg-surface-2/60 hover:bg-surface')} style={site === x.id ? { borderColor: x.color } : undefined}>
            <span className="text-2xl">{x.icon}</span>
            <span className="font-semibold">{t(x.ar, x.fr)}</span>
          </button>
        ))}
      </div>
      {site === 'store' ? (
        <StoreSiteEditor />
      ) : (
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.filter((x) => x.site === site).map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium', tab === x.id ? 'bg-surface text-brand shadow-card' : 'text-muted hover:bg-surface')}>
              <x.icon className="size-4" />
              {t(x.ar, x.fr)}
            </button>
          ))}
        </nav>
        <div className="space-y-5">
          {tab === 'home' && (
            <>
              <Card>
                <CardHeader title={t('شريط الإعلان', "Bandeau d'annonce")} />
                <div className="space-y-3 p-5">
                  <SwitchRow label={t('إظهار شريط في أعلى الموقع', 'Afficher en haut du site')} checked={w.announcement.enabled} onCheckedChange={(enabled) => setW({ ...w, announcement: { ...w.announcement, enabled } })} />
                  {w.announcement.enabled && <Pair a={w.announcement.text_ar} f={w.announcement.text_fr} onA={(text_ar) => setW({ ...w, announcement: { ...w.announcement, text_ar } })} onF={(text_fr) => setW({ ...w, announcement: { ...w.announcement, text_fr } })} label={t('النص', 'Texte')} />}
                </div>
              </Card>
              <Card>
                <CardHeader title={t('الواجهة الرئيسية', 'Bannière principale')} icon={<ImageIcon />} />
                <div className="space-y-4 p-5">
                  <Pair label={t('العنوان', 'Titre')} a={w.hero.title_ar} f={w.hero.title_fr} onA={(v) => setHero('title_ar', v)} onF={(v) => setHero('title_fr', v)} />
                  <Pair label={t('النص', 'Sous-titre')} a={w.hero.subtitle_ar} f={w.hero.subtitle_fr} onA={(v) => setHero('subtitle_ar', v)} onF={(v) => setHero('subtitle_fr', v)} area />
                  <Field label={t('صورة (اختيارية، وإلا يظهر مربع التتبّع)', 'Image (optionnelle)')}>
                    <ImageInput sb={sb} value={w.hero.image_url} folder="website" onChange={(v) => setHero('image_url', v)} aspect="aspect-[16/9]" className="max-w-md" />
                  </Field>
                </div>
              </Card>
              <Card>
                <CardHeader title={t('المزايا', 'Atouts')} action={<Button size="sm" variant="outline" onClick={() => setW({ ...w, features: [...w.features, { icon: 'sparkles', title_ar: '', title_fr: '', text_ar: '', text_fr: '' }] })}><Plus />{t('إضافة', 'Ajouter')}</Button>} />
                <div className="space-y-4 p-5">
                  {w.features.map((f, i) => {
                    const set = (patch: Partial<W['features'][number]>) => setW({ ...w, features: w.features.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                    return (
                      <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                        <div className="flex justify-end">
                          <Button variant="ghost" size="icon-sm" onClick={() => setW({ ...w, features: w.features.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button>
                        </div>
                        <IconPicker value={f.icon} onChange={(icon) => set({ icon })} />
                        <Pair label={t('العنوان', 'Titre')} a={f.title_ar} f={f.title_fr} onA={(title_ar) => set({ title_ar })} onF={(title_fr) => set({ title_fr })} />
                        <Pair label={t('الوصف', 'Texte')} a={f.text_ar} f={f.text_fr} onA={(text_ar) => set({ text_ar })} onF={(text_fr) => set({ text_fr })} />
                      </div>
                    )
                  })}
                </div>
              </Card>
              <Card>
                <CardHeader title={t('من نحن', 'À propos')} />
                <div className="space-y-4 p-5">
                  <Pair label={t('العنوان', 'Titre')} a={w.about.title_ar} f={w.about.title_fr} onA={(title_ar) => setW({ ...w, about: { ...w.about, title_ar } })} onF={(title_fr) => setW({ ...w, about: { ...w.about, title_fr } })} />
                  <Pair label={t('النص', 'Texte')} a={w.about.text_ar} f={w.about.text_fr} onA={(text_ar) => setW({ ...w, about: { ...w.about, text_ar } })} onF={(text_fr) => setW({ ...w, about: { ...w.about, text_fr } })} area />
                </div>
              </Card>
              <Card>
                <CardHeader title={t('أقسام الصفحة الرئيسية', 'Sections')} />
                <div className="grid gap-2 p-5 sm:grid-cols-2">
                  {(
                    [
                      ['features', 'المزايا', 'Atouts'],
                      ['services', 'الخدمات الإدارية', 'Services'],
                      ['about', 'من نحن', 'À propos'],
                      ['faq', 'الأسئلة الشائعة', 'FAQ'],
                    ] as const
                  ).map(([k, a, f]) => (
                    <SwitchRow key={k} label={t(a, f)} checked={w.sections[k] !== false} onCheckedChange={(v) => setW({ ...w, sections: { ...w.sections, [k]: v } })} />
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title={t('محركات البحث (Google)', 'Référencement (Google)')} />
                <div className="p-5">
                  <Pair label={t('وصف الموقع', 'Description')} a={w.seo.description_ar} f={w.seo.description_fr} onA={(description_ar) => setW({ ...w, seo: { ...w.seo, description_ar } })} onF={(description_fr) => setW({ ...w, seo: { ...w.seo, description_fr } })} area />
                </div>
              </Card>
            </>
          )}

          {tab === 'faq' && (
            <Card>
              <CardHeader title={t('الأسئلة الشائعة', 'FAQ')} action={<Button size="sm" onClick={() => setW({ ...w, faq: [...w.faq, { q_ar: '', q_fr: '', a_ar: '', a_fr: '' }] })}><Plus />{t('سؤال', 'Question')}</Button>} />
              <div className="space-y-4 p-5">
                {w.faq.map((q, i) => {
                  const set = (patch: Partial<W['faq'][number]>) => setW({ ...w, faq: w.faq.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                  return (
                    <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                      <div className="flex justify-end"><Button variant="ghost" size="icon-sm" onClick={() => setW({ ...w, faq: w.faq.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button></div>
                      <Pair label={t('السؤال', 'Question')} a={q.q_ar} f={q.q_fr} onA={(q_ar) => set({ q_ar })} onF={(q_fr) => set({ q_fr })} />
                      <Pair label={t('الجواب', 'Réponse')} a={q.a_ar} f={q.a_fr} onA={(a_ar) => set({ a_ar })} onF={(a_fr) => set({ a_fr })} area />
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {tab === 'delivery' && (
            <Card>
              <CardHeader title={t('التوصيل', 'Livraison')} icon={<Truck />} />
              <div className="space-y-4 p-5">
                <SwitchRow label={t('تفعيل التوصيل', 'Activer la livraison')} checked={d.enabled} onCheckedChange={(enabled) => setD({ ...d, enabled })} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('سعر التوصيل لباقي المدن', 'Prix pour les autres villes')}>
                    <MoneyInput value={d.default_price} onChange={(v) => setD({ ...d, default_price: v ?? 0 })} />
                  </Field>
                  <Field label={t('توصيل مجاني ابتداءً من (اختياري)', 'Gratuit dès (optionnel)')}>
                    <MoneyInput value={d.free_above} onChange={(v) => setD({ ...d, free_above: v || null })} />
                  </Field>
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-semibold">{t('المدن وأسعارها', 'Villes et tarifs')}</div>
                  {d.zones.map((z, i) => {
                    const set = (patch: Partial<D['zones'][number]>) => setD({ ...d, zones: d.zones.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
                    return (
                      <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr_10rem_auto]">
                        <Input value={z.city_ar} onChange={(e) => set({ city_ar: e.target.value })} placeholder={t('المدينة بالعربية', 'Ville (ar)')} />
                        <Input value={z.city} onChange={(e) => set({ city: e.target.value })} placeholder="Ville" dir="ltr" />
                        <MoneyInput value={z.price} onChange={(v) => set({ price: v ?? 0 })} />
                        <Button variant="ghost" size="icon-sm" onClick={() => setD({ ...d, zones: d.zones.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button>
                      </div>
                    )
                  })}
                  <Button variant="outline" size="sm" onClick={() => setD({ ...d, zones: [...d.zones, { city: '', city_ar: '', price: d.default_price }] })}><Plus />{t('إضافة مدينة', 'Ajouter une ville')}</Button>
                </div>
              </div>
            </Card>
          )}

          {tab === 'payments' && (
            <Card>
              <CardHeader title={t('طرق الأداء في الموقع', 'Moyens de paiement')} icon={<Wallet />} />
              <div className="space-y-3 p-5">
                <SwitchRow label={t('الأداء عند الاستلام (للتوصيل)', 'Paiement à la livraison')} checked={p.cod} onCheckedChange={(cod) => setP({ ...p, cod })} />
                <SwitchRow label={t('الأداء في المحل', 'Paiement en boutique')} checked={p.in_store} onCheckedChange={(in_store) => setP({ ...p, in_store })} />
                <SwitchRow label={t('التحويل البنكي', 'Virement bancaire')} checked={p.bank_transfer} onCheckedChange={(bank_transfer) => setP({ ...p, bank_transfer })} />
                {p.bank_transfer && (
                  <div className="rounded-xl bg-surface-2 p-3 text-sm">
                    {p.rib ? (
                      <span className="num" dir="ltr">{p.bank_name} · {p.rib}</span>
                    ) : (
                      <span className="text-danger">{t('لم يُدخل رقم الحساب بعد!', 'RIB non renseigné !')}</span>
                    )}
                    <a href="#/settings?s=bank" className="ms-2 text-brand underline">
                      {t('تعديل الحساب البنكي', 'Modifier le compte')}
                    </a>
                  </div>
                )}
              </div>
            </Card>
          )}

          {tab === 'abroad' && ab && (
            <Card>
              <CardHeader title={t('صفحة «أنا خارج المغرب»', 'Page « Je suis à l’étranger »')} description={t('للمغاربة المقيمين بالخارج: طلب الوثائق عن بُعد. اختر الخدمات المتاحة من صفحة الخدمات (زر «متاحة لمغاربة العالم»).', 'Choisissez les services concernés dans Services.')} icon={<Globe2 />} />
              <div className="space-y-4 p-5">
                <SwitchRow label={t('إظهار الصفحة في الموقع', 'Afficher la page')} checked={ab.enabled} onCheckedChange={(enabled) => setAb({ ...ab, enabled })} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('ملاحظة الأداء (ع)', 'Note paiement (ar)')}><Textarea value={ab.payment_note_ar} onChange={(e) => setAb({ ...ab, payment_note_ar: e.target.value })} /></Field>
                  <Field label={t('ملاحظة الأداء (ف)', 'Note paiement (fr)')}><Textarea value={ab.payment_note_fr} onChange={(e) => setAb({ ...ab, payment_note_fr: e.target.value })} dir="ltr" /></Field>
                  <Field label={t('ملاحظة الإرسال بالبريد (ع)', 'Note envoi postal (ar)')}><Textarea value={ab.post_note_ar} onChange={(e) => setAb({ ...ab, post_note_ar: e.target.value })} /></Field>
                  <Field label={t('ملاحظة الإرسال بالبريد (ف)', 'Note envoi postal (fr)')}><Textarea value={ab.post_note_fr} onChange={(e) => setAb({ ...ab, post_note_fr: e.target.value })} dir="ltr" /></Field>
                </div>
              </div>
            </Card>
          )}

          {tab === 'statuses' && (
            <Card>
              <CardHeader title={t('مراحل طلبات الخدمات', 'Étapes des demandes')} description={t('الاسم، اللون، ورسالة واتساب الجاهزة لكل مرحلة. المتغيرات: {name} {service} {number} {link}', 'Variables : {name} {service} {number} {link}')} />
              <div className="space-y-4 p-5">
                {st.map((s, i) => {
                  const set = (patch: Partial<RequestStatus>) => setSt(st.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                  return (
                    <div key={s.key} className="space-y-3 rounded-xl border border-border p-4" style={{ borderInlineStartWidth: 4, borderInlineStartColor: s.color }}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input value={s.name_ar} onChange={(e) => set({ name_ar: e.target.value })} />
                        <Input value={s.name_fr} onChange={(e) => set({ name_fr: e.target.value })} dir="ltr" />
                      </div>
                      <ColorPicker value={s.color} onChange={(color) => set({ color })} />
                      {!s.is_cancel && <SwitchRow label={t('الوثيقة الجاهزة متاحة للتحميل في هذه المرحلة', 'Téléchargement autorisé à cette étape')} checked={s.allow_download} onCheckedChange={(allow_download) => set({ allow_download })} />}
                      {!s.is_cancel && <Textarea value={s.template_ar ?? ''} onChange={(e) => set({ template_ar: e.target.value })} placeholder={t('رسالة واتساب لهذه المرحلة (اختياري)', 'Message WhatsApp (optionnel)')} className="min-h-24" />}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {tab === 'whatsapp' && (
            <Card>
              <CardHeader title={t('رسائل واتساب الجاهزة', 'Messages WhatsApp')} description={t('المتغيرات: {name} {number} {total} {link} {amount}', 'Variables : {name} {number} {total} {link} {amount}')} icon={<MessageCircle />} />
              <div className="space-y-4 p-5">
                <Field label={t('رقم واتساب المكتبة', 'Numéro WhatsApp')}>
                  <Input value={wa.number} onChange={(e) => setWa({ ...wa, number: e.target.value })} dir="ltr" className="num w-60" />
                </Field>
                {TPL.map(([k, a, f]) => (
                  <Field key={k} label={t(a, f)}>
                    <Textarea value={wa.templates[k] ?? ''} onChange={(e) => setWa({ ...wa, templates: { ...wa.templates, [k]: e.target.value } })} className="min-h-24" />
                  </Field>
                ))}
                <div className="space-y-3 rounded-xl border border-border p-4">
                  <div className="text-sm font-semibold">{t('طريقة الإرسال', "Mode d'envoi")}</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ['manual', 'يدوي (مجاني)', 'Manuel (gratuit)', 'زر يفتح واتساب برسالة جاهزة', 'Ouvre WhatsApp avec le message'],
                        ['auto', 'تلقائي (WhatsApp Cloud API)', 'Automatique (Cloud API)', 'يُرسل دون فتح واتساب. يتطلب حساب Meta', 'Envoi direct, compte Meta requis'],
                      ] as const
                    ).map(([v, a, f, da, df]) => (
                      <button key={v} onClick={() => setWa({ ...wa, mode: v })} className={cn('rounded-xl border-2 p-3 text-start', wa.mode === v ? 'border-brand bg-brand-50' : 'border-border')}>
                        <div className="text-sm font-semibold">{t(a, f)}</div>
                        <div className="text-xs text-muted">{t(da, df)}</div>
                      </button>
                    ))}
                  </div>
                  {wa.mode === 'auto' && (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('اسم القالب المعتمد من Meta (اختياري)', 'Nom du modèle Meta (optionnel)')}>
                          <Input value={wa.template_name ?? ''} onChange={(e) => setWa({ ...wa, template_name: e.target.value })} dir="ltr" />
                        </Field>
                        <Field label={t('لغة القالب', 'Langue du modèle')}>
                          <Input value={wa.template_lang ?? 'ar'} onChange={(e) => setWa({ ...wa, template_lang: e.target.value })} dir="ltr" />
                        </Field>
                      </div>
                      <div className="rounded-xl bg-warning/5 p-3 text-xs leading-relaxed text-muted">
                        {t('للتفعيل: أنشئ تطبيقاً في Meta for Developers وأضف رقم واتساب بزنس، ثم أضف في Supabase ← Edge Functions ← Secrets المفتاحين WHATSAPP_TOKEN و WHATSAPP_PHONE_ID. إن لم يكن مفعّلاً سيفتح النظام واتساب يدوياً كالعادة.', 'Activation : créez une app Meta, puis ajoutez WHATSAPP_TOKEN et WHATSAPP_PHONE_ID dans les secrets Supabase. Sinon l’envoi manuel est utilisé.')}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Card>
          )}

          {tab === 'legal' && (
            <Card>
              <CardHeader title={t('الصفحات القانونية', 'Pages légales')} icon={<Scale />} />
              <div className="space-y-4 p-5">
                <Pair label={t('سياسة الخصوصية', 'Confidentialité')} a={w.legal.privacy_ar} f={w.legal.privacy_fr} onA={(privacy_ar) => setW({ ...w, legal: { ...w.legal, privacy_ar } })} onF={(privacy_fr) => setW({ ...w, legal: { ...w.legal, privacy_fr } })} area tall />
                <Pair label={t('شروط الاستعمال', 'Conditions')} a={w.legal.terms_ar} f={w.legal.terms_fr} onA={(terms_ar) => setW({ ...w, legal: { ...w.legal, terms_ar } })} onF={(terms_fr) => setW({ ...w, legal: { ...w.legal, terms_fr } })} area tall />
                <div className="rounded-xl bg-warning/5 p-3 text-xs text-muted">{t('تذكير: التصريح لدى اللجنة الوطنية لحماية المعطيات الشخصية (CNDP) مسؤوليتك القانونية لأن الموقع يجمع وثائق شخصية.', 'Rappel : la déclaration CNDP relève de votre responsabilité.')}</div>
              </div>
            </Card>
          )}
        </div>
      </div>
      )}
    </>
  )
}

function Pair({ label, a, f, onA, onF, area, tall }: { label: string; a: string; f: string; onA: (v: string) => void; onF: (v: string) => void; area?: boolean; tall?: boolean }) {
  const C = area ? Textarea : Input
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} · ع`}>
        <C value={a ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onA(e.target.value)} className={tall ? 'min-h-48' : undefined} />
      </Field>
      <Field label={`${label} · FR`}>
        <C value={f ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onF(e.target.value)} dir="ltr" className={tall ? 'min-h-48' : undefined} />
      </Field>
    </div>
  )
}
