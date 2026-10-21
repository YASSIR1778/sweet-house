import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/shared/lib/supabase'
import type { Service, ServiceCategory, StoreSettings } from '@/shared/lib/types'

export const sb = getSupabase('site')

export type WebsiteSettings = {
  announcement: { enabled: boolean; text_ar: string; text_fr: string }
  hero: { title_ar: string; title_fr: string; subtitle_ar: string; subtitle_fr: string; image_url: string | null }
  features: { icon: string; title_ar: string; title_fr: string; text_ar: string; text_fr: string }[]
  about: { title_ar: string; title_fr: string; text_ar: string; text_fr: string }
  faq: { q_ar: string; q_fr: string; a_ar: string; a_fr: string }[]
  sections: Record<'features' | 'featured' | 'services' | 'about' | 'faq', boolean>
  seo: { description_ar: string; description_fr: string }
  legal: { privacy_ar: string; privacy_fr: string; terms_ar: string; terms_fr: string }
}
export type DeliverySettings = { enabled: boolean; cod: boolean; default_price: number; free_above: number | null; zones: { city: string; city_ar: string; price: number }[] }
export type PaymentSettings = { cod: boolean; in_store: boolean; bank_transfer: boolean; bank_name: string; rib: string; account_holder: string }

export type AbroadSettings = { enabled: boolean; post_note_ar: string; post_note_fr: string; payment_note_ar: string; payment_note_fr: string }
export type SiteData = { store: StoreSettings; website: WebsiteSettings; delivery: DeliverySettings; payments: PaymentSettings; legal: { cndp?: string; company_name?: string; ice?: string }; abroad: AbroadSettings | null }

/** Opening status from the weekly hours (Morocco local time). */
export function openStatus(hours: StoreSettings['hours'] | undefined, now = new Date()) {
  if (!hours?.length) return null
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }))
  const day = local.getDay()
  const mins = local.getHours() * 60 + local.getMinutes()
  const toMin = (s: string | null) => (s ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null)
  const today = hours.find((h) => h.day === day)
  const o = toMin(today?.open ?? null)
  const c = toMin(today?.close ?? null)
  if (o !== null && c !== null && mins >= o && mins < c) return { open: true, until: today!.close as string, closingSoon: c - mins <= 30 }
  if (o !== null && mins < o) return { open: false, next: today!.open as string, today: true }
  for (let i = 1; i <= 7; i++) {
    const h = hours.find((x) => x.day === (day + i) % 7)
    if (h?.open) return { open: false, next: h.open, day: (day + i) % 7, today: false }
  }
  return { open: false }
}

export function useSite() {
  return useQuery({
    queryKey: ['site-settings'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await sb.from('settings').select('key, value').in('key', ['store', 'website', 'delivery', 'online_payments', 'legal', 'abroad'])
      if (error) throw error
      const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
      return { store: m.store, website: m.website, delivery: m.delivery, payments: m.online_payments, legal: m.legal ?? {}, abroad: m.abroad ?? null } as SiteData
    },
  })
}

export type ShopVariant = { id: string; name_ar: string | null; name_fr: string | null; price: number; compare_at_price: number | null; stock_qty: number; image_url: string | null; sort: number }
export type ShopProduct = {
  id: string
  category_id: string | null
  name_ar: string
  name_fr: string
  description_ar: string | null
  description_fr: string | null
  brand: string | null
  images: string[]
  track_stock: boolean
  is_featured: boolean
  created_at: string
  product_variants: ShopVariant[]
}
export type ShopCategory = { id: string; name_ar: string; name_fr: string; icon: string | null; color: string; sort: number }

export function useShop() {
  return useQuery({
    queryKey: ['shop'],
    staleTime: 60_000,
    queryFn: async () => {
      const [p, c] = await Promise.all([
        sb.from('products').select('id, category_id, name_ar, name_fr, description_ar, description_fr, brand, images, track_stock, is_featured, created_at, product_variants(id, name_ar, name_fr, price, compare_at_price, stock_qty, image_url, sort)').order('sort').order('created_at', { ascending: false }),
        sb.from('categories').select('id, name_ar, name_fr, icon, color, sort').order('sort'),
      ])
      if (p.error) throw p.error
      const products = ((p.data ?? []) as ShopProduct[]).map((x) => ({ ...x, product_variants: [...x.product_variants].sort((a, b) => a.sort - b.sort) })).filter((x) => x.product_variants.length)
      const used = new Set(products.map((x) => x.category_id))
      return { products, categories: ((c.data ?? []) as ShopCategory[]).filter((x) => used.has(x.id)) }
    },
  })
}

export function useAdminServices() {
  return useQuery({
    queryKey: ['site-services'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [s, c] = await Promise.all([
        sb.from('services').select('*').eq('kind', 'admin').order('sort'),
        sb.from('service_categories').select('*').eq('kind', 'admin').is('deleted_at', null).order('sort'),
      ])
      if (s.error) throw s.error
      return { services: (s.data ?? []) as Service[], categories: (c.data ?? []) as ServiceCategory[] }
    },
  })
}

export function inStock(p: ShopProduct, v?: ShopVariant) {
  if (!p.track_stock) return true
  return v ? v.stock_qty > 0 : p.product_variants.some((x) => x.stock_qty > 0)
}

export function trackUrl(code: string) {
  return `${location.origin}${import.meta.env.BASE_URL}track/${code}`
}
