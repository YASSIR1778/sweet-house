import { useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { ArrowDownCircle, ArrowUpCircle, Banknote, Camera, CheckCircle2, CircleDollarSign, CreditCard, HandCoins, Lock, LogOut, Printer, Receipt, Store, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { cn, storage } from '@/shared/lib/utils'
import { Avatar, Button, Card, Field, Input, Spinner, Textarea } from '@/shared/ui/primitives'
import { Dialog, Sheet } from '@/shared/ui/overlay'
import { LogoMark } from '@/shared/ui/brand'
import { MoneyInput } from '@/shared/ui/pickers'
import { PrintArea } from '@/shared/ui/receipt'
import type { DeviceInfo } from './device'
import { readRiyad, type RiyadRead } from '@/shared/lib/ai'
import { CustomerDialog } from './dialogs'

export type ShiftTotals = {
  sales_count: number
  sales_total: number
  sales_cash: number
  sales_card: number
  sales_credit: number
  discounts: number
  voided: number
  riyad_fees: number
  movements: Record<string, { amount: number; count: number }>
  movements_total: number
  expected_before_riyad?: number
  opening_drawer?: number
  opening_safe?: number
  opening_riyad?: number | null
  /** card sales + debts paid by card − card refunds: what the card terminal should show */
  card_expected?: number
  card_debts?: number
  card_refunds?: number
  /** platform balance before this shift's Riyad in / out (only for staff who see Riyad balances) */
  riyad_base?: number
  riyad_owner_effect?: number
  riyad_owner_count?: number
  opening_corrections?: { kind: 'cash' | 'riyad'; expected: number; actual: number; reason: string; note: string | null; status: string }[]
}
export type ShiftStatus =
  | { open: true; shift: { id: string; number: number; employee_id: string; opened_at: string; opening_float: number; opening_safe?: number; opening_riyad?: number | null }; employee_name: string; mine: boolean; blind: boolean; float?: number; totals: ShiftTotals }
  | { open: false; suggested_float: number; default_float: number; last_closed_at?: string | null; carry?: Carry }

export function useShift(device: DeviceInfo) {
  const { sb } = useAuth()
  const cache = storage<ShiftStatus | null>(`sh-shift-${device.id}`, null)
  return useQuery({
    queryKey: ['shift', device.id],
    refetchInterval: 60_000,
    initialData: cache.get() ?? undefined,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const { data, error } = await sb.rpc('shift_status', { p_device: device.id })
      if (error) {
        const cached = cache.get()
        if (!navigator.onLine && cached) return cached
        throw error
      }
      cache.set(data as ShiftStatus)
      return data as ShiftStatus
    },
  })
}

// ---------------------------------------------------------------- Open shift screen ("استلام الوردية")
type Carry = { drawer: number; safe: number; riyad: number; float: number; last_closed_at: string | null; last_employee: string | null }
const CASH_REASONS: [string, string, string][] = [
  ['previous_count', 'خطأ في عدّ الوردية السابقة', 'Erreur de comptage précédente'],
  ['owner_withdrawal', 'أخذ المالك نقوداً', 'Retrait du propriétaire'],
  ['other', 'سبب آخر', 'Autre'],
]
const RIYAD_REASONS: [string, string, string][] = [
  ['owner_recharge', 'شحن الرصيد من المالك', 'Recharge par le propriétaire'],
  ['missing_operation', 'عملية لم تُسجَّل', 'Opération non saisie'],
  ['other', 'سبب آخر', 'Autre'],
]

// Cash movements in the closing statement, in this order (amounts are signed: + into the till, − out of it)
const MOVEMENTS: [string, string, string][] = [
  ['debt_payment', 'تسديد ديون نقداً', 'Dettes encaissées'],
  ['online_payment', 'طلبات أونلاين نقداً', 'Commandes en ligne'],
  ['owner_deposit', 'إيداع في الدرج', 'Dépôts'],
  ['expense', 'مصاريف', 'Dépenses'],
  ['refund', 'إرجاعات نقداً', 'Retours'],
  ['owner_withdrawal', 'سحب المالك', 'Retraits du propriétaire'],
  ['riyad_credit', 'رياض بالدين (لم يُدفع نقداً)', 'Riyad à crédit'],
  ['supplier_payment', 'دفع لمورد', 'Fournisseurs'],
  ['salary_advance', 'تسبيق راتب', 'Avance sur salaire'],
  ['adjustment', 'تعديل', 'Ajustement'],
]
const reasonLabel = (k: string) => [...CASH_REASONS, ...RIYAD_REASONS].find(([key]) => key === k)

/** One line: expected amount, ✅ to confirm or ✏️ to type what is really there. */
function CheckRow({ label, hint, expected, value, onChange, confirmed, onConfirm }: { label: string; hint?: string; expected: number; value: number | null; onChange: (v: number | null) => void; confirmed: boolean; onConfirm: () => void }) {
  const { t } = useLang()
  const [edit, setEdit] = useState(false)
  const differs = value !== null && value !== expected
  return (
    <div className={cn('rounded-xl border-2 p-3 transition-colors', confirmed && !differs ? 'border-success/50 bg-success/5' : differs ? 'border-warning/60 bg-warning/5' : 'border-border')}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{label}</div>
          {hint && <div className="text-xs text-muted">{hint}</div>}
        </div>
        <div className="num text-lg font-bold">{money(expected)}</div>
        <Button size="sm" variant={confirmed && !differs ? 'success' : 'outline'} onClick={() => (onChange(expected), setEdit(false), onConfirm())}>
          <CheckCircle2 />
          {t('صحيح', 'OK')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => (setEdit(true), onConfirm())}>
          {t('تصحيح', 'Corriger')}
        </Button>
      </div>
      {(edit || differs) && (
        <div className="mt-3 flex items-center gap-2">
          <span className="shrink-0 text-xs text-muted">{t('الموجود فعلاً:', 'Réel :')}</span>
          <MoneyInput value={value} onChange={onChange} autoFocus className="flex-1" />
          {differs && (
            <span className={cn('num shrink-0 text-xs font-bold', (value ?? 0) > expected ? 'text-info' : 'text-danger')}>
              {(value ?? 0) > expected ? '+' : ''}
              {money((value ?? 0) - expected)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function ReasonPicker({ reasons, reason, note, onReason, onNote }: { reasons: [string, string, string][]; reason: string; note: string; onReason: (r: string) => void; onNote: (n: string) => void }) {
  const { t } = useLang()
  return (
    <div className="space-y-2 rounded-xl bg-warning/5 p-3">
      <div className="text-xs font-semibold text-warning">{t('سبب التصحيح (إلزامي)', 'Motif (obligatoire)')}</div>
      <div className="flex flex-wrap gap-2">
        {reasons.map(([k, ar, fr]) => (
          <button key={k} type="button" onClick={() => onReason(k)} className={cn('rounded-full border px-3 py-1.5 text-xs', reason === k ? 'border-warning bg-warning text-white' : 'border-border bg-surface')}>
            {t(ar, fr)}
          </button>
        ))}
      </div>
      <Input value={note} onChange={(e) => onNote(e.target.value)} placeholder={t('شرح قصير', 'Précision')} />
    </div>
  )
}

export function OpenShiftScreen({ device, status, onOpened }: { device: DeviceInfo; status: Extract<ShiftStatus, { open: false }>; onOpened: () => void }) {
  const { sb, me, can, signOut } = useAuth()
  const { t, lang } = useLang()
  const c = status.carry
  const [drawer, setDrawer] = useState<number | null>(c?.drawer ?? status.suggested_float)
  const [safe, setSafe] = useState<number | null>(c?.safe ?? 0)
  const [riyad, setRiyad] = useState<number | null>(c?.riyad ?? null)
  const [ok, setOk] = useState({ drawer: false, safe: false, riyad: false })
  const [cashReason, setCashReason] = useState({ reason: '', note: '' })
  const [riyadReason, setRiyadReason] = useState({ reason: '', note: '' })
  const [busy, setBusy] = useState(false)

  const cashExpected = (c?.drawer ?? 0) + (c?.safe ?? 0)
  const cashDiff = (drawer ?? 0) + (safe ?? 0) - cashExpected
  const riyadDiff = c && riyad !== null ? riyad - c.riyad : 0
  const showRiyad = can('riyad.view_balance') || can('riyad.fee')
  const allChecked = ok.drawer && ok.safe && (!showRiyad || ok.riyad)
  const missingReason = (cashDiff !== 0 && !cashReason.reason) || (showRiyad && riyadDiff !== 0 && !riyadReason.reason)

  const open = async () => {
    setBusy(true)
    const corrections = [
      ...(cashDiff !== 0 ? [{ kind: 'cash', ...cashReason }] : []),
      ...(showRiyad && riyadDiff !== 0 ? [{ kind: 'riyad', ...riyadReason }] : []),
    ]
    const { error } = await sb.rpc('open_shift_checked', { p_device: device.id, p_drawer: drawer ?? 0, p_safe: safe ?? 0, p_riyad: showRiyad ? riyad : null, p_corrections: corrections })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(corrections.length ? t('تم استلام الوردية، وأُرسل التصحيح للمالك', 'Caisse ouverte, correction envoyée au propriétaire') : t('تم استلام الوردية. عمل موفق 💪', 'Caisse ouverte. Bon travail 💪'))
    onOpened()
  }

  return (
    <ShiftFrame>
      <div className="text-center">
        <Avatar name={me?.full_name ?? ''} color={me?.color} src={me?.avatar_url} size={64} />
        <h1 className="mt-3 text-2xl font-bold">
          {t('مرحباً', 'Bonjour')} {me?.full_name} 👋
        </h1>
        <p className="mt-1 text-white/60">
          {c?.last_employee
            ? t(`استلام الوردية من ${c.last_employee}: تأكّد من المبالغ التالية`, `Reprise de la caisse de ${c.last_employee} : vérifiez les montants`)
            : t('تأكّد من المبالغ التالية قبل البدء', 'Vérifiez les montants avant de commencer')}
        </p>
      </div>
      {can('cash.shift') ? (
        <Card className="mt-6 w-full max-w-lg space-y-3 p-5 text-text">
          <CheckRow label={t('الدرج', 'Tiroir')} hint={t('مبلغ ثابت في بداية كل وردية', 'Fond fixe à chaque ouverture')} expected={c?.drawer ?? status.suggested_float} value={drawer} onChange={setDrawer} confirmed={ok.drawer} onConfirm={() => setOk((o) => ({ ...o, drawer: true }))} />
          <CheckRow label={t('الخزنة', 'Coffre')} hint={t('ما تُرك في الخزنة عند آخر إغلاق', 'Laissé au coffre à la dernière clôture')} expected={c?.safe ?? 0} value={safe} onChange={setSafe} confirmed={ok.safe} onConfirm={() => setOk((o) => ({ ...o, safe: true }))} />
          {cashDiff !== 0 && <ReasonPicker reasons={CASH_REASONS} reason={cashReason.reason} note={cashReason.note} onReason={(reason) => setCashReason({ ...cashReason, reason })} onNote={(note) => setCashReason({ ...cashReason, note })} />}
          {showRiyad && c && (
            <>
              <CheckRow label={t('رصيد رياض', 'Solde Riyad')} hint={t('قارنه بالرصيد الظاهر في المنصة الآن', 'Comparez avec la plateforme')} expected={c.riyad} value={riyad} onChange={setRiyad} confirmed={ok.riyad} onConfirm={() => setOk((o) => ({ ...o, riyad: true }))} />
              {riyadDiff !== 0 && (
                <>
                  <ReasonPicker reasons={RIYAD_REASONS} reason={riyadReason.reason} note={riyadReason.note} onReason={(reason) => setRiyadReason({ ...riyadReason, reason })} onNote={(note) => setRiyadReason({ ...riyadReason, note })} />
                  <p className="text-xs text-muted">{t('يُرسل هذا التصحيح للمالك ليؤكده، ثم يُسجَّل في حساب رياض.', 'Envoyé au propriétaire pour validation.')}</p>
                </>
              )}
            </>
          )}
          <div className="flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-white">
            <span className="text-sm text-white/70">{t('مجموع النقود (الدرج + الخزنة)', 'Total espèces (tiroir + coffre)')}</span>
            <span className="num text-xl font-bold">{money((drawer ?? 0) + (safe ?? 0))}</span>
          </div>
          <Button size="lg" className="w-full" onClick={open} loading={busy} disabled={!allChecked || missingReason}>
            <Store />
            {t('استلام الوردية', 'Prendre la caisse')}
          </Button>
          {!allChecked && <p className="text-center text-xs text-muted">{t('اضغط «صحيح» أو «تصحيح» لكل مبلغ', 'Validez ou corrigez chaque montant')}</p>}
        </Card>
      ) : (
        <div className="mt-8 rounded-2xl bg-white/10 p-5 text-center text-sm">{t('ليست لديك صلاحية فتح الوردية. اطلب من المسيّر فتحها.', "Vous n'avez pas la permission d'ouvrir la caisse.")}</div>
      )}
      <button onClick={() => signOut()} className="mt-6 flex items-center gap-1.5 text-sm text-white/50 hover:text-white">
        <LogOut className="size-4" />
        {t('تبديل الموظف', "Changer d'employé")}
      </button>
    </ShiftFrame>
  )
}

/** Another employee's shift is still open on this device. */
export function ForeignShiftScreen({ device, status, onClosed }: { device: DeviceInfo; status: Extract<ShiftStatus, { open: true }>; onClosed: () => void }) {
  const { signOut, can } = useAuth()
  const { t } = useLang()
  const [closing, setClosing] = useState(false)
  return (
    <ShiftFrame>
      <div className="flex size-16 items-center justify-center rounded-2xl bg-warning/20 text-warning">
        <Lock className="size-8" />
      </div>
      <h1 className="mt-5 text-center text-2xl font-bold">{t(`وردية ${status.employee_name} ما زالت مفتوحة`, `La caisse de ${status.employee_name} est encore ouverte`)}</h1>
      <p className="mt-2 max-w-md text-center text-white/60">
        {t('يجب إغلاقها وعدّ الصندوق قبل أن تفتح ورديتك، حتى تعرف مسؤولية كل واحد.', 'Elle doit être clôturée et comptée avant d’ouvrir la vôtre.')}
      </p>
      <div className="mt-8 flex gap-3">
        <Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10" onClick={() => signOut()}>
          <LogOut />
          {t('رجوع', 'Retour')}
        </Button>
        {can('cash.shift') && (
          <Button onClick={() => setClosing(true)}>
            <Banknote />
            {t('عدّ الصندوق وإغلاق ورديتها', 'Compter et clôturer')}
          </Button>
        )}
      </div>
      <CloseShiftDialog device={device} status={status} open={closing} onClose={() => setClosing(false)} onClosed={onClosed} />
    </ShiftFrame>
  )
}

function ShiftFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy px-6 text-white">
      <div className="bg-grid absolute inset-0 opacity-25" />
      <div className="absolute -bottom-40 -start-40 size-[34rem] rounded-full bg-brand/25 blur-3xl" />
      <div className="absolute start-8 top-6">
        <LogoMark size={40} />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative flex w-full flex-col items-center">
        {children}
      </motion.div>
    </div>
  )
}

// ---------------------------------------------------------------- Drawer sheet (during the shift)
export function ShiftSheet({ device, status, open, onClose, onClosed }: { device: DeviceInfo; status: Extract<ShiftStatus, { open: true }>; open: boolean; onClose: () => void; onClosed: () => void }) {
  const { can } = useAuth()
  const { t } = useLang()
  const [action, setAction] = useState<null | 'expense' | 'owner_withdrawal' | 'owner_deposit' | 'riyad_credit' | 'debt' | 'close'>(null)
  const tot = status.totals
  const mv = (k: string) => tot.movements[k]?.amount ?? 0

  const actions = [
    { id: 'riyad_credit', ar: 'رياض بالدَّين', fr: 'Riyad à crédit', icon: Wallet, perm: 'riyad.credit', color: '#16A34A' },
    { id: 'debt', ar: 'تسديد دين زبون', fr: 'Encaisser une dette', icon: HandCoins, perm: 'debts.collect', color: '#2563EB' },
    { id: 'expense', ar: 'مصروف من الدرج', fr: 'Dépense', icon: ArrowUpCircle, perm: 'cash.expense', color: '#D97706' },
    { id: 'owner_withdrawal', ar: 'سحب المالك', fr: 'Retrait propriétaire', icon: ArrowUpCircle, perm: 'cash.owner_withdrawal', color: '#DC2626' },
    { id: 'owner_deposit', ar: 'إيداع في الدرج', fr: 'Dépôt dans la caisse', icon: ArrowDownCircle, perm: 'cash.owner_withdrawal', color: '#0891B2' },
  ] as const

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={t('الصندوق والوردية', 'Caisse')} description={`${t('وردية', 'Caisse')} #${status.shift.number} · ${status.employee_name}`} width="max-w-lg">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('فُتحت', 'Ouverte à')} value={format(new Date(status.shift.opened_at), 'HH:mm')} />
            <Stat label={t('في البداية: الدرج + الخزنة', 'Début : tiroir + coffre')} value={money(status.shift.opening_float + (status.shift.opening_safe ?? 0))} hint={`${t('الدرج', 'Tiroir')} ${money(status.shift.opening_float)} · ${t('الخزنة', 'Coffre')} ${money(status.shift.opening_safe ?? 0)}`} />
            <Stat label={t('المبيعات', 'Ventes')} value={`${money(tot.sales_total)}`} hint={`${tot.sales_count} ${t('بيع', 'ventes')}`} />
            <Stat label={t('رسوم رياض', 'Frais Riyad')} value={money(tot.riyad_fees)} />
            <Stat label={t('نقداً', 'Espèces')} value={money(tot.sales_cash)} />
            <Stat label={t('بطاقة', 'Carte')} value={money(tot.sales_card)} hint={tot.card_expected !== undefined && tot.card_expected !== tot.sales_card ? `${t('في جهاز الأداء', 'Au TPE')} ${money(tot.card_expected)}` : undefined} />
            {tot.opening_riyad != null && <Stat label={t('رصيد رياض في البداية', 'Solde Riyad au début')} value={money(tot.opening_riyad)} />}
            {tot.sales_credit > 0 && <Stat label={t('بالدين', 'Crédit')} value={money(tot.sales_credit)} />}
            {mv('riyad_credit') !== 0 && <Stat label={t('رياض بالدين', 'Riyad crédit')} value={money(-mv('riyad_credit'))} />}
            {mv('debt_payment') !== 0 && <Stat label={t('تسديد ديون', 'Dettes encaissées')} value={money(mv('debt_payment'))} />}
            {mv('online_payment') !== 0 && <Stat label={t('طلبات أونلاين', 'Commandes en ligne')} value={money(mv('online_payment'))} />}
            {mv('expense') !== 0 && <Stat label={t('مصاريف', 'Dépenses')} value={money(-mv('expense'))} />}
            {mv('refund') !== 0 && <Stat label={t('إرجاعات', 'Retours')} value={money(-mv('refund'))} />}
            {mv('owner_withdrawal') !== 0 && <Stat label={t('سحب المالك', 'Retraits')} value={money(-mv('owner_withdrawal'))} />}
          </div>
          {tot.expected_before_riyad !== undefined && !status.blind && (
            <div className="rounded-2xl bg-navy p-4 text-white">
              <div className="text-sm text-white/60">{t('النقود المتوقعة الآن في الدرج والخزنة معاً (قبل حساب رياض)', 'Espèces attendues tiroir + coffre (hors Riyad)')}</div>
              <div className="num mt-1 text-2xl font-bold">{money(tot.expected_before_riyad)}</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {actions
              .filter((a) => can(a.perm))
              .map((a) => (
                <button key={a.id} onClick={() => setAction(a.id)} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start text-sm font-medium transition-all hover:-translate-y-0.5 hover:shadow-card">
                  <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ background: a.color }}>
                    <a.icon className="size-4.5" />
                  </span>
                  {t(a.ar, a.fr)}
                </button>
              ))}
          </div>
          {can('cash.shift') && (
            <Button variant="navy" size="lg" className="w-full" onClick={() => setAction('close')}>
              <Lock />
              {t('إغلاق الوردية وعدّ الصندوق', 'Clôturer et compter')}
            </Button>
          )}
        </div>
      </Sheet>
      <CashMovementDialog device={device} type={action === 'expense' || action === 'owner_withdrawal' || action === 'owner_deposit' ? action : null} onClose={() => setAction(null)} />
      <RiyadCreditDialog device={device} open={action === 'riyad_credit'} onClose={() => setAction(null)} />
      <DebtPaymentDialog device={device} open={action === 'debt'} onClose={() => setAction(null)} />
      <CloseShiftDialog device={device} status={status} open={action === 'close'} onClose={() => setAction(null)} onClosed={() => (setAction(null), onClose(), onClosed())} />
    </>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="num mt-0.5 font-bold">{value}</div>
      {hint && <div className="num text-[11px] text-subtle">{hint}</div>}
    </div>
  )
}

function useRefreshShift(device: DeviceInfo) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['shift', device.id] })
    qc.invalidateQueries({ queryKey: ['pos-customers'] })
  }
}

