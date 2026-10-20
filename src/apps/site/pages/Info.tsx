import { Link } from 'react-router'
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { whatsappLink } from '@/shared/lib/utils'
import { Button, Card, Skeleton } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { useSite } from '../data'
import { useSeo } from '../Layout'

const DAYS: Record<number, [string, string]> = { 1: ['الإثنين', 'Lundi'], 2: ['الثلاثاء', 'Mardi'], 3: ['الأربعاء', 'Mercredi'], 4: ['الخميس', 'Jeudi'], 5: ['الجمعة', 'Vendredi'], 6: ['السبت', 'Samedi'], 0: ['الأحد', 'Dimanche'] }

export function ContactPage() {
  const { t, pick } = useLang()
  const site = useSite()
  useSeo(t('تواصل معنا', 'Contact'))
  const s = site.data?.store
  const today = new Date().getDay()
  if (!s) return <div className="mx-auto max-w-6xl px-4 py-10"><Skeleton className="h-96" /></div>
  const hours = [...(s.hours ?? [])].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7))
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">{t('تواصل معنا', 'Contactez-nous')}</h1>
      <p className="mt-2 text-muted">{t('نحن في خدمتكم، زورونا أو راسلونا', 'Passez nous voir ou écrivez-nous')}</p>
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-4 p-6">
            <InfoRow icon={<MapPin />} label={t('العنوان', 'Adresse')} value={pick(s, 'address')} />
            <InfoRow icon={<Phone />} label={t('الهاتف', 'Téléphone')} value={<a href={`tel:${s.phone}`} className="num hover:text-brand" dir="ltr">{s.phone}</a>} />
            {s.email && <InfoRow icon={<Mail />} label="E-mail" value={<a href={`mailto:${s.email}`} className="hover:text-brand">{s.email}</a>} />}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="success">
                <a href={whatsappLink(s.whatsapp, t('مرحباً سويت هاوس 👋', 'Bonjour Sweet House 👋'))} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
              {s.maps_url && (
                <Button asChild variant="outline">
                  <a href={s.maps_url} target="_blank" rel="noreferrer">
                    <MapPin />
                    {t('افتح في الخريطة', 'Ouvrir la carte')}
                  </a>
                </Button>
              )}
            </div>
          </Card>
          <Card className="p-6">
            <div className="mb-4 flex items-center gap-2 font-bold">
              <Clock className="size-5 text-brand" />
              {t('أوقات العمل', 'Horaires')}
            </div>
            <div className="space-y-2 text-sm">
              {hours.map((h) => (
                <div key={h.day} className={`flex justify-between rounded-lg px-3 py-2 ${h.day === today ? 'bg-brand-50 font-semibold text-brand' : ''}`}>
                  <span>{t(...DAYS[h.day])}</span>
                  <span className="num" dir="ltr">
                    {h.open ? `${h.open} – ${h.close}` : t('مغلق', 'Fermé')}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <Card className="overflow-hidden">
          <iframe title="map" className="h-full min-h-96 w-full border-0" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent((s.address_fr || s.address_ar || 'Tétouan') + ' Sweet House')}&output=embed`} />
        </Card>
      </div>
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand [&_svg]:size-5">{icon}</span>
      <div>
        <div className="text-xs text-muted">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  )
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const { t, pick } = useLang()
  const site = useSite()
  const title = kind === 'privacy' ? t('سياسة الخصوصية', 'Politique de confidentialité') : t('شروط الاستعمال', "Conditions d'utilisation")
  useSeo(title)
  const legal = site.data?.website.legal
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-extrabold">{title}</h1>
      <Card className="mt-8 p-8">
        {legal ? <div className="leading-loose whitespace-pre-line text-muted">{pick(legal, kind)}</div> : <Skeleton className="h-40" />}
      </Card>
    </div>
  )
}

export function NotFoundPage() {
  const { t } = useLang()
  useSeo('404')
  return (
    <EmptyState
      className="py-32"
      title={t('الصفحة غير موجودة', 'Page introuvable')}
      description={t('ربما تغيّر الرابط', 'Le lien a peut-être changé')}
      action={
        <Button asChild>
          <Link to="/">{t('العودة للرئيسية', "Retour à l'accueil")}</Link>
        </Button>
      }
    />
  )
}
