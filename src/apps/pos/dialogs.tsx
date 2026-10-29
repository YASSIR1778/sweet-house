import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, CreditCard, Delete, Package, Phone, Plus, Search, UserPlus, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, parseMoney } from '@/shared/lib/money'
import { cn, normalizePhone, normalizeSearch } from '@/shared/lib/utils'
import type { Customer } from '@/shared/lib/types'
import { Avatar, Button, Field, Input, Kbd } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { DynamicIcon } from '@/shared/ui/icon'
import type { Catalog, PosPack, PosProduct, PosService, PosVariant } from './catalog'
import { servicePrice } from './catalog'
import { createProduct } from './products'

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
  customer,
  allowCredit,
  onPickCustomer,
}: {
  open: boolean
  total: number
  mode: 'cash' | 'card'
  quickCash: number[]
  onClose: () => void
  onPay: (p: { cash: number; card: number; credit: number; promo?: string }) => void
  busy: boolean
  customer: { id: string; full_name: string } | null
  allowCredit: boolean
  onPickCustomer: () => void
}) {
  const { t } = useLang()
  const [method, setMethod] = useState<'cash' | 'card' | 'mixed' | 'credit'>(mode)
  const [cash, setCash] = useState('')
  const [card, setCard] = useState('')
  const [promo, setPromo] = useState('')
  const [promoInfo, setPromoInfo] = useState<{ code: string; label: string | null; discount_pct: number } | null | 'bad'>(null)
  const { sb } = useAuth()

  useEffect(() => {
    const c = promo.trim().toUpperCase()
    if (c.length < 3) return setPromoInfo(null)
    const id = setTimeout(async () => {
      const { data } = await sb.rpc('promo_lookup', { p_code: c })
      setPromoInfo((data as { code: string; label: string | null; discount_pct: number } | null) ?? 'bad')
    }, 400)
    return () => clearTimeout(id)
  }, [promo, sb])

  useEffect(() => {
    if (!open) return
    setPromo('')
    setMethod(mode)
    setCash('')
    setCard(mode === 'card' ? String(total / 100) : '')
  }, [open, mode, total])

  const cashC = parseMoney(cash) ?? 0
  const cardC = method === 'cash' || method === 'credit' ? 0 : method === 'card' ? total : (parseMoney(card) ?? 0)
  const effectiveCash = method === 'card' ? 0 : cash === '' && method === 'cash' ? total : cashC
  const creditC = method === 'credit' ? Math.max(0, total - effectiveCash) : 0
  const paid = effectiveCash + cardC + creditC
  const change = paid - total
  const ok = paid >= total && cardC <= total && (method !== 'credit' || !!customer)

  const suggestions = useMemo(() => {
    const s = new Set<number>([total])
    for (const q of quickCash) if (q >= total) s.add(q)
    const round = (step: number) => Math.ceil(total / step) * step
    ;[1000, 5000, 10000].forEach((st) => s.add(round(st)))
    return [...s].filter((x) => x >= total).sort((a, b) => a - b).slice(0, 5)
  }, [total, quickCash])

  const submit = () => ok && !busy && onPay({ cash: effectiveCash, card: cardC, credit: creditC, promo: promoInfo && promoInfo !== 'bad' ? promoInfo.code : undefined })

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md" title={t('الأداء', 'Paiement')}>
      <form onSubmit={(e) => (e.preventDefault(), submit())} className="space-y-5">
        <div className="rounded-2xl bg-navy p-5 text-center text-white">
          <div className="text-sm text-white/60">{t('المبلغ المطلوب', 'Montant à payer')}</div>
          <div className="num mt-1 text-4xl font-bold">{money(total)}</div>
        </div>
        <div className={cn('grid gap-2', allowCredit ? 'grid-cols-4' : 'grid-cols-3')}>
          {(
            [
              ['cash', t('نقداً', 'Espèces'), <Banknote key="c" />, 'F2'],
              ['card', t('بطاقة', 'Carte'), <CreditCard key="b" />, 'F3'],
              ['mixed', t('مختلط', 'Mixte'), <Plus key="m" />, ''],
              ...(allowCredit ? ([['credit', t('بالدَّين', 'Crédit'), <UserRound key="d" />, '']] as const) : []),
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
            {method === 'credit' && (
              <button type="button" onClick={onPickCustomer} className={cn('flex w-full items-center gap-2 rounded-xl border p-3 text-start text-sm', customer ? 'border-brand bg-brand-50' : 'border-danger/40 bg-danger/5 text-danger')}>
                <UserRound className="size-4" />
                {customer ? customer.full_name : t('يجب اختيار الزبون للبيع بالدين (F4)', 'Choisissez le client (F4)')}
              </button>
            )}
            <Field label={method === 'mixed' ? t('المبلغ نقداً', 'Montant espèces') : method === 'credit' ? t('دفعة نقدية الآن (اختياري)', 'Acompte en espèces (optionnel)') : t('المبلغ المستلم', 'Montant reçu')}>
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

        {method === 'credit' && creditC > 0 && (
          <div className="flex items-center justify-between rounded-xl bg-warning/10 p-4">
            <span className="font-medium">{t('يُسجَّل ديناً على الزبون', 'Inscrit au crédit du client')}</span>
            <span className="num text-2xl font-bold text-warning">{money(creditC)}</span>
          </div>
        )}
        <div className={cn('flex items-center justify-between rounded-xl p-4 transition-colors', change > 0 ? 'bg-success/10' : change < 0 ? 'bg-danger/10' : 'bg-surface-2')}>
          <span className="font-medium">{change < 0 ? t('المتبقي', 'Reste à payer') : t('الباقي للزبون', 'À rendre')}</span>
          <span className={cn('num text-2xl font-bold', change > 0 ? 'text-success' : change < 0 ? 'text-danger' : '')}>{money(Math.abs(change))}</span>
        </div>

        <div className="space-y-1">
          <Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder={t('🎟️ كود العرض (إن قاله الزبون)', '🎟️ Code promo (si le client le donne)')} className="h-9 text-sm" dir="ltr" />
          {promoInfo === 'bad' && <p className="text-xs text-danger">{t('كود غير صالح', 'Code invalide')}</p>}
          {promoInfo && promoInfo !== 'bad' && (
            <p className="text-xs text-success">
              ✅ {promoInfo.label ?? promoInfo.code}
              {promoInfo.discount_pct > 0 && ` — ${t(`يعطي تخفيض ${promoInfo.discount_pct}%: طبّقه على السلة قبل الأداء`, `Remise ${promoInfo.discount_pct} % : appliquez-la avant`)}`}
            </p>
          )}
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
    queryFn: async () => (await sb.from('customer_balances').select('id, full_name, phone, company_name, balance').order('full_name').limit(2000)).data as (Pick<Customer, 'id' | 'full_name' | 'phone' | 'company_name'> & { balance: number })[],
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
                {c.balance > 0 ? <span className="num rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">{money(c.balance)}</span> : <UserRound className="size-4 text-subtle" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </Dialog>
  )
}

// ---------------------------------------------------------------- Hand-typed item (not in the catalog)
export type CatalogHit = { kind: 'product'; product: PosProduct } | { kind: 'service'; service: PosService }
type CustomItem = { name: string; price: number; qty: number; tax_rate: number }

// words that say nothing about the item when matching names
const STOP_WORDS = new Set(['في', 'من', 'على', 'الى', 'الي', 'عن', 'مع', 'او', 'de', 'la', 'le', 'les', 'du', 'des', 'et', 'en'])

/**
 * «بيع يدوي». While the name is typed, items of the catalog sharing its words are offered: choosing one sells it
 * like a tap in the grid. A new name is saved to the catalog in the same tap (name + price, completed later
 * from the dashboard); if that fails or the line is slow, the item is still sold by hand.
 */
export function CustomItemDialog({
  open,
  initialName,
  catalog,
  canRegister,
  onClose,
  onAdd,
  onPick,
  onSell,
  taxRates,
  defaultTax,
}: {
  open: boolean
  initialName?: string
  catalog: Catalog | undefined
  /** products.manage, online and not training */
  canRegister: boolean
  onClose: () => void
  onAdd: (i: CustomItem) => void
  onPick: (hit: CatalogHit) => void
  /** the item was just saved to the catalog: sell it as that product */
  onSell: (p: PosProduct, qty: number) => void
  taxRates: number[]
  defaultTax: number
}) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [qtyV, setQtyV] = useState('1')
  const [tax, setTax] = useState(defaultTax)
  // null: decided by what is typed (see registerOn)
  const [register, setRegister] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [listOpen, setListOpen] = useState(true)
  const [active, setActive] = useState(-1)
  const priceRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) (setName(initialName ?? ''), setPrice(''), setQtyV('1'), setTax(defaultTax), setRegister(null), setListOpen(true), setActive(-1))
  }, [open, initialName, defaultTax])

  // catalog names, normalized once
  const index = useMemo(
    () =>
      [
        ...(catalog?.products ?? []).map((p) => ({ hit: { kind: 'product', product: p } as CatalogHit, ar: p.name_ar, fr: p.name_fr })),
        ...(catalog?.services ?? []).map((s) => ({ hit: { kind: 'service', service: s } as CatalogHit, ar: s.name_ar, fr: s.name_fr })),
      ].map((x) => ({ ...x, words: normalizeSearch(`${x.ar} ${x.fr}`), keys: [normalizeSearch(x.ar).join(' '), normalizeSearch(x.fr).join(' ')] })),
    [catalog],
  )
  // most shared words first, then all of them, then a name that starts the same way, then the shortest.
  // similar: an item holding every typed word («قلم» → «قلم بيك»), so the typed name is a variant of it, not a new item
  const { hits, exact, similar } = useMemo(() => {
    const all = normalizeSearch(name)
    const words = all.filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    if (!words.length) return { hits: [] as CatalogHit[], exact: null as CatalogHit | null, similar: null as CatalogHit | null }
    const scored = index
      .flatMap((x) => {
        const n = words.filter((w) => x.words.some((h) => h.startsWith(w) || (w.length > 2 && h.includes(w)))).length
        return n ? [{ x, n, score: n * 10 + (n === words.length ? 3 : 0) + (x.words[0]?.startsWith(words[0]) ? 2 : 0) }] : []
      })
      .sort((a, b) => b.score - a.score || a.x.ar.length - b.x.ar.length)
    return {
      hits: scored.slice(0, 6).map((s) => s.x.hit),
      exact: index.find((x) => x.keys.includes(all.join(' ')))?.hit ?? null,
      similar: scored.find((s) => s.n === words.length)?.x.hit ?? null,
    }
  }, [index, name])

  const cents = parseMoney(price) ?? 0
  const q = Number(qtyV.replace(',', '.')) || 0
  const ok = name.trim().length >= 2 && cents > 0 && q > 0
  // a new name is saved unless it looks like something already in the catalog; the employee can always change it
  const registerOn = register ?? !similar
  const saveNew = canRegister && registerOn && !exact
  const shown = listOpen && hits.length > 0

  const hitName = (h: CatalogHit) => pick(h.kind === 'product' ? h.product : h.service, 'name')
  const hitPrice = (h: CatalogHit) => {
    if (h.kind === 'product') {
      const v = h.product.variants
      return (v.length > 1 || v.some((x) => x.packs.length) ? t('من ', 'dès ') : '') + money(Math.min(...v.map((x) => x.price)))
    }
    const s = h.service
    return s.pricing_mode === 'open' ? t('مبلغ حر', 'Libre') : s.price ? money(s.price) + (s.unit_ar ? ` / ${pick(s, 'unit')}` : '') : t('السعر عند البيع', 'Prix libre')
  }
  const choose = (h: CatalogHit) => (onPick(h), onClose())

  const onNameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && shown) (e.preventDefault(), setActive((a) => Math.min(a + 1, hits.length - 1)))
    else if (e.key === 'ArrowUp' && shown) (e.preventDefault(), setActive((a) => Math.max(a - 1, -1)))
    else if (e.key === 'Enter' && shown && active >= 0) (e.preventDefault(), choose(hits[active]))
    else if (e.key === 'Enter' && !ok) (e.preventDefault(), priceRef.current?.focus())
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ok || busy) return
    const i = { name: name.trim(), price: cents, qty: q, tax_rate: tax }
    if (!saveNew) return (onAdd(i), onClose())
    setBusy(true)
    try {
      const saving = createProduct(sb, { name: i.name, price: i.price, tax: i.tax_rate })
      saving.then(() => qc.invalidateQueries({ queryKey: ['pos-catalog'] }), () => {})
      // a slow line must not keep the customer waiting: after 5 s it is sold by hand and the save goes on alone
      const p = await Promise.race([saving, new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), 5000))])
      onSell(p, i.qty)
      toast.success(t(`سُجِّل «${i.name}» في القائمة`, `«${i.name}» ajouté au catalogue`))
    } catch (err) {
      onAdd(i)
      toast.warning(t('أُضيف إلى السلة كبيع يدوي', 'Ajouté en article libre'), {
        description:
          err instanceof Error && err.message === 'timeout'
            ? t('الإنترنت بطيء: سيظهر في القائمة إن اكتمل حفظه', 'Connexion lente : il apparaîtra au catalogue une fois enregistré')
            : `${t('لم يُسجَّل في القائمة', 'Non enregistré au catalogue')}: ${errorMessage(err, lang)}`,
      })
    }
    setBusy(false)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={t('بيع يدوي', 'Article libre')} description={t('اكتب الاسم: إن كان في القائمة يظهر لك لتختاره', 'Tapez le nom : s’il est au catalogue, il vous est proposé')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('الاسم', 'Désignation')} required>
          <Input
            value={name}
            onChange={(e) => (setName(e.target.value), setListOpen(true), setActive(-1))}
            onFocus={() => setListOpen(true)}
            onBlur={() => setTimeout(() => setListOpen(false), 150)}
            onKeyDown={onNameKey}
            autoFocus
            autoComplete="off"
            placeholder={t('مثلاً: كتابة طلب، قلم خاص…', 'ex : rédaction, stylo…')}
          />
          {shown && (
            <div className="mt-1.5 overflow-hidden rounded-xl border border-border">
              <div className="bg-surface-2/60 px-3 py-1 text-[11px] text-muted">{t('في القائمة: اختره ليُسجَّل البيع عليه', 'Au catalogue : choisissez-le')}</div>
              {hits.map((h, i) => (
                <button
                  key={h.kind === 'product' ? h.product.id : h.service.id}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(h)}
                  className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-start text-sm transition-colors hover:bg-surface-2', i === active && 'bg-brand-50')}
                >
                  {h.kind === 'product' ? <Package className="size-4 shrink-0 text-subtle" /> : <DynamicIcon name={h.service.icon} className="size-4 shrink-0 text-subtle" />}
                  <span className="min-w-0 flex-1 truncate">{hitName(h)}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{h.kind === 'product' ? t('سلعة', 'Produit') : t('خدمة', 'Service')}</span>
                  <span className="num shrink-0 font-semibold text-brand">{hitPrice(h)}</span>
                </button>
              ))}
            </div>
          )}
        </Field>
        <div className="grid grid-cols-[1fr_6rem] gap-3">
          <Field label={t('الثمن للوحدة', 'Prix unitaire')} required>
            <div className="relative">
              <Input ref={priceRef} value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" dir="ltr" className="num h-12 pe-12 text-center text-xl font-bold" />
              <span className="absolute inset-y-0 end-3 flex items-center text-xs text-muted">DH</span>
            </div>
          </Field>
          <Field label={t('الكمية', 'Qté')}>
            <Input value={qtyV} onChange={(e) => setQtyV(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" dir="ltr" className="num h-12 text-center text-xl" />
          </Field>
        </div>
        <Field label={t('الضريبة', 'TVA')}>
          <div className="flex gap-1.5">
            {taxRates.map((r) => (
              <button key={r} type="button" onClick={() => setTax(r)} className={cn('num flex-1 rounded-lg border py-1.5 text-sm', tax === r ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                {r}%
              </button>
            ))}
          </div>
        </Field>
        {name.trim().length >= 2 &&
          (exact ? (
            <button type="button" onClick={() => choose(exact)} className="w-full rounded-xl border border-info/30 bg-info/5 px-3 py-2.5 text-start text-sm transition-colors hover:bg-info/10">
              <span className="font-medium">
                «{hitName(exact)}» {t('موجود في القائمة', 'est au catalogue')} · <span className="num">{hitPrice(exact)}</span>
              </span>
              <span className="block text-xs text-muted">{t('اضغط هنا لبيعه من القائمة', 'Touchez pour le vendre depuis le catalogue')}</span>
            </button>
          ) : (
            canRegister && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                <input type="checkbox" checked={registerOn} onChange={(e) => setRegister(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-brand" />
                <span className="text-sm">
                  <span className="font-medium">{t('سجّله في القائمة', 'L’enregistrer au catalogue')}</span>
                  <span className="block text-xs text-muted">
                    {register === null && similar
                      ? t(`يشبه «${hitName(similar)}» الموجود في القائمة، لذلك لن يُسجَّل إلا بوضع العلامة.`, `Ressemble à «${hitName(similar)}» : cochez seulement si c’est un nouvel article.`)
                      : t('بالاسم والثمن فقط ليظهر في المرة القادمة، ويُكمَل لاحقاً من لوحة التحكم. أزل العلامة لشيء لن يتكرر.', 'Nom et prix seulement, pour la prochaine fois. Décochez pour un article ponctuel.')}
                  </span>
                </span>
              </label>
            )
          ))}
        <Button type="submit" size="lg" className="w-full" disabled={!ok} loading={busy}>
          {saveNew ? t('سجّله وأضفه إلى السلة', 'Enregistrer et ajouter') : t('إضافة إلى السلة', 'Ajouter au panier')} {ok && <span className="num opacity-80">· {money(Math.round(cents * q))}</span>}
        </Button>
      </form>
    </Dialog>
  )
}
