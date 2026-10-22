import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { AnimatePresence, motion } from 'motion/react'
import { MapPin, Menu, MessageCircle, Phone, Search, ShoppingBag, X } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { Button } from '@/shared/ui/primitives'
import { LangToggle, Logo } from '@/shared/ui/brand'
import { useCart } from './cart'
import { CartDrawer } from './pages/Checkout'
import { openStatus, useSite } from './data'
import { loadPixels } from './pixels'
import { FocusProductPage } from './pages/ProductLanding'
import { BRAND, BRANDS, ME, OTHER, SITES } from '@/shared/lib/brand'
import type { MenuLink } from '@/shared/lib/blocks'

const LINKS =
  BRAND === 'store'
    ? [
        { to: '/', ar: 'الرئيسية', fr: 'Accueil', end: true },
        { to: '/shop', ar: 'كل المنتجات', fr: 'Produits' },
        { to: '/school-list', ar: '🎒 اللائحة المدرسية', fr: '🎒 Liste scolaire' },
        { to: '/faq', ar: 'الأسئلة الشائعة', fr: 'FAQ' },
        { to: '/track', ar: 'تتبّع طلبيتي', fr: 'Suivi' },
        { to: '/contact', ar: 'تواصل معنا', fr: 'Contact' },
      ]
    : [
        { to: '/', ar: 'الرئيسية', fr: 'Accueil', end: true },
        { to: '/services', ar: 'الخدمات الإدارية', fr: 'Services administratifs' },
        { to: '/abroad', ar: '🌍 خارج المغرب', fr: '🌍 MRE' },
        { to: '/my', ar: 'وثائقي', fr: 'Mes documents' },
        { to: '/track', ar: 'تتبّع طلب', fr: 'Suivi' },
        { to: '/contact', ar: 'تواصل معنا', fr: 'Contact' },
      ]
const DEFAULT_LINKS = LINKS
const OTHER_LINK = { url: SITES[OTHER], ...BRANDS[OTHER], icon: OTHER === 'store' ? '🛍️' : '🗂️' }

export function useSeo(title?: string) {
  const { t, pick } = useLang()
  const site = useSite()
  useEffect(() => {
    const name = t(ME.name_ar, ME.name_fr)
    document.title = title ? `${title} — ${name}` : name
    const desc = site.data ? pick(BRAND === 'store' && site.data.storeSite ? site.data.storeSite.seo : site.data.website.seo, 'description') : ''
    let m = document.querySelector('meta[name="description"]')
    if (!m) {
      m = document.createElement('meta')
      m.setAttribute('name', 'description')
      document.head.appendChild(m)
    }
    m.setAttribute('content', desc)
  }, [title, site.data, pick, t])
}

/** Ad landing page shell: page only, plus the pixels. */
export function FocusLayout() {
  const site = useSite()
  useEffect(() => {
    if (BRAND === 'store') loadPixels(site.data?.tracking)
  }, [site.data?.tracking])
  return (
    <div className="min-h-screen bg-bg">
      <ScrollRestoration />
      <FocusProductPage />
    </div>
  )
}

