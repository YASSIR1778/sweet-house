import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertCircle, ExternalLink, FolderCog, Globe, MonitorPlay, Plus, Search, Sparkles, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { money } from '@/shared/lib/money'
import type { Service, ServiceCategory } from '@/shared/lib/types'
import { Badge, Button, Card, Input, Skeleton } from '@/shared/ui/primitives'
import { EmptyState, PageHeader, Tabs } from '@/shared/ui/data'
import { DynamicIcon } from '@/shared/ui/icon'
import { ServiceEditor } from './ServiceEditor'
import { ServiceCategoriesDialog } from './ServiceCategories'

export function ServicesPage() {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const [kind, setKind] = useState<'counter' | 'admin'>('counter')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Service | 'new' | null>(null)
  const [catsOpen, setCatsOpen] = useState(false)

  const services = useQuery({
    queryKey: ['services'],
    queryFn: async () => {
      const { data, error } = await sb.from('services').select('*, service_price_tiers(min_qty, unit_price)').is('deleted_at', null).order('sort')
      if (error) throw error
      return data as Service[]
    },
  })
  const cats = useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const { data, error } = await sb.from('service_categories').select('*').is('deleted_at', null).order('sort')
      if (error) throw error
      return data as ServiceCategory[]
    },
  })

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (services.data ?? []).filter((s) => s.kind === kind && (!q || s.name_ar.includes(q) || s.name_fr.toLowerCase().includes(q)))
    const cs = (cats.data ?? []).filter((c) => c.kind === kind)
    const out = cs.map((c) => ({ cat: c as ServiceCategory | null, items: list.filter((s) => s.category_id === c.id) }))
    const orphan = list.filter((s) => !cs.some((c) => c.id === s.category_id))
    if (orphan.length) out.push({ cat: null, items: orphan })
    return out.filter((g) => g.items.length)
  }, [services.data, cats.data, kind, search])

  const counts = {
    counter: services.data?.filter((s) => s.kind === 'counter').length ?? 0,
    admin: services.data?.filter((s) => s.kind === 'admin').length ?? 0,
  }
  const unpriced = (services.data ?? []).filter((s) => s.kind === kind && s.pricing_mode !== 'open' && s.price === 0).length

  const toggle = async (s: Service, field: 'is_active' | 'is_online' | 'pos_quick') => {
    const { error } = await sb.from('services').update({ [field]: !s[field] }).eq('id', s.id)
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['services'] })
  }

  const priceLabel = (s: Service) => {
    if (s.pricing_mode === 'open') return t('مبلغ حر', 'Montant libre')
    if (s.price === 0) return t('بدون سعر', 'Sans prix')
    const unit = s.unit_ar ? ` / ${pick(s, 'unit')}` : ''
    return money(s.price) + unit
  }

  return (
    <>
      <PageHeader
        icon={<Sparkles />}
        title={t('الخدمات', 'Services')}
        description={t('خدمات المحل (نسخ، طباعة…) والخدمات الإدارية والإلكترونية', 'Services en boutique et services administratifs')}
        actions={
          <>
            <Button variant="outline" onClick={() => setCatsOpen(true)}>
              <FolderCog />
              {t('فئات الخدمات', 'Catégories')}
            </Button>
            <Button onClick={() => setEditing('new')}>
              <Plus />
              {t('خدمة جديدة', 'Nouveau service')}
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          items={[
            { value: 'counter', label: t('خدمات المحل', 'En boutique'), count: counts.counter },
            { value: 'admin', label: t('الخدمات الإدارية', 'Administratifs'), count: counts.admin },
          ]}
        />
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} placeholder={t('ابحث عن خدمة…', 'Rechercher un service…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {unpriced > 0 && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
          <AlertCircle className="size-5 shrink-0 text-warning" />
          <span>
            {t(`${unpriced} خدمة بدون سعر. حدد أسعارها حتى تظهر بشكل صحيح للزبائن.`, `${unpriced} service(s) sans prix. Définissez leurs tarifs.`)}
          </span>
        </div>
      )}

      {services.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !groups.length ? (
        <Card>
          <EmptyState icon={<Sparkles />} title={t('لا توجد خدمات', 'Aucun service')} />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.cat?.id ?? 'none'}>
              <div className="mb-3 flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg text-white" style={{ background: g.cat?.color ?? '#475569' }}>
                  <DynamicIcon name={g.cat?.icon} className="size-4" />
                </div>
                <h2 className="font-semibold">{g.cat ? pick(g.cat, 'name') : t('بدون فئة', 'Sans catégorie')}</h2>
                <span className="num text-sm text-muted">({g.items.length})</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {g.items.map((s, i) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                    <Card
                      onClick={() => setEditing(s)}
                      className={`group h-full cursor-pointer p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-pop ${!s.is_active ? 'opacity-55' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-text transition-colors group-hover:bg-brand-50 group-hover:text-brand" style={s.pos_color && s.kind === 'counter' ? { background: s.pos_color, color: 'white' } : undefined}>
                          <DynamicIcon name={s.icon ?? g.cat?.icon} className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-snug">{pick(s, 'name')}</div>
                          <div className={`num mt-1 text-sm font-semibold ${s.price === 0 && s.pricing_mode !== 'open' ? 'text-warning' : 'text-brand'}`}>{priceLabel(s)}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {s.pricing_mode === 'tiered' && <Badge tone="info">{t(`${s.service_price_tiers?.length ?? 0} شرائح`, `${s.service_price_tiers?.length ?? 0} paliers`)}</Badge>}
                        {s.kind === 'counter' && (
                          <button onClick={() => toggle(s, 'pos_quick')}>
                            <Badge tone={s.pos_quick ? 'brand' : 'neutral'}>
                              <Zap />
                              {t('زر سريع', 'Raccourci')}
                            </Badge>
                          </button>
                        )}
                        <button onClick={() => toggle(s, 'is_online')}>
                          <Badge tone={s.is_online ? 'success' : 'neutral'}>
                            <Globe />
                            {s.is_online ? t('في الموقع', 'En ligne') : t('مخفية', 'Masqué')}
                          </Badge>
                        </button>
                        {s.system_key === 'riyad_fee' && (
                          <Badge tone="navy">
                            <MonitorPlay />
                            {t('نظامية', 'Système')}
                          </Badge>
                        )}
                        {s.duration_ar && <Badge>{pick(s, 'duration')}</Badge>}
                        {s.official_url && (
                          <a href={s.official_url} target="_blank" rel="noreferrer" className="ms-auto text-subtle hover:text-brand">
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <ServiceEditor service={editing} defaultKind={kind} categories={cats.data ?? []} onClose={() => setEditing(null)} />
      <ServiceCategoriesDialog open={catsOpen} onClose={() => setCatsOpen(false)} kind={kind} />
    </>
  )
}
