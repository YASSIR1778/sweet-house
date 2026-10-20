import { useQuery } from '@tanstack/react-query'
import { Banknote, ClipboardList, Package, ShieldCheck, ShoppingCart, BarChart3, UserRound, Wallet, Truck } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import type { Permission } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Checkbox, Skeleton } from '@/shared/ui/primitives'

export const PERM_GROUPS: Record<string, { ar: string; fr: string; icon: typeof Package }> = {
  pos: { ar: 'البيع', fr: 'Vente', icon: ShoppingCart },
  cash: { ar: 'الصندوق', fr: 'Caisse', icon: Banknote },
  riyad: { ar: 'رياض', fr: 'Riyad', icon: Wallet },
  products: { ar: 'المنتجات والمخزون', fr: 'Produits & stock', icon: Package },
  purchases: { ar: 'المشتريات', fr: 'Achats', icon: Truck },
  customers: { ar: 'الزبائن والديون', fr: 'Clients & crédits', icon: UserRound },
  orders: { ar: 'الطلبات الأونلاين', fr: 'Commandes en ligne', icon: ClipboardList },
  reports: { ar: 'التقارير', fr: 'Rapports', icon: BarChart3 },
  admin: { ar: 'الإدارة', fr: 'Administration', icon: ShieldCheck },
}

export function usePermissions() {
  const { sb } = useAuth()
  return useQuery({
    queryKey: ['permissions'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await sb.from('permissions').select('*').order('sort')
      if (error) throw error
      return data as Permission[]
    },
  })
}

/**
 * Grid of permission checkboxes grouped by area.
 * `inherited` shows role permissions greyed-in (for per-employee overrides).
 */
export function PermissionMatrix({
  value,
  onChange,
  inherited,
  disabled,
}: {
  value: string[]
  onChange: (v: string[]) => void
  inherited?: string[]
  disabled?: boolean
}) {
  const { t, pick } = useLang()
  const perms = usePermissions()
  if (perms.isLoading) return <Skeleton className="h-64" />

  const groups = Object.entries(PERM_GROUPS).map(([key, g]) => ({ key, ...g, items: (perms.data ?? []).filter((p) => p.group_key === key) }))
  const toggle = (k: string, on: boolean) => onChange(on ? [...new Set([...value, k])] : value.filter((x) => x !== k))

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {groups.map((g) => {
        const all = g.items.every((p) => value.includes(p.key))
        return (
          <div key={g.key} className="rounded-xl border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <g.icon className="size-4 text-brand" />
                {t(g.ar, g.fr)}
              </div>
              {!disabled && (
                <button
                  className="text-xs text-brand hover:underline"
                  onClick={() => onChange(all ? value.filter((v) => !g.items.some((p) => p.key === v)) : [...new Set([...value, ...g.items.map((p) => p.key)])])}
                >
                  {all ? t('إلغاء الكل', 'Tout retirer') : t('تحديد الكل', 'Tout cocher')}
                </button>
              )}
            </div>
            <div className="space-y-0.5 p-2">
              {g.items.map((p) => {
                const on = value.includes(p.key)
                const inh = inherited?.includes(p.key)
                return (
                  <label key={p.key} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2', disabled && 'cursor-default')}>
                    <Checkbox checked={on} onCheckedChange={(v) => toggle(p.key, v)} disabled={disabled} />
                    <span className={cn(!on && 'text-muted')}>{pick(p, 'name')}</span>
                    {inh !== undefined && inh && !on && <span className="ms-auto text-[10px] text-subtle">{t('من الدور', 'du rôle')}</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
