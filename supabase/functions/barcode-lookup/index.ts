// Suggests a name, brand and photo for a barcode from open product databases
// (Open Food Facts family, then UPCitemdb free tier). Staff only.
// The photo is copied into the "media" bucket so the shop never depends on
// an external image link.
import { adminClient, callerClient, cors, fail, json } from '../_shared/common.ts'

type Hit = { name: string | null; brand: string | null; image: string | null; source: string }

async function openFacts(code: string): Promise<Hit | null> {
  for (const host of ['world.openproductsfacts.org', 'world.openfoodfacts.org', 'world.openbeautyfacts.org']) {
    try {
      const r = await fetch(`https://${host}/api/v2/product/${code}.json?fields=product_name,product_name_fr,product_name_ar,brands,image_front_url,image_url`, {
        headers: { 'User-Agent': 'SweetHouse-POS/1.0 (library, Tetouan)' },
        signal: AbortSignal.timeout(6000),
      })
      if (!r.ok) continue
      const j = await r.json()
      if (j?.status !== 1 || !j.product) continue
      const p = j.product
      const name = p.product_name_ar || p.product_name_fr || p.product_name || null
      if (!name && !p.image_front_url) continue
      return { name, brand: p.brands?.split(',')[0]?.trim() || null, image: p.image_front_url || p.image_url || null, source: host.split('.')[1] }
    } catch {
      // try the next source
    }
  }
  return null
}

async function upcItemDb(code: string): Promise<Hit | null> {
  try {
    const r = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, { signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const it = (await r.json())?.items?.[0]
    if (!it) return null
    return { name: it.title || null, brand: it.brand || null, image: it.images?.[0] || null, source: 'upcitemdb' }
  } catch {
    return null
  }
}

async function copyImage(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) })
    const type = r.headers.get('content-type') ?? ''
    if (!r.ok || !type.startsWith('image/')) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.byteLength > 4 * 1024 * 1024) return null
    const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = `products/barcode-${crypto.randomUUID()}.${ext}`
    const admin = adminClient()
    const { error } = await admin.storage.from('media').upload(path, buf, { contentType: type })
    if (error) return null
    return admin.storage.from('media').getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const caller = callerClient(req)
    const { data: ok } = await caller.rpc('has_perm', { p: 'products.manage' })
    if (ok !== true) return fail('forbidden', 403)
    const { code } = await req.json()
    const digits = String(code ?? '').replace(/\D/g, '')
    if (digits.length < 8 || digits.length > 14) return json({ found: false })

    const hit = (await openFacts(digits)) ?? (await upcItemDb(digits))
    if (!hit) return json({ found: false })
    const image = hit.image ? await copyImage(hit.image) : null
    return json({ found: true, name: hit.name, brand: hit.brand, image, source: hit.source })
  } catch (e) {
    return fail(String(e), 500)
  }
})