function CashMovementDialog({ device, type, onClose }: { device: DeviceInfo; type: 'expense' | 'owner_withdrawal' | 'owner_deposit' | null; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const refresh = useRefreshShift(device)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const titles = { expense: t('مصروف من الدرج', 'Dépense depuis la caisse'), owner_withdrawal: t('سحب المالك', 'Retrait du propriétaire'), owner_deposit: t('إيداع في الدرج', 'Dépôt dans la caisse') }
  const submit = async () => {
    if (!type || !amount) return
    setBusy(true)
    const { error } =
      type === 'expense'
        ? await sb.rpc('add_expense', { p: { amount, paid_from: 'drawer', device_id: device.id, note } })
        : await sb.rpc('add_cash_movement', { p_device: device.id, p_type: type, p_amount: amount, p_note: note || null })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم التسجيل', 'Enregistré'))
    setAmount(null)
    setNote('')
    refresh()
    onClose()
  }
  return (
    <Dialog open={!!type} onOpenChange={(o) => !o && onClose()} size="sm" title={type ? titles[type] : ''}>
      <div className="space-y-4">
        <Field label={t('المبلغ', 'Montant')}>
          <MoneyInput value={amount} onChange={setAmount} autoFocus />
        </Field>
        <Field label={type === 'expense' ? t('ماذا اشتريت؟', 'Objet') : t('ملاحظة', 'Note')} required={type === 'expense'}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={!amount || (type === 'expense' && !note.trim())}>
          {t('تسجيل', 'Enregistrer')}
        </Button>
      </div>
    </Dialog>
  )
}

function CustomerField({ customer, onPick }: { customer: { id: string; full_name: string } | null; onPick: (c: { id: string; full_name: string; phone: string | null } | null) => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} className={cn('flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-start text-sm', customer ? 'border-brand bg-brand-50' : 'border-dashed border-border')}>
        <CircleDollarSign className="size-4 text-muted" />
        {customer?.full_name ?? t('اختر الزبون…', 'Choisir le client…')}
      </button>
      <CustomerDialog open={open} onClose={() => setOpen(false)} onPick={onPick} />
    </>
  )
}

