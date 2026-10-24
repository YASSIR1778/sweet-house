import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, ExternalLink, FileText, PlayCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { money } from '@/shared/lib/money'
import type { DocReq, GuideStep, Service, ServiceCategory, ServiceField, ServiceGuide } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Badge, Button } from './primitives'

/** What a guide needs from its service (the public link has no price). */
export type GuideService = Pick<Service, 'id' | 'name_ar' | 'name_fr'> &
  Partial<Pick<Service, 'kind' | 'category_id' | 'description_ar' | 'description_fr' | 'price' | 'pricing_mode' | 'unit_ar' | 'unit_fr' | 'duration_ar' | 'duration_fr' | 'official_url' | 'icon' | 'is_online' | 'is_active' | 'system_key' | 'sort'>> & {
    required_documents?: DocReq[]
    fields?: ServiceField[]
  }
export type GuideContent = Pick<ServiceGuide, 'steps' | 'tips_ar' | 'links' | 'images' | 'video_url'> & Partial<Pick<ServiceGuide, 'templates' | 'require_ref' | 'require_proof'>>
export type GuideRow = ServiceGuide & { service_id: string; updated_at: string; employees: { full_name: string } | null }
export type GuideCategory = Pick<ServiceCategory, 'id' | 'kind' | 'name_ar' | 'name_fr' | 'icon' | 'color' | 'sort'>

export const youtubeId = (u: string) => u.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/)?.[1]
export const hasGuide = (g?: Partial<GuideContent> | null) => !!g && (!!g.steps?.length || !!g.tips_ar || !!g.video_url || !!g.links?.length || !!g.images?.length)

/** Every service with its guide and category: one query shared by the POS and the dashboard. */
export function useServiceGuides(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['service-guides'],
    staleTime: 60_000,
    queryFn: async () => {
      const [s, g, c] = await Promise.all([
        sb
          .from('services')
          .select('id, kind, category_id, name_ar, name_fr, description_ar, description_fr, price, pricing_mode, unit_ar, unit_fr, duration_ar, duration_fr, official_url, required_documents, fields, icon, is_online, is_active, system_key, sort')
          .is('deleted_at', null)
          .order('sort'),
        sb.from('service_guides').select('service_id, tips_ar, links, images, steps, video_url, templates, require_ref, require_proof, updated_at, employees:updated_by(full_name)'),
        sb.from('service_categories').select('id, kind, name_ar, name_fr, icon, color, sort').is('deleted_at', null).order('sort'),
      ])
      if (s.error) throw s.error
      if (g.error) throw g.error
      return {
        services: (s.data ?? []) as GuideService[],
        guides: new Map(((g.data ?? []) as unknown as GuideRow[]).map((x) => [x.service_id, x])),
        categories: (c.data ?? []) as GuideCategory[],
      }
    },
  })
}

export function siteServiceUrl(id: string) {
  return `${location.origin}${import.meta.env.BASE_URL}services/${id}`
}
export function siteGuideUrl(token: string) {
  return `${location.origin}${import.meta.env.BASE_URL}guide/${token}`
}
/** wa.me without a number: WhatsApp asks whom to send it to. */
export const whatsappShareUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

/**
 * Plain text of a guide for WhatsApp or the clipboard.
 * full: the whole guide (employee, partner office) · customer: documents and information to bring.
 */
