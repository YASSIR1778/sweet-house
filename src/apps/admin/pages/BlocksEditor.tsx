import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Plus, Trash, X } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import type { Brand } from '@/shared/lib/brand'
import { BLOCK_TYPES, newBlock, type Block, type BlockItem, type BlockType, type MenuLink } from '@/shared/lib/blocks'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Field, Input, Textarea } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { ColorPicker, IconPicker } from '@/shared/ui/pickers'
import { ImageInput } from '@/shared/ui/media'

function Pair({ label, a, f, onA, onF, area }: { label: string; a?: string; f?: string; onA: (v: string) => void; onF: (v: string) => void; area?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Field label={`${label} (ع)`}>{area ? <Textarea value={a ?? ''} onChange={(e) => onA(e.target.value)} rows={3} /> : <Input value={a ?? ''} onChange={(e) => onA(e.target.value)} />}</Field>
      <Field label={`${label} (fr)`}>{area ? <Textarea value={f ?? ''} onChange={(e) => onF(e.target.value)} rows={3} dir="ltr" /> : <Input value={f ?? ''} onChange={(e) => onF(e.target.value)} dir="ltr" />}</Field>
    </div>
  )
}

const LINK_HINT = 'مثال: /shop · /shop?cat=… · /p/<منتج> · /services · /abroad · أو رابط كامل https://…'

