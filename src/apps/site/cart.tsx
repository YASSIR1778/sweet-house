import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { storage } from '@/shared/lib/utils'

export type CartItem = { variant_id: string; product_id: string; name_ar: string; name_fr: string; image: string | null; price: number; qty: number; max: number | null }

type Ctx = {
  items: CartItem[]
  add: (i: CartItem) => void
  setQty: (variant_id: string, qty: number) => void
  remove: (variant_id: string) => void
  clear: () => void
  count: number
  subtotal: number
  open: boolean
  setOpen: (v: boolean) => void
}

const C = createContext<Ctx | null>(null)
const store = storage<CartItem[]>('sh-site-cart', [])

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(store.get)
  const [open, setOpen] = useState(false)
  useEffect(() => store.set(items), [items])

  const clamp = (q: number, max: number | null) => Math.max(1, max === null ? q : Math.min(q, max))

  const value: Ctx = {
    items,
    add: (i) =>
      setItems((xs) => {
        const ex = xs.find((x) => x.variant_id === i.variant_id)
        return ex ? xs.map((x) => (x.variant_id === i.variant_id ? { ...x, qty: clamp(x.qty + i.qty, i.max) } : x)) : [...xs, { ...i, qty: clamp(i.qty, i.max) }]
      }),
    setQty: (id, q) => setItems((xs) => (q <= 0 ? xs.filter((x) => x.variant_id !== id) : xs.map((x) => (x.variant_id === id ? { ...x, qty: clamp(q, x.max) } : x)))),
    remove: (id) => setItems((xs) => xs.filter((x) => x.variant_id !== id)),
    clear: () => setItems([]),
    count: items.reduce((a, x) => a + x.qty, 0),
    subtotal: items.reduce((a, x) => a + x.price * x.qty, 0),
    open,
    setOpen,
  }
  return <C.Provider value={value}>{children}</C.Provider>
}

export function useCart() {
  const c = useContext(C)
  if (!c) throw new Error('useCart outside provider')
  return c
}
