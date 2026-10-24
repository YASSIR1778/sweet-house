import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Copy, ExternalLink, Link2, MessageCircle, Printer, Send, Share2, Trash, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Checkbox, Field, Input, Textarea } from './primitives'
import { Dialog, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger, useConfirm } from './overlay'
import { copyText, guideText, printGuide, siteGuideUrl, siteServiceUrl, whatsappShareUrl, type GuideContent, type GuideService } from './guide'

/**
 * «مشاركة» menu of a guide: the whole guide or the customer's list of documents,
 * copied, sent on WhatsApp (any contact) or printed; plus the owner's own actions.
 */
export function GuideShareMenu({
  service: s,
  guide: g,
  onSendToEmployee,
  onLinks,
  size = 'sm',
}: {
  service: GuideService
  guide: GuideContent | null | undefined
  onSendToEmployee?: () => void
  onLinks?: () => void
  size?: 'sm' | 'md'
}) {
  const { t, lang } = useLang()
  const full = () => guideText(s, g, 'full')
  const customer = () => guideText(s, g, 'customer', s.kind === 'admin' && s.is_online ? `🌐 اطلب الخدمة أونلاين: ${siteServiceUrl(s.id)}` : undefined)
  const share = (text: string) => (navigator.share ? navigator.share({ title: s.name_ar, text }).catch(() => undefined) : window.open(whatsappShareUrl(text), '_blank'))
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <Button size={size} variant="outline">
          <Share2 />
          {t('مشاركة', 'Partager')}
        </Button>
      </DropdownTrigger>
      <DropdownContent>
        <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-subtle">{t('الدليل كاملاً (لموظف أو مكتب شريك)', 'Guide complet')}</div>
        <DropdownItem icon={<MessageCircle />} onSelect={() => window.open(whatsappShareUrl(full()), '_blank')}>
          {t('إرسال على واتساب', 'Envoyer sur WhatsApp')}
        </DropdownItem>
        <DropdownItem icon={<Copy />} onSelect={() => copyText(full(), lang)}>
          {t('نسخ النص', 'Copier le texte')}
        </DropdownItem>
        {typeof navigator.share === 'function' && (
          <DropdownItem icon={<Share2 />} onSelect={() => share(full())}>
            {t('مشاركة عبر تطبيق آخر', 'Autre application')}
          </DropdownItem>
        )}
        <DropdownItem icon={<Printer />} onSelect={() => printGuide(s, g)}>
          {t('طباعة / PDF', 'Imprimer / PDF')}
        </DropdownItem>
        <DropdownSeparator />
        <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold text-subtle">{t('للزبون: الوثائق والمعلومات المطلوبة', 'Pour le client : pièces à fournir')}</div>
        <DropdownItem icon={<MessageCircle />} onSelect={() => window.open(whatsappShareUrl(customer()), '_blank')}>
          {t('إرسال للزبون على واتساب', 'Envoyer au client')}
        </DropdownItem>
        <DropdownItem icon={<Copy />} onSelect={() => copyText(customer(), lang)}>
          {t('نسخ لائحة الوثائق', 'Copier la liste')}
        </DropdownItem>
        {(onSendToEmployee || onLinks) && <DropdownSeparator />}
        {onSendToEmployee && (
          <DropdownItem icon={<Users />} onSelect={onSendToEmployee}>
            {t('إرسال لموظف(ة) داخل النظام', 'Envoyer à un employé')}
          </DropdownItem>
        )}
        {onLinks && (
          <DropdownItem icon={<Link2 />} onSelect={onLinks}>
            {t('رابط لشخص خارج المحل', 'Lien pour une personne externe')}
          </DropdownItem>
        )}
      </DropdownContent>
    </Dropdown>
  )
}

type Emp = { id: string; full_name: string; phone: string | null; color: string; avatar_url: string | null }

