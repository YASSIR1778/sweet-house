import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { ArchiveRestore, Pencil, Plus, ScrollText, Search, Sparkles, Trash } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { Avatar, Badge, Card, Input, Skeleton } from '@/shared/ui/primitives'
import { EmptyState, PageHeader } from '@/shared/ui/data'
import { Select } from '@/shared/ui/select'

type Log = {
  id: number
  at: string
  action: string
  entity: string
  entity_id: string | null
  label: string | null
  changes: Record<string, unknown> | null
  employees: { full_name: string; color: string } | null
}

const ENTITIES: Record<string, [string, string]> = {
  products: ['منتج', 'Produit'],
  categories: ['فئة', 'Catégorie'],
  services: ['خدمة', 'Service'],
  service_categories: ['فئة خدمات', 'Catégorie service'],
  customers: ['زبون', 'Client'],
  employees: ['موظف', 'Employé'],
  roles: ['دور', 'Rôle'],
  devices: ['جهاز', 'Appareil'],
  settings: ['إعدادات', 'Paramètres'],
  sales: ['بيع', 'Vente'],
  stock: ['مخزون', 'Stock'],
}

const ACTIONS: Record<string, { ar: string; fr: string; tone: 'success' | 'info' | 'danger' | 'warning' | 'brand'; icon: typeof Plus }> = {
  insert: { ar: 'إضافة', fr: 'Ajout', tone: 'success', icon: Plus },
  update: { ar: 'تعديل', fr: 'Modification', tone: 'info', icon: Pencil },
  delete: { ar: 'حذف نهائي', fr: 'Suppression', tone: 'danger', icon: Trash },
  trash: { ar: 'نقل للسلة', fr: 'Corbeille', tone: 'warning', icon: Trash },
  restore: { ar: 'استرجاع', fr: 'Restauration', tone: 'success', icon: ArchiveRestore },
  custom: { ar: 'عملية', fr: 'Action', tone: 'brand', icon: Sparkles },
}

export function ActivityPage() {
  const { sb } = useAuth()
  const { t } = useLang()
  const [search, setSearch] = useState('')
  const [entity, setEntity] = useState<string | null>(null)

  const logs = useQuery({
    queryKey: ['activity', entity],
    queryFn: async () => {
      let q = sb.from('activity_log').select('*, employees(full_name, color)').order('at', { ascending: false }).limit(500)
      if (entity) q = q.eq('entity', entity)
      const { data, error } = await q
      if (error) throw error
      return data as Log[]
    },
  })

  const rows = useMemo(() => {
    const s = search.toLowerCase()
    return (logs.data ?? []).filter((l) => !s || l.label?.toLowerCase().includes(s) || l.employees?.full_name.toLowerCase().includes(s))
  }, [logs.data, search])

  const describe = (l: Log) => {
    if (!l.changes) return null
    const keys = Object.keys(l.changes).filter((k) => !['updated_at', 'deleted_at'].includes(k))
    if (l.action === 'update') return keys.slice(0, 4).join('، ') + (keys.length > 4 ? '…' : '')
    if (l.entity === 'sales' && 'total' in l.changes) return `${(Number(l.changes.total) / 100).toFixed(2)} DH${l.changes.reason ? ` — ${l.changes.reason}` : ''}`
    if (l.entity === 'stock') return `${Number(l.changes.change) > 0 ? '+' : ''}${l.changes.change} → ${l.changes.new_qty}${l.changes.note ? ` (${l.changes.note})` : ''}`
    if ('pin' in l.changes) return t('تغيير الرمز السري', 'PIN modifié')
    return null
  }

  return (
    <>
      <PageHeader icon={<ScrollText />} title={t('سجل النشاطات', "Journal d'activité")} description={t('كل عملية مهمة تُسجّل تلقائياً: من، ماذا، ومتى', 'Chaque action importante : qui, quoi, quand')} />
      <Card className="mb-4 flex flex-wrap gap-3 p-3">
        <div className="min-w-56 flex-1">
          <Input icon={<Search />} placeholder={t('ابحث…', 'Rechercher…')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="w-52">
          <Select value={entity} onValueChange={setEntity} allowEmpty emptyLabel={t('كل الأقسام', 'Toutes les sections')} options={Object.entries(ENTITIES).map(([k, v]) => ({ value: k, label: t(v[0], v[1]) }))} />
        </div>
      </Card>
      <Card>
        {logs.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !rows.length ? (
          <EmptyState icon={<ScrollText />} title={t('لا توجد نشاطات بعد', 'Aucune activité')} />
        ) : (
          <ol className="relative px-5 py-4">
            <div className="absolute inset-y-6 start-[38px] w-px bg-border" />
            {rows.map((l, i) => {
              const a = ACTIONS[l.action] ?? ACTIONS.custom
              const ent = ENTITIES[l.entity]
              return (
                <li key={l.id} className="relative flex gap-4 py-2.5" style={{ animation: `riseIn 300ms ${Math.min(i, 15) * 15}ms both` }}>
                  <div className="relative z-10">
                    {l.employees ? <Avatar name={l.employees.full_name} color={l.employees.color} size={36} /> : <div className="flex size-9 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">SYS</div>}
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 py-2.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold">{l.employees?.full_name ?? t('النظام', 'Système')}</span>
                      <Badge tone={a.tone}>
                        <a.icon />
                        {t(a.ar, a.fr)}
                      </Badge>
                      {ent && <span className="text-muted">{t(ent[0], ent[1])}</span>}
                      {l.label && <span className="font-medium">«{l.label}»</span>}
                      <span className="num ms-auto text-xs text-subtle">{format(new Date(l.at), 'dd/MM/yyyy HH:mm')}</span>
                    </div>
                    {describe(l) && <div className="mt-1 text-xs text-muted">{describe(l)}</div>}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Card>
    </>
  )
}
