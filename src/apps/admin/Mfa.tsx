import { useEffect, useState } from 'react'
import { KeyRound, LogOut, ShieldCheck, Smartphone, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Badge, Button, Field, Input, Spinner } from '@/shared/ui/primitives'
import { Dialog } from '@/shared/ui/overlay'
import { AuthShell } from './pages/AuthShell'

/** Returns true when this session must still enter its authenticator code. */
export function useMfaRequired() {
  const { sb, session } = useAuth()
  const [state, setState] = useState<'checking' | 'required' | 'ok'>('checking')
  useEffect(() => {
    if (!session) return setState('ok')
    sb.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setState(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2' ? 'required' : 'ok')
    })
  }, [sb, session])
  return { state, done: () => setState('ok') }
}

export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const { sb, signOut } = useAuth()
  const { t, lang } = useLang()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { data } = await sb.auth.mfa.listFactors()
    const f = data?.totp.find((x) => x.status === 'verified')
    if (!f) return (setBusy(false), onDone())
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: f.id, code: code.trim() })
    setBusy(false)
    if (error) return toast.error(t('الرمز غير صحيح أو انتهت صلاحيته', 'Code incorrect ou expiré') + ` (${errorMessage(error, lang)})`)
    onDone()
  }
  return (
    <AuthShell title={t('التحقق بخطوتين', 'Vérification en deux étapes')} subtitle={t('افتح تطبيق المصادقة على هاتفك وأدخل الرمز المكوّن من 6 أرقام', 'Saisissez le code à 6 chiffres de votre application')}>
      <form onSubmit={verify} className="space-y-4">
        <Field label={t('الرمز', 'Code')}>
          <Input icon={<KeyRound />} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus dir="ltr" className="num text-center text-xl tracking-[0.4em]" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={code.length !== 6}>
          <ShieldCheck />
          {t('تحقق', 'Vérifier')}
        </Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => signOut()}>
          <LogOut />
          {t('تسجيل الخروج', 'Déconnexion')}
        </Button>
      </form>
    </AuthShell>
  )
}

/** Enroll / remove an authenticator app for the signed-in user. */
export function SecurityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string; status: string; created_at: string }[] | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const { data } = await sb.auth.mfa.listFactors()
    setFactors((data?.all ?? []).filter((f) => f.factor_type === 'totp'))
  }
  useEffect(() => {
    if (open) (load(), setEnroll(null), setCode(''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const start = async () => {
    setBusy(true)
    // Drop unfinished attempts first (Supabase refuses duplicates).
    for (const f of factors ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Sweet House ${new Date().toISOString().slice(0, 10)}` })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }
  const confirm = async () => {
    if (!enroll) return
    setBusy(true)
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enroll.id, code })
    setBusy(false)
    if (error) return toast.error(t('الرمز غير صحيح، حاول مجدداً', 'Code incorrect'))
    toast.success(t('تم تفعيل التحقق بخطوتين ✅', 'Double authentification activée ✅'))
    setEnroll(null)
    load()
  }
  const remove = async (id: string) => {
    const { error } = await sb.auth.mfa.unenroll({ factorId: id })
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('تم إلغاء التحقق بخطوتين', 'Désactivée'))
    load()
  }
  const verified = (factors ?? []).filter((f) => f.status === 'verified')

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} size="md" title={t('أمان الحساب', 'Sécurité du compte')} description={t('التحقق بخطوتين: بعد كلمة السر يُطلب رمز من تطبيق على هاتفك', 'Après le mot de passe, un code de votre téléphone est demandé')}>
      {!factors ? (
        <Spinner />
      ) : enroll ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted">{t('1. ثبّت تطبيق Google Authenticator أو Microsoft Authenticator على هاتفك. 2. امسح هذا الرمز. 3. أدخل الرمز الظاهر في التطبيق.', '1. Installez Google/Microsoft Authenticator. 2. Scannez. 3. Saisissez le code.')}</p>
          <img src={enroll.qr} alt="QR" className="mx-auto size-48 rounded-xl bg-white p-2" />
          <div className="num rounded-lg bg-surface-2 p-2 text-xs break-all select-all" dir="ltr">
            {enroll.secret}
          </div>
          <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" className="num text-center text-xl tracking-[0.4em]" placeholder="000000" autoFocus />
          <Button className="w-full" onClick={confirm} loading={busy} disabled={code.length !== 6}>
            {t('تأكيد التفعيل', 'Activer')}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {verified.length ? (
            verified.map((f) => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <Smartphone className="size-5 text-success" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{f.friendly_name}</div>
                  <Badge tone="success">{t('مفعّل', 'Actif')}</Badge>
                </div>
                <Button variant="danger-soft" size="sm" onClick={() => remove(f.id)}>
                  <Trash />
                  {t('إلغاء', 'Retirer')}
                </Button>
              </div>
            ))
          ) : (
            <div className="rounded-xl bg-warning/5 p-4 text-sm text-muted">{t('التحقق بخطوتين غير مفعّل. ننصح به بقوة لحساب المالك.', 'Non activée. Fortement conseillée pour le propriétaire.')}</div>
          )}
          {!verified.length && (
            <Button className="w-full" onClick={start} loading={busy}>
              <ShieldCheck />
              {t('تفعيل التحقق بخطوتين', 'Activer la double authentification')}
            </Button>
          )}
          <p className="text-xs text-muted">{t('ملاحظة: يُطلب الرمز عند الدخول إلى لوحة التحكم. الدخول إلى نقطة البيع بالرمز السري لا يتأثر.', 'Demandé pour le tableau de bord ; le POS par PIN n’est pas affecté.')}</p>
        </div>
      )}
    </Dialog>
  )
}
