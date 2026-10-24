import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  CreditCard,
  Globe,
  GraduationCap,
  LayoutGrid,
  Lock,
  Minus,
  Package,
  PauseCircle,
  Percent,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash,
  UserRound,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money, parseMoney, qty as fmtQty } from '@/shared/lib/money'
import { cn, matchesSearch, storage, uuid, whatsappLink } from '@/shared/lib/utils'
import type { Sale } from '@/shared/lib/types'
import { useReceiptConfig } from '@/shared/lib/receipt-config'
import { Avatar, Badge, Button, Input, Kbd, Spinner } from '@/shared/ui/primitives'
import { Dialog, Sheet, Tooltip } from '@/shared/ui/overlay'
import { LangToggle, LogoMark, ThemeToggle } from '@/shared/ui/brand'
import { EmptyState } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { PrintReceipt, Receipt } from '@/shared/ui/receipt'
import { findByBarcode, useCatalog, type PosProduct, type PosService } from './catalog'
import { cartTotals, emptyCart, lineTotal, toPayload, useCart, type CartLine, type CartState } from './cart'
import { AmountDialog, CustomItemDialog, CustomerDialog, PayDialog, QtyDialog, VariantDialog } from './dialogs'
import { beep, type DeviceInfo } from './device'
import { ShiftSheet, type ShiftStatus } from './shift'
import { enqueue, isNetworkError, useOfflineQueue } from './offline'
import { RefundDialog } from './refund'
import { CreateInvoiceDialog } from '@/shared/ui/invoice-dialog'
import { OnlineSheet } from './online'
import { useOnlinePending } from '@/shared/lib/online'
import { AttendanceButton } from './attendance'
import { AssistantButton } from '@/apps/admin/Assistant'
import { WritingButton } from '@/shared/ui/ai-tools'
import { hasGuide, useServiceGuides } from '@/shared/ui/guide'
import { GuidesSheet, useGuideInbox } from './guides'

type PosSettings = { allow_negative_stock: boolean; sound: boolean; auto_print: boolean; quick_cash: number[] }
type Held = { id: string; at: string; label: string; state: CartState }
const heldStore = storage<Held[]>('sh-pos-held', [])
const trainingStore = storage<boolean>('sh-pos-training', false)

