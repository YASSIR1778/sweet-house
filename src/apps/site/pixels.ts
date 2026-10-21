// Ad pixels (Meta, TikTok) for the store: loaded only when the owner sets an ID
// in the dashboard. Events: PageView, ViewContent, InitiateCheckout, Purchase.
type Win = Window & { fbq?: (...a: unknown[]) => void; _fbq?: unknown; ttq?: { track: (e: string, d?: unknown) => void; page: () => void; load: (id: string) => void } & Record<string, unknown> }
const w = window as Win
let loaded = { meta: '', tiktok: '' }

export function loadPixels(ids: { meta_pixel_id?: string; tiktok_pixel_id?: string } | null | undefined) {
  const meta = (ids?.meta_pixel_id ?? '').replace(/\D/g, '')
  const tiktok = (ids?.tiktok_pixel_id ?? '').replace(/[^A-Z0-9]/gi, '')
  if (meta && loaded.meta !== meta) {
    loaded.meta = meta
    /* eslint-disable */
    ;(function (f: any, b: Document, e: string, v: string) {
      if (f.fbq) return
      const n: any = (f.fbq = function (...args: unknown[]) {
        n.callMethod ? n.callMethod(...args) : n.queue.push(args)
      })
      if (!f._fbq) f._fbq = n
      n.push = n
      n.loaded = true
      n.version = '2.0'
      n.queue = []
      const t = b.createElement(e) as HTMLScriptElement
      t.async = true
      t.src = v
      b.head.appendChild(t)
    })(w, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
    w.fbq!('init', meta)
    w.fbq!('track', 'PageView')
  }
  if (tiktok && loaded.tiktok !== tiktok) {
    loaded.tiktok = tiktok
    ;(function (t: any) {
      const q: any[] = []
      const ttq: any = (t.ttq = t.ttq || [])
      ttq.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie']
      ttq.setAndDefer = (o: any, m: string) => (o[m] = (...a: unknown[]) => o.push([m, ...a]))
      for (const m of ttq.methods) ttq.setAndDefer(ttq, m)
      ttq.load = (id: string) => {
        const s = document.createElement('script')
        s.async = true
        s.src = `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${id}&lib=ttq`
        document.head.appendChild(s)
      }
      void q
    })(w)
    w.ttq!.load(tiktok)
    w.ttq!.page()
  }
}

export function pixel(event: 'ViewContent' | 'InitiateCheckout' | 'Purchase' | 'Contact', data?: { value?: number; content_id?: string; content_name?: string }) {
  const value = data?.value !== undefined ? data.value / 100 : undefined
  try {
    w.fbq?.('track', event, { value, currency: 'MAD', content_ids: data?.content_id ? [data.content_id] : undefined, content_name: data?.content_name, content_type: 'product' })
    const tt = event === 'Purchase' ? 'CompletePayment' : event
    w.ttq?.track(tt, { value, currency: 'MAD', content_id: data?.content_id, content_name: data?.content_name, content_type: 'product' })
  } catch {
    /* pixel blocked */
  }
}
