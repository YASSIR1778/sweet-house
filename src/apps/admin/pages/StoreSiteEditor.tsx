import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Image as ImageIcon, LayoutTemplate, ListChecks, Megaphone, Menu, Plus, RotateCcw, Rows3, Save, Search, ShieldCheck, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { SITES } from '@/shared/lib/brand'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Field, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { IconPicker } from '@/shared/ui/pickers'
import type { StoreSite } from '@/apps/site/data'
import { blocksOf } from '@/shared/lib/blocks'
import { BlocksEditor, MenuEditor, SocialsEditor } from './BlocksEditor'

const TABS = [
  { id: 'blocks', ar: 'أقسام الصفحة الرئيسية', fr: 'Sections', icon: Rows3 },
  { id: 'home', ar: 'الواجهة والوعد', fr: 'Bannière et promesse', icon: LayoutTemplate },
  { id: 'menu', ar: 'القائمة والحسابات', fr: 'Menu et réseaux', icon: Menu },
  { id: 'trust', ar: 'الضمانات', fr: 'Garanties', icon: ShieldCheck },
  { id: 'faq', ar: 'الأسئلة الشائعة', fr: 'FAQ', icon: ListChecks },
  { id: 'returns', ar: 'الإرجاع والاستبدال', fr: 'Retours', icon: RotateCcw },
  { id: 'seo', ar: 'Google والإعلان', fr: 'SEO et bandeau', icon: Search },
] as const

const STORE_MENU = [
  { label_ar: 'الرئيسية', label_fr: 'Accueil', to: '/' },
  { label_ar: 'كل المنتجات', label_fr: 'Produits', to: '/shop' },
  { label_ar: 'الأسئلة الشائعة', label_fr: 'FAQ', to: '/faq' },
  { label_ar: 'تتبّع طلبيتي', label_fr: 'Suivi', to: '/track' },
  { label_ar: 'تواصل معنا', label_fr: 'Contact', to: '/contact' },
]

function Pair({ label, a, f, onA, onF, area }: { label: string; a: string; f: string; onA: (v: string) => void; onF: (v: string) => void; area?: boolean }) {
  const C = area ? Textarea : Input
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={`${label} (ع)`}>
        <C value={a ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onA(e.target.value)} rows={3} />
      </Field>
      <Field label={`${label} (fr)`}>
        <C value={f ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => onF(e.target.value)} dir="ltr" rows={3} />
      </Field>
    </div>
  )
}

