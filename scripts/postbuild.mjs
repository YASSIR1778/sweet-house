// GitHub Pages has no SPA rewrites: copy the site shell to every public
// route so they answer 200 (good for Google), keep 404.html as the
// fallback for dynamic URLs, and write robots.txt + sitemap.xml.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'

// `node scripts/postbuild.mjs store` → the Store site (dist-store)
const STORE = process.argv[2] === 'store'
const DIST = STORE ? 'dist-store' : 'dist'
const SLUG = STORE ? 'sweet-house-store' : 'sweet-house'
const BASE = `https://yassir1778.github.io/${SLUG}`
const ROUTES = STORE
  ? ['shop', 'checkout', 'faq', 'returns', 'track', 'contact', 'privacy', 'terms', 'unsubscribe', 'p']
  : ['services', 'abroad', 'my', 'alerts', 'unsubscribe', 'track', 'contact', 'privacy', 'terms']

copyFileSync(`${DIST}/index.html`, `${DIST}/404.html`)
for (const r of ROUTES) {
  mkdirSync(`${DIST}/${r}`, { recursive: true })
  copyFileSync(`${DIST}/index.html`, `${DIST}/${r}/index.html`)
}

const today = new Date().toISOString().slice(0, 10)
const url = (path, lastmod = today) => `  <url><loc>${BASE}/${path}</loc><lastmod>${lastmod}</lastmod></url>`

// Every visible product (store) / service (services) page, so Google finds them.
// Uses the public API values of the build environment; skipped when absent.
async function pages() {
  const api = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!api || !key) return []
  const q = STORE ? 'products?select=id,updated_at&is_online=eq.true&deleted_at=is.null' : "services?select=id,updated_at&kind=eq.admin&is_online=eq.true&is_active=eq.true&deleted_at=is.null"
  try {
    const r = await fetch(`${api}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
    if (!r.ok) return []
    return (await r.json()).map((x) => ({ path: `${STORE ? 'shop' : 'services'}/${x.id}`, lastmod: String(x.updated_at ?? today).slice(0, 10) }))
  } catch {
    return []
  }
}

const dynamic = await pages()
// A real file for each product / service page: links from ads, WhatsApp and Google
// answer 200 instead of GitHub's 404 fallback (the store also gets the /p/<id> ad page).
for (const d of dynamic) {
  for (const path of STORE ? [d.path, d.path.replace(/^shop\//, 'p/')] : [d.path]) {
    mkdirSync(`${DIST}/${path}`, { recursive: true })
    copyFileSync(`${DIST}/index.html`, `${DIST}/${path}/index.html`)
  }
}
writeFileSync(
  `${DIST}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    [...['', ...ROUTES.filter((r) => !['checkout', 'p', 'unsubscribe'].includes(r))].map((r) => url(r ? r + '/' : '')), ...dynamic.map((d) => url(d.path, d.lastmod))].join('\n') +
    `\n</urlset>\n`,
)
writeFileSync(`${DIST}/robots.txt`, `User-agent: *\nAllow: /${SLUG}/\nDisallow: /${SLUG}/admin/\nDisallow: /${SLUG}/pos/\nDisallow: /${SLUG}/p/\nSitemap: ${BASE}/sitemap.xml\n`)
console.log(`postbuild (${STORE ? 'store' : 'services'}): routes, 404, sitemap (+${dynamic.length} pages), robots`)
