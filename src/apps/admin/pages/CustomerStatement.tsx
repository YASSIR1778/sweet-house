import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, HandCoins, MessageCircle, Printer, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import type { Customer } from '@/shared/lib/types'
import { cn, fillTemplate, whatsappLink } from '@/shared/lib/utils'
import { Badge, Button, Card, Field, Input, Spinner, SwitchRow } from '@/shared/ui/primitives'
import { Dialog, Sheet } from '@/shared/ui/overlay'
import { EmptyState } from '@/shared/ui/data'
import { MoneyInput } from '@/shared/ui/pickers'
import { PrintArea } from '@/shared/ui/receipt'

type Statement = {
  customer: Customer
  balance: number
  entries: { id: string; type: string; amount: number; method: string | null; note: string | null; created_at: string; sale_number: string | null; employee_name: string | null }[]
}

const TYPES: Record<string, [string, string]> = {
  sale_credit: ['بيع بالدين', 'Vente à crédit'],
  riyad_credit: ['رياض بالدين', 'Riyad à crédit'],
  manual_charge: ['دين مضاف', 'Crédit ajouté'],
  payment: ['تسديد', 'Paiement'],
  adjustment: ['تعديل / إرجاع', 'Ajustement / retour'],
}

export const DEFAULT_DEBT_REMINDER = 'مرحباً {name} 👋\nنذكّركم بأن الرصيد المتبقي في حسابكم لدى مكتبة سويت هاوس هو {amount}.\nشكراً لثقتكم 🌟'