/** Website editor → 🛍️ Store: content of the store website only. */
export function StoreSiteEditor() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('blocks')
  const [w, setW] = useState<StoreSite | null>(null)
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['website-store'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'website_store').single()).data?.value as StoreSite })
  useEffect(() => {
    if (q.data) setW({ ...q.data, blocks: blocksOf('store', q.data.blocks, q.data.sections), menu: q.data.menu?.length ? q.data.menu : STORE_MENU })
  }, [q.data])
  if (!w) return <Skeleton className="h-96" />

  const save = async () => {
    setBusy(true)
    const { error } = await sb.from('settings').update({ value: w }).eq('key', 'website_store')
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظ ✨ التغييرات ظاهرة في المتجر الآن', 'Enregistré ✨ visible sur la boutique'))
    qc.invalidateQueries({ queryKey: ['website-store'] })
  }
  const hero = (k: keyof StoreSite['hero'], v: string) => setW({ ...w, hero: { ...w.hero, [k]: v } })

  return (
    <>
      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <a href={SITES.store} target="_blank" rel="noreferrer">
            <ExternalLink />
            {t('فتح المتجر', 'Voir la boutique')}
          </a>
        </Button>
        <Button onClick={save} loading={busy}>
          <Save />
          {t('حفظ', 'Enregistrer')}
        </Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {TABS.map((x) => (
            <button key={x.id} onClick={() => setTab(x.id)} className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium', tab === x.id ? 'bg-surface text-brand shadow-card' : 'text-muted hover:bg-surface')}>
              <x.icon className="size-4" />
              {t(x.ar, x.fr)}
            </button>
          ))}
        </nav>
        <div className="space-y-5">
          {tab === 'blocks' && <BlocksEditor brand="store" blocks={w.blocks ?? []} onChange={(blocks) => setW({ ...w, blocks })} />}
          {tab === 'menu' && (
            <>
              <MenuEditor menu={w.menu ?? []} onChange={(menu) => setW({ ...w, menu })} />
              <SocialsEditor value={w.socials ?? {}} onChange={(socials) => setW({ ...w, socials })} />
            </>
          )}
          {tab === 'home' && (
            <>
              <Card>
                <CardHeader title={t('الواجهة الرئيسية', 'Bannière principale')} icon={<ImageIcon />} description={t('السطر الثاني يظهر بلون متدرج', 'La 2e ligne est en dégradé')} />
                <div className="space-y-4 p-5">
                  <Pair label={t('السطر الأول', 'Ligne 1')} a={w.hero.title_ar} f={w.hero.title_fr} onA={(v) => hero('title_ar', v)} onF={(v) => hero('title_fr', v)} />
                  <Pair label={t('السطر الملوّن', 'Ligne colorée')} a={w.hero.accent_ar} f={w.hero.accent_fr} onA={(v) => hero('accent_ar', v)} onF={(v) => hero('accent_fr', v)} />
                  <Pair label={t('النص', 'Texte')} a={w.hero.subtitle_ar} f={w.hero.subtitle_fr} onA={(v) => hero('subtitle_ar', v)} onF={(v) => hero('subtitle_fr', v)} area />
                  <p className="text-xs text-muted">{t('المنتجات التي تظهر بجانب العنوان: المنتجات «المميزة» ⭐ (من صفحة المنتجات).', 'Les produits à côté du titre : les produits « en vedette » ⭐.')}</p>
                </div>
              </Card>
              <Card>
                <CardHeader title={t('وعد الدفع عند الاستلام', 'Promesse paiement à la livraison')} />
                <div className="space-y-4 p-5">
                  <Pair label={t('العنوان', 'Titre')} a={w.promise.title_ar} f={w.promise.title_fr} onA={(title_ar) => setW({ ...w, promise: { ...w.promise, title_ar } })} onF={(title_fr) => setW({ ...w, promise: { ...w.promise, title_fr } })} />
                  <Pair label={t('النص', 'Texte')} a={w.promise.text_ar} f={w.promise.text_fr} onA={(text_ar) => setW({ ...w, promise: { ...w.promise, text_ar } })} onF={(text_fr) => setW({ ...w, promise: { ...w.promise, text_fr } })} area />
                </div>
              </Card>
            </>
          )}

          {tab === 'trust' && (
            <Card>
              <CardHeader title={t('الضمانات', 'Garanties')} description={t('تظهر تحت العنوان وفي الشريط المتحرك', 'Sous le titre et dans le bandeau défilant')} action={<Button size="sm" variant="outline" onClick={() => setW({ ...w, trust: [...w.trust, { icon: 'sparkles', text_ar: '', text_fr: '' }] })}><Plus />{t('إضافة', 'Ajouter')}</Button>} />
              <div className="space-y-4 p-5">
                {w.trust.map((x, i) => {
                  const set = (p: Partial<StoreSite['trust'][number]>) => setW({ ...w, trust: w.trust.map((y, j) => (j === i ? { ...y, ...p } : y)) })
                  return (
                    <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                      <div className="flex items-center justify-between">
                        <IconPicker value={x.icon} onChange={(icon) => set({ icon })} />
                        <Button variant="ghost" size="icon-sm" onClick={() => setW({ ...w, trust: w.trust.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button>
                      </div>
                      <Pair label={t('النص', 'Texte')} a={x.text_ar} f={x.text_fr} onA={(text_ar) => set({ text_ar })} onF={(text_fr) => set({ text_fr })} />
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {tab === 'faq' && (
            <Card>
              <CardHeader title={t('الأسئلة الشائعة للمتجر', 'FAQ de la boutique')} description={t('سؤال «ثمن التوصيل» يُضاف تلقائياً من إعدادات التوصيل', 'La question « prix de livraison » est ajoutée automatiquement')} action={<Button size="sm" onClick={() => setW({ ...w, faq: [...w.faq, { q_ar: '', q_fr: '', a_ar: '', a_fr: '' }] })}><Plus />{t('سؤال', 'Question')}</Button>} />
              <div className="space-y-4 p-5">
                {w.faq.map((x, i) => {
                  const set = (p: Partial<StoreSite['faq'][number]>) => setW({ ...w, faq: w.faq.map((y, j) => (j === i ? { ...y, ...p } : y)) })
                  return (
                    <div key={i} className="space-y-3 rounded-xl border border-border p-4">
                      <div className="flex justify-end"><Button variant="ghost" size="icon-sm" onClick={() => setW({ ...w, faq: w.faq.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button></div>
                      <Pair label={t('السؤال', 'Question')} a={x.q_ar} f={x.q_fr} onA={(q_ar) => set({ q_ar })} onF={(q_fr) => set({ q_fr })} />
                      <Pair label={t('الجواب', 'Réponse')} a={x.a_ar} f={x.a_fr} onA={(a_ar) => set({ a_ar })} onF={(a_fr) => set({ a_fr })} area />
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {tab === 'returns' && (
            <Card>
              <CardHeader title={t('سياسة الإرجاع والاستبدال', 'Politique de retour')} description={t('كل سطر قاعدة مرقّمة في صفحة «الإرجاع والاستبدال»', 'Chaque ligne = une règle numérotée')} action={<Button size="sm" variant="outline" onClick={() => setW({ ...w, returns: [...w.returns, { text_ar: '', text_fr: '' }] })}><Plus />{t('قاعدة', 'Règle')}</Button>} />
              <div className="space-y-4 p-5">
                {w.returns.map((x, i) => {
                  const set = (p: Partial<StoreSite['returns'][number]>) => setW({ ...w, returns: w.returns.map((y, j) => (j === i ? { ...y, ...p } : y)) })
                  return (
                    <div key={i} className="flex gap-2 rounded-xl border border-border p-4">
                      <span className="num flex size-7 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                      <div className="flex-1"><Pair label={t('القاعدة', 'Règle')} a={x.text_ar} f={x.text_fr} onA={(text_ar) => set({ text_ar })} onF={(text_fr) => set({ text_fr })} area /></div>
                      <Button variant="ghost" size="icon-sm" onClick={() => setW({ ...w, returns: w.returns.filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {tab === 'seo' && (
            <>
              <Card>
                <CardHeader title={t('شريط الإعلان في أعلى المتجر', 'Bandeau en haut de la boutique')} icon={<Megaphone />} />
                <div className="space-y-3 p-5">
                  <SwitchRow label={t('إظهار الشريط', 'Afficher')} checked={w.announcement.enabled} onCheckedChange={(enabled) => setW({ ...w, announcement: { ...w.announcement, enabled } })} />
                  {w.announcement.enabled && <Pair label={t('النص', 'Texte')} a={w.announcement.text_ar} f={w.announcement.text_fr} onA={(text_ar) => setW({ ...w, announcement: { ...w.announcement, text_ar } })} onF={(text_fr) => setW({ ...w, announcement: { ...w.announcement, text_fr } })} />}
                </div>
              </Card>
              <Card>
                <CardHeader title={t('محركات البحث (Google)', 'Référencement (Google)')} />
                <div className="p-5">
                  <Pair label={t('وصف المتجر', 'Description')} a={w.seo.description_ar} f={w.seo.description_fr} onA={(description_ar) => setW({ ...w, seo: { ...w.seo, description_ar } })} onF={(description_fr) => setW({ ...w, seo: { ...w.seo, description_fr } })} area />
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  )
}
