import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { CheckCircle2, Megaphone, MessageCircle, Plus, Search, Send, SkipForward, Trash, UserMinus, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, Checkbox, Field, Input, Textarea } from '@/shared/ui/primitives'
import { Dialog, Sheet, useConfirm } from '@/shared/ui/overlay'
import { DataTable, EmptyState, PageHeader, Tabs, type Column } from '@/shared/ui/data'
import { ColorPicker, IconPicker } from '@/shared/ui/pickers'
import { DynamicIcon } from '@/shared/ui/icon'

type Topic = { id: string; name_ar: string; name_fr: string; icon: string | null; color: string; is_active: boolean; sort: number }
type Sub = { id: string; name: string | null; phone: string; topics: string[]; source: string; consent_at: string; unsubscribed_at: string | null; created_at: string }
type Bc = { id: string; title: string; message: string; topics: string[]; created_at: string; total: number; sent: number; author: string | null }
type Rcp = { subscriber_id: string; phone: string; name: string | null; unsub_code: string; status: 'pending' | 'sent' | 'skipped' | 'failed'; sent_at: string | null }

const unsubUrl = (code: string) => `${location.origin}${import.meta.env.BASE_URL}unsubscribe?c=${code}`
const personalize = (msg: string, r: Rcp) => `${msg.replace(/\{name\}/g, r.name ?? '').trim()}\n\n— مكتبة سويت هاوس\nلإيقاف هذه الرسائل: ${unsubUrl(r.unsub_code)}`