function BlockForm({ b, brand, set }: { b: Block; brand: Brand; set: (p: Partial<Block>) => void }) {
  const { sb } = useAuth()
  const { t, pick } = useLang()
  const products = useQuery({ queryKey: ['blk-products'], enabled: b.type === 'products', queryFn: async () => ((await sb.from('products').select('id, name_ar, name_fr').is('deleted_at', null).eq('is_online', true).order('name_ar')).data ?? []) as { id: string; name_ar: string; name_fr: string }[] })
  const cats = useQuery({ queryKey: ['blk-cats'], enabled: b.type === 'products', queryFn: async () => ((await sb.from('categories').select('id, name_ar, name_fr').is('deleted_at', null).order('sort')).data ?? []) as { id: string; name_ar: string; name_fr: string }[] })
  const services = useQuery({ queryKey: ['blk-services'], enabled: b.type === 'services', queryFn: async () => ((await sb.from('services').select('id, name_ar, name_fr').eq('kind', 'admin').is('deleted_at', null).order('sort')).data ?? []) as { id: string; name_ar: string; name_fr: string }[] })
  const scats = useQuery({ queryKey: ['blk-scats'], enabled: b.type === 'services', queryFn: async () => ((await sb.from('service_categories').select('id, name_ar, name_fr').eq('kind', 'admin').is('deleted_at', null).order('sort')).data ?? []) as { id: string; name_ar: string; name_fr: string }[] })
  const pickList = b.type === 'products' ? products.data : services.data
  const titled = !['trust', 'promise', 'school', 'features', 'shortcuts', 'cross', 'custom_request', 'image'].includes(b.type)

  return (
    <div className="space-y-4">
      {titled && <Pair label={t('العنوان', 'Titre')} a={b.title_ar} f={b.title_fr} onA={(title_ar) => set({ title_ar })} onF={(title_fr) => set({ title_fr })} />}
      {['products', 'categories', 'services', 'steps', 'faq'].includes(b.type) && <Pair label={t('سطر صغير فوق العنوان', 'Sur-titre')} a={b.subtitle_ar} f={b.subtitle_fr} onA={(subtitle_ar) => set({ subtitle_ar })} onF={(subtitle_fr) => set({ subtitle_fr })} />}
      {['banner', 'text', 'about', 'whatsapp'].includes(b.type) && <Pair label={t('النص', 'Texte')} a={b.text_ar} f={b.text_fr} onA={(text_ar) => set({ text_ar })} onF={(text_fr) => set({ text_fr })} area />}
      {['banner', 'text'].includes(b.type) && <Pair label={t('نص الزر', 'Bouton')} a={b.button_ar} f={b.button_fr} onA={(button_ar) => set({ button_ar })} onF={(button_fr) => set({ button_fr })} />}
      {['banner', 'text', 'image'].includes(b.type) && (
        <Field label={t('الرابط عند الضغط', 'Lien')} hint={LINK_HINT}>
          <Input value={b.link ?? ''} onChange={(e) => set({ link: e.target.value })} dir="ltr" />
        </Field>
      )}
      {['banner', 'image'].includes(b.type) && (
        <Field label={t('الصورة', 'Image')}>
          <ImageInput sb={sb} value={b.image_url ?? null} folder="website" onChange={(image_url) => set({ image_url })} aspect={b.type === 'image' ? 'aspect-[21/9]' : 'aspect-[4/3]'} className="max-w-md" />
        </Field>
      )}
      {b.type === 'banner' && (
        <Field label={t('اللون', 'Couleur')}>
          <ColorPicker value={b.color ?? (brand === 'store' ? '#FF6B35' : '#2563EB')} onChange={(color) => set({ color })} />
        </Field>
      )}
      {b.type === 'video' && (
        <Field label={t('رابط الفيديو', 'Lien vidéo')} hint="YouTube / Shorts / mp4">
          <Input value={b.video_url ?? ''} onChange={(e) => set({ video_url: e.target.value })} dir="ltr" />
        </Field>
      )}

      {(b.type === 'products' || b.type === 'services') && (
        <>
          <Field label={t('ماذا يُعرض؟', 'Contenu')}>
            <select value={b.source ?? 'featured'} onChange={(e) => set({ source: e.target.value as Block['source'] })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
              {b.type === 'products' ? (
                <>
                  <option value="featured">{t('المنتجات المميزة ⭐', 'En vedette ⭐')}</option>
                  <option value="latest">{t('الأحدث', 'Les plus récents')}</option>
                  <option value="sale">{t('المخفّضة (عليها ثمن قديم)', 'En promotion')}</option>
                  <option value="category">{t('من قسم معيّن', 'Un rayon')}</option>
                  <option value="manual">{t('أختارها بنفسي', 'Choix manuel')}</option>
                </>
              ) : (
                <>
                  <option value="featured">{t('الأولى في الترتيب', 'Les premières')}</option>
                  <option value="category">{t('من مجال معيّن', 'Un domaine')}</option>
                  <option value="manual">{t('أختارها بنفسي', 'Choix manuel')}</option>
                </>
              )}
            </select>
          </Field>
          {b.source === 'category' && (
            <Field label={b.type === 'products' ? t('القسم', 'Rayon') : t('المجال', 'Domaine')}>
              <select value={b.category_id ?? ''} onChange={(e) => set({ category_id: e.target.value || null })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
                <option value="">—</option>
                {(b.type === 'products' ? cats.data : scats.data)?.map((c) => <option key={c.id} value={c.id}>{pick(c, 'name')}</option>)}
              </select>
            </Field>
          )}
          {b.source === 'manual' && (
            <Field label={t('اضغط لاختيار (بالترتيب)', 'Cliquez pour choisir (dans l’ordre)')}>
              <div className="flex max-h-48 flex-wrap gap-1 overflow-y-auto rounded-xl border border-border p-2">
                {pickList?.map((x) => {
                  const ids = b.ids ?? []
                  const n = ids.indexOf(x.id)
                  return (
                    <button key={x.id} type="button" onClick={() => set({ ids: n >= 0 ? ids.filter((i) => i !== x.id) : [...ids, x.id] })} className={cn('rounded-lg border px-2 py-1 text-xs', n >= 0 ? 'border-brand bg-brand-50 text-brand' : 'border-border text-muted')}>
                      {n >= 0 && <b className="num">{n + 1}. </b>}
                      {pick(x, 'name')}
                    </button>
                  )
                })}
              </div>
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('العدد الأقصى', 'Nombre max')}>
              <Input type="number" min={1} max={24} value={b.limit ?? 8} onChange={(e) => set({ limit: Number(e.target.value) })} className="num" />
            </Field>
            {b.type === 'products' && (
              <Field label={t('الشكل', 'Disposition')}>
                <select value={b.layout ?? 'grid'} onChange={(e) => set({ layout: e.target.value as Block['layout'] })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
                  <option value="grid">{t('شبكة', 'Grille')}</option>
                  <option value="carousel">{t('شريط يمرَّر بالإصبع', 'Carrousel')}</option>
                </select>
              </Field>
            )}
          </div>
        </>
      )}

      {b.type === 'steps' && (
        <Field label={t('الخطوات', 'Étapes')}>
          <div className="space-y-2">
            {(b.items ?? []).map((it, i) => {
              const setIt = (p: Partial<BlockItem>) => set({ items: (b.items ?? []).map((x, j) => (j === i ? { ...x, ...p } : x)) })
              return (
                <div key={i} className="space-y-2 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <IconPicker value={it.icon ?? 'sparkles'} onChange={(icon) => setIt({ icon })} />
                    <Button size="icon-sm" variant="ghost" onClick={() => set({ items: (b.items ?? []).filter((_, j) => j !== i) })}><Trash className="text-danger" /></Button>
                  </div>
                  <Pair label={t('الخطوة', 'Étape')} a={it.title_ar} f={it.title_fr} onA={(title_ar) => setIt({ title_ar })} onF={(title_fr) => setIt({ title_fr })} />
                  <Pair label={t('الشرح', 'Détail')} a={it.text_ar} f={it.text_fr} onA={(text_ar) => setIt({ text_ar })} onF={(text_fr) => setIt({ text_fr })} />
                </div>
              )
            })}
            <Button size="sm" variant="outline" onClick={() => set({ items: [...(b.items ?? []), { title_ar: '' }] })}><Plus />{t('خطوة', 'Étape')}</Button>
          </div>
        </Field>
      )}
      {b.type === 'faq' && (
        <Field label={t('عدد الأسئلة المعروضة', 'Nombre de questions')} hint={t('الأسئلة نفسها تُعدَّل في تبويب «الأسئلة الشائعة»', 'Les questions se modifient dans l’onglet FAQ')}>
          <Input type="number" min={1} max={20} value={b.limit ?? 8} onChange={(e) => set({ limit: Number(e.target.value) })} className="num" />
        </Field>
      )}
      {['features', 'trust', 'promise', 'about'].includes(b.type) && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
          {b.type === 'features' && t('المزايا تُعدَّل في «الصفحة الرئيسية» ← المزايا.', 'Modifiez-les dans Accueil → Atouts.')}
          {b.type === 'trust' && t('الضمانات تُعدَّل في تبويب «الضمانات».', 'Modifiez-les dans l’onglet Garanties.')}
          {b.type === 'promise' && t('نص الوعد يُعدَّل في «الصفحة الرئيسية» ← وعد الدفع عند الاستلام.', 'Texte dans Accueil → Promesse.')}
          {b.type === 'about' && t('اتركه فارغاً لاستعمال نص «من نحن» في الصفحة الرئيسية.', 'Vide = texte « À propos ».')}
        </p>
      )}
      {brand === 'store' && b.type === 'school' && <p className="text-xs text-muted">{t('يبرز وحده في غشت وشتنبر.', 'Mis en avant en août-septembre.')}</p>}
    </div>
  )
}

/** Website editor: home page sections (add / edit / reorder / duplicate / hide / delete). */
export function BlocksEditor({ brand, blocks, onChange }: { brand: Brand; blocks: Block[]; onChange: (b: Block[]) => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const move = (i: number, d: -1 | 1) => {
    const x = [...blocks]
    const j = i + d
    if (j < 0 || j >= x.length) return
    ;[x[i], x[j]] = [x[j], x[i]]
    onChange(x)
  }
  const set = (id: string, p: Partial<Block>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const add = (type: BlockType) => {
    const b = newBlock(type)
    onChange([...blocks, b])
    setAdding(false)
    setOpen(b.id)
  }
  const types = (Object.keys(BLOCK_TYPES) as BlockType[]).filter((k) => BLOCK_TYPES[k].sites.includes(brand))

  return (
    <Card>
      <CardHeader
        title={t('أقسام الصفحة الرئيسية', 'Sections de l’accueil')}
        description={t('رتّبها كما تشاء: ↑↓ للترتيب، 👁 للإخفاء، ✏️ للتعديل. الواجهة الرئيسية دائماً في الأعلى.', 'Ordre ↑↓, masquer 👁, modifier ✏️. La bannière reste en haut.')}
        action={<Button size="sm" onClick={() => setAdding(true)}><Plus />{t('إضافة قسم', 'Ajouter')}</Button>}
      />
      <div className="space-y-2 p-5 pt-0">
        <div className="rounded-xl border border-dashed border-border p-3 text-sm text-muted">⬆️ {t('الواجهة الرئيسية (العنوان والبحث)', 'Bannière principale')}</div>
        {blocks.map((b, i) => {
          const meta = BLOCK_TYPES[b.type]
          return (
            <div key={b.id} className={cn('rounded-xl border border-border bg-surface', !b.enabled && 'opacity-50')}>
              <div className="flex items-center gap-2 p-2.5">
                <span className="text-xl">{meta?.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{b.title_ar || t(meta?.ar ?? b.type, meta?.fr ?? b.type)}</div>
                  <div className="text-xs text-muted">{t(meta?.ar ?? '', meta?.fr ?? '')}</div>
                </div>
                <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} title={t('للأعلى', 'Monter')}><ArrowUp /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} title={t('للأسفل', 'Descendre')}><ArrowDown /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => set(b.id, { enabled: !b.enabled })} title={b.enabled ? t('إخفاء', 'Masquer') : t('إظهار', 'Afficher')}>{b.enabled ? <Eye /> : <EyeOff />}</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => setOpen(open === b.id ? null : b.id)} title={t('تعديل', 'Modifier')}>{open === b.id ? <X /> : <Pencil />}</Button>
                <Button size="icon-sm" variant="ghost" onClick={() => onChange([...blocks.slice(0, i + 1), { ...structuredClone(b), id: Math.random().toString(36).slice(2, 10) }, ...blocks.slice(i + 1)])} title={t('نسخ', 'Dupliquer')}><Copy /></Button>
                <Button size="icon-sm" variant="ghost" onClick={() => confirm(t('حذف هذا القسم؟', 'Supprimer cette section ?')) && onChange(blocks.filter((x) => x.id !== b.id))} title={t('حذف', 'Supprimer')}><Trash className="text-danger" /></Button>
              </div>
              {open === b.id && (
                <div className="border-t border-border p-4">
                  <BlockForm b={b} brand={brand} set={(p) => set(b.id, p)} />
                </div>
              )}
            </div>
          )
        })}
        {!blocks.length && <div className="py-6 text-center text-sm text-muted">{t('لا أقسام. أضف قسماً.', 'Aucune section.')}</div>}
      </div>
      <Dialog open={adding} onOpenChange={setAdding} title={t('إضافة قسم', 'Ajouter une section')}>
        <div className="grid max-h-[65vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {types.map((k) => (
            <button key={k} onClick={() => add(k)} className="flex items-start gap-3 rounded-xl border border-border p-3 text-start hover:border-brand hover:bg-brand-50">
              <span className="text-2xl">{BLOCK_TYPES[k].icon}</span>
              <span>
                <span className="block font-semibold">{t(BLOCK_TYPES[k].ar, BLOCK_TYPES[k].fr)}</span>
                <span className="block text-xs text-muted">{BLOCK_TYPES[k].hint_ar}</span>
              </span>
            </button>
          ))}
        </div>
      </Dialog>
    </Card>
  )
}

