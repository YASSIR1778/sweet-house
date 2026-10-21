import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Check, Vault, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Badge, Button, Card } from '@/shared/ui/primitives'

export const CORRECTION_REASONS: Record<string, [string, string]> = {
  previous_count: ['خطأ في عدّ الوردية السابقة', 'Erreur de comptage précédente'],
  owner_withdrawal: ['أخذ المالك نقوداً', 'Retrait du propriétaire'],
  owner_recharge: ['شحن الرصيد من المالك', 'Recharge par le propriétaire'],
  missing_operation: ['عملية لم تُسجَّل', 'Opération non saisie'],
  other: ['سبب آخر', 'Autre'],
}

type Pending = { id: string; expected: number; actual: number; reason: string; note: string | null; created_at: string; employee: string | null; shift_number: number }

/** Riyad corrections made at shift opening, waiting for the owner. */
export function RiyadCorrections() {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['riyad-corrections'], enabled: can('riyad.manage'), refetchInterval: 30_000, queryFn: async () => (await sb.rpc('riyad_corrections_pending')).data as Pending[] })
  if (!q.data?.length) return null

  const decide = async (c: Pending, ok: boolean) => {
    const { error } = await sb.rpc('decide_riyad_correction', { p_id: c.id, p_approve: ok })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(ok ? (c.reason === 'owner_recharge' ? t('سُجّل الشحن في حساب رياض ✅', 'Recharge enregistrée ✅') : t('سُجّل التصحيح ✅', 'Correction enregistrée ✅')) : t('رُفض التصحيح', 'Refusée'))
    qc.invalidateQueries({ queryKey: ['riyad-corrections'] })
    qc.invalidateQueries({ queryKey: ['riyad'] })
  }

  return (
    <div className="mb-5 space-y-2">
      <div className="text-sm font-semibold text-warning">{t('تصحيحات رياض بانتظار تأكيدك', 'Corrections Riyad à valider')}</div>
      {q.data.map((c) => {
        const diff = c.actual - c.expected
        return (
          <Card key={c.id} className="flex flex-wrap items-center gap-4 border-2 border-warning/40 bg-warning/5 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {t(...(CORRECTION_REASONS[c.reason] ?? [c.reason, c.reason]))}
                <span className={cn('num ms-2', diff > 0 ? 'text-success' : 'text-danger')}>
                  {diff > 0 ? '+' : ''}
                  {money(diff)}
                </span>
              </div>
              <div className="num text-xs text-muted">
                {t('المتوقع', 'Attendu')} {money(c.expected)} · {t('وجدته', 'Constaté')} {money(c.actual)} · {c.employee} · {t('وردية', 'Caisse')} #{c.shift_number} · {format(new Date(c.created_at), 'dd/MM HH:mm')}
              </div>
              {c.note && <div className="mt-1 text-sm">«{c.note}»</div>}
            </div>
            <Button variant="success" onClick={() => decide(c, true)}>
              <Check />
              {c.reason === 'owner_recharge' && diff > 0 ? t('تأكيد الشحن', 'Confirmer la recharge') : t('تأكيد', 'Valider')}
            </Button>
            <Button variant="ghost" onClick={() => decide(c, false)}>
              <X />
              {t('رفض', 'Refuser')}
            </Button>
          </Card>
        )
      })}
    </div>
  )
}

/** Shift detail: start (drawer / safe / Riyad), what was left, and opening corrections. */
export function ShiftCarryDetail({ shift }: { shift: { id: string; status: string; opening_float: number; opening_safe?: number | null; opening_riyad?: number | null; closing_drawer?: number | null; closing_safe?: number | null; handed_over?: number | null } }) {
  const { sb } = useAuth()
  const { t } = useLang()
  const corr = useQuery({ queryKey: ['shift-corrections', shift.id], queryFn: async () => (await sb.from('shift_corrections').select('*').eq('shift_id', shift.id).order('created_at')).data as (Pending & { kind: 'cash' | 'riyad'; status: string })[] })
  const cells: [string, number | null | undefined][] = [
    [t('الدرج عند الفتح', 'Tiroir ouverture'), shift.opening_float],
    [t('الخزنة عند الفتح', 'Coffre ouverture'), shift.opening_safe],
    [t('رياض عند الفتح', 'Riyad ouverture'), shift.opening_riyad],
  ]
  if (shift.status === 'closed') cells.push([t('تُرك في الدرج', 'Laissé au tiroir'), shift.closing_drawer], [t('تُرك في الخزنة', 'Laissé au coffre'), shift.closing_safe], [t('سُلّم للمالك', 'Remis au propriétaire'), shift.handed_over])
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        {cells.map(([l, v]) => (
          <Card key={l} className="p-3">
            <div className="text-xs text-muted">{l}</div>
            <div className="num font-bold">{v === null || v === undefined ? '—' : money(v)}</div>
          </Card>
        ))}
      </div>
      {(corr.data ?? []).map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          <Badge tone="warning">{c.kind === 'cash' ? t('تصحيح النقود عند الفتح', 'Correction espèces') : t('تصحيح رياض عند الفتح', 'Correction Riyad')}</Badge>
          <span className="num">
            {money(c.expected)} → {money(c.actual)} ({c.actual - c.expected > 0 ? '+' : ''}
            {money(c.actual - c.expected)})
          </span>
          <span className="text-muted">{t(...(CORRECTION_REASONS[c.reason] ?? [c.reason, c.reason]))}</span>
          {c.note && <span>«{c.note}»</span>}
          {c.kind === 'riyad' && <Badge tone={c.status === 'approved' ? 'success' : c.status === 'rejected' ? 'danger' : 'neutral'}>{c.status === 'approved' ? t('أكّده المالك', 'Validée') : c.status === 'rejected' ? t('مرفوض', 'Refusée') : t('بانتظار المالك', 'En attente')}</Badge>}
        </div>
      ))}
    </div>
  )
}

export function SafeBalanceCard() {
  const { sb } = useAuth()
  const { t } = useLang()
  const q = useQuery({ queryKey: ['safe-balance'], refetchInterval: 60_000, queryFn: async () => (await sb.rpc('safe_balance')).data as number })
  return (
    <Card className="mb-5 flex items-center gap-4 p-4">
      <span className="flex size-11 items-center justify-center rounded-xl bg-navy text-white">
        <Vault className="size-5" />
      </span>
      <div className="flex-1">
        <div className="text-sm text-muted">{t('في الخزنة الآن (حسب آخر وردية)', 'Au coffre actuellement')}</div>
        <div className="num text-2xl font-bold">{money(q.data ?? 0)}</div>
      </div>
      <div className="text-xs text-muted">{t('+ الدرج: مبلغ ثابت في بداية كل وردية', '+ tiroir : fond fixe')}</div>
    </Card>
  )
}
