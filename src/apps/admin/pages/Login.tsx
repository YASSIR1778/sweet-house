import { useState } from 'react'
import { KeyRound, LogIn, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { loginToEmail } from '@/shared/lib/supabase'
import { Button, Field, Input } from '@/shared/ui/primitives'
import { AuthShell } from './AuthShell'

export function LoginPage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await sb.auth.signInWithPassword({ email: loginToEmail(login), password })
    setBusy(false)
    if (error) toast.error(errorMessage(error, lang))
  }

  return (
    <AuthShell title={t('مرحباً بعودتك 👋', 'Bon retour 👋')} subtitle={t('سجّل الدخول إلى لوحة التحكم', 'Connectez-vous au tableau de bord')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('البريد الإلكتروني أو اسم المستخدم', "E-mail ou nom d'utilisateur")}>
          <Input icon={<User />} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required dir="ltr" />
        </Field>
        <Field label={t('كلمة السر', 'Mot de passe')}>
          <Input icon={<KeyRound />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required dir="ltr" />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={busy}>
          <LogIn />
          {t('دخول', 'Se connecter')}
        </Button>
      </form>
    </AuthShell>
  )
}
