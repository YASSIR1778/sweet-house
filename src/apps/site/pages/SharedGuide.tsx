import { useEffect } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { BookOpen, LinkIcon, Printer } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { Button, Card, Spinner } from '@/shared/ui/primitives'
import { EmptyState } from '@/shared/ui/data'
import { GuideView, printGuide, type GuideContent, type GuideService } from '@/shared/ui/guide'
import { sb } from '../data'
import { useSeo } from '../Layout'

type Shared = Omit<GuideService, 'id'> & { note: string | null; expires_at: string | null; guide: (GuideContent & { updated_at: string }) | null }

/** A guide the owner shared with someone outside the shop: read-only, expires, never indexed. */
export function SharedGuidePage() {
  const { token = '' } = useParams()
  const { t, pick } = useLang()
  const q = useQuery({
    queryKey: ['shared-guide', token],
    retry: false,
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await sb.rpc('shared_guide', { p_token: token })
      if (error) throw error
      return data as Shared | null
    },
  })
  useSeo(q.data ? pick(q.data, 'name') : t('دليل خدمة', 'Guide'))
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex, nofollow'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  if (q.isLoading)
    return (
      <div className="flex justify-center py-24">
        <Spinner />
      </div>
    )
  if (!q.data)
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <EmptyState icon={<LinkIcon />} title={t('الرابط غير صالح أو انتهت مدته', 'Lien invalide ou expiré')} description={t('اطلب رابطاً جديداً من مكتبة سويت هاوس', 'Demandez un nouveau lien à Sweet House')} />
      </div>
    )

  const service: GuideService = { id: token, ...q.data }
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand">
          <BookOpen className="size-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-muted">{t('دليل خدمة من مكتبة سويت هاوس', 'Guide de service — Sweet House')}</div>
          <h1 className="text-2xl font-extrabold">{pick(q.data, 'name')}</h1>
          <div className="num mt-1 text-xs text-subtle">
            {q.data.note && `${t('إلى', 'Pour')}: ${q.data.note} · `}
            {q.data.guide?.updated_at && `${t('آخر تحديث', 'Mis à jour')} ${format(new Date(q.data.guide.updated_at), 'dd/MM/yyyy')}`}
            {q.data.expires_at && ` · ${t('صالح حتى', 'Valable jusqu’au')} ${format(new Date(q.data.expires_at), 'dd/MM/yyyy')}`}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => printGuide(service, q.data!.guide)}>
          <Printer />
          {t('طباعة / PDF', 'Imprimer / PDF')}
        </Button>
      </div>
      <Card className="p-5">
        <GuideView service={service} guide={q.data.guide} price={false} />
      </Card>
    </div>
  )
}