function RiyadCreditDialog({ device, open, onClose }: { device: DeviceInfo; open: boolean; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const refresh = useRefreshShift(device)
  const [customer, setCustomer] = useState<{ id: string; full_name: string } | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!customer || !amount) return
    setBusy(true)
    const { error } = await sb.rpc('riyad_credit', { p_device: device.id, p_customer: customer.id, p_amount: amount, p_note: note || null })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`سُجّل دين رياض على ${customer.full_name}`, `Crédit Riyad enregistré pour ${customer.full_name}`))
    setCustomer(null)
    setAmount(null)
    setNote('')
    refresh()
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={t('رياض بالدَّين', 'Riyad à crédit')} description={t('عملية رياض لم يدفعها الزبون نقداً', 'Opération Riyad non payée par le client')}>
      <div className="space-y-4">
        <Field label={t('الزبون', 'Client')} required>
          <CustomerField customer={customer} onPick={setCustomer} />
        </Field>
        <Field label={t('مبلغ العملية', "Montant de l'opération")} required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label={t('نوع العملية / ملاحظة', 'Type / note')}>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('مثلاً: أداء فاتورة الكهرباء', 'ex : facture électricité')} />
        </Field>
        <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={!customer || !amount}>
          {t('تسجيل الدين', 'Enregistrer le crédit')}
        </Button>
      </div>
    </Dialog>
  )
}

