import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Card, CardHeader, Field, Input, SwitchRow } from '@/shared/ui/primitives'

type Cfg = { enabled: boolean; model_fast: string; model_smart: string; monthly_limit: number }
type Usage = { month_count: number; by_action: Record<string, number>; tokens_in: number; tokens_out: number }

const ACTIONS: Record<string, [string, string]> = {
  id_card: ['قراءة البطاقة', 'Lecture CIN'],
  riyad: ['قراءة كشف رياض', 'Relevé Riyad'],
  write: ['المساعد الكتابي', 'Rédaction'],
  service_docs: ['اقتراح وثائق الخدمات', 'Suggestions services'],
  assistant: ['المساعد الذكي', 'Assistant'],
}

/** Settings → AI: on/off, monthly cap, usage and how to add the API key. */
export function AiSection() {
  const { sb, me } = useAuth()
  const { t, lang } = useLang()
  const [cfg, setCfg] = useState<Cfg | null>(null)
  const q = useQuery({ queryKey: ['ai-cfg'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'ai').single()).data?.value as Cfg })
  const usage = useQuery({ queryKey: ['ai-usage'], queryFn: async () => (await sb.rpc('ai_usage_summary')).data as Usage })
  useEffect(() => {
    if (q.data) setCfg(q.data)
  }, [q.data])

  const save = async (next: Cfg) => {
    setCfg(next)
    const { error } = await sb.from('settings').update({ value: next }).eq('key', 'ai')
    if (error) toast.error(errorMessage(error, lang))
  }
  if (!me?.is_owner)
    return <Card className="p-5 text-sm text-muted">{t('إعدادات الذكاء الاصطناعي خاصة بالمالك.', 'Réservé au propriétaire.')}</Card>
  if (!cfg) return null
  const u = usage.data

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={t('الذكاء الاصطناعي', 'Intelligence artificielle')} description={t('قراءة بطاقة التعريف، المساعد الكتابي، قراءة كشف رياض، واقتراح وثائق الخدمات', 'Lecture CIN, rédaction, relevé Riyad, suggestions')} icon={<Sparkles />} />
        <div className="space-y-4 p-5">
          <SwitchRow label={t('تفعيل أدوات الذكاء الاصطناعي', 'Activer les outils IA')} checked={cfg.enabled} onCheckedChange={(enabled) => save({ ...cfg, enabled })} />
          <Field label={t('الحد الأقصى للاستعمال في الشهر', 'Utilisations max par mois')} hint={t('حماية من المصاريف غير المتوقعة. كل قراءة أو كتابة = استعمال واحد.', 'Protection contre les coûts imprévus.')}>
            <Input type="number" min={0} value={cfg.monthly_limit} onChange={(e) => setCfg({ ...cfg, monthly_limit: Number(e.target.value) })} onBlur={() => save(cfg)} className="num w-32" />
          </Field>
          <div className="rounded-xl bg-surface-2 p-4">
            <div className="text-sm text-muted">{t('هذا الشهر', 'Ce mois-ci')}</div>
            <div className="num mt-1 text-2xl font-bold">
              {u?.month_count ?? 0} <span className="text-sm font-normal text-muted">/ {cfg.monthly_limit}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
              {Object.entries(u?.by_action ?? {}).map(([k, n]) => (
                <span key={k}>
                  {t(ACTIONS[k]?.[0] ?? k, ACTIONS[k]?.[1] ?? k)}: <span className="num font-semibold">{n}</span>
                </span>
              ))}
            </div>
            {!!u && (u.tokens_in > 0 || u.tokens_out > 0) && (
              <div className="mt-2 text-xs text-muted">
                {t('التكلفة التقريبية هذا الشهر (أقصى تقدير):', 'Coût estimé ce mois (max) :')}{' '}
                <span className="num font-semibold text-text">≈ {((u.tokens_in * 2 + u.tokens_out * 10) / 1e6 * 10).toFixed(1)} {t('درهم', 'DH')}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title={t('طريقة التفعيل (مرة واحدة)', 'Activation (une fois)')} />
        <ol className="list-decimal space-y-2 p-5 ps-10 text-sm">
          <li>
            {t('افتح ', 'Ouvrez ')}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">
              console.anthropic.com <ExternalLink className="size-3" />
            </a>
            {t(' وأنشئ حساباً، ثم أضف رصيداً صغيراً (Billing).', ', créez un compte et ajoutez un petit crédit (Billing).')}
          </li>
          <li>{t('من «API Keys» أنشئ مفتاحاً جديداً وانسخه (يبدأ بـ sk-ant-).', 'Dans « API Keys », créez une clé (commence par sk-ant-).')}</li>
          <li>
            {t('في Supabase: Edge Functions ← Secrets ← Add new secret: الاسم ', 'Dans Supabase : Edge Functions → Secrets → nom ')}
            <code className="num rounded bg-surface-2 px-1.5 py-0.5" dir="ltr">ANTHROPIC_API_KEY</code>
            {t(' والقيمة هي المفتاح. احفظ.', ' et la clé comme valeur.')}
          </li>
          <li>{t('جرّب «تصوير بطاقة التعريف» في أي طلب خدمة. لا تشارك المفتاح مع أي أحد ولا تضعه في الموقع.', 'Testez « Scanner une CIN ». Ne partagez jamais la clé.')}</li>
        </ol>
        <p className="px-5 pb-5 text-xs text-muted">{t('الصور تُرسل للقراءة فقط ولا يحفظها النظام. اذكر ذلك في سياسة الخصوصية وتصريح CNDP.', 'Images envoyées pour lecture seulement, non conservées. À mentionner dans la politique de confidentialité / CNDP.')}</p>
      </Card>
    </div>
  )
}