export function CustomerStatement({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { sb, can } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [mode, setMode] = useState<null | 'pay' | 'adjust'>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<'transfer' | 'card'>('transfer')
  const [note, setNote] = useState('')
  const [decrease, setDecrease] = useState(false)
  const [busy, setBusy] = useState(false)
  const [printing, setPrinting] = useState(false)

  const st = useQuery({
    queryKey: ['statement', customer?.id],
    enabled: !!customer,
    queryFn: async () => (await sb.rpc('customer_statement', { p_customer: customer!.id })).data as Statement,
  })
  const tpl = useQuery({
    queryKey: ['settings', 'whatsapp'],
    queryFn: async () => (await sb.from('settings').select('value').eq('key', 'whatsapp').single()).data?.value as { templates?: Record<string, string> },
  })

  const submit = async () => {
    if (!customer || !amount) return
    setBusy(true)
    const { error } =
      mode === 'pay'
        ? await sb.rpc('pay_debt', { p_device: null, p_customer: customer.id, p_amount: amount, p_method: method, p_note: note || null })
        : await sb.rpc('adjust_debt', { p_customer: customer.id, p_amount: decrease ? -amount : amount, p_note: note })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم التسجيل', 'Enregistré'))
    setMode(null)
    setAmount(null)
    setNote('')
    qc.invalidateQueries({ queryKey: ['statement', customer.id] })
    qc.invalidateQueries({ queryKey: ['customer-balances'] })
  }

  const s = st.data
  const reminder = s ? fillTemplate(tpl.data?.templates?.debt_reminder || DEFAULT_DEBT_REMINDER, { name: s.customer.full_name, amount: money(s.balance) }) : ''

  const exportCsv = () =>
    s &&
    downloadCsv(
      `releve-${s.customer.full_name}`,
      ['Date', 'Type', 'Ticket', 'Montant', 'Note'],
      s.entries.map((e) => [format(new Date(e.created_at), 'dd/MM/yyyy HH:mm'), t(...(TYPES[e.type] ?? [e.type, e.type])), e.sale_number, csvMoney(e.amount), e.note]),
    )

  return (
    <>
      <Sheet open={!!customer} onOpenChange={(o) => !o && onClose()} title={t('كشف الحساب', 'Relevé de compte')} description={customer?.full_name} width="max-w-2xl">
        {!s ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-5">
            <div className={cn('rounded-2xl p-6 text-center', s.balance > 0 ? 'bg-danger/10' : 'bg-success/10')}>
              <div className="text-sm text-muted">{s.balance > 0 ? t('الدين المتبقي', 'Reste dû') : t('لا يوجد دين', 'Aucune dette')}</div>
              <div className={cn('num mt-1 text-4xl font-extrabold', s.balance > 0 ? 'text-danger' : 'text-success')}>{money(s.balance)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('debts.collect') && s.balance > 0 && (
                <Button onClick={() => (setMode('pay'), setAmount(s.balance))}>
                  <HandCoins />
                  {t('تسجيل تسديد', 'Encaisser')}
                </Button>
              )}
              {can('customers.manage') && (
                <Button variant="outline" onClick={() => setMode('adjust')}>
                  <Scale />
                  {t('تعديل الدين', 'Ajuster')}
                </Button>
              )}
              {can('debts.remind') && s.balance > 0 && s.customer.phone && (
                <Button asChild variant="success">
                  <a href={whatsappLink(s.customer.phone, reminder)} target="_blank" rel="noreferrer">
                    <MessageCircle />
                    {t('تذكير واتساب', 'Rappel WhatsApp')}
                  </a>
                </Button>
              )}
              <Button variant="ghost" onClick={() => setPrinting(true)}>
                <Printer />
              </Button>
              <Button variant="ghost" onClick={exportCsv}>
                <Download />
              </Button>
            </div>
            {!s.entries.length ? (
              <EmptyState title={t('لا توجد عمليات', 'Aucune opération')} />
            ) : (
              <Card className="divide-y divide-border">
                {s.entries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <Badge tone={e.amount > 0 ? 'danger' : 'success'}>{t(...(TYPES[e.type] ?? [e.type, e.type]))}</Badge>
                    <div className="min-w-0 flex-1">
                      <div className="truncate">
                        {e.sale_number && <span className="num font-medium">{e.sale_number} </span>}
                        <span className="text-muted">{e.note}</span>
                      </div>
                      <div className="num text-xs text-subtle">
                        {format(new Date(e.created_at), 'dd/MM/yyyy HH:mm')} {e.employee_name && `· ${e.employee_name}`}
                      </div>
                    </div>
                    <span className={cn('num font-semibold', e.amount > 0 ? 'text-danger' : 'text-success')}>
                      {e.amount > 0 ? '+' : ''}
                      {money(e.amount)}
                    </span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        )}
      </Sheet>

      <Dialog open={!!mode} onOpenChange={(o) => !o && setMode(null)} size="sm" title={mode === 'pay' ? t('تسجيل تسديد', 'Encaissement') : t('تعديل الدين', 'Ajustement')}>
        <div className="space-y-4">
          <Field label={t('المبلغ', 'Montant')}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          {mode === 'pay' ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={method === 'transfer' ? 'navy' : 'outline'} onClick={() => setMethod('transfer')}>
                  {t('تحويل بنكي', 'Virement')}
                </Button>
                <Button variant={method === 'card' ? 'navy' : 'outline'} onClick={() => setMethod('card')}>
                  {t('بطاقة', 'Carte')}
                </Button>
              </div>
              <p className="text-xs text-muted">{t('التسديد نقداً يتم من نقطة البيع حتى يدخل الصندوق.', 'Les paiements en espèces se font au POS.')}</p>
            </>
          ) : (
            <SwitchRow label={t('إنقاص الدين (تخفيض أو مسامحة)', 'Diminuer (remise)')} description={t('وإلا فسيُضاف المبلغ إلى الدين، مثلاً دين قديم', 'Sinon le montant est ajouté (ancienne dette)')} checked={decrease} onCheckedChange={setDecrease} />
          )}
          <Field label={t('ملاحظة', 'Note')} required={mode === 'adjust'}>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <Button className="w-full" onClick={submit} loading={busy} disabled={!amount || (mode === 'adjust' && !note.trim())}>
            {t('تسجيل', 'Enregistrer')}
          </Button>
        </div>
      </Dialog>

      {printing && s && (
        <PrintArea onDone={() => setPrinting(false)}>
          <div style={{ width: '100%', fontSize: 12, color: '#000', direction: 'rtl' }}>
            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>كشف الحساب</div>
            <div style={{ textAlign: 'center' }}>{s.customer.full_name}</div>
            <div style={{ textAlign: 'center' }}>{format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            {s.entries.slice(0, 40).map((e) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>
                  {format(new Date(e.created_at), 'dd/MM')} {TYPES[e.type]?.[0]}
                </span>
                <span style={{ direction: 'ltr' }}>{money(e.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 15 }}>
              <span>الباقي</span>
              <span style={{ direction: 'ltr' }}>{money(s.balance)}</span>
            </div>
          </div>
        </PrintArea>
      )}
    </>
  )
}