export function guideText(s: GuideService, g: GuideContent | null | undefined, variant: 'full' | 'customer', link?: string) {
  const out: string[] = [variant === 'full' ? `📘 دليل خدمة: ${s.name_ar}` : `📄 ${s.name_ar}`]
  if (variant === 'customer') {
    if (s.description_ar) out.push(s.description_ar)
    const bits = [s.price ? `💰 ${money(s.price)}${s.unit_ar ? ` / ${s.unit_ar}` : ''}` : '', s.duration_ar ? `⏱️ ${s.duration_ar}` : ''].filter(Boolean)
    if (bits.length) out.push(bits.join(' · '))
  } else {
    if (s.duration_ar) out.push(`⏱️ المدة: ${s.duration_ar}`)
    if (s.official_url) out.push(`🔗 البوابة الرسمية: ${s.official_url}`)
  }
  const docs = s.required_documents ?? []
  if (docs.length) out.push('', '📎 الوثائق المطلوبة:', ...docs.map((d) => `• ${d.name_ar}${d.required ? '' : ' (إن وُجدت)'}`))
  const fields = s.fields ?? []
  if (fields.length) out.push('', variant === 'full' ? '📝 المعلومات التي نطلبها من الزبون:' : '📝 المعلومات المطلوبة منك:', ...fields.map((f) => `• ${f.label_ar}`))
  if (variant === 'full' && g) {
    const steps = g.steps ?? []
    if (steps.length) out.push('', '✅ الخطوات:', ...steps.flatMap((st, i) => [`${i + 1}. ${st.title}${st.required ? '' : ' (اختيارية)'}`, ...(st.url ? [`   ${st.url}`] : [])]))
    if (g.tips_ar) out.push('', `⚠️ انتبه: ${g.tips_ar}`)
    const links = (g.links ?? []).filter((l) => l.url)
    if (links.length) out.push('', '🔗 روابط مفيدة:', ...links.map((l) => `• ${l.label ? `${l.label}: ` : ''}${l.url}`))
    if (g.video_url) out.push('', `🎬 فيديو الشرح: ${g.video_url}`)
  }
  if (link) out.push('', link)
  out.push('', '— مكتبة سويت هاوس')
  return out.join('\n')
}

