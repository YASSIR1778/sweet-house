import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Coins, Download, PackageX, Tag } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { money, qty } from '@/shared/lib/money'
import { csvMoney, downloadCsv } from '@/shared/lib/export'
import { Button, Card } from '@/shared/ui/primitives'
import { DataTable, EmptyState, StatCard, Tabs, type Column } from '@/shared/ui/data'

type Stale = {
  variant_id: string
  name_ar: string
  name_fr: string
  variant_ar: string | null
  variant_fr: string | null
  barcode: string | null
  image_url: string | null
  stock: number
  price: number
  retail_value: number
  cost_value: number | null
  last_sold_at: string | null
  days: number | null
}

/** 28 · Products sitting on the shelf: money tied up that a discount could free. */
export function StaleProducts() {
  const { sb, can } = useAuth()
  const { t, pick } = useLang()
  const [days, setDays] = useState('90')
  const q = useQuery({ queryKey: ['stale-products', days], queryFn: async () => (await sb.rpc('stale_products', { p_days: Number(days) })).data as Stale[] })
  const rows = q.data ?? []
  const showCost = can('products.view_cost')
  const name = (r: Stale) => pick(r, 'name') + (r.variant_ar ? ` — ${pick(r, 'variant')}` : '')

  const cols: Column<Stale>[] = [
    {
      key: 'p',
      header: t('المنتج', 'Produit'),
      cell: (r) => (
        <div className="flex items-center gap-3">
          {r.image_url ? <img src={r.image_url} alt="" className="size-9 rounded-lg object-cover" /> : <div className="size-9 rounded-lg bg-surface-2" />}
          <div>
            <div className="font-medium">{name(r)}</div>
            {r.barcode && <div className="num text-xs text-muted">{r.barcode}</div>}
          </div>
        </div>
      ),
    },
    { key: 's', header: t('في المخزون', 'En stock'), sortValue: (r) => r.stock, cell: (r) => <span className="num font-semibold">{qty(r.stock)}</span> },
    { key: 'v', header: t('قيمة البيع', 'Valeur de vente'), sortValue: (r) => r.retail_value, cell: (r) => <span className="num">{money(r.retail_value)}</span> },
    ...(showCost ? [{ key: 'c', header: t('المال المجمّد (ثمن الشراء)', 'Argent immobilisé (coût)'), sortValue: (r: Stale) => r.cost_value ?? 0, cell: (r: Stale) => <span className="num font-semibold text-warning">{money(r.cost_value)}</span> }] : []),
    {
      key: 'l',
      header: t('آخر بيع', 'Dernière vente'),
      sortValue: (r) => r.days ?? 99999,
      cell: (r) => <span className="text-muted">{r.days === null ? t('لم يُبع أبداً', 'Jamais vendu') : t(`منذ ${r.days} يوماً`, `il y a ${r.days} j`)}</span>,
    },
  ]

  const exportCsv = () =>
    downloadCsv(`produits-dormants-${days}j`, ['Produit', 'Code-barres', 'Stock', 'Valeur vente', ...(showCost ? ['Coût immobilisé'] : []), 'Jours sans vente'], rows.map((r) => [name(r), r.barcode ?? '', r.stock, csvMoney(r.retail_value), ...(showCost ? [csvMoney(r.cost_value)] : []), r.days ?? 'jamais']))

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <PackageX className="size-6 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{t('منتجات لم تُبع منذ مدة', 'Produits dormants')}</div>
          <div className="text-sm text-muted">{t('اعمل عليها تخفيضاً أو ضعها في الواجهة لتحرير المال المجمّد', 'Faites une promo pour libérer l’argent immobilisé')}</div>
        </div>
        <Tabs
          value={days}
          onChange={setDays}
          items={[
            { value: '60', label: t('شهران', '2 mois') },
            { value: '90', label: t('3 أشهر', '3 mois') },
            { value: '180', label: t('6 أشهر', '6 mois') },
            { value: '365', label: t('سنة', '1 an') },
          ]}
        />
        <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
          <Download />
          Excel
        </Button>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard index={0} tone="warning" label={t('عدد المنتجات', 'Produits')} value={rows.length} icon={<PackageX />} loading={q.isLoading} />
        <StatCard index={1} label={t('قيمتها بثمن البيع', 'Valeur de vente')} value={money(rows.reduce((a, r) => a + r.retail_value, 0))} icon={<Tag />} loading={q.isLoading} />
        {showCost && <StatCard index={2} tone="danger" label={t('المال المجمّد', 'Argent immobilisé')} value={money(rows.reduce((a, r) => a + (r.cost_value ?? 0), 0))} icon={<Coins />} loading={q.isLoading} />}
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.variant_id} loading={q.isLoading} pageSize={50} empty={<EmptyState icon={<PackageX />} title={t('ممتاز! كل منتجاتك تتحرك', 'Tout se vend bien 👌')} />} />
    </div>
  )
}
