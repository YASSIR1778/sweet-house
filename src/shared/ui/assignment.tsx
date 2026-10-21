import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArrowLeftRight, ChevronDown, Hand, History, Undo2, UserCheck, UserPlus, UserX } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { Avatar, Badge, Button, Card, Field, Textarea } from './primitives'
import { Dialog } from './overlay'

type Person = { id: string; full_name: string; color: string; avatar_url?: string | null }
type Assignment = {
  assignee: (Person & { since: string | null }) | null
  log: { action: 'claim' | 'assign' | 'handover' | 'release'; reason: string | null; created_at: string; from_name: string | null; to_name: string | null; by_name: string | null }[]
}
export type AssigneeMini = { id: string; full_name: string; color: string } | null

/** Small badge for lists: who holds the task, or "nobody". */
export function AssigneeBadge({ a }: { a: AssigneeMini }) {
  const { t } = useLang()
  const { me } = useAuth()
  if (!a)
    return (
      <Badge tone="warning">
        <UserX />
        {t('بدون مسؤول', 'Sans responsable')}
      </Badge>
    )
  return (
    <Badge style={{ background: `${a.color}1a`, color: a.color }}>
      <UserCheck />
      {a.id === me?.id ? t('عندي', 'Moi') : a.full_name}
    </Badge>
  )
}

/**
 * Who is in charge of a request / order, with claim, assign, hand over
 * (reason required) and release. Every move is logged and notified.
 */
