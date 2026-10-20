import { useState } from 'react'
import { KeyRound, Mail, Rocket, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { AuthShell } from './AuthShell'

/** First run: create the owner account (only possible while none exists). */
export function SetupPage({ onDone }: { onDone: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' })
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.password.length < 8) return toast.error(errorMessage('weak_password', lang))
    if (form.password !== form.confirm) return toast.error(t('كلمتا السر غير متطابقتين', 'Les mots de passe ne correspondent pas'))
    setBusy(true)
    try {
      await callFn(sb, 'bootstrap-owner', { full_name: form.full_name, email: form.email, password: form.password })
    } catch (err) {
      setBusy(false)
      return toast.error(errorMessage(err, lang))
    }
    const { error: signErr } = await sb.auth.signInWithPassword({ email: form.email.trim().toLowerCase(), password: form.password })
    setBusy(false)
    if (signErr) return toast.error(errorMessage(signErr, lang))
    toast.success(t('تم إنشاء حساب المالك بنجاح 🎉', 'Compte propriétaire créé 🎉'))
    onDone()
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <AuthShell title={t('مرحباً بك في Sweet House 🎉', 'Bienvenue sur Sweet House 🎉')} subtitle={t('أنشئ حساب المالك لبدء استعمال النظام. هذه الخطوة تتم مرة واحدة فقط.', 'Créez le compte propriétaire. Cette étape ne se fait qu’une seule fois.')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('الاسم الكامل', 'Nom complet')} required>
          <Input icon={<User />} value={form.full_name} onChange={set('full_name')} required />
        </Field>
        <Field label={t('البريد الإلكتروني', 'E-mail')} required>
          <Input icon={<Mail />} type="email" value={form.email} onChange={set('email')} required dir="ltr" autoComplete="email" />
        </Field>
        <Field label={t('كلمة السر', 'Mot de passe')} hint={t('8 أحرف على الأقل', '8 caractères minimum')} required>
          <Input icon={<KeyRound />} type="password" value={form.password} onChange={set('password')} required dir="ltr" autoComplete="new-password" />
        </Field>
        <Field label={t('تأكيد كلمة السر', 'Confirmer le mot de passe')} required>
          <Input icon={<KeyRound />} type="password" value={form.confirm} onChange={set('confirm')} required dir="ltr" autoComplete="new-password" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          <Rocket />
          {t('إنشاء الحساب والبدء', 'Créer et commencer')}
        </Button>
      </form>
    </AuthShell>
  )
}
