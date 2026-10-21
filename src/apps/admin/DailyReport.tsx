import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Copy, FileBarChart, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { whatsappLink } from '@/shared/lib/utils'
import { Button, Field, Input, Spinner, SwitchRow } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { Select } from '@/shared/ui/select'
import { PushToggle } from '@/shared/ui/push-toggle'

type Cfg = { enabled: boolean; hour: number; phone: string | null; last_sent?: string | null }

/** 30 · Evening report for the owner: preview, send to WhatsApp, schedule. */
export function DailyReportButton() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const text = useQuery({ queryKey: ['daily-report', open], enabled: open, queryFn: async () => (await sb.rpc('daily_report_preview')).data as string })
  const settings = useQuery({ queryKey: ['daily-report-cfg'], enabled: open, queryFn: async () => (await sb.from('settings').select('value').eq('key', 'daily_report').single()).data?.value as Cfg })
  useEffect(() => {
    if (settings.data) setCfg(settings.data)
  }, [settings.data])
  if (!me?.is_owner) return null

  const save = async (next: Cfg) => {
    setCfg(next)
    const { error } = await sb.from('settings').update({ value: next }).eq('key', 'daily_report')
    if (error) toast.error(errorMessage(error, lang))
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FileBarChart />
        {t('تقرير اليوم', 'Rapport du jour')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen} size="md" title={t('تقرير اليوم', 'Rapport du jour')} description={t('يصلك تلقائياً كل مساء كإشعار، وعلى واتساب عند تفعيل واتساب الرسمي', 'Envoyé chaque soir en notification (et WhatsApp si l’API est active)')}>
        <div className="space-y-4">
          <div className="max-h-80 overflow-y-auto rounded-xl bg-surface-2 p-4 text-sm leading-relaxed whitespace-pre-line">{text.data ?? <Spinner />}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" asChild disabled={!text.data}>
              <a href={whatsappLink(cfg?.phone || '', text.data ?? '')} target="_blank" rel="noreferrer">
                <MessageCircle />
                {t('إرسال على واتساب', 'Envoyer sur WhatsApp')}
              </a>
            </Button>
            <Button variant="outline" onClick={() => text.data && (navigator.clipboard.writeText(text.data), toast.success(t('تم النسخ', 'Copié')))}>
              <Copy />
              {t('نسخ', 'Copier')}
            </Button>
          </div>
          {cfg && (
            <div className="space-y-3 border-t border-border pt-4">
              <SwitchRow label={t('إرسال التقرير تلقائياً كل يوم', 'Envoi automatique chaque jour')} checked={cfg.enabled} onCheckedChange={(enabled) => save({ ...cfg, enabled })} />
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('الساعة', 'Heure')}>
                  <Select value={String(cfg.hour)} onValueChange={(v) => save({ ...cfg, hour: Number(v ?? 21) })} options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }))} />
                </Field>
                <Field label={t('رقم واتساب لاستلامه', 'N° WhatsApp de réception')}>
                  <Input value={cfg.phone ?? ''} onChange={(e) => setCfg({ ...cfg, phone: e.target.value })} onBlur={() => save(cfg)} dir="ltr" inputMode="tel" placeholder="06…" />
                </Field>
              </div>
              <PushToggle sb={sb} app="admin" />
              <p className="text-xs text-muted">{t('فعّل الإشعارات على هاتفك (افتح لوحة التحكم من الهاتف) ليصلك التقرير هناك.', 'Activez les notifications sur votre téléphone pour le recevoir.')}</p>
            </div>
          )}
        </div>
      </Dialog>
    </>
  )
}
