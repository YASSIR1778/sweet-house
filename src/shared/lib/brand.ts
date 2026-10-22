// Which public website this build is: the Services site (default) or the Store.
// Same code and database; vite.store.config.ts sets VITE_BRAND=store.
export type Brand = 'services' | 'store'

export const BRAND: Brand = import.meta.env.VITE_BRAND === 'store' ? 'store' : 'services'

export const SITES: Record<Brand, string> = {
  services: 'https://yassir1778.github.io/sweet-house',
  store: 'https://yassir1778.github.io/sweet-house-store',
}

export const BRANDS: Record<Brand, { name_ar: string; name_fr: string; sub_ar: string; sub_fr: string; tagline_ar: string; tagline_fr: string; color: string; color600: string; color50: string; ring: string }> = {
  services: {
    name_ar: 'سويت هاوس للخدمات',
    name_fr: 'Sweet House Services',
    sub_ar: 'خدمات إدارية وإلكترونية',
    sub_fr: 'Services administratifs',
    tagline_ar: 'وراقك الإدارية من تيليفونك',
    tagline_fr: 'Vos démarches administratives depuis votre téléphone',
    color: '#2563EB',
    color600: '#1D4ED8',
    color50: '#EFF6FF',
    ring: 'rgb(37 99 235 / 0.35)',
  },
  store: {
    name_ar: 'متجر سويت هاوس',
    name_fr: 'Sweet House Store',
    sub_ar: 'متجر إلكتروني · تطوان',
    sub_fr: 'Boutique en ligne · Tétouan',
    tagline_ar: 'كلشي اللي محتاج، يوصلك لباب الدار',
    tagline_fr: 'Tout ce qu’il vous faut, livré chez vous',
    color: '#FF6B35',
    color600: '#F05A24',
    color50: '#FFF3EE',
    ring: 'rgb(255 107 53 / 0.35)',
  },
}

export const ME = BRANDS[BRAND]
export const OTHER: Brand = BRAND === 'store' ? 'services' : 'store'

/** Paint the brand colour on the public site. */
export function applyBrandColors() {
  const s = document.documentElement.style
  s.setProperty('--brand', ME.color)
  s.setProperty('--brand-600', ME.color600)
  s.setProperty('--brand-50', ME.color50)
  s.setProperty('--ring', ME.ring)
}

/** Paths that live on the other site (old links keep working). */
export function otherSitePath(path: string): string | null {
  const storePaths = /^\/(shop|checkout|faq|returns|p)(\/|$)/
  const servicePaths = /^\/(services|abroad|my|alerts)(\/|$)/
  if (BRAND === 'services' && storePaths.test(path)) return SITES.store + path
  if (BRAND === 'store' && servicePaths.test(path)) return SITES.services + path
  return null
}
