import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Megaphone, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Button, Card, CardHeader, Field, Input } from '@/shared/ui/primitives'

type Tracking = { meta_pixel_id: string; tiktok_pixel_id: string }

/** Settings → Ads: pixel IDs for the store (Meta / TikTok). Public identifiers, not secrets. */
export function AdsSection() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const q = useQuery({ queryKey: ['tracking'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'tracking').single()).data?.value as Tracking })
  const [v, setV] = useState<Tracking | null>(null)
  useEffect(() => {
    if (q.data) setV({ meta_pixel_id: q.data.meta_pixel_id ?? '', tiktok_pixel_id: q.data.tiktok_pixel_id ?? '' })
  }, [q.data])
  if (!v) return null
  const save = async () => {
    const { error } = await sb.from('settings').update({ value: v }).eq('key', 'tracking')
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظ ✅ البيكسل يشتغل في المتجر الآن', 'Enregistré ✅'))
  }
  return (
    <Card>
      <CardHeader title={t('الإعلانات (Pixel)', 'Publicité (Pixel)')} description={t('ضع رقم البيكسل ليعرف فيسبوك وتيك توك من طلب بعد الإعلان، فتتحسن الإعلانات وتقلّ تكلفتها. يُستعمل في موقع المتجر فقط.', 'Les pixels mesurent les commandes issues des pubs (site Store uniquement).')} icon={<Megaphone />} />
      <div className="space-y-4 p-5">
        <Field label="Meta Pixel ID (Facebook / Instagram)" hint={t('من Meta Events Manager ← مصادر البيانات ← رقم من 15–16 رقماً', 'Events Manager → Sources de données')}>
          <Input value={v.meta_pixel_id} onChange={(e) => setV({ ...v, meta_pixel_id: e.target.value.trim() })} dir="ltr" className="num" placeholder="123456789012345" />
        </Field>
        <Field label="TikTok Pixel ID" hint={t('من TikTok Ads Manager ← Assets ← Events', 'TikTok Ads Manager → Events')}>
          <Input value={v.tiktok_pixel_id} onChange={(e) => setV({ ...v, tiktok_pixel_id: e.target.value.trim() })} dir="ltr" placeholder="C9XXXXXXXXXXXXXXX" />
        </Field>
        <p className="text-xs text-muted">{t('الأحداث المرسلة: زيارة صفحة، مشاهدة منتج، بداية الطلب، وطلبية مؤكدة مع قيمتها. اذكر استعمال البيكسل في سياسة الخصوصية.', 'Événements : PageView, ViewContent, InitiateCheckout, Purchase.')}</p>
        <Button onClick={save}>
          <Save />
          {t('حفظ', 'Enregistrer')}
        </Button>
      </div>
    </Card>
  )
}