/** Send a guide to employees: a notification in their dashboard / POS (and a push), or WhatsApp. */
export function SendGuideDialog({ service: s, guide: g, onClose }: { service: GuideService | null; guide: GuideContent | null | undefined; onClose: () => void }) {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const [picked, setPicked] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const team = useQuery({
    queryKey: ['guide-team'],
    enabled: !!s,
    queryFn: async () => {
      const { data, error } = await sb.rpc('guide_team')
      if (error) throw error
      return data as Emp[]
    },
  })
  const others = (team.data ?? []).filter((e) => e.id !== me?.id)
  const close = () => (setPicked([]), setNote(''), onClose())
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const send = async () => {
    if (!s) return
    setBusy(true)
    const { data, error } = await sb.rpc('guide_send', { p_service: s.id, p_employees: picked, p_note: note })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`أُرسل الدليل (${data}) ✅ يظهر لهم في نقطة البيع ولوحة التحكم`, `Guide envoyé (${data}) ✅`))
    close()
  }
  const whatsapp = (e: Emp) => s && window.open(whatsappLink(e.phone!, `${note.trim() ? `${note.trim()}\n\n` : ''}${guideText(s, g, 'full')}`), '_blank')

  return (
    <Dialog
      open={!!s}
      onOpenChange={(o) => !o && close()}
      title={t('إرسال الدليل لموظف(ة)', 'Envoyer le guide à un employé')}
      description={s?.name_ar}
      footer={
        <Button onClick={send} loading={busy} disabled={!picked.length}>
          <Send />
          {t('إرسال داخل النظام', 'Envoyer dans l’application')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          {others.map((e) => (
            <div key={e.id} className={cn('flex items-center gap-3 rounded-xl border p-2.5', picked.includes(e.id) ? 'border-brand bg-brand-50/50' : 'border-border')}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <Checkbox checked={picked.includes(e.id)} onCheckedChange={() => toggle(e.id)} />
                <Avatar name={e.full_name} color={e.color} src={e.avatar_url} size={32} />
                <span className="truncate text-sm font-medium">{e.full_name}</span>
              </label>
              {e.phone && (
                <Button size="sm" variant="ghost" onClick={() => whatsapp(e)}>
                  <MessageCircle />
                  {t('واتساب', 'WhatsApp')}
                </Button>
              )}
            </div>
          ))}
          {team.isSuccess && !others.length && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <UserRound className="size-4" />
              {t('لا يوجد موظفون آخرون', 'Aucun autre employé')}
            </p>
          )}
        </div>
        <Field label={t('ملاحظة (اختيارية)', 'Note (optionnelle)')}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('مثلاً: اقرئيه قبل طلب الغد', 'ex. à lire avant demain')} />
        </Field>
        <p className="text-xs text-muted">{t('يصلهم إشعار، ويجدونه في «دليل الخدمات» بنقطة البيع تحت «أُرسل إليك».', 'Ils reçoivent une notification et le retrouvent dans les guides du POS.')}</p>
      </div>
    </Dialog>
  )
}

type Share = { id: string; token: string; note: string | null; expires_at: string | null; revoked_at: string | null; views: number; last_view_at: string | null; created_at: string }