export function SiteLayout() {
  const { t, pick } = useLang()
  const site = useSite()
  const cart = useCart()
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => setMenu(false), [loc.pathname])
  useEffect(() => {
    if (BRAND === 'store') loadPixels(site.data?.tracking)
  }, [site.data?.tracking])
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

  const store = site.data?.store
  const saved = (BRAND === 'store' ? site.data?.storeSite?.menu : (site.data?.website as { menu?: MenuLink[] } | undefined)?.menu) ?? []
  const LINKS = saved.length ? saved.map((m) => ({ to: m.to, ar: m.label_ar, fr: m.label_fr || m.label_ar, end: m.to === '/' })) : DEFAULT_LINKS
  const ann = BRAND === 'store' ? site.data?.storeSite?.announcement : site.data?.website.announcement
  const wa = store?.whatsapp || '212697740298'

  return (
    <div className="min-h-screen bg-bg">
      <ScrollRestoration />
      {ann?.enabled && pick(ann, 'text') && <div className="bg-brand px-4 py-2 text-center text-sm font-medium text-white">{pick(ann, 'text')}</div>}
      <header className={cn('sticky top-0 z-40 transition-all', scrolled ? 'border-b border-border/70 bg-bg/85 shadow-sm backdrop-blur-xl' : 'bg-bg')}>
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/">
            <Logo color={ME.color} subtitle={t(ME.sub_ar, ME.sub_fr)} />
          </Link>
          <nav className="ms-6 hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cn('rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand' : 'text-muted hover:text-text')}>
                {t(l.ar, l.fr)}
              </NavLink>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <OpenBadge />
            <a href={OTHER_LINK.url} className="me-1 hidden rounded-full border border-border px-3 py-1 text-xs font-medium text-muted hover:text-text xl:inline-block">
              {OTHER_LINK.icon} {t(OTHER_LINK.name_ar, OTHER_LINK.name_fr)}
            </a>
            {BRAND === 'store' && (
              <Button asChild variant="ghost" size="icon" className="hidden sm:inline-flex">
                <Link to="/shop" aria-label="search">
                  <Search />
                </Link>
              </Button>
            )}
            <LangToggle compact />
            {BRAND === 'store' && (
            <Button variant="ghost" size="icon" className="relative" onClick={() => cart.setOpen(true)} aria-label="cart">
              <ShoppingBag />
              <AnimatePresence>
                {cart.count > 0 && (
                  <motion.span key={cart.count} initial={{ scale: 0 }} animate={{ scale: 1 }} className="num absolute end-0.5 top-0.5 flex min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                    {cart.count}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
            )}
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenu(!menu)}>
              {menu ? <X /> : <Menu />}
            </Button>
          </div>
        </div>
        <AnimatePresence>
          {menu && (
            <motion.nav initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-border bg-surface lg:hidden">
              <div className="flex flex-col p-3">
                {LINKS.map((l) => (
                  <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => cn('rounded-lg px-3 py-3 text-sm font-medium', isActive ? 'bg-brand-50 text-brand' : 'text-text')}>
                    {t(l.ar, l.fr)}
                  </NavLink>
                ))}
                <a href={OTHER_LINK.url} className="rounded-lg px-3 py-3 text-sm font-medium text-muted">
                  {OTHER_LINK.icon} {t(`زوروا ${OTHER_LINK.name_ar}`, `Voir ${OTHER_LINK.name_fr}`)}
                </a>
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main>
        <AnimatePresence mode="wait">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mt-20 bg-navy text-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo invert color={ME.color} subtitle={t(ME.sub_ar, ME.sub_fr)} />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/60">{t(ME.tagline_ar, ME.tagline_fr)}</p>
            <a href={OTHER_LINK.url} className="mt-5 flex max-w-sm items-center gap-3 rounded-2xl bg-white/5 p-3 text-sm hover:bg-white/10">
              <span className="text-2xl">{OTHER_LINK.icon}</span>
              <span>
                <span className="block text-white/50">{t('عندنا أيضاً', 'Découvrez aussi')}</span>
                <span className="block font-semibold">{t(OTHER_LINK.name_ar, OTHER_LINK.name_fr)} — {t(OTHER_LINK.tagline_ar, OTHER_LINK.tagline_fr)}</span>
              </span>
            </a>
            <div className="mt-5 flex gap-2">
              {store?.socials?.facebook && (
                <a href={store.socials.facebook} target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center rounded-lg bg-white/10 hover:bg-brand">
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M14 9V7c0-1 .5-1.5 1.5-1.5H17V2h-3c-3 0-4 2-4 4.5V9H8v3.5h2V22h4v-9.5h2.6L17 9h-3Z" /></svg>
                </a>
              )}
              {store?.socials?.instagram && (
                <a href={store.socials.instagram} target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center rounded-lg bg-white/10 hover:bg-brand">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
                </a>
              )}
              <a href={whatsappLink(wa, '')} target="_blank" rel="noreferrer" className="flex size-9 items-center justify-center rounded-lg bg-white/10 hover:bg-[#25D366]">
                <MessageCircle className="size-4" />
              </a>
            </div>
          </div>
          <div>
            <div className="mb-3 font-semibold">{t('روابط', 'Liens')}</div>
            <ul className="space-y-2 text-sm text-white/60">
              {LINKS.slice(1).map((l) => (
                <li key={l.to}>
                  <Link to={l.to} className="hover:text-white">
                    {t(l.ar, l.fr)}
                  </Link>
                </li>
              ))}
              {BRAND === 'services' ? (
                <li>
                  <Link to="/alerts" className="hover:text-white">
                    {t('🔔 تنبيهات المباريات على واتساب', '🔔 Alertes WhatsApp')}
                  </Link>
                </li>
              ) : (
                <li>
                  <Link to="/returns" className="hover:text-white">
                    {t('الإرجاع والاستبدال', 'Retours et échanges')}
                  </Link>
                </li>
              )}
              <li>
                <Link to="/privacy" className="hover:text-white">
                  {t('سياسة الخصوصية', 'Confidentialité')}
                </Link>
              </li>
              <li>
                <Link to="/terms" className="hover:text-white">
                  {t('شروط الاستعمال', 'Conditions')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-semibold">{t('تواصل', 'Contact')}</div>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li className="flex gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                {store ? pick(store, 'address') : ''}
              </li>
              <li className="flex gap-2">
                <Phone className="mt-0.5 size-4 shrink-0 text-brand" />
                <a href={`tel:${store?.phone ?? ''}`} className="num hover:text-white" dir="ltr">
                  {store?.phone}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 py-5 text-center text-xs text-white/40">
          © {new Date().getFullYear()} {t(ME.name_ar, ME.name_fr)}
          {site.data?.legal.cndp && <span className="num"> · CNDP {site.data.legal.cndp}</span>}
        </div>
      </footer>

      {!/\/services\/[^/]+/.test(loc.pathname) && (
      <a href={whatsappLink(wa, t('مرحباً سويت هاوس 👋', 'Bonjour Sweet House 👋'))} target="_blank" rel="noreferrer" aria-label="WhatsApp" className="fixed end-5 bottom-5 z-30 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl shadow-[#25D366]/30 transition-transform hover:scale-110">
        <span className="absolute inset-0 animate-ping rounded-full bg-[#25D366] opacity-30" />
        <MessageCircle className="relative size-7" />
      </a>
      )}
      {BRAND === 'store' && <CartDrawer />}
    </div>
  )
}

const DAY: Record<number, [string, string]> = { 0: ['الأحد', 'dimanche'], 1: ['الإثنين', 'lundi'], 2: ['الثلاثاء', 'mardi'], 3: ['الأربعاء', 'mercredi'], 4: ['الخميس', 'jeudi'], 5: ['الجمعة', 'vendredi'], 6: ['السبت', 'samedi'] }

export function OpenBadge({ big }: { big?: boolean }) {
  const { t } = useLang()
  const site = useSite()
  const [, tick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 60_000)
    return () => clearInterval(i)
  }, [])
  const st = openStatus(site.data?.store.hours)
  if (!st) return null
  const label = st.open
    ? st.closingSoon
      ? t(`يغلق قريباً (${st.until})`, `Ferme bientôt (${st.until})`)
      : t(`مفتوح الآن · حتى ${st.until}`, `Ouvert · jusqu’à ${st.until}`)
    : st.next
      ? st.today
        ? t(`مغلق · يفتح ${st.next}`, `Fermé · ouvre à ${st.next}`)
        : t(`مغلق · يفتح ${DAY[st.day!]?.[0]} ${st.next}`, `Fermé · ouvre ${DAY[st.day!]?.[1]} ${st.next}`)
      : t('مغلق', 'Fermé')
  return (
    <span className={cn('items-center gap-1.5 rounded-full font-medium', big ? 'inline-flex px-3 py-1.5 text-sm' : 'me-2 hidden px-2.5 py-1 text-xs md:inline-flex', st.open ? (st.closingSoon ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success') : 'bg-danger/10 text-danger')}>
      <span className="relative flex size-2">
        {st.open && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span className="num">{label}</span>
    </span>
  )
}
