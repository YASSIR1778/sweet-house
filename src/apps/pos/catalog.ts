import { useQuery } from '@tanstack/react-query'
import type { SupabaseClient } from '@supabase/supabase-js'
import { storage } from '@/shared/lib/utils'

export type PosPack = { id: string; name_ar: string; name_fr: string; factor: number; barcode: string | null; price: number }
export type PosVariant = { id: string; name_ar: string | null; name_fr: string | null; sku: string | null; barcode: string | null; price: number; stock_qty: number; image_url: string | null; packs: PosPack[] }
export type PosProduct = {
  id: string
  category_id: string | null
  name_ar: string
  name_fr: string
  image: string | null
  tax_rate: number
  track_stock: boolean
  low_stock_alert: number
  has_variants: boolean
  variants: PosVariant[]
}
export type PosService = {
  id: string
  category_id: string | null
  kind: 'counter' | 'admin'
  system_key: string | null
  name_ar: string
  name_fr: string
  pricing_mode: 'fixed' | 'tiered' | 'open'
  price: number
  unit_ar: string | null
  unit_fr: string | null
  tax_rate: number
  icon: string | null
  pos_quick: boolean
  pos_color: string | null
  pos_sort: number
  tiers: { min_qty: number; unit_price: number }[]
}
export type PosCategory = { id: string; name_ar: string; name_fr: string; icon: string | null; color: string; sort: number }
export type Catalog = { categories: PosCategory[]; products: PosProduct[]; services: PosService[]; service_categories: PosCategory[] }

const cache = storage<Catalog | null>('sh-pos-catalog', null)

export function useCatalog(sb: SupabaseClient) {
  return useQuery({
    queryKey: ['pos-catalog'],
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    initialData: cache.get() ?? undefined,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const { data, error } = await sb.rpc('pos_catalog')
      if (error) throw error
      const c = data as Catalog
      cache.set(c)
      return c
    },
  })
}

export function servicePrice(s: PosService, qty: number) {
  if (s.pricing_mode !== 'tiered') return s.price
  const tier = [...s.tiers].sort((a, b) => b.min_qty - a.min_qty).find((t) => t.min_qty <= qty)
  return tier ? tier.unit_price : s.price
}

/** Find a variant or pack by barcode. */
export function findByBarcode(c: Catalog | undefined, code: string) {
  if (!c) return null
  for (const p of c.products)
    for (const v of p.variants) {
      if (v.barcode === code) return { product: p, variant: v, pack: null as PosPack | null }
      const k = v.packs.find((x) => x.barcode === code)
      if (k) return { product: p, variant: v, pack: k }
    }
  return null
}