export function DebtPaymentDialog({ device, open, onClose, initialCustomer }: { device: DeviceInfo; open: boolean; onClose: () => void; initialCustomer?: { id: string; full_name: string } | null }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const refresh = useRefreshShift(device)
  const [customer, setCustomer] = useState<{ id: string; full_name: string } | null>(initialCustomer ?? null)
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<'cash' | 'card'>('cash')
  const [busy, setBusy] = useState(false)
  const bal = useQuery({
    queryKey: ['balance', customer?.id],
    enabled: !!customer,
    queryFn: async () => (await sb.from('customer_balances').select('balance').eq('id', customer!.id).single()).data?.balance as number,
  })
  const submit = async () => {
    if (!customer || !amount) return
    setBusy(true)
    const { data, error } = await sb.rpc('pay_debt', { p_device: device.id, p_customer: customer.id, p_amount: amount, p_method: method, p_note: null })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t(`تم التسديد. الباقي: ${money(data as number)}`, `Encaissé. Reste : ${money(data as number)}`))
    setAmount(null)
    refresh()
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={t('تسديد دين', 'Encaisser une dette')}>
      <div className="space-y-4">
        <Field label={t('الزبون', 'Client')} required>
          <CustomerField customer={customer} onPick={setCustomer} />
        </Field>
        {customer && (
          <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3 text-sm">
            <span className="text-muted">{t('الدين الحالي', 'Dette actuelle')}</span>
            {bal.isLoading ? <Spinner className="size-4" /> : <span className={cn('num font-bold', (bal.data ?? 0) > 0 ? 'text-danger' : 'text-success')}>{money(bal.data ?? 0)}</span>}
          </div>
        )}
        <Field label={t('المبلغ المدفوع', 'Montant payé')} required>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        {customer && (bal.data ?? 0) > 0 && (
          <Button variant="soft" size="sm" onClick={() => setAmount(bal.data ?? 0)}>
            {t('تسديد الكل', 'Tout payer')} · {money(bal.data ?? 0)}
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant={method === 'cash' ? 'navy' : 'outline'} onClick={() => setMethod('cash')}>
            {t('نقداً', 'Espèces')}
          </Button>
          <Button variant={method === 'card' ? 'navy' : 'outline'} onClick={() => setMethod('card')}>
            {t('بطاقة', 'Carte')}
          </Button>
        </div>
        <Button className="w-full" size="lg" onClick={submit} loading={busy} disabled={!customer || !amount}>
          {t('تأكيد التسديد', 'Confirmer')}
        </Button>
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Close shift (blind count)
type CloseResult = {
  expected: number
  counted: number
  difference: number
  totals: ShiftTotals
  riyad_expected: number
  riyad_reported: number | null
  drawer?: number
  safe?: number
  handed_over?: number
  float?: number
  card_expected?: number
  card_terminal?: number | null
}

/** One line of the closing statement: label, signed amount (or a plain total). */
function Line({ label, hint, amount, signed, total, tone }: { label: string; hint?: string; amount: number; signed?: boolean; total?: boolean; tone?: 'muted' }) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-1 text-sm', total && 'mt-1 border-t border-border pt-2 font-bold', tone === 'muted' && 'text-muted')}>
      <span className="min-w-0">
        {label}
        {hint && <span className="ms-1.5 text-xs font-normal text-subtle">{hint}</span>}
      </span>
      <span className={cn('num shrink-0', total ? 'text-base' : 'font-semibold')} dir="ltr">
        {signed ? (amount < 0 ? '− ' : '+ ') : ''}
        {money(signed ? Math.abs(amount) : amount)}
      </span>
    </div>
  )
}

/** Difference between what the employee typed and what is expected, shown as she types. */
function Gap({ value, expected }: { value: number | null; expected: number }) {
  const { t } = useLang()
  if (value === null) return null
  const d = value - expected
  return <div className={cn('text-sm font-medium', d === 0 ? 'text-success' : d > 0 ? 'text-info' : 'text-danger')}>{d === 0 ? t('✅ مضبوط', '✅ Juste') : `${d > 0 ? t('زيادة', 'Excédent') : t('نقص', 'Manque')}: ${money(Math.abs(d))}`}</div>
}

export function CloseShiftDialog({ status, open, onClose, onClosed }: { device: DeviceInfo; status: Extract<ShiftStatus, { open: true }>; open: boolean; onClose: () => void; onClosed: () => void }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const [counted, setCounted] = useState<number | null>(null)
  const [rin, setRin] = useState<number | null>(null)
  const [rout, setRout] = useState<number | null>(null)
  const [rbal, setRbal] = useState<number | null>(null)
  const [tpe, setTpe] = useState<number | null>(null)
  const [handed, setHanded] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<CloseResult | null>(null)
  const [printing, setPrinting] = useState(false)

  const tot = status.totals
  const sh = status.shift
  const openingCash = sh.opening_float + (sh.opening_safe ?? 0)
  const cashExpected = tot.expected_before_riyad !== undefined ? tot.expected_before_riyad + (rin ?? 0) - (rout ?? 0) : undefined
  const riyadExpected = tot.riyad_base !== undefined ? tot.riyad_base - (rin ?? 0) + (rout ?? 0) : undefined
  const cardExpected = tot.card_expected ?? tot.sales_card
  const moves = MOVEMENTS.filter(([k]) => (tot.movements[k]?.amount ?? 0) !== 0)
  const corrections = tot.opening_corrections ?? []
  const float = status.float ?? sh.opening_float
  const left = counted === null ? null : counted - (handed ?? 0)

  const submit = async () => {
    if (counted === null) return toast.error(t('أدخل المبلغ المعدود', 'Saisissez le montant compté'))
    try {
      const pending = JSON.parse(localStorage.getItem('sh-pos-queue') ?? '[]') as unknown[]
      if (pending.length) return toast.error(t(`يوجد ${pending.length} بيع لم يُرسل بعد (بدون إنترنت). انتظر عودة الاتصال قبل إغلاق الوردية.`, `${pending.length} ventes hors ligne non envoyées. Attendez la connexion.`))
    } catch {
      /* storage unavailable */
    }
    setBusy(true)
    const { data, error } = await sb.rpc('close_shift', {
      p_shift: sh.id,
      p_counted: counted,
      p_riyad_in: rin ?? 0,
      p_riyad_out: rout ?? 0,
      p_riyad_balance: rbal,
      p_handed_over: handed ?? 0,
      p_notes: notes || null,
      p_card_terminal: tpe,
    })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setResult(data as CloseResult)
  }

  const finish = () => {
    setResult(null)
    setCounted(null)
    setRin(null)
    setRout(null)
    setRbal(null)
    setTpe(null)
    setHanded(null)
    setNotes('')
    onClosed()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && (result ? finish() : onClose())} size="md" title={result ? t('نتيجة إغلاق الوردية', 'Résultat de la clôture') : t('إغلاق الوردية', 'Clôture de caisse')} description={`#${sh.number} · ${status.employee_name}`}>
      {!result ? (
        <div className="space-y-5">
          {/* 1 · Riyad first: its in / out go into the cash expected below */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Wallet className="size-4 text-success" />
              {t('1. رياض: أرقام الكشف', '1. Riyad : relevé')}
              <RiyadPhotoButton onRead={(r) => (r.total_in !== null && setRin(Math.round(r.total_in * 100)), r.total_out !== null && setRout(Math.round(r.total_out * 100)), r.balance !== null && setRbal(Math.round(r.balance * 100)))} />
            </div>
            {tot.riyad_base !== undefined && (
              <div className="rounded-xl bg-surface-2/60 px-3 py-1.5">
                {tot.opening_riyad != null ? (
                  <Line label={t('رصيد المنصة في بداية ورديتك', 'Solde au début de la caisse')} amount={tot.opening_riyad} />
                ) : (
                  <Line label={t('رصيد رياض المسجّل في النظام', 'Solde Riyad enregistré')} amount={tot.riyad_base} />
                )}
                {tot.opening_riyad != null && (tot.riyad_owner_effect ?? 0) !== 0 && (
                  <Line label={t('عمليات المالك خلال الوردية (شحن، سحب…)', 'Opérations du propriétaire')} hint={`(${tot.riyad_owner_count})`} amount={tot.riyad_owner_effect!} signed />
                )}
                {(rin ?? 0) > 0 && <Line label={t('دخل الصندوق من رياض', 'Entrées Riyad')} amount={-(rin ?? 0)} signed />}
                {(rout ?? 0) > 0 && <Line label={t('خرج من الصندوق لرياض', 'Sorties Riyad')} amount={rout ?? 0} signed />}
                <Line label={t('= الرصيد المتوقع في المنصة الآن', '= Solde attendu sur la plateforme')} amount={riyadExpected!} total />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('دخل الصندوق من رياض', 'Entrées Riyad')} hint={t('مجموع ما دفعه الزبائن نقداً', 'Total encaissé')}>
                <MoneyInput value={rin} onChange={setRin} />
              </Field>
              <Field label={t('خرج من الصندوق لرياض', 'Sorties Riyad')} hint={t('مجموع ما سلّمته للزبائن', 'Total versé')}>
                <MoneyInput value={rout} onChange={setRout} />
              </Field>
            </div>
            <Field label={t('رصيد المنصة الظاهر في رياض الآن', 'Solde affiché sur Riyad')}>
              <MoneyInput value={rbal} onChange={setRbal} />
            </Field>
            {riyadExpected !== undefined && <Gap value={rbal} expected={riyadExpected} />}
          </Card>

          {/* 2 · Cash: drawer + safe counted once */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Banknote className="size-4 text-brand" />
              {t('2. النقود: الدرج + الخزنة معاً', '2. Espèces : tiroir + coffre')}
            </div>
            <div className="rounded-xl bg-surface-2/60 px-3 py-1.5">
              <Line label={t('في بداية الوردية', 'Au début')} hint={`${t('الدرج', 'Tiroir')} ${money(sh.opening_float)} · ${t('الخزنة', 'Coffre')} ${money(sh.opening_safe ?? 0)}`} amount={openingCash} />
              {corrections.map((c, i) => {
                const r = reasonLabel(c.reason)
                return (
                  <p key={i} className="pb-1 text-xs text-warning">
                    {c.kind === 'cash' ? t('عند الاستلام: كان المتوقع', 'À l’ouverture : attendu') : t('رياض عند الاستلام: كان المتوقع', 'Riyad à l’ouverture : attendu')} {money(c.expected)} {t('ووُجد', 'trouvé')} {money(c.actual)}
                    {r && ` · ${t(r[1], r[2])}`}
                    {c.note && ` · ${c.note}`}
                  </p>
                )
              })}
              {status.blind ? (
                <p className="py-1 text-xs text-muted">{t('اكتب ما عددته فعلاً. سيظهر المتوقع بعد التأكيد.', 'Saisissez ce que vous avez compté.')}</p>
              ) : (
                <>
                  <Line label={t('مبيعات نقداً', 'Ventes en espèces')} hint={`(${tot.sales_count})`} amount={tot.sales_cash} signed />
                  {moves.map(([k, ar, fr]) => (
                    <Line key={k} label={t(ar, fr)} hint={`(${tot.movements[k].count})`} amount={tot.movements[k].amount} signed />
                  ))}
                  {(rin ?? 0) > 0 && <Line label={t('دخل رياض', 'Entrées Riyad')} amount={rin ?? 0} signed />}
                  {(rout ?? 0) > 0 && <Line label={t('خرج رياض', 'Sorties Riyad')} amount={-(rout ?? 0)} signed />}
                  {cashExpected !== undefined && <Line label={t('= المتوقع الآن في الدرج والخزنة', '= Attendu tiroir + coffre')} amount={cashExpected} total />}
                </>
              )}
            </div>
            <Field label={t('مجموع ما عددته (الدرج + الخزنة)', 'Total compté (tiroir + coffre)')} required>
              <MoneyInput value={counted} onChange={setCounted} />
            </Field>
            {!status.blind && cashExpected !== undefined && <Gap value={counted} expected={cashExpected} />}
          </Card>

          {/* 3 · Card terminal */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <CreditCard className="size-4 text-info" />
              {t('3. البطاقة البنكية', '3. Carte bancaire')}
            </div>
            <div className="rounded-xl bg-surface-2/60 px-3 py-1.5">
              <Line label={t('مبيعات بالبطاقة', 'Ventes par carte')} amount={tot.sales_card} />
              {(tot.card_debts ?? 0) > 0 && <Line label={t('ديون سُدّدت بالبطاقة', 'Dettes payées par carte')} amount={tot.card_debts!} signed />}
              {(tot.card_refunds ?? 0) > 0 && <Line label={t('إرجاعات على البطاقة', 'Remboursements carte')} amount={-tot.card_refunds!} signed />}
              <Line label={t('= المتوقع في جهاز الأداء', '= Attendu au TPE')} amount={cardExpected} total />
            </div>
            <Field label={t('مجموع تذكرة جهاز الأداء (TPE)', 'Total du ticket TPE')} hint={t('اختياري: من تذكرة إغلاق اليوم في الجهاز', 'Optionnel : ticket de clôture du TPE')}>
              <MoneyInput value={tpe} onChange={setTpe} />
            </Field>
            <Gap value={tpe} expected={cardExpected} />
          </Card>

          {/* debts of the shift, for information */}
          {(tot.sales_credit > 0 || (tot.movements.riyad_credit?.amount ?? 0) !== 0 || (tot.movements.debt_payment?.amount ?? 0) !== 0 || (tot.card_debts ?? 0) > 0) && (
            <div className="rounded-xl border border-border px-3 py-1.5">
              <div className="pt-1 text-xs font-semibold text-muted">{t('الديون خلال الوردية (للاطلاع)', 'Crédits de la caisse (info)')}</div>
              {tot.sales_credit > 0 && <Line label={t('بيع بالدين', 'Ventes à crédit')} amount={tot.sales_credit} tone="muted" />}
              {(tot.movements.riyad_credit?.amount ?? 0) !== 0 && <Line label={t('رياض بالدين', 'Riyad à crédit')} amount={-tot.movements.riyad_credit.amount} tone="muted" />}
              {(tot.movements.debt_payment?.amount ?? 0) !== 0 && <Line label={t('سُدّد نقداً', 'Payé en espèces')} amount={tot.movements.debt_payment.amount} tone="muted" />}
              {(tot.card_debts ?? 0) > 0 && <Line label={t('سُدّد بالبطاقة', 'Payé par carte')} amount={tot.card_debts!} tone="muted" />}
            </div>
          )}

          {/* 4 · What leaves and what stays */}
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Store className="size-4 text-navy dark:text-white" />
              {t('4. ما يُسلَّم وما يبقى', '4. Remise et reste')}
            </div>
            {can('cash.owner_withdrawal') && (
              <Field label={t('المبلغ الذي سيُسلَّم للمالك / البنك الآن', 'Montant remis au propriétaire')} hint={t('يُخصم من الخزنة', 'Déduit du coffre')}>
                <MoneyInput value={handed} onChange={setHanded} />
              </Field>
            )}
            {left !== null && left >= 0 ? (
              <div className="rounded-xl bg-surface-2/60 px-3 py-1.5">
                <Line label={t('يبقى في الدرج', 'Reste au tiroir')} hint={`(${t('كان', 'était')} ${money(sh.opening_float)})`} amount={Math.min(float, left)} />
                <Line label={t('يوضع في الخزنة', 'Au coffre')} hint={`(${t('كانت', 'était')} ${money(sh.opening_safe ?? 0)})`} amount={left - Math.min(float, left)} />
              </div>
            ) : (
              <p className="text-xs text-muted">{t('يظهر هنا ما يبقى في الدرج والخزنة بعد أن تكتب ما عددته.', 'Le reste s’affiche après le comptage.')}</p>
            )}
            {left !== null && left < 0 && <p className="text-xs text-danger">{t('المبلغ المُسلَّم أكبر من النقود المعدودة.', 'Remise supérieure au compté.')}</p>}
          </Card>

          <Field label={t('ملاحظات', 'Notes')}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Button size="lg" className="w-full" onClick={submit} loading={busy} disabled={counted === null || (left !== null && left < 0)}>
            <Lock />
            {t('تأكيد الإغلاق', 'Valider la clôture')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={cn('rounded-2xl p-5 text-center', result.difference === 0 ? 'bg-success/10' : Math.abs(result.difference) < 1000 ? 'bg-warning/10' : 'bg-danger/10')}>
            {result.difference === 0 ? <CheckCircle2 className="mx-auto size-10 text-success" /> : <Receipt className="mx-auto size-10 text-warning" />}
            <div className="mt-2 text-sm text-muted">{result.difference === 0 ? t('الصندوق مضبوط تماماً 👌', 'Caisse juste 👌') : result.difference > 0 ? t('زيادة في الصندوق', 'Excédent') : t('نقص في الصندوق', 'Manquant')}</div>
            <div className={cn('num text-3xl font-extrabold', result.difference === 0 ? 'text-success' : result.difference > 0 ? 'text-info' : 'text-danger')}>
              {result.difference > 0 ? '+' : ''}
              {money(result.difference)}
            </div>
          </motion.div>
          {result.drawer !== undefined && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border-2 border-brand bg-brand-50 p-4 text-center">
                <div className="text-sm text-muted">{t('اتركي في الدرج', 'Laissez dans le tiroir')}</div>
                <div className="num text-2xl font-extrabold text-brand">{money(result.drawer)}</div>
              </div>
              <div className="rounded-2xl border-2 border-navy bg-surface-2 p-4 text-center">
                <div className="text-sm text-muted">{t('يوضع في الخزنة', 'Mettez au coffre')}</div>
                <div className="num text-2xl font-extrabold">{money(result.safe ?? 0)}</div>
              </div>
              {(result.drawer ?? 0) < (result.float ?? 0) && <p className="col-span-2 text-xs text-danger">{t('النقود أقل من مبلغ الدرج الثابت، أخبري المالك.', 'Moins que le fond de caisse : prévenez le propriétaire.')}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Stat label={t('المتوقع', 'Attendu')} value={money(result.expected)} />
            <Stat label={t('المعدود', 'Compté')} value={money(result.counted)} />
            <Stat label={t('المبيعات', 'Ventes')} value={money(result.totals.sales_total)} />
            <Stat label={t('رسوم رياض', 'Frais Riyad')} value={money(result.totals.riyad_fees)} />
            {result.card_terminal != null && (
              <Stat
                label={t('جهاز البطاقة', 'TPE')}
                value={money(result.card_terminal)}
                hint={result.card_terminal !== result.card_expected ? `${t('فرق', 'Écart')}: ${money(result.card_terminal - (result.card_expected ?? 0))}` : '✓'}
              />
            )}
            {can('riyad.view_balance') && <Stat label={t('رصيد رياض المتوقع', 'Solde Riyad attendu')} value={money(result.riyad_expected)} />}
            {can('riyad.view_balance') && result.riyad_reported !== null && <Stat label={t('رصيد رياض المُبلغ عنه', 'Solde Riyad déclaré')} value={money(result.riyad_reported)} hint={result.riyad_reported !== result.riyad_expected ? `${t('فرق', 'Écart')}: ${money(result.riyad_reported - result.riyad_expected)}` : '✓'} />}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setPrinting(true)}>
              <Printer />
              {t('طباعة التقرير', 'Imprimer')}
            </Button>
            <Button onClick={finish}>{t('إنهاء', 'Terminer')}</Button>
          </div>
          {printing && <ShiftPrint status={status} result={result} riyad={{ in: rin ?? 0, out: rout ?? 0 }} onDone={() => setPrinting(false)} />}
        </div>
      )}
    </Dialog>
  )
}

/** Paper report: the same statement as the closing screen. */
function ShiftPrint({ status, result, riyad, onDone }: { status: Extract<ShiftStatus, { open: true }>; result: CloseResult; riyad: { in: number; out: number }; onDone: () => void }) {
  const { t } = useLang()
  const { can } = useAuth()
  const tot = result.totals
  const sh = status.shift
  type Row = [string, number] | null
  const section = (title: string, rows: Row[]) => ({ title, rows: rows.filter(Boolean) as [string, number][] })
  const sections = [
    section(t('النقود', 'Espèces'), [
      [t('الدرج في البداية', 'Tiroir début'), sh.opening_float],
      [t('الخزنة في البداية', 'Coffre début'), sh.opening_safe ?? 0],
      [t('مبيعات نقداً', 'Ventes espèces'), tot.sales_cash],
      ...MOVEMENTS.filter(([k]) => (tot.movements[k]?.amount ?? 0) !== 0).map(([k, ar, fr]) => [t(ar, fr), tot.movements[k].amount] as Row),
      riyad.in ? [t('دخل رياض', 'Entrées Riyad'), riyad.in] : null,
      riyad.out ? [t('خرج رياض', 'Sorties Riyad'), -riyad.out] : null,
      [t('المتوقع', 'Attendu'), result.expected],
      [t('المعدود', 'Compté'), result.counted],
      [t('الفرق', 'Écart'), result.difference],
    ]),
    section(t('رياض', 'Riyad'), [
      can('riyad.view_balance') && tot.opening_riyad != null ? [t('رصيد البداية', 'Solde début'), tot.opening_riyad] : null,
      can('riyad.view_balance') && (tot.riyad_owner_effect ?? 0) !== 0 ? [t('عمليات المالك', 'Opérations propriétaire'), tot.riyad_owner_effect!] : null,
      [t('دخل الصندوق', 'Entrées'), riyad.in],
      [t('خرج من الصندوق', 'Sorties'), riyad.out],
      can('riyad.view_balance') ? [t('الرصيد المتوقع', 'Solde attendu'), result.riyad_expected] : null,
      result.riyad_reported !== null ? [t('الرصيد في المنصة', 'Solde plateforme'), result.riyad_reported] : null,
      [t('رسوم رياض', 'Frais Riyad'), tot.riyad_fees],
    ]),
    section(t('البطاقة', 'Carte'), [
      [t('مبيعات بالبطاقة', 'Ventes carte'), tot.sales_card],
      (tot.card_debts ?? 0) > 0 ? [t('ديون بالبطاقة', 'Dettes carte'), tot.card_debts!] : null,
      (tot.card_refunds ?? 0) > 0 ? [t('إرجاعات بالبطاقة', 'Remb. carte'), -tot.card_refunds!] : null,
      [t('المتوقع في الجهاز', 'Attendu TPE'), result.card_expected ?? tot.sales_card],
      result.card_terminal != null ? [t('تذكرة الجهاز', 'Ticket TPE'), result.card_terminal] : null,
    ]),
    section(t('المجموع', 'Total'), [
      [t('المبيعات', 'Ventes'), tot.sales_total],
      tot.sales_credit ? [t('بالدين', 'Crédit'), tot.sales_credit] : null,
      result.handed_over ? [t('سُلّم للمالك', 'Remis au propriétaire'), result.handed_over] : null,
      result.drawer !== undefined ? [t('تُرك في الدرج', 'Laissé au tiroir'), result.drawer] : null,
      result.drawer !== undefined ? [t('في الخزنة', 'Au coffre'), result.safe ?? 0] : null,
    ]),
  ]
  return (
    <PrintArea onDone={onDone}>
      <div style={{ width: '100%', fontSize: 12, color: '#000', direction: 'rtl' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{t('تقرير الوردية', 'Rapport de caisse')}</div>
        <div style={{ textAlign: 'center' }}>
          #{sh.number} · {status.employee_name}
        </div>
        <div style={{ textAlign: 'center' }}>{format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
        {sections.map((sec) => (
          <div key={sec.title}>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0 2px', paddingTop: 4, fontWeight: 700 }}>{sec.title}</div>
            {sec.rows.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{k}</span>
                <span style={{ direction: 'ltr' }}>{money(v)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PrintArea>
  )
}

/** 23 · Read the three Riyad numbers from a photo / screenshot of the platform. */
function RiyadPhotoButton({ onRead }: { onRead: (r: RiyadRead) => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const run = async (f?: File | null) => {
    if (!f) return
    setBusy(true)
    try {
      const r = await readRiyad(sb, f)
      if (!r.readable || (r.total_in === null && r.total_out === null && r.balance === null)) {
        toast.error(t('لم نستطع قراءة الأرقام من الصورة. اكتبها يدوياً.', 'Chiffres illisibles, saisissez-les.'))
      } else {
        onRead(r)
        toast.success(t('تمت قراءة الأرقام ✨ راجعها قبل الإغلاق', 'Chiffres lus ✨ vérifiez-les'))
      }
      if (r.notes) toast.info(r.notes)
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" className="ms-auto" onClick={() => ref.current?.click()} loading={busy}>
        <Camera />
        {t('قراءة من صورة ✨', 'Lire une photo ✨')}
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (run(e.target.files?.[0]), (e.target.value = ''))} />
    </>
  )
}
