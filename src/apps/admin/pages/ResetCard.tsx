import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Button, Card, CardHeader, Checkbox, Input } from '@/shared/ui/primitives'

type Preview = Record<string, number> & { files: string[] }

const ROWS: [string, string, string][] = [
  ['sales', 'مبيعات', 'ventes'],
  ['shifts', 'ورديات', 'caisses'],
  ['riyad', 'عمليات رياض', 'opérations Riyad'],
  ['requests', 'طلبات خدمات', 'demandes'],
  ['orders', 'طلبيات', 'commandes'],
  ['invoices', 'فواتير', 'factures'],
  ['debts', 'عمليات ديون', 'opérations de crédit'],
  ['help', 'طلبات مساعدة', 'demandes d’aide'],
  ['attendance', 'تسجيلات حضور', 'pointages'],
  ['notifications', 'إشعارات', 'notifications'],
]

/** "Start for real": wipe test transactions once, keep products, services, employees and settings. */
export function ResetCard() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [opts, setOpts] = useState({ expenses: false, purchases: false, payroll: false })
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const pv = useQuery({ queryKey: ['reset-preview'], enabled: !!me?.is_owner, queryFn: async () => (await sb.rpc('reset_preview')).data as Preview })
  const golive = useQuery({ queryKey: ['go-live'], enabled: !!me?.is_owner, queryFn: async () => (await sb.from('settings').select('value').eq('key', 'go_live').maybeSingle()).data?.value as { at: string } | undefined })
  if (!me?.is_owner || !pv.data) return null
  const p = pv.data

  const run = async () => {
    setBusy(true)
    try {
      for (let i = 0; i < p.files.length; i += 100) {
        const { error } = await sb.storage.from('customer-docs').remove(p.files.slice(i, i + 100))
        if (error) throw error
      }
      const { error } = await sb.rpc('reset_test_data', { p: { confirm: word.trim(), ...opts } })
      if (error) throw error
      toast.success(t('تم! النظام نظيف وجاهز للعمل الحقيقي 🚀', 'C’est fait ! Le système est prêt 🚀'))
      setWord('')
      qc.invalidateQueries()
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-danger/30">
      <CardHeader
        title={t('بدء العمل الحقيقي', 'Démarrer pour de vrai')}
        description={t('يحذف عمليات التجربة مرة واحدة: المنتجات والخدمات والموظفون والإعدادات تبقى كما هي، والترقيم يبدأ من 1', 'Efface les opérations de test ; produits, services, employés et réglages sont conservés')}
        icon={<Rocket />}
      />
      <div className="space-y-4 p-5">
        {golive.data?.at && (
          <div className="rounded-xl bg-success/10 p-3 text-sm text-success">
            {t('بدأ العمل الحقيقي يوم', 'Démarré le')} <span className="num">{format(new Date(golive.data.at), 'dd/MM/yyyy HH:mm')}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          {ROWS.map(([k, ar, fr]) => (
            <div key={k} className="rounded-lg bg-surface-2 px-3 py-2">
              <span className="num font-semibold">{p[k] ?? 0}</span> {t(ar, fr)}
            </div>
          ))}
          <div className="rounded-lg bg-surface-2 px-3 py-2">
            <span className="num font-semibold">{p.files.length}</span> {t('ملف زبون', 'fichiers clients')}
          </div>
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-muted">{t('احذف أيضاً (اختياري):', 'Effacer aussi (optionnel) :')}</div>
          {(
            [
              ['expenses', `المصاريف (${p.expenses ?? 0})`, `Dépenses (${p.expenses ?? 0})`],
              ['purchases', `المشتريات وحساب الموردين (${p.purchases ?? 0})`, `Achats (${p.purchases ?? 0})`],
              ['payroll', `الرواتب والتسبيقات والمكافآت (${p.payroll ?? 0})`, `Salaires (${p.payroll ?? 0})`],
            ] as const
          ).map(([k, ar, fr]) => (
            <label key={k} className="flex items-center gap-2.5">
              <Checkbox checked={opts[k]} onCheckedChange={(v) => setOpts({ ...opts, [k]: !!v })} />
              {t(ar, fr)}
            </label>
          ))}
        </div>
        <p className="text-xs text-muted">{t('ننصح بتحميل نسخة احتياطية قبل ذلك. لا يمكن التراجع عن هذه العملية.', 'Faites une sauvegarde avant. Action irréversible.')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={word} onChange={(e) => setWord(e.target.value)} placeholder={t('اكتب «ابدأ» للتأكيد', 'Tapez « ابدأ » pour confirmer')} className="max-w-56" />
          <Button variant="danger" onClick={run} loading={busy} disabled={word.trim() !== 'ابدأ'}>
            <Rocket />
            {t('ابدأ العمل الحقيقي', 'Démarrer')}
          </Button>
        </div>
      </div>
    </Card>
  )
}
