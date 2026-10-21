// GitHub Pages has no SPA rewrites: copy the site shell to every public
// route so they answer 200 (good for Google), keep 404.html as the
// fallback for dynamic URLs, and write robots.txt + sitemap.xml.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'

const BASE = 'https://yassir1778.github.io/sweet-house'
const ROUTES = ['shop', 'services', 'abroad', 'my', 'alerts', 'unsubscribe', 'track', 'contact', 'privacy', 'terms', 'checkout']

copyFileSync('dist/index.html', 'dist/404.html')
for (const r of ROUTES) {
  mkdirSync(`dist/${r}`, { recursive: true })
  copyFileSync('dist/index.html', `dist/${r}/index.html`)
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  'dist/sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    ['', ...ROUTES.filter((r) => r !== 'checkout')].map((r) => `  <url><loc>${BASE}/${r ? r + '/' : ''}</loc><lastmod>${today}</lastmod></url>`).join('\n') +
    `\n</urlset>\n`,
)
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /sweet-house/\nDisallow: /sweet-house/admin/\nDisallow: /sweet-house/pos/\nSitemap: ${BASE}/sitemap.xml\n`)
console.log('postbuild: routes, 404, sitemap, robots')