/** Website editor: the site's top menu. */
export function MenuEditor({ menu, onChange }: { menu: MenuLink[]; onChange: (m: MenuLink[]) => void }) {
  const { t } = useLang()
  const move = (i: number, d: -1 | 1) => {
    const x = [...menu]
    const j = i + d
    if (j < 0 || j >= x.length) return
    ;[x[i], x[j]] = [x[j], x[i]]
    onChange(x)
  }
  return (
    <Card>
      <CardHeader title={t('قائمة الموقع', 'Menu du site')} description={LINK_HINT} action={<Button size="sm" variant="outline" onClick={() => onChange([...menu, { label_ar: '', label_fr: '', to: '/' }])}><Plus />{t('رابط', 'Lien')}</Button>} />
      <div className="space-y-2 p-5 pt-0">
        {menu.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <Input value={m.label_ar} onChange={(e) => onChange(menu.map((x, j) => (j === i ? { ...x, label_ar: e.target.value } : x)))} placeholder={t('الاسم (ع)', 'Libellé (ar)')} />
            <Input value={m.label_fr} onChange={(e) => onChange(menu.map((x, j) => (j === i ? { ...x, label_fr: e.target.value } : x)))} placeholder="Libellé (fr)" dir="ltr" />
            <Input value={m.to} onChange={(e) => onChange(menu.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} placeholder="/shop" dir="ltr" />
            <div className="flex">
              <Button size="icon-sm" variant="ghost" onClick={() => move(i, -1)}><ArrowUp /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => move(i, 1)}><ArrowDown /></Button>
              <Button size="icon-sm" variant="ghost" onClick={() => onChange(menu.filter((_, j) => j !== i))}><Trash className="text-danger" /></Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