export function copyText(text: string, lang: 'ar' | 'fr') {
  navigator.clipboard.writeText(text).then(
    () => toast.success(lang === 'ar' ? 'تم النسخ' : 'Copié'),
    () => toast.error(lang === 'ar' ? 'تعذّر النسخ' : 'Copie impossible'),
  )
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** Clean printable page (or «Save as PDF») of one guide, in a new window. */
export function printGuide(s: GuideService, g: GuideContent | null | undefined, opts: { price?: boolean } = {}) {
  const w = window.open('', '_blank', 'width=860,height=1000')
  if (!w) return toast.error('اسمح بالنوافذ المنبثقة للطباعة / Autorisez les pop-ups')
  const li = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join('')}</ul>` : '')
  const steps = (g?.steps ?? [])
    .map((st) => `<li>${esc(st.title)}${st.required ? '' : ' <small>(اختيارية)</small>'}${st.url ? `<br><a href="${esc(st.url)}">${esc(st.url)}</a>` : ''}</li>`)
    .join('')
  const meta = [opts.price && s.price ? `الثمن: ${esc(money(s.price))}${s.unit_ar ? ` / ${esc(s.unit_ar)}` : ''}` : '', s.duration_ar ? `المدة: ${esc(s.duration_ar)}` : ''].filter(Boolean).join(' · ')
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${esc(s.name_ar)}</title><style>
    body{font-family:Tahoma,Arial,sans-serif;max-width:760px;margin:24px auto;padding:0 20px;color:#0f172a;line-height:1.7}
    h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
    .meta{color:#475569;font-size:13px}.tip{background:#fef3c7;border-radius:8px;padding:10px 12px;white-space:pre-line}
    ol li,ul li{margin:4px 0}a{color:#1d4ed8;word-break:break-all;font-size:12px}small{color:#64748b}
    footer{margin-top:28px;color:#94a3b8;font-size:12px;border-top:1px solid #e2e8f0;padding-top:8px}
    </style></head><body>
    <h1>${esc(s.name_ar)}</h1>${s.name_fr ? `<div class="meta" dir="ltr">${esc(s.name_fr)}</div>` : ''}
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    ${s.official_url ? `<div class="meta">البوابة الرسمية: <a href="${esc(s.official_url)}">${esc(s.official_url)}</a></div>` : ''}
    ${(s.required_documents ?? []).length ? `<h2>الوثائق المطلوبة</h2>${li((s.required_documents ?? []).map((d) => esc(d.name_ar) + (d.required ? '' : ' <small>(إن وُجدت)</small>')))}` : ''}
    ${(s.fields ?? []).length ? `<h2>المعلومات التي نطلبها من الزبون</h2>${li((s.fields ?? []).map((f) => esc(f.label_ar)))}` : ''}
    ${steps ? `<h2>الخطوات</h2><ol>${steps}</ol>` : ''}
    ${g?.tips_ar ? `<h2>انتبه</h2><div class="tip">${esc(g.tips_ar)}</div>` : ''}
    ${(g?.links ?? []).filter((l) => l.url).length ? `<h2>روابط مفيدة</h2>${li((g?.links ?? []).filter((l) => l.url).map((l) => `${esc(l.label || '')} <a href="${esc(l.url)}">${esc(l.url)}</a>`))}` : ''}
    ${g?.video_url ? `<h2>فيديو الشرح</h2><a href="${esc(g.video_url)}">${esc(g.video_url)}</a>` : ''}
    <footer>مكتبة سويت هاوس · ${new Date().toLocaleDateString('fr-MA')}</footer>
    </body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 350)
}

/** Read-only guide: documents, information to ask, steps with their links, tips, video, pictures. */
export function GuideView({ service: s, guide: g, price = true }: { service: GuideService; guide: GuideContent | null | undefined; price?: boolean }) {
  const { t, pick } = useLang()
  const [video, setVideo] = useState(false)
  const yt = g?.video_url ? youtubeId(g.video_url) : undefined
  const docs = s.required_documents ?? []
  const fields = s.fields ?? []
  const steps: GuideStep[] = g?.steps ?? []
  const links = (g?.links ?? []).filter((l) => l.url)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {price && s.price !== undefined && (
          <Badge tone="brand" className="num text-sm">
            {s.pricing_mode === 'open' ? t('مبلغ حر', 'Montant libre') : s.price ? money(s.price) + (s.unit_ar ? ` / ${pick(s, 'unit')}` : '') : t('حسب الطلب', 'Sur devis')}
          </Badge>
        )}
        {s.duration_ar && (
          <Badge>
            <Clock />
            {pick(s, 'duration')}
          </Badge>
        )}
        {s.official_url && (
          <Button size="sm" variant="outline" asChild>
            <a href={s.official_url} target="_blank" rel="noreferrer">
              <ExternalLink />
              {t('البوابة الرسمية', 'Portail officiel')}
            </a>
          </Button>
        )}
      </div>
      {pick(s, 'description') && <p className="text-sm text-muted">{pick(s, 'description')}</p>}

      {docs.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-brand" />
            {t('الوثائق المطلوبة', 'Pièces à fournir')}
          </h4>
          <ul className="space-y-1.5">
            {docs.map((d, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className={cn('mt-0.5 size-4 shrink-0', d.required ? 'text-success' : 'text-subtle')} />
                <span>
                  {pick(d, 'name')}
                  {!d.required && <span className="ms-1 text-xs text-subtle">({t('إن وُجدت', 'si disponible')})</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {fields.length > 0 && (
        <section>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <ClipboardList className="size-4 text-brand" />
            {t('المعلومات التي تطلبها من الزبون', 'Informations à demander')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {fields.map((f) => (
              <Badge key={f.key} tone={f.required ? 'navy' : 'neutral'}>
                {pick(f, 'label')}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {steps.length > 0 ? (
        <section>
          <h4 className="mb-2 text-sm font-semibold">{t('خطوات الإنجاز', 'Étapes')}</h4>
          <ol className="space-y-2">
            {steps.map((st, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-3">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1 text-sm">
                  {st.title}
                  {!st.required && <span className="ms-1 text-xs text-subtle">({t('اختيارية', 'optionnelle')})</span>}
                </div>
                {st.url && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={st.url} target="_blank" rel="noreferrer">
                      <ExternalLink />
                      {st.url_label || t('فتح', 'Ouvrir')}
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">{t('لا توجد خطوات مكتوبة لهذه الخدمة بعد', 'Aucune étape rédigée pour ce service')}</p>
      )}

      {g?.tips_ar && (
        <div className="rounded-xl bg-warning/10 p-3 text-sm whitespace-pre-line">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-warning">
            <AlertTriangle className="size-3.5" />
            {t('انتبه', 'Attention')}
          </div>
          {g.tips_ar}
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-brand hover:bg-surface-2">
              <ExternalLink className="size-3.5" />
              {l.label || l.url}
            </a>
          ))}
        </div>
      )}

      {g?.video_url && (
        <div>
          <Button size="sm" variant="outline" onClick={() => (yt ? setVideo((v) => !v) : window.open(g.video_url!, '_blank'))}>
            <PlayCircle />
            {t('فيديو الشرح', 'Vidéo explicative')}
          </Button>
          {video && yt && <iframe className="mt-2 aspect-video w-full rounded-xl" src={`https://www.youtube-nocookie.com/embed/${yt}`} allow="encrypted-media; picture-in-picture" allowFullScreen title="guide" />}
        </div>
      )}

      {(g?.images ?? []).length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {g!.images.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-border">
              <img src={u} alt="" className="aspect-video w-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
