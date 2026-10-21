// Sweet House service worker: app shell offline support.
// - Pages: network first, cached copy when offline.
// - Hashed build assets & icons: cache first.
// - Google Fonts: stale-while-revalidate.
// - Supabase API / storage: never cached (always live data).
const VERSION = 'sh-v2'
const SHELL = ['/sweet-house/', '/sweet-house/pos/', '/sweet-house/admin/', '/sweet-house/logo.svg', '/sweet-house/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.hostname.endsWith('supabase.co')) return

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(VERSION).then((c) => c.put(req, copy))
          return res
        })
        .catch(async () => {
          const c = await caches.open(VERSION)
          const path = url.pathname
          const app = path.startsWith('/sweet-house/pos') ? '/sweet-house/pos/' : path.startsWith('/sweet-house/admin') ? '/sweet-house/admin/' : '/sweet-house/'
          return (await c.match(req)) || (await c.match(app)) || Response.error()
        }),
    )
    return
  }

  if (url.pathname.startsWith('/sweet-house/assets/') || /\.(png|svg|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req)
        const net = fetch(req)
          .then((res) => {
            c.put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || net
      }),
    )
  }
})

// Web push from the push-notify Edge Function
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch {
    d = { title: 'Sweet House', body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(d.title || 'Sweet House', {
      body: d.body || '',
      icon: '/sweet-house/icon-192.png',
      badge: '/sweet-house/icon-192.png',
      tag: d.tag,
      dir: 'rtl',
      lang: 'ar',
      data: { url: d.url || '/sweet-house/admin/' },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/sweet-house/admin/'
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const app = url.includes('/pos/') ? '/sweet-house/pos/' : '/sweet-house/admin/'
      const open = list.find((c) => c.url.includes(app))
      if (open) return open.focus().then((c) => (c && 'navigate' in c ? c.navigate(url) : c))
      return self.clients.openWindow(url)
    }),
  )
})