export function AssignmentCard({ entity, id }: { entity: 'request' | 'order' | 'help'; id: string }) {
  const { sb, me, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [dlg, setDlg] = useState<null | 'handover' | 'assign' | 'release'>(null)
  const [to, setTo] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const q = useQuery({ queryKey: ['assignment', entity, id], queryFn: async () => (await sb.rpc('task_assignment', { p_entity: entity, p_id: id })).data as Assignment })
  const people = useQuery({ queryKey: ['assignees', entity], enabled: !!dlg, queryFn: async () => (await sb.rpc('task_assignees', { p_entity: entity })).data as Person[] })
  const a = q.data?.assignee ?? null
  const mine = a?.id === me?.id
  const manager = can('tasks.assign')

  const run = async (action: 'claim' | 'assign' | 'handover' | 'release', p_to: string | null = null, p_reason: string | null = null) => {
    setBusy(true)
    const { error } = await sb.rpc('assign_task', { p_entity: entity, p_id: id, p_action: action, p_to, p_reason })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(
      action === 'claim' ? t('أصبحت المسؤول عن هذا الطلب ✅', 'Vous êtes responsable ✅') : action === 'release' ? t('أُعيد الطلب إلى القائمة', 'Remis dans la liste') : t('تم التسليم وأُشعر زميلك 🔔', 'Transmis, votre collègue est notifié 🔔'),
    )
    setDlg(null)
    setTo(null)
    setReason('')
    for (const k of [['assignment', entity, id], ['requests'], ['pos-requests'], ['orders'], ['pos-orders'], ['request', id], ['order', id], ['today-tasks'], ['my-tasks'], ['help'], ['help-counts']]) qc.invalidateQueries({ queryKey: k })
  }

  const verb: Record<string, [string, string]> = {
    claim: ['تكفّل به', 'a pris en charge'],
    assign: ['عيّنه المسيّر لـ', 'assigné à'],
    handover: ['سلّمه إلى', 'transmis à'],
    release: ['أعاده إلى القائمة', 'remis dans la liste'],
  }

  return (
    <Card className={cn('space-y-3 p-4', !a && 'border-warning/40 bg-warning/5')}>
      <div className="flex flex-wrap items-center gap-3">
        {a ? (
          <>
            <Avatar name={a.full_name} color={a.color} src={a.avatar_url} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{t('المسؤول عن الإنجاز', 'Responsable')}</div>
              <div className="font-semibold">
                {a.full_name} {mine && <span className="text-xs font-normal text-success">({t('أنت', 'vous')})</span>}
              </div>
              {a.since && <div className="num text-[11px] text-subtle">{t('منذ', 'depuis')} {format(new Date(a.since), 'dd/MM HH:mm')}</div>}
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium text-warning">
            <UserX className="size-5" />
            {t('لا أحد يتكفّل بهذا الطلب بعد', 'Personne ne s’en occupe encore')}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {(!a || (!mine && manager)) && (
            <Button size="sm" onClick={() => run('claim')} loading={busy && !dlg}>
              <Hand />
              {t('أتكفّل به', 'Je m’en occupe')}
            </Button>
          )}
          {(mine || (a && manager)) && (
            <Button size="sm" variant="outline" onClick={() => setDlg('handover')}>
              <ArrowLeftRight />
              {t('تسليمه لزميل', 'Transmettre')}
            </Button>
          )}
          {manager && !a && (
            <Button size="sm" variant="outline" onClick={() => setDlg('assign')}>
              <UserPlus />
              {t('تعيين موظف', 'Attribuer')}
            </Button>
          )}
          {mine && (
            <Button size="sm" variant="ghost" onClick={() => setDlg('release')} title={t('إرجاعه إلى القائمة', 'Remettre dans la liste')}>
              <Undo2 />
            </Button>
          )}
        </div>
      </div>
      {a && !mine && !manager && <p className="text-xs text-muted">{t(`هذا الطلب عند ${a.full_name}. لا يمكنك تغيير حالته إلا إذا سلّمه لك.`, `Géré par ${a.full_name}. Demandez-lui de vous le transmettre.`)}</p>}

      {(q.data?.log.length ?? 0) > 0 && (
        <div>
          <button onClick={() => setShowLog((s) => !s)} className="flex items-center gap-1.5 text-xs text-muted hover:text-text">
            <History className="size-3.5" />
            {t('سجل التكليف', 'Historique d’attribution')} ({q.data!.log.length})
            <ChevronDown className={cn('size-3.5 transition-transform', showLog && 'rotate-180')} />
          </button>
          {showLog && (
            <ol className="mt-2 space-y-1.5 border-s-2 border-border ps-3 text-xs">
              {q.data!.log.map((l, i) => (
                <li key={i}>
                  <span className="font-medium">{l.by_name}</span> {t(verb[l.action][0], verb[l.action][1])} {l.action !== 'claim' && l.action !== 'release' && <span className="font-medium">{l.to_name}</span>}
                  {l.reason && <span className="text-muted"> — «{l.reason}»</span>}
                  <span className="num ms-1 text-subtle">{format(new Date(l.created_at), 'dd/MM HH:mm')}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <Dialog
        open={!!dlg}
        onOpenChange={(o) => !o && setDlg(null)}
        size="sm"
        title={dlg === 'release' ? t('إرجاع الطلب إلى القائمة', 'Remettre dans la liste') : dlg === 'assign' ? t('تعيين موظف', 'Attribuer') : t('تسليم الطلب لزميل', 'Transmettre à un collègue')}
        description={dlg === 'handover' ? t('سيصل لزميلك إشعار، ويُسجَّل السبب في السجل', 'Votre collègue est notifié, le motif est enregistré') : dlg === 'release' ? t('سيظهر الطلب للجميع بدون مسؤول، ويُشعر المسيّر', 'Visible par tous, le gérant est prévenu') : undefined}
      >
        <div className="space-y-4">
          {dlg !== 'release' && (
            <div className="grid gap-2">
              {(people.data ?? [])
                .filter((p) => p.id !== a?.id)
                .map((p) => (
                  <button key={p.id} onClick={() => setTo(p.id)} className={cn('flex items-center gap-3 rounded-xl border-2 p-2.5 text-start text-sm', to === p.id ? 'border-brand bg-brand-50' : 'border-border hover:bg-surface-2')}>
                    <Avatar name={p.full_name} color={p.color} src={p.avatar_url} size={32} />
                    <span className="font-medium">{p.full_name}</span>
                    {p.id === me?.id && <span className="text-xs text-muted">({t('أنا', 'moi')})</span>}
                  </button>
                ))}
            </div>
          )}
          {dlg !== 'assign' && (
            <Field label={t('السبب', 'Motif')} required>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dlg === 'release' ? t('مثلاً: انتهت ورديتي', 'ex. fin de mon service') : t('مثلاً: الموقع الرسمي لا يعمل عندي، أو انتهت ورديتي', 'ex. portail en panne, fin de service')} />
            </Field>
          )}
          <Button className="w-full" loading={busy} disabled={(dlg !== 'release' && !to) || (dlg !== 'assign' && reason.trim().length < 3)} onClick={() => run(dlg!, dlg === 'release' ? null : to, dlg === 'assign' ? null : reason)}>
            {t('تأكيد', 'Confirmer')}
          </Button>
        </div>
      </Dialog>
    </Card>
  )
}
