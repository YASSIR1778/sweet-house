import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Copy, ExternalLink, Megaphone, Plus, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card, CardHeader, Input, Skeleton, Switch } from '@/shared/ui/primitives'
import { Tabs } from '@/shared/ui/data'

export const CHANNELS: Record<string, { ar: string; icon: string; color: string; open?: string }> = {
  facebook: { ar: 'فيسبوك', icon: '📘', color: '#1877F2', open: 'https://www.facebook.com/' },
  instagram: { ar: 'إنستغرام', icon: '📸', color: '#E1306C', open: 'https://www.instagram.com/' },
  tiktok: { ar: 'تيك توك', icon: '🎬', color: '#111827', open: 'https://www.tiktok.com/upload' },
  whatsapp: { ar: 'واتساب', icon: '💬', color: '#25D366' },
  google: { ar: 'غوغل', icon: '📍', color: '#EA4335' },
  other: { ar: 'أخرى', icon: '🔗', color: '#64748B' },
}

type Post = { channel: string; text: string; image_idea: string; link_path: string; link?: string; code?: string }
type Offer = { title: string; description: string; code: string; channel: string; discount_pct: number; ends_on: string; why: string }
type Week = { week_start: string; theme: string; why: string; services: string[]; channels: string[]; offer: string }

/** A ready post: copy text + tracking link, open the platform. */
export function PostCard({ post }: { post: Post }) {
  const { t } = useLang()
  const ch = CHANNELS[post.channel] ?? CHANNELS.other
  const full = post.link ? `${post.text}\n\n👉 ${post.link}` : post.text
  const copy = () => (navigator.clipboard.writeText(full), toast.success(t('نُسخ النص مع الرابط ✅ الصقه في المنشور', 'Texte + lien copiés ✅')))
  return (
    <div className="rounded-xl border border-border p-3 text-sm" style={{ borderInlineStartWidth: 3, borderInlineStartColor: ch.color }}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted">
        <span className="text-base">{ch.icon}</span>
        <b className="text-text">{ch.ar}</b>
        {post.code && <Badge tone="neutral">{post.code}</Badge>}
      </div>
      <p className="whitespace-pre-wrap">{post.text}</p>
      {post.image_idea && <p className="mt-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">🖼️ {post.image_idea}</p>}
      {post.link && (
        <p className="mt-2 truncate text-xs text-brand" dir="ltr">
          {post.link}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={copy}>
          <Copy />
          {t('نسخ', 'Copier')}
        </Button>
        {ch.open && (
          <Button size="sm" variant="outline" asChild>
            <a href={ch.open} target="_blank" rel="noreferrer" onClick={copy}>
              <ExternalLink />
              {t(`نسخ وفتح ${ch.ar}`, `Copier et ouvrir`)}
            </a>
          </Button>
        )}
        {post.channel === 'whatsapp' && (
          <Button size="sm" variant="outline" asChild>
            <a href="#/broadcasts" onClick={copy}>
              <Megaphone />
              {t('نسخ وفتح قائمة البث', 'Vers la diffusion')}
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}

/** An offer from the offers agent: activate its promo code in one click. */
export function OfferCard({ offer, suggestionId }: { offer: Offer; suggestionId?: string }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [done, setDone] = useState(false)
  const activate = async () => {
    const code = offer.code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
    const { error } = await sb.from('promo_codes').upsert({
      code, channel: CHANNELS[offer.channel] ? offer.channel : 'other', label: offer.title, discount_pct: Math.min(50, Math.max(0, offer.discount_pct || 0)),
      ends_on: /^\d{4}-\d{2}-\d{2}$/.test(offer.ends_on) ? offer.ends_on : null, active: true, suggestion_id: suggestionId?.startsWith('test') ? null : suggestionId,
    })
    if (error) return toast.error(errorMessage(error, lang))
    setDone(true)
    toast.success(t(`🎟️ الكود ${code} مفعّل: الموظفة تكتبه في نقطة البيع`, `Code ${code} activé`))
    qc.invalidateQueries({ queryKey: ['promo-codes'] })
  }
  return (
    <div className="rounded-xl border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <b>{offer.title}</b>
        <Badge tone="brand">{offer.code}</Badge>
        {offer.discount_pct > 0 && <Badge tone="warning">−{offer.discount_pct}%</Badge>}
        {offer.ends_on && <span className="num text-xs text-muted">{t('حتى', 'jusqu’au')} {offer.ends_on}</span>}
      </div>
      <p className="mt-1">{offer.description}</p>
      <p className="mt-1 text-xs text-muted">💡 {offer.why}</p>
      <Button size="sm" className="mt-2" onClick={activate} disabled={done}>
        <Ticket />
        {done ? t('مفعّل', 'Activé') : t('فعّل الكود', 'Activer le code')}
      </Button>
    </div>
  )
}

export function PlanView({ plan }: { plan: Week[] }) {
  const { t } = useLang()
  return (
    <div className="space-y-2">
      {plan.map((w, i) => (
        <div key={i} className="rounded-xl border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-xs text-muted">{t('أسبوع', 'Semaine du')} {w.week_start}</span>
            <b>{w.theme}</b>
            <span>{w.channels.map((c) => CHANNELS[c]?.icon ?? '').join(' ')}</span>
          </div>
          <p className="mt-1 text-muted">{w.why}</p>
          {!!w.services.length && <p className="mt-1 text-xs">🧾 {w.services.join('، ')}</p>}
          {w.offer && <p className="mt-1 text-xs">🎯 {w.offer}</p>}
        </div>
      ))}
    </div>
  )
}

type Stats = {
  channels: { channel: string; clicks: number; requests: number; orders: number; shop_sales: number; revenue: number }[]
  top_links: { code: string; channel: string; label: string; clicks: number; requests: number; orders: number }[]
  total_revenue_period: number
}
type Promo = { code: string; channel: string; label: string | null; discount_pct: number; active: boolean; uses: number; ends_on: string | null }

/** «التسويق» tab: what each channel brought, promo codes, the plan. */
export function MarketingTab() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [days, setDays] = useState('30')
  const stats = useQuery({ queryKey: ['mk-stats', days], queryFn: async () => (await sb.rpc('marketing_stats', { p_days: Number(days) })).data as Stats })
  const promos = useQuery({ queryKey: ['promo-codes'], queryFn: async () => ((await sb.from('promo_codes').select('*').order('created_at', { ascending: false })).data ?? []) as Promo[] })
  const asks = useQuery({ queryKey: ['review-asks'], queryFn: async () => (await sb.from('review_asks').select('phone', { count: 'exact', head: true }).gte('asked_at', new Date(Date.now() - 30 * 86400_000).toISOString())).count ?? 0 })
  const plan = useQuery({ queryKey: ['mk-plan'], queryFn: async () => ((await sb.from('marketing_plan').select('*').order('month', { ascending: false }).limit(2)).data ?? []) as { month: string; plan: Week[] }[] })
  const [nc, setNc] = useState({ code: '', channel: 'facebook', discount_pct: 0 })
  const addPromo = async () => {
    const code = nc.code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const { error } = await sb.from('promo_codes').insert({ code, channel: nc.channel, discount_pct: nc.discount_pct, label: `${CHANNELS[nc.channel].ar}` })
    if (error) return toast.error(errorMessage(error, lang))
    setNc({ ...nc, code: '' })
    qc.invalidateQueries({ queryKey: ['promo-codes'] })
  }
  const setPromo = async (code: string, patch: Partial<Promo>) => {
    const { error } = await sb.from('promo_codes').update(patch).eq('code', code)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['promo-codes'] })
  }
  const s = stats.data
  const marketingRevenue = (s?.channels ?? []).reduce((a, c) => a + c.revenue, 0)
  const weeks = (plan.data ?? []).flatMap((m) => m.plan ?? []).sort((a, b) => (a.week_start < b.week_start ? -1 : 1))

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`📊 ${t('ماذا جلبت كل قناة؟', 'Ce que chaque canal rapporte')}`} description={t('من الروابط الخاصة بكل منشور، وأكواد العروض في المحل', 'Liens de chaque post + codes promo en boutique')} />
        <div className="space-y-3 p-5 pt-0">
          <Tabs value={days} onChange={setDays} items={[{ value: '7', label: t('7 أيام', '7 j') }, { value: '30', label: t('30 يوماً', '30 j') }, { value: '90', label: t('90 يوماً', '90 j') }]} />
          {!s ? (
            <Skeleton className="h-32" />
          ) : (
            <>
              <div className="rounded-xl bg-success/10 p-3 text-sm">
                {t('المداخيل التي جاءت من التسويق:', 'Revenus issus du marketing :')} <b className="num text-lg">{money(marketingRevenue)}</b>
                {s.total_revenue_period > 0 && <span className="text-muted"> ({Math.round((marketingRevenue / s.total_revenue_period) * 100)}% {t('من مبيعات المحل', 'des ventes')})</span>}
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface-2 text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2 text-start">{t('القناة', 'Canal')}</th>
                      <th className="px-2 py-2">{t('نقرات', 'Clics')}</th>
                      <th className="px-2 py-2">{t('طلبات خدمات', 'Demandes')}</th>
                      <th className="px-2 py-2">{t('طلبيات', 'Commandes')}</th>
                      <th className="px-2 py-2">{t('مبيعات بالكود', 'Ventes code')}</th>
                      <th className="px-2 py-2">{t('المال', 'Revenu')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {s.channels.map((c) => (
                      <tr key={c.channel} className={cn(!c.clicks && !c.revenue && 'text-muted')}>
                        <td className="px-3 py-2">
                          {CHANNELS[c.channel]?.icon} {CHANNELS[c.channel]?.ar ?? c.channel}
                        </td>
                        <td className="num px-2 py-2 text-center">{c.clicks}</td>
                        <td className="num px-2 py-2 text-center">{c.requests}</td>
                        <td className="num px-2 py-2 text-center">{c.orders}</td>
                        <td className="num px-2 py-2 text-center">{c.shop_sales}</td>
                        <td className="num px-2 py-2 text-center font-semibold">{money(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl bg-warning/10 p-3 text-sm">
                ⭐ {t('دعوات التقييم على Google المرسلة خلال 30 يوماً:', 'Invitations à laisser un avis (30 j) :')} <b className="num">{asks.data ?? 0}</b>
                <span className="text-muted"> — {t('راجع عدد التقييمات في صفحتك على Google', 'vérifiez le nombre d’avis sur Google')}</span>
              </div>
              {!!s.top_links.length && (
                <div className="space-y-1 text-sm">
                  <div className="font-medium">🏆 {t('أنجح المنشورات', 'Meilleurs posts')}</div>
                  {s.top_links.slice(0, 5).map((l) => (
                    <div key={l.code} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                      <span>{CHANNELS[l.channel]?.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{l.label}</span>
                      <span className="num text-xs text-muted">
                        {l.clicks} {t('نقرة', 'clics')} · {l.requests + l.orders} {t('طلب', 'demandes')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title={`🎟️ ${t('أكواد العروض', 'Codes promo')}`} description={t('الزبون يقول الكود، والموظفة تكتبه في نافذة الأداء بنقطة البيع، فيُحسب البيع لتلك القناة', 'Le client donne le code, la caissière le saisit au paiement')} icon={<Ticket />} />
        <div className="space-y-3 p-5 pt-0">
          <div className="flex flex-wrap items-end gap-2">
            <Input value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value.toUpperCase() })} placeholder="FB10" className="w-28" dir="ltr" />
            <select value={nc.channel} onChange={(e) => setNc({ ...nc, channel: e.target.value })} className="h-10 rounded-[10px] border border-border bg-surface px-3 text-sm">
              {Object.entries(CHANNELS).map(([k, c]) => (
                <option key={k} value={k}>
                  {c.icon} {c.ar}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-sm">
              <Input type="number" min={0} max={50} value={nc.discount_pct} onChange={(e) => setNc({ ...nc, discount_pct: Number(e.target.value) })} className="num w-20" />%
            </label>
            <Button onClick={addPromo} disabled={nc.code.replace(/[^A-Z0-9]/gi, '').length < 3}>
              <Plus />
              {t('أضف', 'Ajouter')}
            </Button>
          </div>
          <div className="divide-y divide-border rounded-xl border border-border text-sm">
            {(promos.data ?? []).map((p) => (
              <div key={p.code} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <Badge tone="brand">{p.code}</Badge>
                <span>{CHANNELS[p.channel]?.icon}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{p.label}</span>
                <span className="num text-xs">{p.discount_pct > 0 ? `−${p.discount_pct}%` : t('بدون تخفيض', 'sans remise')}</span>
                <span className="num text-xs text-muted">
                  {p.uses} {t('استعمال', 'util.')}
                </span>
                {p.ends_on && <span className="num text-xs text-muted">{format(new Date(p.ends_on), 'dd/MM')}</span>}
                <Switch checked={p.active} onCheckedChange={(active) => setPromo(p.code, { active })} />
              </div>
            ))}
            {!promos.data?.length && <div className="px-3 py-2 text-muted">{t('لا أكواد بعد. وكيل العروض 🎯 سيقترح أكواداً.', 'Aucun code.')}</div>}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title={`📅 ${t('خطة الأسابيع القادمة', 'Plan des prochaines semaines')}`} description={t('يضعها سي المخطِّط كل أحد، ويتبعها وكلاء القنوات. عدّلها بالرد على اقتراحه.', 'Établi chaque dimanche par le planificateur.')} />
        <div className="p-5 pt-0">{weeks.length ? <PlanView plan={weeks} /> : <div className="text-sm text-muted">{t('لا خطة بعد. شغّل سي المخطِّط من تبويب الوكلاء.', 'Pas encore de plan.')}</div>}</div>
      </Card>
    </div>
  )
}
