import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Database, Download, HardDrive, ShieldCheck, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Input, Skeleton, SwitchRow } from '@/shared/ui/primitives'
import { useConfirm } from '@/shared/ui/overlay'
import { ResetCard } from './ResetCard'

type Usage = { buckets: { bucket: string; bytes: number; count: number }[]; total: number; limit: number; database: number; database_limit: number }
type Cand = { id: string; path: string; name: string; size: string | null; created_at: string; number: string | null; kind: string }
type Retention = { enabled: boolean; customer_docs_months: number; keep_deliverables: boolean }

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

export function DataSection() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const { confirm, confirmNode } = useConfirm()
  const [days, setDays] = useState(90)
  const [busy, setBusy] = useState<string | null>(null)
  const [withDeliverables, setWithDeliverables] = useState(false)
  const [ret, setRet] = useState<Retention | null>(null)
  const retQ = useQuery({ queryKey: ['retention-cfg'], enabled: !!me?.is_owner, queryFn: async () => (await sb.from('settings').select('value').eq('key', 'retention').single()).data?.value as Retention })
  const preview = useQuery({ queryKey: ['retention-preview', ret], enabled: !!me?.is_owner, queryFn: async () => (await sb.rpc('retention_preview')).data as { now: number; week: number; bytes_week: number } })
  useEffect(() => {
    if (retQ.data) setRet(retQ.data)
  }, [retQ.data])
  const saveRet = async (next: Retention) => {
    setRet(next)
    const { error } = await sb.from('settings').update({ value: next }).eq('key', 'retention')
    if (error) return toast.error(errorMessage(error, lang))
    qc.invalidateQueries({ queryKey: ['retention-cfg'] })
  }

  const usage = useQuery({ queryKey: ['storage-usage'], queryFn: async () => (await sb.rpc('storage_usage')).data as Usage })
  const cands = useQuery({ queryKey: ['cleanup', days, withDeliverables], enabled: !!me?.is_owner, queryFn: async () => (await sb.rpc('cleanup_candidates', { p_days: days, p_include_deliverables: withDeliverables })).data as Cand[] })

  const backup = async () => {
    setBusy('backup')
    const { data, error } = await sb.rpc('full_backup')
    setBusy(null)
    if (error) return toast.error(errorMessage(error, lang))
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sweet-house-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`
    a.click()
    toast.success(t('تم تحميل النسخة الاحتياطية. احفظها في مكان آمن (Google Drive مثلاً).', 'Sauvegarde téléchargée. Conservez-la en lieu sûr.'))
  }

  const cleanup = async () => {
    const list = cands.data ?? []
    if (!list.length) return
    if (!(await confirm({ title: t(`حذف ${list.length} ملف نهائياً؟`, `Supprimer ${list.length} fichiers ?`), description: t('هذه وثائق طلبات منتهية. لا يمكن استرجاعها بعد الحذف.', 'Documents de demandes terminées. Suppression définitive.'), danger: true, confirmLabel: t('حذف نهائي', 'Supprimer') }))) return
    setBusy('cleanup')
    try {
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100)
        const { error } = await sb.storage.from('customer-docs').remove(chunk.map((c) => c.path))
        if (error) throw error
        await sb.rpc('mark_files_deleted', { p_ids: chunk.map((c) => c.id) })
      }
      toast.success(t('تم تحرير المساحة ✅', 'Espace libéré ✅'))
      qc.invalidateQueries({ queryKey: ['storage-usage'] })
      qc.invalidateQueries({ queryKey: ['cleanup'] })
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(null)
    }
  }

  const u = usage.data
  const pct = u ? (u.total / u.limit) * 100 : 0
  const dbPct = u ? (u.database / u.database_limit) * 100 : 0
  const candSize = (cands.data ?? []).reduce((a, c) => a + Number(c.size ?? 0), 0)

  return (
    <>
      {confirmNode}
      <Card>
        <CardHeader title={t('المساحة المستعملة', 'Espace utilisé')} description={t('حدود الخطة المجانية في Supabase', 'Limites du plan gratuit Supabase')} icon={<HardDrive />} />
        <div className="space-y-5 p-5">
          {!u ? (
            <Skeleton className="h-24" />
          ) : (
            <>
              {[
                [t('الملفات (صور ووثائق)', 'Fichiers'), u.total, u.limit, pct],
                [t('قاعدة البيانات', 'Base de données'), u.database, u.database_limit, dbPct],
              ].map(([label, used, lim, p]) => (
                <div key={label as string}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span>{label as string}</span>
                    <span className="num text-muted">
                      {mb(used as number)} / {mb(lim as number)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={cn('h-full rounded-full transition-all', (p as number) > 85 ? 'bg-danger' : (p as number) > 60 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.min(100, p as number)}%` }} />
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {u.buckets.map((b) => (
                  <span key={b.bucket} className="num rounded-full bg-surface-2 px-2.5 py-1">
                    {b.bucket === 'media' ? t('الصور', 'Images') : t('وثائق الزبائن', 'Documents clients')}: {mb(b.bytes)} · {b.count}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>

      {me?.is_owner && (
        <>
          <Card>
            <CardHeader title={t('النسخة الاحتياطية', 'Sauvegarde')} description={t('ملف واحد فيه كل بياناتك. أنصح بتحميله مرة في الأسبوع.', 'Un fichier avec toutes vos données. Conseillé chaque semaine.')} icon={<Database />} />
            <div className="p-5">
              <Button onClick={backup} loading={busy === 'backup'}>
                <Download />
                {t('تحميل نسخة احتياطية كاملة', 'Télécharger une sauvegarde complète')}
              </Button>
              <p className="mt-2 text-xs text-muted">{t('الخطة المجانية لا تحتفظ بنسخ تلقائية، لذلك هذه النسخة مهمة. الملفات (الصور والوثائق) غير مضمّنة.', 'Le plan gratuit ne sauvegarde pas automatiquement. Les fichiers ne sont pas inclus.')}</p>
            </div>
          </Card>
          {ret && (
            <Card>
              <CardHeader title={t('حماية المعطيات: الحذف التلقائي', 'Protection des données : suppression automatique')} description={t('وثائق الزبون الشخصية (صور البطاقة، الشواهد…) تُحذف بعد مدة من إنجاز الطلب. الوثيقة الجاهزة تبقى.', 'Documents personnels supprimés après la fin de la demande ; le document final reste.')} icon={<ShieldCheck />} />
              <div className="space-y-3 p-5">
                <SwitchRow label={t('تفعيل الحذف التلقائي', 'Activer la suppression automatique')} checked={ret.enabled} onCheckedChange={(enabled) => saveRet({ ...ret, enabled })} />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {t('بعد', 'Après')}
                  {[3, 6, 12].map((m) => (
                    <button key={m} onClick={() => saveRet({ ...ret, customer_docs_months: m })} className={cn('num rounded-lg border px-3 py-1.5', ret.customer_docs_months === m ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                      {m === 12 ? t('سنة', '1 an') : `${m} ${t('أشهر', 'mois')}`}
                    </button>
                  ))}
                  {t('من إنجاز الطلب', 'après la fin de la demande')}
                </div>
                <SwitchRow label={t('الاحتفاظ دائماً بالوثائق الجاهزة ولقطات التأكيد', 'Toujours garder les documents finaux')} checked={ret.keep_deliverables} onCheckedChange={(keep_deliverables) => saveRet({ ...ret, keep_deliverables })} />
                {preview.data && (
                  <div className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
                    {t('سيُحذف خلال الأسبوع القادم:', 'À supprimer la semaine prochaine :')} <span className="num font-semibold text-text">{preview.data.week}</span> {t('ملف', 'fichiers')} · <span className="num">{mb(preview.data.bytes_week)}</span>
                  </div>
                )}
                <p className="text-xs text-muted">{t('يتم الحذف كل إثنين فجراً، ويصلك تنبيه يوم الجمعة قبله. لإبقاء ملف معيّن: «احتفظ بوثائق هذا الطلب» داخل الطلب.', 'Exécution chaque lundi, avertissement le vendredi. Pour garder un dossier : case à cocher dans la demande.')}</p>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title={t('تنظيف وثائق الزبائن القديمة', 'Nettoyage des anciens documents')} description={t('يدوياً: وثائق الطلبات المنتهية فقط، عدا الطلبات المحمية بـ«احتفظ».', 'Manuel : demandes terminées, sauf dossiers protégés.')} icon={<Trash />} />
            <div className="space-y-3 p-5">
              <div className="flex items-center gap-2 text-sm">
                {t('أقدم من', 'Plus anciens que')}
                <Input type="number" min={7} value={days} onChange={(e) => setDays(Math.max(7, Number(e.target.value)))} className="num w-24" />
                {t('يوماً', 'jours')}
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input type="checkbox" checked={withDeliverables} onChange={(e) => setWithDeliverables(e.target.checked)} />
                {t('احذف أيضاً الوثائق الجاهزة (غير منصوح به)', 'Supprimer aussi les documents finaux (déconseillé)')}
              </label>
              <div className="rounded-xl bg-surface-2 p-3 text-sm">
                <span className="num font-semibold">{cands.data?.length ?? 0}</span> {t('ملف', 'fichiers')} · <span className="num">{mb(candSize)}</span>
              </div>
              <Button variant="danger-soft" onClick={cleanup} loading={busy === 'cleanup'} disabled={!cands.data?.length}>
                <Trash />
                {t('حذف هذه الملفات', 'Supprimer ces fichiers')}
              </Button>
            </div>
          </Card>
        </>
      )}
      <ResetCard />
    </>
  )
}
