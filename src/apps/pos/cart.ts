import { useReducer } from 'react'
import type { PosPack, PosProduct, PosService, PosVariant } from './catalog'
import { servicePrice } from './catalog'

export type CartLine = {
  key: string
  type: 'product' | 'service'
  product?: PosProduct
  variant?: PosVariant
  pack?: PosPack | null
  service?: PosService
  name_ar: string
  name_fr: string
  qty: number
  unit_price: number
  /** Catalog price (null for open-amount services) */
  base_price: number | null
  discount: number
}

export type CartState = { lines: CartLine[]; discount: number; customer: { id: string; full_name: string; phone: string | null } | null; note: string }

type Action =
  | { type: 'addProduct'; product: PosProduct; variant: PosVariant; pack?: PosPack | null; qty?: number }
  | { type: 'addService'; service: PosService; qty: number; amount?: number }
  | { type: 'qty'; key: string; qty: number }
  | { type: 'price'; key: string; price: number }
  | { type: 'lineDiscount'; key: string; discount: number }
  | { type: 'remove'; key: string }
  | { type: 'discount'; discount: number }
  | { type: 'customer'; customer: CartState['customer'] }
  | { type: 'note'; note: string }
  | { type: 'load'; state: CartState }
  | { type: 'clear' }

export const emptyCart: CartState = { lines: [], discount: 0, customer: null, note: '' }

function reprice(l: CartLine): CartLine {
  if (l.type === 'service' && l.service && l.service.pricing_mode === 'tiered' && l.unit_price === l.base_price) {
    const p = servicePrice(l.service, l.qty)
    return { ...l, unit_price: p, base_price: p }
  }
  if (l.type === 'service' && l.service && l.service.pricing_mode === 'tiered') {
    return { ...l, base_price: servicePrice(l.service, l.qty) }
  }
  return l
}

function reducer(s: CartState, a: Action): CartState {
  switch (a.type) {
    case 'addProduct': {
      const key = `p:${a.variant.id}:${a.pack?.id ?? ''}`
      const existing = s.lines.find((l) => l.key === key)
      if (existing) return { ...s, lines: s.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + (a.qty ?? 1) } : l)) }
      const price = a.pack ? a.pack.price : a.variant.price
      const vname = (x: string | null) => (x ? ` - ${x}` : '')
      return {
        ...s,
        lines: [
          ...s.lines,
          {
            key,
            type: 'product',
            product: a.product,
            variant: a.variant,
            pack: a.pack ?? null,
            name_ar: a.product.name_ar + vname(a.variant.name_ar) + (a.pack ? ` (${a.pack.name_ar})` : ''),
            name_fr: a.product.name_fr + vname(a.variant.name_fr) + (a.pack ? ` (${a.pack.name_fr})` : ''),
            qty: a.qty ?? 1,
            unit_price: price,
            base_price: price,
            discount: 0,
          },
        ],
      }
    }
    case 'addService': {
      const open = a.service.pricing_mode === 'open'
      const key = open ? `s:${a.service.id}:${crypto.randomUUID()}` : `s:${a.service.id}`
      const existing = !open && s.lines.find((l) => l.key === key)
      if (existing) return { ...s, lines: s.lines.map((l) => (l.key === key ? reprice({ ...l, qty: l.qty + a.qty }) : l)) }
      const price = open ? (a.amount ?? 0) : servicePrice(a.service, a.qty)
      return {
        ...s,
        lines: [
          ...s.lines,
          { key, type: 'service', service: a.service, name_ar: a.service.name_ar, name_fr: a.service.name_fr, qty: a.qty, unit_price: price, base_price: open ? null : price, discount: 0 },
        ],
      }
    }
    case 'qty':
      return { ...s, lines: a.qty <= 0 ? s.lines.filter((l) => l.key !== a.key) : s.lines.map((l) => (l.key === a.key ? reprice({ ...l, qty: a.qty }) : l)) }
    case 'price':
      return { ...s, lines: s.lines.map((l) => (l.key === a.key ? { ...l, unit_price: a.price } : l)) }
    case 'lineDiscount':
      return { ...s, lines: s.lines.map((l) => (l.key === a.key ? { ...l, discount: a.discount } : l)) }
    case 'remove':
      return { ...s, lines: s.lines.filter((l) => l.key !== a.key) }
    case 'discount':
      return { ...s, discount: a.discount }
    case 'customer':
      return { ...s, customer: a.customer }
    case 'note':
      return { ...s, note: a.note }
    case 'load':
      return a.state
    case 'clear':
      return emptyCart
  }
}

export function useCart() {
  return useReducer(reducer, emptyCart)
}

export function lineTotal(l: CartLine) {
  return Math.round(l.unit_price * l.qty) - l.discount
}

export function cartTotals(s: CartState) {
  const subtotal = s.lines.reduce((a, l) => a + Math.round((l.base_price ?? l.unit_price) * l.qty), 0)
  const net = s.lines.reduce((a, l) => a + lineTotal(l), 0)
  const total = Math.max(0, net - s.discount)
  const items = s.lines.reduce((a, l) => a + l.qty, 0)
  return { subtotal, net, total, discount: subtotal - total, items }
}

export function toPayload(s: CartState, id: string, deviceId: string | null, pay: { cash: number; card: number; credit?: number }) {
  return {
    id,
    device_id: deviceId,
    customer_id: s.customer?.id ?? null,
    note: s.note || null,
    discount: s.discount,
    payments: pay,
    items: s.lines.map((l) =>
      l.type === 'product'
        ? { type: 'product', variant_id: l.variant!.id, pack_id: l.pack?.id ?? null, qty: l.qty, unit_price: l.unit_price, discount: l.discount }
        : { type: 'service', service_id: l.service!.id, qty: l.qty, unit_price: l.unit_price, discount: l.discount },
    ),
  }
}