/** Read-only links for someone outside the shop: they expire and can be revoked. */
export function GuideLinksDialog({ service: s, onClose }: { service: GuideService | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const { confirm, confirmNode } = useConfirm()
  const [days, setDays] = useState(30)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const links = useQuery({
    queryKey: ['guide-links', s?.id],
    enabled: !!s,
    queryFn: async () => (await sb.from('guide_shares').select('id, token, note, expires_at, revoked_at, views, last_view_at, created_at').eq('service_id', s!.id).order('created_at', { ascending: false })).data as Share[],
  })
  const message = (token: string) => `📘 دليل خدمة «${s?.name_ar}» من مكتبة سويت هاوس:\n${siteGuideUrl(token)}`
  const create = async () => {
    if (!s) return
    setBusy(true)
    const { data, error } = await sb.rpc('guide_share_create', { p_service: s.id, p_days: days, p_note: note })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    copyText(siteGuideUrl((data as { token: string }).token), lang)
    setNote('')
    links.refetch()
  }
  const revoke = async (x: Share) => {
    if (!(await confirm({ title: t('إلغاء هذا الرابط؟', 'Révoquer ce lien ?'), description: t('من عنده الرابط لن يستطيع فتح الدليل بعد الآن', 'Le lien ne fonctionnera plus'), danger: true }))) return
    const { error } = await sb.rpc('guide_share_revoke', { p_id: x.id })
    if (error) return toast.error(errorMessage(error, lang))
    links.refetch()
  }
  const status = (x: Share) =>
    x.revoked_at ? (['danger', t('ملغى', 'Révoqué')] as const) : x.expires_at && new Date(x.expires_at) < new Date() ? (['neutral', t('منتهي', 'Expiré')] as const) : (['success', t('يعمل', 'Actif')] as const)

  return (
    <Dialog open={!!s} onOpenChange={(o) => !o && onClose()} size="lg" title={t('رابط الدليل لشخص خارج المحل', 'Lien du guide pour une personne externe')} description={s?.name_ar}>
      <div className="space-y-5">
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm text-muted">{t('يفتح الدليل للقراءة فقط (الخطوات، الوثائق، الروابط، الفيديو) بدون الثمن وبدون رسائل واتساب الداخلية.', 'Lecture seule : étapes, pièces, liens, vidéo. Sans prix ni messages internes.')}</p>
          <div className="flex flex-wrap gap-2">
            {[7, 30, 90, 0].map((d) => (
              <button key={d} onClick={() => setDays(d)} className={cn('num rounded-lg border px-3 py-1.5 text-sm', days === d ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                {d ? t(d <= 10 ? `${d} أيام` : `${d} يوماً`, `${d} jours`) : t('بدون انتهاء', 'Sans expiration')}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('لمن؟ (مثلاً: مكتب الخدمات بمرتيل)', 'Pour qui ? (ex. bureau partenaire)')} className="min-w-48 flex-1" />
            <Button onClick={create} loading={busy}>
              <Link2 />
              {t('إنشاء الرابط ونسخه', 'Créer et copier')}
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          {(links.data ?? []).map((x) => {
            const [tone, label] = status(x)
            const live = tone === 'success'
            return (
              <div key={x.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Badge tone={tone}>{label}</Badge>
                    <span className="truncate">{x.note || t('بدون اسم', 'Sans nom')}</span>
                  </div>
                  <div className="num mt-0.5 text-xs text-muted">
                    {format(new Date(x.created_at), 'dd/MM/yyyy')}
                    {x.expires_at && ` → ${format(new Date(x.expires_at), 'dd/MM/yyyy')}`} · {t(`${x.views} مشاهدة`, `${x.views} vues`)}
                  </div>
                </div>
                {live && (
                  <>
                    <Button size="icon-sm" variant="ghost" onClick={() => copyText(siteGuideUrl(x.token), lang)}>
                      <Copy />
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => window.open(whatsappShareUrl(message(x.token)), '_blank')}>
                      <MessageCircle />
                    </Button>
                    <Button size="icon-sm" variant="ghost" asChild>
                      <a href={siteGuideUrl(x.token)} target="_blank" rel="noreferrer">
                        <ExternalLink />
                      </a>
                    </Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => revoke(x)}>
                      <Trash className="text-danger" />
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
      {confirmNode}
    </Dialog>
  )
}

/** «الدليل غير دقيق؟» — any employee tells the owner what changed on the portal. */
export function SuggestGuideDialog({ serviceId, onClose }: { serviceId: string | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [text, setText] = useState('')
  const send = async () => {
    if (!serviceId) return
    const { error } = await sb.rpc('suggest_guide_edit', { p_service: serviceId, p_text: text })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('شكراً! وصل اقتراحك للمالك 🙏', 'Merci ! Suggestion envoyée 🙏'))
    setText('')
    onClose()
  }
  return (
    <Dialog open={!!serviceId} onOpenChange={(o) => !o && onClose()} size="sm" title={t('اقتراح تعديل على الدليل', 'Suggérer une correction')}>
      <div className="space-y-3">
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('مثلاً: زر «طلب جديد» أصبح في أعلى الصفحة، أو الرابط تغيّر إلى…', 'ex. le bouton a changé de place…')} autoFocus />
        <Button className="w-full" onClick={send} disabled={text.trim().length < 5}>
          <Send />
          {t('إرسال للمالك', 'Envoyer')}
        </Button>
      </div>
    </Dialog>
  )
}