/** 8 · WhatsApp broadcast list: only people who said yes, with one-click unsubscribe. */
export function BroadcastsPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [tab, setTab] = useState('messages')
  const [compose, setCompose] = useState<{ title: string; message: string; topics: string[] } | null>(null)
  const [openBc, setOpenBc] = useState<Bc | null>(null)
  const [addSub, setAddSub] = useState<{ name: string; phone: string; topics: string[]; consent: boolean } | null>(null)
  const [editTopic, setEditTopic] = useState<Partial<Topic> | null>(null)
  const [q, setQ] = useState('')

  const topics = useQuery({ queryKey: ['bc-topics'], queryFn: async () => (await sb.from('broadcast_topics').select('*').order('sort')).data as Topic[] })
  const subs = useQuery({ queryKey: ['bc-subs'], queryFn: async () => (await sb.from('broadcast_subscribers').select('*').order('created_at', { ascending: false })).data as Sub[] })
  const list = useQuery({ queryKey: ['bc-list'], queryFn: async () => (await sb.rpc('broadcasts_list')).data as Bc[] })
  const active = (subs.data ?? []).filter((s) => !s.unsubscribed_at)
  const topicName = (id: string) => {
    const x = topics.data?.find((tp) => tp.id === id)
    return x ? pick(x, 'name') : '—'
  }
  const countFor = (ids: string[]) => active.filter((s) => !ids.length || s.topics.some((x) => ids.includes(x))).length

  const create = async () => {
    if (!compose) return
    const { data, error } = await sb.rpc('broadcast_create', { p_title: compose.title, p_message: compose.message, p_topics: compose.topics })
    if (error) return toast.error(errorMessage(error, lang))
    setCompose(null)
    await qc.invalidateQueries({ queryKey: ['bc-list'] })
    const fresh = ((await sb.rpc('broadcasts_list')).data as Bc[]).find((b) => b.id === data)
    if (fresh) setOpenBc(fresh)
  }

  const saveSub = async () => {
    if (!addSub) return
    if (!addSub.consent) return toast.error(t('يجب أن يوافق الزبون صراحةً على استقبال الرسائل', 'Le consentement du client est obligatoire'))
    if (!addSub.topics.length) return toast.error(t('اختر موضوعاً واحداً على الأقل', 'Choisissez au moins un sujet'))
    const digits = addSub.phone.replace(/\D/g, '')
    if (digits.length < 9) return toast.error(t('رقم الهاتف غير صحيح', 'Numéro invalide'))
    const phone = addSub.phone.trim().startsWith('+') || digits.startsWith('00') ? digits.replace(/^00/, '') : `212${digits.slice(-9)}`
    const { error } = await sb.from('broadcast_subscribers').upsert({ name: addSub.name || null, phone, topics: addSub.topics, source: 'admin', consent_at: new Date().toISOString(), unsubscribed_at: null }, { onConflict: 'phone' })
    if (error) return toast.error(errorMessage(error, lang))
    setAddSub(null)
    qc.invalidateQueries({ queryKey: ['bc-subs'] })
  }
  const unsubscribe = async (s: Sub) => {
    if (!(await confirm({ title: t('إيقاف الرسائل لهذا الرقم؟', 'Désinscrire ce numéro ?'), description: `+${s.phone}` }))) return
    await sb.from('broadcast_subscribers').update({ unsubscribed_at: new Date().toISOString(), topics: [] }).eq('id', s.id)
    qc.invalidateQueries({ queryKey: ['bc-subs'] })
  }
  const saveTopic = async () => {
    if (!editTopic?.name_ar) return
    const row = { name_ar: editTopic.name_ar, name_fr: editTopic.name_fr || editTopic.name_ar, icon: editTopic.icon ?? null, color: editTopic.color ?? '#FF6B35', is_active: editTopic.is_active ?? true, sort: editTopic.sort ?? 0 }
    const { error } = editTopic.id ? await sb.from('broadcast_topics').update(row).eq('id', editTopic.id) : await sb.from('broadcast_topics').insert(row)
    if (error) return toast.error(errorMessage(error, lang))
    setEditTopic(null)
    qc.invalidateQueries({ queryKey: ['bc-topics'] })
  }

  const subCols: Column<Sub>[] = [
    { key: 'n', header: t('الاسم', 'Nom'), cell: (s) => <span className="font-medium">{s.name ?? '—'}</span> },
    { key: 'p', header: t('الهاتف', 'Téléphone'), cell: (s) => <span className="num" dir="ltr">+{s.phone}</span> },
    { key: 't', header: t('المواضيع', 'Sujets'), cell: (s) => <div className="flex flex-wrap gap-1">{s.unsubscribed_at ? <Badge tone="danger">{t('ألغى الاشتراك', 'Désinscrit')}</Badge> : s.topics.map((x) => <Badge key={x}>{topicName(x)}</Badge>)}</div> },
    { key: 's', header: t('المصدر', 'Source'), cell: (s) => <span className="text-xs text-muted">{s.source === 'site' ? t('الموقع', 'Site') : s.source === 'pos' ? t('المحل', 'Boutique') : t('يدوي', 'Manuel')} · <span className="num">{format(new Date(s.consent_at), 'dd/MM/yy')}</span></span> },
    { key: 'a', header: '', cell: (s) => !s.unsubscribed_at && <Button variant="ghost" size="icon-sm" onClick={(e) => (e.stopPropagation(), unsubscribe(s))}><UserMinus className="text-danger" /></Button> },
  ]
  const shownSubs = (subs.data ?? []).filter((s) => !q || s.phone.includes(q.replace(/\D/g, '')) || (s.name ?? '').toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      {confirmNode}
      <PageHeader
        icon={<Megaphone />}
        title={t('قائمة البث', 'Listes de diffusion')}
        description={t('أخبر المهتمين بالمباريات والتسجيلات والعروض على واتساب — فقط من وافق على ذلك', 'Prévenez sur WhatsApp ceux qui l’ont accepté')}
        actions={
          <Button onClick={() => setCompose({ title: '', message: 'مرحباً {name} 👋\n', topics: [] })}>
            <Plus />
            {t('رسالة جديدة', 'Nouveau message')}
          </Button>
        }
      />
      <Tabs
        className="mb-4"
        value={tab}
        onChange={setTab}
        items={[
          { value: 'messages', label: t('الرسائل', 'Messages'), count: list.data?.length },
          { value: 'subs', label: t('المشتركون', 'Abonnés'), count: active.length },
          { value: 'topics', label: t('المواضيع', 'Sujets'), count: topics.data?.length },
        ]}
      />

      {tab === 'messages' &&
        (!list.data?.length ? (
          <EmptyState icon={<Megaphone />} title={t('لم ترسل أي رسالة بعد', 'Aucun message')} description={t('يشترك الزبائن من الموقع (صفحة «التنبيهات») أو تضيفهم هنا بموافقتهم.', 'Les clients s’inscrivent depuis le site ou vous les ajoutez avec leur accord.')} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {list.data.map((b) => (
              <button key={b.id} onClick={() => setOpenBc(b)} className="text-start">
                <Card className="space-y-2 p-4 transition-all hover:border-brand/40 hover:shadow-pop">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{b.title}</div>
                    <Badge tone={b.sent >= b.total ? 'success' : 'warning'}>
                      <span className="num">{b.sent}/{b.total}</span>
                    </Badge>
                  </div>
                  <div className="line-clamp-2 text-sm whitespace-pre-line text-muted">{b.message}</div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full bg-success" style={{ width: `${b.total ? (b.sent / b.total) * 100 : 0}%` }} />
                  </div>
                  <div className="num text-xs text-subtle">{format(new Date(b.created_at), 'dd/MM/yyyy HH:mm')} · {b.author}</div>
                </Card>
              </button>
            ))}
          </div>
        ))}

      {tab === 'subs' && (
        <>
          <div className="mb-3 flex flex-wrap gap-3">
            <div className="min-w-56 flex-1">
              <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('اسم أو رقم…', 'Nom ou numéro…')} />
            </div>
            <Button variant="outline" onClick={() => setAddSub({ name: '', phone: '', topics: [], consent: false })}>
              <Plus />
              {t('إضافة مشترك', 'Ajouter')}
            </Button>
          </div>
          <DataTable rows={shownSubs} columns={subCols} rowKey={(s) => s.id} loading={subs.isLoading} pageSize={50} empty={<EmptyState icon={<Users />} title={t('لا يوجد مشتركون بعد', 'Aucun abonné')} />} />
        </>
      )}

      {tab === 'topics' && (
        <div className="space-y-2">
          {(topics.data ?? []).map((tp) => (
            <Card key={tp.id} className={cn('flex items-center gap-3 p-3', !tp.is_active && 'opacity-50')}>
              <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: tp.color }}>
                <DynamicIcon name={tp.icon} className="size-4" />
              </span>
              <span className="flex-1 font-medium">{pick(tp, 'name')}</span>
              <span className="num text-sm text-muted">{active.filter((s) => s.topics.includes(tp.id)).length} {t('مشترك', 'abonnés')}</span>
              <Button variant="outline" size="sm" onClick={() => setEditTopic(tp)}>
                {t('تعديل', 'Modifier')}
              </Button>
            </Card>
          ))}
          <Button variant="outline" onClick={() => setEditTopic({ name_ar: '', name_fr: '', color: '#FF6B35', is_active: true, sort: (topics.data?.length ?? 0) + 1 })}>
            <Plus />
            {t('موضوع جديد', 'Nouveau sujet')}
          </Button>
        </div>
      )}

      {/* compose */}
      <Dialog open={!!compose} onOpenChange={(o) => !o && setCompose(null)} size="md" title={t('رسالة جديدة', 'Nouveau message')}>
        {compose && (
          <div className="space-y-4">
            <Field label={t('عنوان داخلي', 'Titre interne')}>
              <Input value={compose.title} onChange={(e) => setCompose({ ...compose, title: e.target.value })} placeholder={t('مثلاً: مباراة الأمن الوطني', 'ex. Concours DGSN')} />
            </Field>
            <Field label={t('لمن؟', 'Destinataires')}>
              <div className="flex flex-wrap gap-2">
                {(topics.data ?? []).filter((x) => x.is_active).map((tp) => {
                  const on = compose.topics.includes(tp.id)
                  return (
                    <button key={tp.id} type="button" onClick={() => setCompose({ ...compose, topics: on ? compose.topics.filter((x) => x !== tp.id) : [...compose.topics, tp.id] })} className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-transparent text-white' : 'border-border text-muted')} style={on ? { background: tp.color } : undefined}>
                      {pick(tp, 'name')}
                    </button>
                  )
                })}
              </div>
              <div className="mt-1.5 text-xs text-muted">
                {compose.topics.length ? '' : t('بدون اختيار = كل المشتركين · ', 'Aucun = tous · ')}
                <span className="num font-semibold">{countFor(compose.topics)}</span> {t('مستلم', 'destinataires')}
              </div>
            </Field>
            <Field label={t('الرسالة', 'Message')} hint={t('{name} يُستبدل باسم الزبون. رابط إلغاء الاشتراك يُضاف تلقائياً.', '{name} = nom du client. Lien de désinscription ajouté automatiquement.')}>
              <Textarea rows={7} value={compose.message} onChange={(e) => setCompose({ ...compose, message: e.target.value })} />
            </Field>
            <Button className="w-full" onClick={create} disabled={!countFor(compose.topics) || compose.message.trim().length < 5}>
              <Send />
              {t('تحضير الإرسال', 'Préparer l’envoi')}
            </Button>
          </div>
        )}
      </Dialog>

      <SendSheet bc={openBc} onClose={() => (setOpenBc(null), qc.invalidateQueries({ queryKey: ['bc-list'] }))} />

      {/* add subscriber */}
      <Dialog open={!!addSub} onOpenChange={(o) => !o && setAddSub(null)} size="sm" title={t('إضافة مشترك', 'Ajouter un abonné')}>
        {addSub && (
          <div className="space-y-4">
            <Field label={t('الاسم', 'Nom')}>
              <Input value={addSub.name} onChange={(e) => setAddSub({ ...addSub, name: e.target.value })} />
            </Field>
            <Field label={t('رقم واتساب', 'N° WhatsApp')}>
              <Input value={addSub.phone} onChange={(e) => setAddSub({ ...addSub, phone: e.target.value })} dir="ltr" inputMode="tel" placeholder="06… / +34…" />
            </Field>
            <div className="flex flex-wrap gap-2">
              {(topics.data ?? []).filter((x) => x.is_active).map((tp) => {
                const on = addSub.topics.includes(tp.id)
                return (
                  <button key={tp.id} type="button" onClick={() => setAddSub({ ...addSub, topics: on ? addSub.topics.filter((x) => x !== tp.id) : [...addSub.topics, tp.id] })} className={cn('rounded-full border px-3 py-1.5 text-sm', on ? 'border-transparent text-white' : 'border-border text-muted')} style={on ? { background: tp.color } : undefined}>
                    {pick(tp, 'name')}
                  </button>
                )
              })}
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox checked={addSub.consent} onCheckedChange={(consent) => setAddSub({ ...addSub, consent })} />
              {t('وافق الزبون شفهياً أو كتابياً على استقبال هذه الرسائل', 'Le client a accepté de recevoir ces messages')}
            </label>
            <Button className="w-full" onClick={saveSub}>
              {t('حفظ', 'Enregistrer')}
            </Button>
          </div>
        )}
      </Dialog>

      {/* topic */}
      <Dialog open={!!editTopic} onOpenChange={(o) => !o && setEditTopic(null)} size="sm" title={editTopic?.id ? t('تعديل الموضوع', 'Modifier le sujet') : t('موضوع جديد', 'Nouveau sujet')}>
        {editTopic && (
          <div className="space-y-4">
            <Field label={t('الاسم بالعربية', 'Nom (ar)')}>
              <Input value={editTopic.name_ar ?? ''} onChange={(e) => setEditTopic({ ...editTopic, name_ar: e.target.value })} />
            </Field>
            <Field label={t('بالفرنسية', 'Nom (fr)')}>
              <Input value={editTopic.name_fr ?? ''} onChange={(e) => setEditTopic({ ...editTopic, name_fr: e.target.value })} dir="ltr" />
            </Field>
            <Field label={t('اللون', 'Couleur')}>
              <ColorPicker value={editTopic.color ?? '#FF6B35'} onChange={(color) => setEditTopic({ ...editTopic, color })} />
            </Field>
            <Field label={t('الأيقونة', 'Icône')}>
              <IconPicker value={editTopic.icon ?? null} onChange={(icon) => setEditTopic({ ...editTopic, icon })} color={editTopic.color} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={editTopic.is_active ?? true} onCheckedChange={(is_active) => setEditTopic({ ...editTopic, is_active })} />
              {t('ظاهر في الموقع', 'Visible sur le site')}
            </label>
            <div className="flex gap-2">
              {editTopic.id && (
                <Button variant="danger-soft" onClick={async () => (await sb.from('broadcast_topics').delete().eq('id', editTopic.id!), setEditTopic(null), qc.invalidateQueries({ queryKey: ['bc-topics'] }))}>
                  <Trash />
                </Button>
              )}
              <Button className="flex-1" onClick={saveTopic}>
                {t('حفظ', 'Enregistrer')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </>
  )
}

function SendSheet({ bc, onClose }: { bc: Bc | null; onClose: () => void }) {
  const { sb, me } = useAuth()
  const { t } = useLang()
  const qc = useQueryClient()
  const [auto, setAuto] = useState(false)
  const rcps = useQuery({
    queryKey: ['bc-rcp', bc?.id],
    enabled: !!bc,
    queryFn: async () => (await sb.from('broadcast_recipients').select('subscriber_id, phone, name, unsub_code, status, sent_at').eq('broadcast_id', bc!.id).order('status')).data as Rcp[],
  })
  const mode = useQuery({ queryKey: ['wa-mode'], queryFn: async () => ((await sb.from('settings').select('value').eq('key', 'whatsapp').single()).data?.value as { mode?: string })?.mode ?? 'manual' })
  const rows = useMemo(() => [...(rcps.data ?? [])].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending')), [rcps.data])
  const pending = rows.filter((r) => r.status === 'pending')

  const mark = async (r: Rcp, status: Rcp['status']) => {
    await sb.from('broadcast_recipients').update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null, sent_by: me?.id }).eq('broadcast_id', bc!.id).eq('subscriber_id', r.subscriber_id)
    qc.invalidateQueries({ queryKey: ['bc-rcp', bc?.id] })
  }
  const sendOne = (r: Rcp) => {
    window.open(whatsappLink(r.phone, personalize(bc!.message, r)), '_blank')
    mark(r, 'sent')
  }
  const sendAuto = async () => {
    setAuto(true)
    let ok = 0
    for (const r of pending) {
      try {
        await callFn(sb, 'whatsapp-send', { to: r.phone, text: personalize(bc!.message, r) })
        await mark(r, 'sent')
        ok++
      } catch {
        await mark(r, 'failed')
      }
      await new Promise((res) => setTimeout(res, 400))
    }
    setAuto(false)
    toast.success(t(`أُرسلت ${ok} رسالة تلقائياً`, `${ok} messages envoyés`))
  }

  return (
    <Sheet open={!!bc} onOpenChange={(o) => !o && onClose()} width="max-w-xl" title={bc?.title ?? ''} description={t(`${pending.length} في الانتظار من ${rows.length}`, `${pending.length} en attente sur ${rows.length}`)}>
      {bc && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line">{bc.message}</div>
          {pending.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" variant="success" onClick={() => sendOne(pending[0])}>
                <MessageCircle />
                {t('أرسل التالي', 'Envoyer le suivant')} ({pending[0].name ?? `+${pending[0].phone}`})
              </Button>
              {mode.data === 'auto' && (
                <Button size="lg" variant="outline" onClick={sendAuto} loading={auto}>
                  <Send />
                  {t('إرسال تلقائي للجميع', 'Envoi auto à tous')}
                </Button>
              )}
            </div>
          )}
          {!pending.length && (
            <div className="flex items-center gap-2 rounded-xl bg-success/10 p-3 text-sm text-success">
              <CheckCircle2 className="size-4" />
              {t('انتهى الإرسال لكل المستلمين', 'Envoi terminé')}
            </div>
          )}
          <p className="text-xs text-muted">{t('«أرسل التالي» يفتح واتساب برسالة جاهزة؛ اضغط إرسال في واتساب ثم ارجع هنا للتالي.', '« Suivant » ouvre WhatsApp avec le message prêt.')}</p>
          <div className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r) => (
              <div key={r.subscriber_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name ?? '—'} <span className="num text-xs text-muted" dir="ltr">+{r.phone}</span></span>
                {r.status === 'pending' ? (
                  <>
                    <Button size="icon-sm" variant="ghost" onClick={() => sendOne(r)}><MessageCircle className="text-success" /></Button>
                    <Button size="icon-sm" variant="ghost" onClick={() => mark(r, 'skipped')}><SkipForward /></Button>
                  </>
                ) : (
                  <Badge tone={r.status === 'sent' ? 'success' : r.status === 'failed' ? 'danger' : 'neutral'}>
                    {r.status === 'sent' ? t('أُرسلت', 'Envoyé') : r.status === 'failed' ? t('فشل', 'Échec') : t('تُخطّي', 'Ignoré')}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
