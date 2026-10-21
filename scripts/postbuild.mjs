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
  ? ['shop', 'checkout', 'school-list', 'faq', 'returns', 'track', 'contact', 'privacy', 'terms', 'unsubscribe', 'p']
  : ['services', 'abroad', 'my', 'alerts', 'unsubscribe', 'track', 'contact', 'privacy', 'terms']

copyFileSync(`${DIST}/index.html`, `${DIST}/404.html`)
for (const r of ROUTES) {
  mkdirSync(`${DIST}/${r}`, { recursive: true })
  copyFileSync(`${DIST}/index.html`, `${DIST}/${r}/index.html`)
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  `${DIST}/sitemap.xml`,
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ['', ...ROUTES.filter((r) => !['checkout', 'p', 'unsubscribe'].includes(r))].map((r) => `  <url><loc>${BASE}/${r ? r + '/' : ''}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`,
)
writeFileSync(`${DIST}/robots.txt`, `User-agent: *\nAllow: /${SLUG}/\nDisallow: /${SLUG}/admin/\nDisallow: /${SLUG}/pos/\nDisallow: /${SLUG}/p/\nSitemap: ${BASE}/sitemap.xml\n`)
console.log(`postbuild (${STORE ? 'store' : 'services'}): routes, 404, sitemap, robots`)
