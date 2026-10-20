import { useMemo, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Inbox } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useLang } from '@/shared/lib/i18n'
import { Button, Card, Skeleton } from './primitives'

export function PageHeader({
  title,
  description,
  actions,
  icon,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-[#ff8f5e] text-white shadow-md shadow-brand/25 [&_svg]:size-5">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 scale-150 rounded-full bg-brand/10 blur-xl" />
        <div className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-surface text-brand shadow-card [&_svg]:size-7">
          {icon ?? <Inbox />}
        </div>
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function StatCard({
  label,
  value,
  icon,
  tone = 'brand',
  delta,
  hint,
  loading,
  index = 0,
}: {
  label: ReactNode
  value: ReactNode
  icon: ReactNode
  tone?: 'brand' | 'navy' | 'success' | 'info' | 'warning' | 'danger'
  delta?: number | null
  hint?: ReactNode
  loading?: boolean
  index?: number
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand',
    navy: 'bg-navy/5 text-navy dark:bg-white/10 dark:text-white',
    success: 'bg-success/10 text-success',
    info: 'bg-info/10 text-info',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
  }
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
      <Card className="group relative overflow-hidden p-5 transition-shadow hover:shadow-pop">
        <div className="absolute -end-8 -top-8 size-24 rounded-full bg-brand/5 transition-transform duration-500 group-hover:scale-150" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm text-muted">{label}</div>
            {loading ? <Skeleton className="mt-2 h-8 w-28" /> : <div className="num mt-1.5 truncate text-2xl font-bold tracking-tight">{value}</div>}
          </div>
          <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5', tones[tone])}>{icon}</div>
        </div>
        {(delta !== undefined && delta !== null) || hint ? (
          <div className="relative mt-3 flex items-center gap-2 text-xs">
            {delta !== undefined && delta !== null && (
              <span className={cn('num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold', delta >= 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                {delta >= 0 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
                {Math.abs(delta).toFixed(0)}%
              </span>
            )}
            {hint && <span className="text-muted">{hint}</span>}
          </div>
        ) : null}
      </Card>
    </motion.div>
  )
}

// ---------------------------------------------------------------- DataTable
export type Column<T> = {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  className?: string
  sortValue?: (row: T) => string | number
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  onRowClick,
  empty,
  pageSize = 25,
}: {
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  loading?: boolean
  onRowClick?: (row: T) => void
  empty?: ReactNode
  pageSize?: number
}) {
  const { t } = useLang()
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    return [...rows].sort((a, b) => {
      const va = col.sortValue!(a)
      const vb = col.sortValue!(b)
      return (va > vb ? 1 : va < vb ? -1 : 0) * sort.dir
    })
  }, [rows, sort, columns])

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const current = Math.min(page, pages - 1)
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize)

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/50">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn('px-4 py-3 text-start text-xs font-semibold whitespace-nowrap text-muted', c.sortValue && 'cursor-pointer select-none hover:text-text', c.className)}
                  onClick={() => c.sortValue && setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3.5">
                        <Skeleton className="h-4 w-full max-w-32" />
                      </td>
                    ))}
                  </tr>
                ))
              : visible.map((row, i) => (
                  <tr
                    key={rowKey(row)}
                    onClick={() => onRowClick?.(row)}
                    style={{ animation: `riseIn 300ms ${Math.min(i, 12) * 20}ms both` }}
                    className={cn('border-b border-border transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-2/60')}
                  >
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3', c.className)}>
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && rows.length === 0 && (empty ?? <EmptyState title={t('لا توجد بيانات', 'Aucune donnée')} />)}
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm text-muted">
          <span className="num">
            {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} / {sorted.length}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronRight className="ltr:rotate-180" />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronLeft className="ltr:rotate-180" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

export function Tabs({
  value,
  onChange,
  items,
  className,
}: {
  value: string
  onChange: (v: string) => void
  items: { value: string; label: ReactNode; count?: number }[]
  className?: string
}) {
  return (
    <div className={cn('inline-flex gap-1 rounded-xl border border-border bg-surface p-1', className)}>
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
            value === it.value ? 'text-white' : 'text-muted hover:text-text',
          )}
        >
          {value === it.value && <motion.span layoutId={`tab-${items.map((i) => i.value).join()}`} className="absolute inset-0 rounded-lg bg-navy dark:bg-brand" transition={{ type: 'spring', duration: 0.4, bounce: 0.15 }} />}
          <span className="relative flex items-center gap-1.5">
            {it.label}
            {it.count !== undefined && <span className={cn('num rounded-full px-1.5 text-[11px]', value === it.value ? 'bg-white/20' : 'bg-surface-2')}>{it.count}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
