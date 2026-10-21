import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Download, HardDriveDownload, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader } from '@/shared/ui/primitives'
import { useState } from 'react'

type Issue = { key: string; severity: 'danger' | 'warning'; ar: string; detail: unknown }

const HELP: Record<string, { ar: string; to?: string }> = {
  push_none: { ar: 'افتح لوحة التحكم من هاتفك واضغط زر تفعيل الإشعارات 🔔 في أعلى الصفحة.' },
  push: { ar: 'جرّب إلغاء الإشعارات وإعادة تفعيلها من الهاتف.' },
  backup: { ar: 'النسخة التلقائية تعمل كل ليلة 2:30. يمكنك أخذ نسخة الآن.', to: '/settings?s=data' },
  agents: { ar: 'افتح صفحة الفريق لترى السبب.', to: '/agents' },
  cron: { ar: 'مهمة تلقائية لم تنجح. أرسل لي اسمها لأراجعها.' },
  http: { ar: 'اتصالات داخلية (إشعارات، وكلاء…) فشلت. إن تكرر، أرسل لي.' },
  space: { ar: 'نظّف وثائق الزبائن القديمة.', to: '/settings?s=data' },
}

/** 🩺 Owner card: only the problems, with what to do. A green line when all is fine. */
export function SystemHealthCard() {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const q = useQuery({ queryKey: ['system-health'], enabled: can('owner'), refetchInterval: 300_000, queryFn: async () => (await sb.rpc('system_health')).data as { issues: Issue[] } | null })
  if (!q.data) return null
  const issues = q.data.issues ?? []
  if (!issues.length)
    return (
      <div className="mb-5 flex items-center gap-2 text-sm text-success">
        <Stethoscope className="size-4" />
        {t('صحة النظام: كل شيء يعمل ✅', 'Santé du système : tout fonctionne ✅')}
      </div>
    )
  return (
    <Card className="mb-5 border-danger/30">
      <CardHeader title={`🩺 ${t('صحة النظام', 'Santé du système')}`} description={t(`${issues.length} أمر يحتاج انتباهك`, `${issues.length} point(s) à vérifier`)} icon={<Stethoscope />} />
      <div className="space-y-2 px-5 pb-5">
        {issues.map((i) => (
          <div key={i.key} className={cn('rounded-xl p-3 text-sm', i.severity === 'danger' ? 'bg-danger/10' : 'bg-warning/10')}>
            <div className="font-semibold">{i.severity === 'danger' ? '🔴' : '🟠'} {i.ar}</div>
            <div className="mt-0.5 text-muted">
              {HELP[i.key]?.ar}
              {HELP[i.key]?.to && (
                <Link to={HELP[i.key].to!} className="ms-2 text-brand underline">
                  {t('فتح', 'Ouvrir')}
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

type Run = { id: number; started_at: string; ok: boolean | null; path: string | null; bytes: number | null; tables: number | null; error: string | null }

/** Nightly backups: list, download, back up now. */
export function BackupsCard() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const runs = useQuery({ queryKey: ['backup-runs'], enabled: !!me?.is_owner, queryFn: async () => ((await sb.from('backup_runs').select('*').order('id', { ascending: false }).limit(14)).data ?? []) as Run[] })
  if (!me?.is_owner) return null
  const now = async () => {
    setBusy(true)
    try {
      const r = await callFn<{ bytes: number }>(sb, 'backup', {})
      toast.success(t(`تمت النسخة ✅ (${Math.round(r.bytes / 1024)} KB)`, 'Sauvegarde faite ✅'))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
      qc.invalidateQueries({ queryKey: ['backup-runs'] })
      qc.invalidateQueries({ queryKey: ['system-health'] })
      qc.invalidateQueries({ queryKey: ['launch-checklist'] })
    }
  }
  const download = async (path: string) => {
    const { data, error } = await sb.storage.from('backups').createSignedUrl(path, 120, { download: true })
    if (error) return toast.error(errorMessage(error, lang))
    window.location.href = data.signedUrl
  }
  return (
    <Card>
      <CardHeader title={t('النسخ الاحتياطية التلقائية', 'Sauvegardes automatiques')} description={t('كل ليلة 2:30 نسخة كاملة من كل البيانات، محفوظة في مكان خاص. نحتفظ بآخر 14 نسخة.', 'Chaque nuit à 2h30, on garde les 14 dernières.')} icon={<HardDriveDownload />} />
      <div className="space-y-3 p-5 pt-0">
        <Button variant="outline" onClick={now} loading={busy}>
          <HardDriveDownload />
          {t('خذ نسخة الآن', 'Sauvegarder maintenant')}
        </Button>
        <div className="divide-y divide-border rounded-xl border border-border text-sm">
          {(runs.data ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-3 py-2">
              <span>{r.ok ? '✅' : r.ok === false ? '❌' : '⏳'}</span>
              <span className="num flex-1">{format(new Date(r.started_at), 'dd/MM/yyyy HH:mm')}</span>
              {r.ok ? (
                <>
                  <span className="num text-xs text-muted">
                    {r.tables} {t('جدول', 'tables')} · {Math.round((r.bytes ?? 0) / 1024)} KB
                  </span>
                  <Button size="icon-sm" variant="ghost" onClick={() => download(r.path!)} title={t('تحميل', 'Télécharger')}>
                    <Download />
                  </Button>
                </>
              ) : (
                <span className="truncate text-xs text-danger">{r.error}</span>
              )}
            </div>
          ))}
          {!runs.data?.length && <div className="px-3 py-2 text-muted">{t('لا توجد نسخ بعد.', 'Aucune sauvegarde.')}</div>}
        </div>
        <p className="text-xs text-muted">{t('نصيحة: حمّل نسخة مرة في الشهر واحفظها في Google Drive أيضاً.', 'Conseil : téléchargez-en une par mois sur Google Drive.')}</p>
      </div>
    </Card>
  )
}