export function SellScreen({ device, shift, onShiftChange }: { device: DeviceInfo; shift: Extract<ShiftStatus, { open: true }>; onShiftChange: () => void }) {
  const { sb, me, can, signOut } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const catalog = useCatalog(sb)
  const receiptCfg = useReceiptConfig(sb)
  const settings = useQuery({
    queryKey: ['pos-settings'],
    queryFn: async () => {
      const { data } = await sb.from('settings').select('key, value').in('key', ['pos', 'cash'])
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      return { pos: (m.pos ?? {}) as PosSettings, cash: (m.cash ?? {}) as { auto_lock_minutes?: number } }
    },
  })
  const pos = settings.data?.pos

  const [cart, dispatch] = useCart()
  const totals = cartTotals(cart)
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState<string | 'services' | null>(null)
  const [variantFor, setVariantFor] = useState<PosProduct | null>(null)
  const [amountFor, setAmountFor] = useState<PosService | null>(null)
  const [qtyFor, setQtyFor] = useState<{ service?: PosService; line?: CartLine } | null>(null)
  const [pay, setPay] = useState<'cash' | 'card' | null>(null)
  const [paying, setPaying] = useState(false)
  const [customerOpen, setCustomerOpen] = useState(false)
  const [discountOpen, setDiscountOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const [shiftOpen, setShiftOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const legal = receiptCfg.data?.legal as { tax_rates?: number[]; default_tax_rate?: number } | undefined
  const [onlineOpen, setOnlineOpen] = useState(false)
  // «دليل الخدمات»: the list, or straight to one service's guide (from a cart line)
  const [guides, setGuides] = useState<{ service: string | null } | null>(null)
  const serviceGuides = useServiceGuides(sb)
  const guideInbox = useGuideInbox(sb, me?.id)
  const guidesUnread = (guideInbox.data ?? []).filter((n) => !n.read_at).length
  // Training mode: sales are simulated on this screen only (nothing saved, no stock, no cash).
  const [training, setTrainingState] = useState(trainingStore.get)
  const [trainingAsk, setTrainingAsk] = useState(false)
  const setTraining = (v: boolean) => {
    // A real cart in progress is put on hold, and training carts are thrown away.
    if (v && cart.lines.length) holdCart(true)
    else dispatch({ type: 'clear' })
    trainingStore.set(v)
    setTrainingState(v)
  }
  const notInTraining = (fn: () => void) => () => (training ? toast.info(t('غير متاح في وضع التدريب', 'Indisponible en mode formation')) : fn())
  const queue = useOfflineQueue(sb, () => (qc.invalidateQueries({ queryKey: ['shift', device.id] }), qc.invalidateQueries({ queryKey: ['pos-history'] }), qc.invalidateQueries({ queryKey: ['pos-catalog'] })))
  const [queueOpen, setQueueOpen] = useState(false)
  const pending = useOnlinePending(sb, can('requests.manage') || can('orders.manage'))
  const helpCounts = useQuery({ queryKey: ['help-counts'], refetchInterval: 30_000, enabled: can('requests.manage'), queryFn: async () => (await sb.rpc('help_counts')).data as { new: number } })
  const pendingCount = (pending.data?.requests_new ?? 0) + (pending.data?.orders_new ?? 0) + (helpCounts.data?.new ?? 0)
  const [held, setHeld] = useState<Held[]>(heldStore.get)
  const [done, setDone] = useState<Sale | null>(null)
  const [printSale, setPrintSale] = useState<Sale | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [lastKey, setLastKey] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const saleId = useRef(uuid())

  const sound = (k: Parameters<typeof beep>[0]) => pos?.sound !== false && beep(k)

  // ------------------------------------------------ online status & auto-lock
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => (window.removeEventListener('online', on), window.removeEventListener('offline', off))
  }, [])

  useEffect(() => {
    const mins = settings.data?.cash.auto_lock_minutes ?? 5
    if (!mins) return
    let timer = setTimeout(lock, mins * 60_000)
    const reset = () => (clearTimeout(timer), (timer = setTimeout(lock, mins * 60_000)))
    const evs = ['mousedown', 'keydown', 'touchstart']
    evs.forEach((e) => window.addEventListener(e, reset))
    return () => (clearTimeout(timer), evs.forEach((e) => window.removeEventListener(e, reset)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.data, cart.lines.length])

  function lock() {
    if (cart.lines.length) holdCart(true)
    signOut()
  }

  // ------------------------------------------------ adding items
  const addProduct = useCallback(
    (p: PosProduct) => {
      if (p.variants.length > 1 || p.variants.some((v) => v.packs.length)) return setVariantFor(p)
      const v = p.variants[0]
      if (!v) return
      if (p.track_stock && v.stock_qty <= 0 && pos?.allow_negative_stock === false) {
        sound('error')
        return toast.error(t('نفد المخزون', 'Rupture de stock'))
      }
      dispatch({ type: 'addProduct', product: p, variant: v })
      setLastKey(`p:${v.id}:`)
      sound('ok')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pos],
  )

  const addService = (s: PosService) => {
    if (s.pricing_mode === 'open') return setAmountFor(s)
    if (s.pricing_mode === 'tiered' || s.unit_ar) return setQtyFor({ service: s })
    dispatch({ type: 'addService', service: s, qty: 1 })
    setLastKey(`s:${s.id}`)
    sound('ok')
  }

  const onSearchEnter = () => {
    const code = search.trim()
    if (!code) return
    const hit = findByBarcode(catalog.data, code)
    if (hit) {
      dispatch({ type: 'addProduct', product: hit.product, variant: hit.variant, pack: hit.pack })
      setLastKey(`p:${hit.variant.id}:${hit.pack?.id ?? ''}`)
      sound('ok')
      setSearch('')
      return
    }
    if (filtered.products.length === 1 && !filtered.services.length) {
      addProduct(filtered.products[0])
      setSearch('')
      return
    }
    if (/^\d{6,}$/.test(code)) {
      sound('error')
      toast.error(t(`الباركود ${code} غير موجود`, `Code-barres ${code} introuvable`))
      setSearch('')
    }
  }

  // ------------------------------------------------ filtering
  const filtered = useMemo(() => {
    const c = catalog.data
    if (!c) return { products: [], services: [] }
    const q = search.trim().toLowerCase()
    const matches = (o: { name_ar: string; name_fr: string }) => matchesSearch(q, o.name_ar, o.name_fr)
    const counter = c.services.filter((s) => s.kind === 'counter')
    if (q)
      return {
        products: c.products.filter((p) => matches(p) || p.variants.some((v) => v.barcode?.includes(q) || v.sku?.toLowerCase().includes(q))).slice(0, 60),
        services: c.services.filter(matches).slice(0, 20),
      }
    if (cat === 'services') return { products: [], services: c.services }
    return { products: c.products.filter((p) => !cat || p.category_id === cat), services: cat ? [] : counter.filter((s) => !s.pos_quick) }
  }, [catalog.data, search, cat])

  const quick = useMemo(() => (catalog.data?.services ?? []).filter((s) => s.pos_quick && s.kind === 'counter').sort((a, b) => a.pos_sort - b.pos_sort), [catalog.data])

  // ------------------------------------------------ hold / resume
  const holdCart = (silent = false) => {
    if (!cart.lines.length) return
    if (training) {
      // never keep a practice cart: it could be resumed later as a real sale
      if (silent) dispatch({ type: 'clear' })
      else toast.info(t('غير متاح في وضع التدريب', 'Indisponible en mode formation'))
      return
    }
    const h: Held = { id: uuid(), at: new Date().toISOString(), label: cart.customer?.full_name ?? `${cart.lines.length} ${t('منتجات', 'articles')}`, state: cart }
    const next = [h, ...held]
    setHeld(next)
    heldStore.set(next)
    dispatch({ type: 'clear' })
    if (!silent) toast.success(t('تم تعليق البيع', 'Vente mise en attente'))
  }
  const resume = (h: Held) => {
    if (cart.lines.length) holdCart(true)
    dispatch({ type: 'load', state: h.state })
    const next = held.filter((x) => x.id !== h.id)
    setHeld(next)
    heldStore.set(next)
    setHeldOpen(false)
  }

  // ------------------------------------------------ checkout
  // A receipt built on the device (offline sale or training).
  const localSale = (p: { cash: number; card: number; credit: number }, prefix: string): Sale => {
    const tt = cartTotals(cart)
    const paid = p.cash + p.card + p.credit
    return {
        id: saleId.current,
        number: `${prefix}-${saleId.current.slice(0, 6).toUpperCase()}`,
        status: 'completed',
        customer_id: cart.customer?.id ?? null,
        employee_id: me?.id ?? '',
        employee_name: me?.full_name ?? '',
        customer: cart.customer,
        subtotal: tt.subtotal,
        discount_total: tt.subtotal - tt.total,
        total: tt.total,
        tax_total: Math.round(cart.lines.reduce((a, l) => { const r = l.product?.tax_rate ?? l.service?.tax_rate ?? l.tax_rate ?? 0; return a + (lineTotal(l) * r) / (100 + r) }, 0) * (tt.net ? tt.total / tt.net : 1)),
        cash_received: p.cash,
        change_given: Math.max(0, paid - tt.total),
        paid_cash: p.cash - Math.max(0, paid - tt.total),
        paid_card: p.card,
        paid_credit: p.credit,
        note: null,
        void_reason: null,
        voided_at: null,
        created_at: new Date().toISOString(),
        items: cart.lines.map((l, i) => ({ line_no: i + 1, item_type: l.type, name_ar: l.name_ar, name_fr: l.name_fr, qty: l.qty, unit_price: l.unit_price, original_unit_price: l.base_price ?? l.unit_price, discount: l.discount, total: lineTotal(l), tax_rate: l.product?.tax_rate ?? l.service?.tax_rate ?? l.tax_rate ?? 0 })),
    }
  }

  const checkout = async (p: { cash: number; card: number; credit: number; promo?: string }) => {
    if (training) {
      const sale = { ...localSale(p, 'TR'), note: t('وضع التدريب — ليس وصلاً حقيقياً', 'Mode formation — ticket non valable') }
      sound('success')
      saleId.current = uuid()
      dispatch({ type: 'clear' })
      setPay(null)
      setDone(sale)
      toast.info(t('بيع تجريبي: لم يُسجَّل شيء ولم يتغير المخزون ولا الصندوق', 'Vente d’essai : rien n’est enregistré'))
      return
    }
    setPaying(true)
    const payload = toPayload(cart, saleId.current, device.id, p)
    const { data, error } = await sb.rpc('create_sale', { p: payload })
    setPaying(false)
    let sale = data as Sale
    if (error) {
      if (!isNetworkError(error)) {
        sound('error')
        return toast.error(errorMessage(error, lang))
      }
      // No connection: keep the sale locally, print a provisional receipt, sync later.
      sale = localSale(p, 'HL')
      enqueue({ id: saleId.current, payload, local: sale, created_at: sale.created_at })
      toast.warning(t('لا يوجد إنترنت: حُفظ البيع على الجهاز وسيُرسل تلقائياً عند عودة الاتصال', 'Hors ligne : vente enregistrée localement, envoi automatique au retour du réseau'))
    }
    sound('success')
    // which campaign brought this customer (promo code said at the counter)
    if (p.promo && !error) sb.rpc('sale_set_promo', { p_sale: sale.id, p_code: p.promo }).then(() => {})
    if (cart.request && !error) {
      const { error: e2 } = await sb.rpc('close_request_with_sale', { p_request: cart.request.id, p_sale: sale.id })
      if (e2) toast.error(errorMessage(e2, lang))
      else toast.success(t(`تم إغلاق الطلب ${cart.request.number} ✅`, `Demande ${cart.request.number} clôturée ✅`))
      qc.invalidateQueries({ queryKey: ['pos-requests'] })
    }
    saleId.current = uuid()
    dispatch({ type: 'clear' })
    setPay(null)
    setDone(sale)
    if (pos?.auto_print !== false) setPrintSale(sale)
    qc.invalidateQueries({ queryKey: ['pos-catalog'] })
    qc.invalidateQueries({ queryKey: ['pos-history'] })
    qc.invalidateQueries({ queryKey: ['shift', device.id] })
  }

  // ------------------------------------------------ prepare an online request (school list…) in the cart
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail as { id: string; number: string; customer_name: string; phone: string; customer_id: string | null; service: string }
      if (cart.lines.length && !cart.request) holdCart(true)
      dispatch({ type: 'load', state: { ...emptyCart, request: { id: d.id, number: d.number, customer_name: d.customer_name, phone: d.phone, service: d.service }, customer: d.customer_id ? { id: d.customer_id, full_name: d.customer_name, phone: d.phone } : null, note: d.number } })
      setOnlineOpen(false)
      toast.info(t(`حضّر طلب ${d.number}: امسح المنتجات ثم أرسل الثمن للزبون`, `Préparez ${d.number} : scannez puis envoyez le prix`))
      searchRef.current?.focus()
    }
    window.addEventListener('sh-prepare-request', on)
    return () => window.removeEventListener('sh-prepare-request', on)
  })

  const sendPrice = async () => {
    if (!cart.request) return
    await sb.from('service_requests').update({ price: totals.total }).eq('id', cart.request.id)
    const list = cart.lines.map((l) => `• ${pick(l, 'name')} × ${fmtQty(l.qty)} = ${money(lineTotal(l))}`).join('\n')
    const text = t(
      `مرحباً ${cart.request.customer_name} 👋
طلبكم ${cart.request.number} (${cart.request.service}) جاهز:
${list}

المجموع: ${money(totals.total)}
ننتظركم في المحل 🌟`,
      `Bonjour ${cart.request.customer_name} 👋
Votre demande ${cart.request.number} est prête :
${list}

Total : ${money(totals.total)}`,
    )
    window.open(whatsappLink(cart.request.phone, text), '_blank')
  }

  // ------------------------------------------------ keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modal = document.querySelector('[role="dialog"], [role="alertdialog"]')
      if (e.key === 'F1') (e.preventDefault(), searchRef.current?.focus())
      if (modal) return
      if (e.key === 'F2' && cart.lines.length) (e.preventDefault(), setPay('cash'))
      if (e.key === 'F3' && cart.lines.length) (e.preventDefault(), setPay('card'))
      if (e.key === 'F4') (e.preventDefault(), setCustomerOpen(true))
      if (e.key === 'F8') (e.preventDefault(), holdCart())
      if (e.key === 'F6' && can('pos.custom_item')) (e.preventDefault(), setCustomOpen(true))
      if (e.key === 'Escape' && document.activeElement === searchRef.current) setSearch('')
      // Scanner typing anywhere goes to the search box
      if (/^[\dA-Za-z]$/.test(e.key) && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const maxDisc = me?.max_discount_percent ?? 0

  return (
    <div className={cn('flex h-screen flex-col bg-bg', training && 'ring-4 ring-warning ring-inset')}>
      {training && (
        <div className="flex shrink-0 items-center justify-center gap-3 bg-[repeating-linear-gradient(135deg,#F59E0B_0_14px,#FBBF24_14px_28px)] px-4 py-1.5 text-sm font-bold text-navy">
          <GraduationCap className="size-4" />
          {t('وضع التدريب — البيع هنا تجريبي: لا يُسجَّل، لا يغيّر المخزون ولا الصندوق', 'Mode formation — ventes fictives : rien n’est enregistré')}
          <button onClick={() => setTraining(false)} className="rounded-md bg-navy px-2 py-0.5 text-xs text-white">
            {t('خروج', 'Quitter')}
          </button>
        </div>
      )}
      {/* ---------------------------------------------- Header */}
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
        <LogoMark size={36} />
        <div className="hidden leading-tight md:block">
          <div className="font-latin text-sm font-extrabold">
            Sweet <span className="text-brand">House</span>
          </div>
          <div className="text-[11px] text-muted">{device.name}</div>
        </div>
        <div className="relative mx-auto w-full max-w-xl">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-5 text-subtle" />
          <input
            ref={searchRef}
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
            placeholder={t('امسح الباركود أو ابحث عن منتج / خدمة…', 'Scannez ou recherchez un produit / service…')}
            className="h-11 w-full rounded-xl border border-border bg-surface-2/60 ps-11 pe-20 text-sm transition-all placeholder:text-subtle focus:border-brand focus:bg-surface focus:ring-4 focus:ring-[var(--ring)] focus:outline-none"
          />
          <div className="pointer-events-none absolute inset-y-0 end-3 flex items-center gap-1.5 text-subtle">
            <ScanBarcode className="size-4" />
            <Kbd>F1</Kbd>
          </div>
        </div>
        <Tooltip content={online ? (queue.items.length ? t(`${queue.items.length} بيع بانتظار الإرسال`, `${queue.items.length} ventes en attente`) : t('متصل', 'En ligne')) : t('غير متصل: البيع مستمر وسيُرسل لاحقاً', 'Hors ligne : les ventes seront envoyées plus tard')}>
          <button onClick={() => queue.items.length && setQueueOpen(true)} className={cn('relative flex h-9 items-center gap-1.5 rounded-lg px-2', online ? 'text-success' : 'animate-pulse bg-danger/10 text-danger')}>
            {online ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
            {queue.items.length > 0 && <span className={cn('num rounded-full px-1.5 text-[11px] font-bold text-white', queue.failed.length ? 'bg-danger' : 'bg-warning')}>{queue.items.length}</span>}
          </button>
        </Tooltip>
        <Tooltip content={t('الصندوق والوردية', 'Caisse')}>
          <Button variant="outline" onClick={notInTraining(() => setShiftOpen(true))} className="gap-2">
            <Banknote />
            <span className="num hidden xl:inline">#{shift.shift.number}</span>
          </Button>
        </Tooltip>
        {(can('requests.manage') || can('orders.manage')) && (
          <Tooltip content={t('الطلبات الأونلاين', 'Commandes en ligne')}>
            <Button variant="ghost" size="icon" className="relative" onClick={notInTraining(() => setOnlineOpen(true))}>
              <Globe />
              {pendingCount > 0 && <span className="num absolute -end-0.5 -top-0.5 flex size-4.5 animate-pulse items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">{pendingCount}</span>}
            </Button>
          </Tooltip>
        )}
        <Tooltip content={t('دليل الخدمات', 'Guides des services')}>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setGuides({ service: null })}>
            <BookOpen />
            {guidesUnread > 0 && <span className="num absolute -end-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{guidesUnread}</span>}
          </Button>
        </Tooltip>
        <Tooltip content={t('المبيعات الأخيرة', 'Ventes récentes')}>
          <Button variant="ghost" size="icon" onClick={notInTraining(() => setHistoryOpen(true))}>
            <Clock />
          </Button>
        </Tooltip>
        <Tooltip content={t('المبيعات المعلقة', 'En attente')}>
          <Button variant="ghost" size="icon" className="relative" onClick={notInTraining(() => setHeldOpen(true))}>
            <PauseCircle />
            {held.length > 0 && <span className="num absolute -end-0.5 -top-0.5 flex size-4.5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{held.length}</span>}
          </Button>
        </Tooltip>
        <Tooltip content={training ? t('إيقاف وضع التدريب', 'Quitter le mode formation') : t('وضع التدريب', 'Mode formation')}>
          <Button variant={training ? 'primary' : 'ghost'} size="icon" onClick={() => (training ? setTraining(false) : setTrainingAsk(true))}>
            <GraduationCap />
          </Button>
        </Tooltip>
        <Tooltip content={t('المساعد الكتابي: طلب، شكاية، رسالة', 'Assistant de rédaction')}>
          <span>
            <WritingButton sb={sb} size="icon" />
          </span>
        </Tooltip>
        <AssistantButton mode="pos" />
        <AttendanceButton deviceId={device.id} />
        <LangToggle compact />
        <ThemeToggle />
        <div className="flex items-center gap-2.5 border-s border-border ps-4">
          <Avatar name={me?.full_name ?? ''} color={me?.color} src={me?.avatar_url} size={36} />
          <div className="hidden leading-tight lg:block">
            <div className="text-sm font-semibold">{me?.full_name}</div>
            <div className="text-[11px] text-muted">{me?.role ? pick(me.role, 'name') : t('المالك', 'Propriétaire')}</div>
          </div>
          <Tooltip content={t('قفل وتبديل الموظف', 'Verrouiller / changer')}>
            <Button variant="outline" size="icon" onClick={lock}>
              <Lock />
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------- Catalog */}
        <section className="flex min-w-0 flex-1 flex-col">
          {(quick.length > 0 || can('pos.custom_item')) && (
            <div className="flex gap-2 overflow-x-auto border-b border-border bg-surface/60 px-4 py-3">
              {can('pos.custom_item') && (
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => setCustomOpen(true)} className="flex shrink-0 items-center gap-2.5 rounded-xl border-2 border-dashed border-brand/50 bg-brand-50 px-4 py-2.5 text-start text-brand transition-all hover:-translate-y-0.5 hover:border-brand">
                  <Plus className="size-5" />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold whitespace-nowrap">{t('بيع يدوي', 'Article libre')}</div>
                    <div className="text-[11px] opacity-75">{t('غير موجود في القائمة', 'Hors catalogue')} · F6</div>
                  </div>
                </motion.button>
              )}
              {quick.map((s) => (
                <motion.button
                  key={s.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => addService(s)}
                  className="group flex shrink-0 items-center gap-2.5 rounded-xl px-4 py-2.5 text-start text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  style={{ background: s.pos_color ?? '#0F172A' }}
                >
                  <DynamicIcon name={s.icon} className="size-5 opacity-90" />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold whitespace-nowrap">{pick(s, 'name')}</div>
                    <div className="num text-[11px] opacity-75">{s.pricing_mode === 'open' ? t('مبلغ حر', 'Libre') : money(s.price) + (s.unit_ar ? ` / ${pick(s, 'unit')}` : '')}</div>
                  </div>
                </motion.button>
              ))}
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-1">
            <CatChip active={!cat} onClick={() => setCat(null)} icon={<LayoutGrid className="size-4" />} label={t('الكل', 'Tout')} />
            {catalog.data?.categories.map((c) => (
              <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} color={c.color} icon={<DynamicIcon name={c.icon} className="size-4" />} label={pick(c, 'name')} />
            ))}
            <CatChip active={cat === 'services'} onClick={() => setCat('services')} icon={<DynamicIcon name="sparkles" className="size-4" />} label={t('الخدمات', 'Services')} />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {catalog.isLoading && !catalog.data ? (
              <div className="flex justify-center py-20">
                <Spinner />
              </div>
            ) : !filtered.products.length && !filtered.services.length ? (
              <EmptyState icon={<Package />} title={search ? t('لا نتائج', 'Aucun résultat') : t('لا توجد منتجات', 'Aucun produit')} description={!search ? t('أضف منتجاتك من لوحة التحكم', 'Ajoutez vos produits dans le tableau de bord') : undefined} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                {filtered.services.map((s) => (
                  <motion.button key={s.id} layout whileTap={{ scale: 0.96 }} onClick={() => addService(s)} className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 text-start shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop">
                    <div className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand">
                      <DynamicIcon name={s.icon} className="size-5" />
                    </div>
                    <div className="line-clamp-2 min-h-10 text-sm leading-snug font-medium">{pick(s, 'name')}</div>
                    <div className="num text-sm font-bold text-brand">{s.pricing_mode === 'open' ? t('مبلغ حر', 'Libre') : s.price ? money(s.price) : t('السعر عند البيع', 'Prix libre')}</div>
                  </motion.button>
                ))}
                {filtered.products.map((p) => {
                  const stock = p.variants.reduce((a, v) => a + Number(v.stock_qty), 0)
                  const low = p.track_stock && stock <= p.low_stock_alert
                  const price = Math.min(...p.variants.map((v) => v.price))
                  return (
                    <motion.button key={p.id} layout whileTap={{ scale: 0.96 }} onClick={() => addProduct(p)} className="group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface text-start shadow-card transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-2">
                        {p.image ? <img src={p.image} alt="" loading="lazy" className="size-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <Package className="absolute inset-0 m-auto size-9 text-subtle/60" />}
                        {p.track_stock && (
                          <span className={cn('num absolute end-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-bold backdrop-blur', stock <= 0 ? 'bg-danger text-white' : low ? 'bg-warning text-white' : 'bg-white/85 text-navy')}>{fmtQty(stock)}</span>
                        )}
                        {(p.variants.length > 1 || p.variants.some((v) => v.packs.length)) && <span className="absolute start-2 top-2 rounded-full bg-navy/80 px-2 py-0.5 text-[10px] text-white">{t('خيارات', 'Options')}</span>}
                      </div>
                      <div className="flex flex-1 flex-col justify-between gap-1 p-3">
                        <div className="line-clamp-2 text-sm leading-snug font-medium">{pick(p, 'name')}</div>
                        <div className="num text-sm font-bold text-brand">{money(price)}</div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* ---------------------------------------------- Cart */}
        <aside className="flex w-[400px] shrink-0 flex-col border-s border-border bg-surface xl:w-[440px]">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <button onClick={() => setCustomerOpen(true)} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2 text-start text-sm transition-colors hover:border-brand hover:bg-brand-50/50">
              <UserRound className="size-4 shrink-0 text-muted" />
              <span className={cn('truncate', !cart.customer && 'text-muted')}>{cart.customer?.full_name ?? t('زبون عابر', 'Client de passage')}</span>
              <Kbd>F4</Kbd>
            </button>
            <Tooltip content={t('تعليق البيع (F8)', 'Mettre en attente (F8)')}>
              <Button variant="ghost" size="icon" disabled={!cart.lines.length} onClick={() => holdCart()}>
                <PauseCircle />
              </Button>
            </Tooltip>
            <Tooltip content={t('إفراغ السلة', 'Vider')}>
              <Button variant="ghost" size="icon" disabled={!cart.lines.length} onClick={() => dispatch({ type: 'clear' })}>
                <Trash className="text-danger" />
              </Button>
            </Tooltip>
          </div>

          {cart.request && (
            <div className="border-b border-border bg-brand-50/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">
                    {t('تحضير', 'Préparation')} <span className="num">{cart.request.number}</span>
                  </div>
                  <div className="truncate text-xs text-muted">{cart.request.service} · {cart.request.customer_name}</div>
                </div>
                <button onClick={() => dispatch({ type: 'request', request: null })} className="text-subtle hover:text-danger">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="success" disabled={!cart.lines.length} onClick={sendPrice}>
                  {t('إرسال الثمن واتساب', 'Envoyer le prix')}
                </Button>
                <Button size="sm" variant="outline" disabled={!cart.lines.length} onClick={() => holdCart()}>
                  <PauseCircle />
                  {t('تعليق حتى يأتي', 'En attente')}
                </Button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {!cart.lines.length ? (
              <div className="flex h-full flex-col items-center justify-center p-8 text-center">
                <div className="relative mb-4">
                  <div className="absolute inset-0 scale-150 rounded-full bg-brand/10 blur-2xl" />
                  <ShoppingCart className="relative size-14 text-brand/40" strokeWidth={1.4} />
                </div>
                <div className="font-semibold">{t('السلة فارغة', 'Panier vide')}</div>
                <div className="mt-1 text-sm text-muted">{t('امسح منتجاً أو اختر من القائمة', 'Scannez ou choisissez un article')}</div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {cart.lines.map((l) => (
                    <motion.li
                      key={l.key}
                      layout
                      initial={{ opacity: 0, x: 20, backgroundColor: 'rgba(255,107,53,0.12)' }}
                      animate={{ opacity: 1, x: 0, backgroundColor: lastKey === l.key ? ['rgba(255,107,53,0.12)', 'rgba(255,107,53,0)'] : 'rgba(255,107,53,0)' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="px-4 py-3"
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm leading-snug font-medium">{pick(l, 'name')}</div>
                          <div className="num mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                            {can('pos.price_override') && l.base_price !== null ? (
                              <PriceEdit value={l.unit_price} onChange={(price) => dispatch({ type: 'price', key: l.key, price })} />
                            ) : (
                              <span>{money(l.unit_price)}</span>
                            )}
                            {l.base_price !== null && l.unit_price !== l.base_price && <span className="text-subtle line-through">{money(l.base_price)}</span>}
                            {l.discount > 0 && <Badge tone="success">-{money(l.discount)}</Badge>}
                          </div>
                        </div>
                        <div className="num text-sm font-bold">{money(lineTotal(l))}</div>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex items-center rounded-lg border border-border" dir="ltr">
                          <button className="flex size-8 items-center justify-center text-muted hover:text-text" onClick={() => dispatch({ type: 'qty', key: l.key, qty: l.qty - 1 })}>
                            <Minus className="size-3.5" />
                          </button>
                          <button className="num min-w-10 px-1 text-sm font-semibold" onClick={() => setQtyFor({ line: l, service: l.service })}>
                            {fmtQty(l.qty)}
                          </button>
                          <button className="flex size-8 items-center justify-center text-muted hover:text-text" onClick={() => dispatch({ type: 'qty', key: l.key, qty: l.qty + 1 })}>
                            <Plus className="size-3.5" />
                          </button>
                        </div>
                        {can('pos.discount') && (
                          <LineDiscount
                            line={l}
                            maxPercent={maxDisc}
                            onChange={(discount) => dispatch({ type: 'lineDiscount', key: l.key, discount })}
                          />
                        )}
                        {l.service && hasGuide(serviceGuides.data?.guides.get(l.service.id)) && (
                          <Tooltip content={t('دليل هذه الخدمة', 'Guide de ce service')}>
                            <button className="ms-auto flex size-8 items-center justify-center rounded-lg text-subtle hover:bg-brand-50 hover:text-brand" onClick={() => setGuides({ service: l.service!.id })}>
                              <BookOpen className="size-4" />
                            </button>
                          </Tooltip>
                        )}
                        <button className={cn('flex size-8 items-center justify-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger', !(l.service && hasGuide(serviceGuides.data?.guides.get(l.service.id))) && 'ms-auto')} onClick={() => dispatch({ type: 'remove', key: l.key })}>
                          <X className="size-4" />
                        </button>
                      </div>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </div>

          {/* totals */}
          <div className="border-t border-border bg-surface-2/40 p-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted">
                <span>
                  {t('المجموع الفرعي', 'Sous-total')} <span className="num">({fmtQty(totals.items)})</span>
                </span>
                <span className="num">{money(totals.subtotal)}</span>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>{t('التخفيض', 'Remise')}</span>
                  <span className="num">-{money(totals.discount)}</span>
                </div>
              )}
              {can('pos.discount') && cart.lines.length > 0 && (
                <button onClick={() => setDiscountOpen(true)} className="flex items-center gap-1 text-xs text-brand hover:underline">
                  <Percent className="size-3" />
                  {cart.discount ? t('تعديل تخفيض السلة', 'Modifier la remise') : t('تخفيض على السلة', 'Remise sur le panier')}
                </button>
              )}
            </div>
            <div className="mt-3 flex items-end justify-between">
              <span className="text-sm font-medium text-muted">{t('المجموع', 'Total')}</span>
              <motion.span key={totals.total} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="num text-3xl font-extrabold tracking-tight">
                {money(totals.total)}
              </motion.span>
            </div>
            <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
              <Button size="xl" disabled={!cart.lines.length} onClick={() => setPay('cash')} className="text-base">
                <Banknote className="!size-5" />
                {t('نقداً', 'Espèces')}
                <Kbd>F2</Kbd>
              </Button>
              <Button size="xl" variant="navy" disabled={!cart.lines.length} onClick={() => setPay('card')} className="px-5">
                <CreditCard className="!size-5" />
                <Kbd>F3</Kbd>
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {/* ---------------------------------------------- dialogs */}
      <VariantDialog
        product={variantFor}
        onClose={() => setVariantFor(null)}
        onPick={(v, pack) => {
          if (!variantFor) return
          dispatch({ type: 'addProduct', product: variantFor, variant: v, pack })
          setLastKey(`p:${v.id}:${pack?.id ?? ''}`)
          sound('ok')
        }}
      />
      <AmountDialog
        service={amountFor}
        onClose={() => setAmountFor(null)}
        onConfirm={(amount) => {
          if (amountFor) dispatch({ type: 'addService', service: amountFor, qty: 1, amount })
          sound('ok')
        }}
      />
      <QtyDialog
        open={!!qtyFor}
        title={qtyFor?.line ? pick(qtyFor.line, 'name') : qtyFor?.service ? pick(qtyFor.service, 'name') : ''}
        initial={qtyFor?.line?.qty ?? 1}
        service={qtyFor?.service}
        onClose={() => setQtyFor(null)}
        onConfirm={(q) => {
          if (qtyFor?.line) dispatch({ type: 'qty', key: qtyFor.line.key, qty: q })
          else if (qtyFor?.service) {
            dispatch({ type: 'addService', service: qtyFor.service, qty: q })
            setLastKey(`s:${qtyFor.service.id}`)
            sound('ok')
          }
        }}
      />
      <CustomItemDialog
        open={customOpen}
        onClose={() => (setCustomOpen(false), searchRef.current?.focus())}
        taxRates={legal?.tax_rates ?? [0, 7, 10, 14, 20]}
        defaultTax={legal?.default_tax_rate ?? 20}
        onAdd={(i) => (dispatch({ type: 'addCustom', ...i }), sound('ok'))}
      />
      <PayDialog open={!!pay} mode={pay ?? 'cash'} total={totals.total} quickCash={pos?.quick_cash ?? []} onClose={() => setPay(null)} onPay={checkout} busy={paying} customer={cart.customer} allowCredit={can('pos.credit_sale')} onPickCustomer={() => setCustomerOpen(true)} />
      <CustomerDialog open={customerOpen} onClose={() => setCustomerOpen(false)} onPick={(c) => dispatch({ type: 'customer', customer: c })} />
      <CartDiscountDialog open={discountOpen} onClose={() => setDiscountOpen(false)} net={totals.net} subtotal={totals.subtotal} current={cart.discount} maxPercent={maxDisc} onApply={(d) => dispatch({ type: 'discount', discount: d })} />
      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} onPrint={setPrintSale} device={device} />
      <ShiftSheet device={device} status={shift} open={shiftOpen} onClose={() => setShiftOpen(false)} onClosed={onShiftChange} />
      <OnlineSheet device={device} open={onlineOpen} onClose={() => setOnlineOpen(false)} />
      <GuidesSheet open={!!guides} initial={guides?.service} onClose={() => (setGuides(null), guideInbox.refetch())} />
      <Sheet open={queueOpen} onOpenChange={setQueueOpen} title={t('مبيعات بانتظار الإرسال', 'Ventes en attente d’envoi')} width="max-w-md">
        <div className="space-y-3">
          <Button className="w-full" onClick={() => queue.sync()} loading={queue.syncing} disabled={!online}>
            {t('إرسال الآن', 'Envoyer maintenant')}
          </Button>
          {queue.items.map((q) => (
            <div key={q.id} className={cn('rounded-xl border p-3 text-sm', q.error ? 'border-danger/40 bg-danger/5' : 'border-border')}>
              <div className="flex items-center justify-between">
                <span className="num font-semibold">{q.local.number}</span>
                <span className="num font-bold">{money(q.local.total)}</span>
              </div>
              <div className="num text-xs text-muted">{format(new Date(q.created_at), 'dd/MM HH:mm')}</div>
              {q.error && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs text-danger">{errorMessage(q.error, lang)}</span>
                  <Button size="sm" variant="ghost" onClick={() => queue.discard(q.id)}>
                    {t('تجاهل', 'Ignorer')}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Sheet>

      <Sheet open={heldOpen} onOpenChange={setHeldOpen} title={t('المبيعات المعلقة', 'Ventes en attente')} width="max-w-md">
        {!held.length ? (
          <EmptyState icon={<PauseCircle />} title={t('لا توجد مبيعات معلقة', 'Aucune vente en attente')} />
        ) : (
          <div className="space-y-2">
            {held.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{h.label}</div>
                  <div className="num text-xs text-muted">
                    {format(new Date(h.at), 'HH:mm')} · {money(cartTotals(h.state).total)}
                  </div>
                </div>
                <Button size="sm" onClick={() => resume(h)}>
                  {t('استئناف', 'Reprendre')}
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => (setHeld(held.filter((x) => x.id !== h.id)), heldStore.set(held.filter((x) => x.id !== h.id)))}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      <Dialog open={trainingAsk} onOpenChange={setTrainingAsk} size="sm" title={t('وضع التدريب', 'Mode formation')} description={t('للموظف الجديد: يبيع ويجرب كل شيء دون خوف من الخطأ', 'Pour les nouveaux : s’entraîner sans risque')}>
        <ul className="mb-5 space-y-2 text-sm">
          {[
            t('البيع لا يُسجَّل في النظام ولا يظهر في التقارير', 'Les ventes ne sont pas enregistrées'),
            t('المخزون والصندوق لا يتغيران', 'Ni stock ni caisse ne changent'),
            t('الوصل المطبوع مكتوب عليه «تدريب»', 'Le ticket porte la mention « formation »'),
            t('الصندوق والطلبات والمبيعات السابقة مقفلة أثناء التدريب', 'Caisse, commandes et historique bloqués'),
          ].map((x) => (
            <li key={x} className="flex gap-2">
              <CheckCircle2 className="size-4 shrink-0 text-success" />
              {x}
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={() => (setTraining(true), setTrainingAsk(false))}>
          <GraduationCap />
          {t('تشغيل وضع التدريب', 'Activer')}
        </Button>
      </Dialog>

      {/* success */}
      <AnimatePresence>
        {done && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 flex items-center justify-center bg-navy/60 backdrop-blur-sm" onClick={() => setDone(null)}>
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', bounce: 0.35 }}
              className="w-full max-w-sm rounded-3xl bg-surface p-8 text-center shadow-pop"
              onClick={(e) => e.stopPropagation()}
            >
              <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.1, type: 'spring', bounce: 0.5 }} className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="size-11 text-success" />
              </motion.div>
              <div className="mt-4 text-xl font-bold">{done.number.startsWith('TR-') ? t('بيع تجريبي ناجح 🎓', 'Vente d’essai réussie 🎓') : t('تم البيع بنجاح', 'Vente enregistrée')}</div>
              <div className="num mt-1 text-sm text-muted">
                {done.number} · {money(done.total)}
              </div>
              {done.change_given > 0 && (
                <div className="mt-5 rounded-2xl bg-success/10 p-4">
                  <div className="text-sm text-success">{t('الباقي للزبون', 'À rendre')}</div>
                  <div className="num text-4xl font-extrabold text-success">{money(done.change_given)}</div>
                </div>
              )}
              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setPrintSale(done)}>
                  <Printer />
                  {t('طباعة', 'Imprimer')}
                </Button>
                <Button autoFocus onClick={() => (setDone(null), searchRef.current?.focus())}>
                  {t('بيع جديد', 'Nouvelle vente')}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {printSale && receiptCfg.data && <PrintReceipt sale={printSale} cfg={receiptCfg.data} onDone={() => setPrintSale(null)} />}
    </div>
  )
}

function CatChip({ active, onClick, label, icon, color }: { active: boolean; onClick: () => void; label: string; icon: React.ReactNode; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all', active ? 'border-transparent text-white shadow-md' : 'border-border bg-surface text-muted hover:text-text')}
      style={active ? { background: color ?? '#0F172A' } : undefined}
    >
      {icon}
      {label}
    </button>
  )
}

function PriceEdit({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  if (!edit)
    return (
      <button onClick={() => (setV(String(value / 100)), setEdit(true))} className="underline decoration-dotted underline-offset-2 hover:text-brand">
        {money(value)}
      </button>
    )
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))}
      onBlur={() => {
        const c = parseMoney(v)
        if (c !== null && c >= 0) onChange(c)
        setEdit(false)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="num h-6 w-20 rounded border border-brand px-1 text-xs"
      dir="ltr"
    />
  )
}

function LineDiscount({ line, maxPercent, onChange }: { line: CartLine; maxPercent: number; onChange: (v: number) => void }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const gross = Math.round(line.unit_price * line.qty)
  const opts = [5, 10, 15, 20, 50].filter((p) => p <= maxPercent)
  if (!opts.length && !line.discount) return null
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className={cn('flex h-8 items-center gap-1 rounded-lg px-2 text-xs', line.discount ? 'bg-success/10 text-success' : 'text-subtle hover:bg-surface-2 hover:text-text')}>
        <Percent className="size-3.5" />
      </button>
      {open && (
        <div className="absolute bottom-9 start-0 z-10 flex gap-1 rounded-xl border border-border bg-surface p-1.5 shadow-pop">
          {opts.map((p) => (
            <button key={p} onClick={() => (onChange(Math.round((gross * p) / 100)), setOpen(false))} className="num rounded-lg px-2 py-1 text-xs font-semibold hover:bg-brand-50 hover:text-brand">
              {p}%
            </button>
          ))}
          {line.discount > 0 && (
            <button onClick={() => (onChange(0), setOpen(false))} className="rounded-lg px-2 py-1 text-xs text-danger hover:bg-danger/10">
              {t('إزالة', 'Retirer')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function CartDiscountDialog({
  open,
  onClose,
  net,
  subtotal,
  current,
  maxPercent,
  onApply,
}: {
  open: boolean
  onClose: () => void
  net: number
  subtotal: number
  current: number
  maxPercent: number
  onApply: (v: number) => void
}) {
  const { t } = useLang()
  const [mode, setMode] = useState<'percent' | 'amount'>('percent')
  const [v, setV] = useState('')
  useEffect(() => setV(open && current ? String(current / 100) : ''), [open, current])
  useEffect(() => {
    if (open && current) setMode('amount')
  }, [open, current])
  const n = Number(v.replace(',', '.')) || 0
  const amount = mode === 'percent' ? Math.round((net * n) / 100) : Math.round(n * 100)
  const pct = subtotal ? ((subtotal - (net - amount)) / subtotal) * 100 : 0
  const over = pct > maxPercent + 0.001
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="sm" title={t('تخفيض على السلة', 'Remise sur le panier')} description={t(`الحد المسموح لك: ${maxPercent}%`, `Votre limite : ${maxPercent}%`)}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant={mode === 'percent' ? 'navy' : 'outline'} onClick={() => setMode('percent')}>
            %
          </Button>
          <Button variant={mode === 'amount' ? 'navy' : 'outline'} onClick={() => setMode('amount')}>
            DH
          </Button>
        </div>
        <Input autoFocus value={v} onChange={(e) => setV(e.target.value.replace(/[^\d.,]/g, ''))} className="num h-14 text-center text-2xl font-bold" dir="ltr" />
        <div className={cn('num rounded-xl p-3 text-center text-sm', over ? 'bg-danger/10 text-danger' : 'bg-surface-2')}>
          -{money(amount)} → {money(Math.max(0, net - amount))}
          {over && <div className="mt-1 text-xs">{t('يتجاوز الحد المسموح', 'Dépasse votre limite')}</div>}
        </div>
        <div className="flex gap-2">
          {current > 0 && (
            <Button variant="danger-soft" onClick={() => (onApply(0), onClose())}>
              {t('إزالة', 'Retirer')}
            </Button>
          )}
          <Button className="flex-1" disabled={over || amount < 0 || amount > net} onClick={() => (onApply(amount), onClose())}>
            {t('تطبيق', 'Appliquer')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function HistorySheet({ open, onClose, onPrint, device }: { open: boolean; onClose: () => void; onPrint: (s: Sale) => void; device: DeviceInfo }) {
  const { sb, can } = useAuth()
  const [refunding, setRefunding] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const { t } = useLang()
  const cfg = useReceiptConfig(sb)
  const [selected, setSelected] = useState<string | null>(null)
  const list = useQuery({
    queryKey: ['pos-history'],
    enabled: open,
    queryFn: async () => (await sb.rpc('recent_sales', { p_limit: 40 })).data as { id: string; number: string; status: string; total: number; created_at: string; employee_name: string; customer_name: string | null }[],
  })
  const sale = useQuery({
    queryKey: ['sale', selected],
    enabled: !!selected,
    queryFn: async () => (await sb.rpc('get_sale', { p_id: selected })).data as Sale,
  })
  return (
    <Sheet open={open} onOpenChange={(o) => !o && (onClose(), setSelected(null))} title={t('المبيعات الأخيرة', 'Ventes récentes')} width="max-w-lg">
      {selected ? (
        <div className="space-y-4">
          <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
            ← {t('رجوع', 'Retour')}
          </Button>
          {sale.data && cfg.data ? (
            <>
              <div className="flex justify-center rounded-xl bg-white p-4 ring-1 ring-border">
                <Receipt sale={sale.data} cfg={cfg.data} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => onPrint(sale.data!)}>
                  <Printer />
                  {t('إعادة الطباعة', 'Réimprimer')}
                </Button>
                {can('pos.invoice') && sale.data.status === 'completed' && (
                  <Button variant="outline" onClick={() => setInvoicing(true)}>
                    {t('فاتورة A4', 'Facture A4')}
                  </Button>
                )}
                {can('pos.refund') && sale.data.status === 'completed' && (
                  <Button variant="danger-soft" onClick={() => setRefunding(true)}>
                    {t('إرجاع', 'Retour')}
                  </Button>
                )}
              </div>
              <CreateInvoiceDialog saleId={sale.data.id} customer={sale.data.customer} open={invoicing} onClose={() => setInvoicing(false)} />
              <RefundDialog device={device} sale={refunding ? sale.data : null} onClose={() => setRefunding(false)} onDone={() => (setRefunding(false), sale.refetch(), list.refetch())} />
            </>
          ) : (
            <Spinner />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {list.data?.map((s) => (
            <button key={s.id} onClick={() => setSelected(s.id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface p-3 text-start transition-colors hover:border-brand/40">
              <div className="min-w-0 flex-1">
                <div className="num font-semibold">{s.number}</div>
                <div className="truncate text-xs text-muted">
                  <span className="num">{format(new Date(s.created_at), 'dd/MM HH:mm')}</span> · {s.employee_name}
                  {s.customer_name ? ` · ${s.customer_name}` : ''}
                </div>
              </div>
              <div className={cn('num font-bold', s.status === 'voided' && 'text-subtle line-through')}>{money(s.total)}</div>
            </button>
          ))}
          {list.data && !list.data.length && <EmptyState title={t('لا مبيعات بعد', 'Aucune vente')} />}
        </div>
      )}
    </Sheet>
  )
}

