import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Delete, Phone, Plus, Search, UserPlus, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, parseMoney } from '@/shared/lib/money'
import { cn, normalizePhone } from '@/shared/lib/utils'
import type { Customer } from '@/shared/lib/types'
import { Avatar, Button, Field, Input, Kbd } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import type { PosPack, PosProduct, PosService, PosVariant } from './catalog'
import { servicePrice } from './catalog'

// ---------------------------------------------------------------- Numeric keypad
export function Keypad({ value, onChange, decimals = true }: { value: string; onChange: (v: string) => void; decimals?: boolean }) {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', decimals ? '.' : '', '0', 'del']
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {keys.map((k, i) =>
        !k ? (
          <div key={i} />
        ) : (
          <button
            key={k}
            type="button"
            onClick={() => (k === 'del' ? onChange(value.slice(0, -1)) : k === '.' && value.includes('.') ? null : onChange(value + k))}
            className="num flex h-14 items-center justify-center rounded-xl border border-border bg-surface text-xl font-medium transition-colors hover:bg-surface-2 active:scale-95"
          >
            {k === 'del' ? <Delete className="size-5" /> : k}
          </button>
        ),
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Amount (open-price services, e.g. Riyad fees)
export function AmountDialog({ service, onClose, onConfirm }: { service: PosService | null; onClose: () => void; onConfirm: (cents: number) => void }) {
  const { t, pick } = useLang()
  const [v, setV] = useState('')
  useEffect(() => setV(''), [service])
  const cents = parseMoney(v) ?? 0
  const submit = () => cents > 0 && (onConfirm(cents), onClose())
  return (
    <Dialog open={!!service} onOpenChange={(o) => !o && onClose()} size="sm" title={service ? pick(service, 'name') : ''} description={t('أدخل المبلغ', 'Saisissez le montant')}>
      <form onSubmit={(e) => (e.preventDefault(), submit())} className="space-y-4">
        <div className="relative">
          <Input autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className="num h-16 pe-14 text-center text-3xl font-bold" dir="ltr" />
          <span className="absolute inset-y-0 end-4 flex items-center text-muted">DH</span>
        </div>
        <Keypad value={v} onChange={setV} />
        <Button type="submit" size="lg" className="w-full" disabled={cents <= 0}>
          {t('إضافة', 'Ajouter')} {cents > 0 && money(cents)}
        </Button>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Quantity (tiered services / edit qty)
export function QtyDialog({
  open,
  title,
  initial,
  service,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  initial: number
  service?: PosService | null
  onClose: () => void
  onConfirm: (q: number) => void
}) {
  const { t, pick } = useLang()
  const [v, setV] = useState('')
  useEffect(() => setV(open ? String(initial) : ''), [open, initial])
  const q = Number(v.replace(',', '.'))
  const valid = Number.isFinite(q) && q > 0
  const unit = service && valid ? servicePrice(service, q) : null
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={title} description={service ? t('عدد', 'Nombre de') + ' ' + (pick(service, 'unit') || t('الوحدات', 'unités')) : t('الكمية', 'Quantité')}>
      <form onSubmit={(e) => (e.preventDefault(), valid && (onConfirm(q), onClose()))} className="space-y-4">
        <Input autoFocus value={v} onFocus={(e) => e.target.select()} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className="num h-16 text-center text-3xl font-bold" dir="ltr" />
        {service?.pricing_mode === 'tiered' && service.tiers.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className={cn('num rounded-full px-2.5 py-1', unit === service.price ? 'bg-brand text-white' : 'bg-surface-2')}>1+ → {money(service.price)}</span>
            {service.tiers.map((tr) => (
              <span key={tr.min_qty} className={cn('num rounded-full px-2.5 py-1', unit === tr.unit_price && q >= tr.min_qty ? 'bg-brand text-white' : 'bg-surface-2')}>
                {tr.min_qty}+ → {money(tr.unit_price)}
              </span>
            ))}
          </div>
        )}
        <Keypad value={v} onChange={setV} />
        <Button type="submit" size="lg" className="w-full" disabled={!valid}>
          {t('تأكيد', 'Valider')}
          {unit !== null && valid && <span className="num opacity-80">· {money(Math.round(unit * q))}</span>}
        </Button>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Variant / pack chooser
export function VariantDialog({
  product,
  onClose,
  onPick,
}: {
  product: PosProduct | null
  onClose: () => void
  onPick: (v: PosVariant, pack: PosPack | null) => void
}) {
  const { t, pick } = useLang()
  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()} size="lg" title={product ? pick(product, 'name') : ''} description={t('اختر النوع أو العلبة', 'Choisissez la variante ou le conditionnement')}>
      <div className="grid gap-3 sm:grid-cols-2">
        {product?.variants.flatMap((v) => [
          <button key={v.id} onClick={() => (onPick(v, null), onClose())} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4 text-start transition-all hover:border-brand hover:bg-brand-50">
            <div>
              <div className="font-semibold">{pick(v, 'name') || t('الوحدة', 'Unité')}</div>
              <div className="num text-xs text-muted">
                {t('المخزون', 'Stock')}: {v.stock_qty}
              </div>
            </div>
            <div className="num text-lg font-bold text-brand">{money(v.price)}</div>
          </button>,
          ...v.packs.map((k) => (
            <button key={k.id} onClick={() => (onPick(v, k), onClose())} className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4 text-start transition-all hover:border-brand hover:bg-brand-50">
              <div>
                <div className="font-semibold">
                  {pick(v, 'name') ? `${pick(v, 'name')} · ` : ''}
                  {pick(k, 'name')}
                </div>
                <div className="num text-xs text-muted">× {k.factor}</div>
              </div>
              <div className="num text-lg font-bold text-brand">{money(k.price)}</div>
            </button>
          )),
        ])}
      </div>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Payment
export function PayDialog({
  open,
  total,
  mode,
  quickCash,
  onClose,
  onPay,
  busy,
}: {
  open: boolean
  total: number
  mode: 'cash' | 'card'
  quickCash: number[]
  onClose: () => void
  onPay: (p: { cash: number; card: number }) => void
  busy: boolean
}) {
  const { t } = useLang()
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed'>(mode)
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')

  useEffect(() => {
    if (!open) return
    setMethod(mode)
    setCash('')
    setCard(mode === 'card' ? String(total / 100) : '')
  }, [open, mode, total])

  const cashC = parseMoney(cash) ?? 0
  const cardC = method === 'cash' ? 0 : method === 'card' ? total : (parseMoney(card) ?? 0)
  const effectiveCash = method === 'card' ? 0 : cash === '' && method === 'cash' ? total : cashC
  const paid = effectiveCash + cardC
  const change = paid - total
  const ok = paid >= total && cardC <= total

  const suggestions = useMemo(() => {
    const s = new Set<number>([total])
    for (const q of quickCash) if (q >= total) s.add(q)
    const round = (step: number) => Math.ceil(total / step) * step
    ;[1000, 5000, 10000].forEach((st) => s.add(round(st)))
    return [...s].filter((x) => x >= total).sort((a, b) => a - b).slice(0, 5)
  }, [total, quickCash])

  const submit = () => ok && !busy && onPay({ cash: effectiveCash, card: cardC })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md" title={t('الأداء', 'Paiement')}>
      <form onSubmit={(e) => (e.preventDefault(), submit())} className="space-y-5">
        <div className="rounded-2xl bg-navy p-5 text-center text-white">
          <div className="text-sm text-white/60">{t('المبلغ المطلوب', 'Montant à payer')}</div>
          <div className="num mt-1 text-4xl font-bold">{money(total)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['cash', t('نقداً', 'Espèces'), <Banknote key="c" />, 'F2'],
              ['card', t('بطاقة', 'Carte'), <CreditCard key="b" />, 'F3'],
              ['mixed', t('مختلط', 'Mixte'), <Plus key="m" />, ''],
            ] as const
          ).map(([m, label, icon, kbd]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={cn('flex flex-col items-center gap-1.5 rounded-xl border-2 p-3 text-sm font-medium transition-all [&_svg]:size-5', method === m ? 'border-brand bg-brand-50 text-brand' : 'border-border hover:bg-surface-2')}
            >
              {icon}
              {label}
              {kbd && <Kbd>{kbd}</Kbd>}
            </button>
          ))}
        </div>

        {method !== 'card' && (
          <div className="space-y-3">
            <Field label={method === 'mixed' ? t('المبلغ نقداً', 'Montant espèces') : t('المبلغ المستلم', 'Montant reçu')}>
              <div className="relative">
                <Input autoFocus value={cash} placeholder={method === 'cash' ? String(total / 100) : '0'} onChange={(e) => setCash(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className="num h-14 pe-12 text-center text-2xl font-bold" dir="ltr" />
                <span className="absolute inset-y-0 end-4 flex items-center text-muted">DH</span>
              </div>
            </Field>
            {method === 'cash' && (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => setCash(String(s / 100))} className="num rounded-lg border border-border bg-surface px-3.5 py-2 text-sm font-semibold transition-colors hover:border-brand hover:text-brand">
                    {money(s, { short: true })}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {method === 'mixed' && (
          <Field label={t('المبلغ بالبطاقة', 'Montant carte')}>
            <Input value={card} onChange={(e) => setCard(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" className="num h-12 text-center text-xl font-bold" dir="ltr" />
          </Field>
        )}

        <div className={cn('flex items-center justify-between rounded-xl p-4 transition-colors', change > 0 ? 'bg-success/10' : change < 0 ? 'bg-danger/10' : 'bg-surface-2')}>
          <span className="font-medium">{change < 0 ? t('المتبقي', 'Reste à payer') : t('الباقي للزبون', 'À rendre')}</span>
          <span className={cn('num text-2xl font-bold', change > 0 ? 'text-success' : change < 0 ? 'text-danger' : '')}>{money(Math.abs(change))}</span>
        </div>

        <Button type="submit" size="xl" className="w-full" disabled={!ok} loading={busy}>
          {t('تأكيد الأداء', 'Valider le paiement')}
          <Kbd>Enter</Kbd>
        </Button>
      </form>
    </Dialog>
  )
}

// ---------------------------------------------------------------- Customer picker
export function CustomerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (c: { id: string; full_name: string; phone: string | null } | null) => void
}) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (open) (setQ(''), setCreating(false), setName(''), setPhone(''))
  }, [open])

  const customers = useQuery({
    queryKey: ['pos-customers'],
    enabled: open,
    queryFn: async () => (await sb.from('customers').select('id, full_name, phone, company_name').is('deleted_at', null).order('full_name').limit(1000)).data as Pick<Customer, 'id' | 'full_name' | 'phone' | 'company_name'>[],
  })
  const list = (customers.data ?? []).filter((c) => !q || c.full_name.toLowerCase().includes(q.toLowerCase()) || c.phone?.includes(normalizePhone(q) || q)).slice(0, 30)

  const create = async () => {
    const { data, error } = await sb.from('customers').insert({ full_name: name.trim(), phone: phone ? normalizePhone(phone) : null }).select('id, full_name, phone').single()
    if (error) return toast.error(error.code === '23505' ? t('رقم الهاتف موجود مسبقاً', 'Numéro déjà existant') : errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['pos-customers'] })
    onPick(data)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md" title={t('اختيار الزبون', 'Choisir le client')}>
      {creating ? (
        <div className="space-y-4">
          <Field label={t('الاسم', 'Nom')} required>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t('الهاتف', 'Téléphone')}>
            <Input icon={<Phone />} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" placeholder="06…" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreating(false)}>
              {t('رجوع', 'Retour')}
            </Button>
            <Button onClick={create} disabled={!name.trim()}>
              <UserPlus />
              {t('إضافة واختيار', 'Ajouter et choisir')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Input autoFocus icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('الاسم أو الهاتف…', 'Nom ou téléphone…')} />
            </div>
            <Button variant="soft" onClick={() => (setCreating(true), setName(/\d/.test(q) ? '' : q), setPhone(/\d/.test(q) ? q : ''))}>
              <UserPlus />
              {t('جديد', 'Nouveau')}
            </Button>
          </div>
          <div className="max-h-80 space-y-1 overflow-y-auto">
            <button onClick={() => (onPick(null), onClose())} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-start text-sm text-muted hover:bg-surface-2">
              <X className="size-4" />
              {t('بدون زبون', 'Sans client')}
            </button>
            {list.map((c) => (
              <button key={c.id} onClick={() => (onPick(c), onClose())} className="flex w-full items-center gap-3 rounded-xl p-2.5 text-start hover:bg-surface-2">
                <Avatar name={c.full_name} color="#475569" size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.full_name}</div>
                  <div className="num text-xs text-muted" dir="ltr">
                    {c.phone ? `+${c.phone}` : ''} {c.company_name ? `· ${c.company_name}` : ''}
                  </div>
                </div>
                <UserRound className="size-4 text-subtle" />
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}
