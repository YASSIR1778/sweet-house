import { useState } from 'react'
import { motion } from 'motion/react'
import { KeyRound, Monitor, ShieldCheck, User } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { loginToEmail } from '@/shared/lib/supabase'
import { Button, Card, Field, Input } from '@/shared/ui/primitives'
import { LangToggle, LogoMark } from '@/shared/ui/brand'
import type { DeviceInfo } from './device'

/** One-time registration of this computer as a POS terminal (owner / settings.manage). */
export function DeviceSetup({ onRegistered }: { onRegistered: (d: DeviceInfo) => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState(t('صندوق المحل', 'Caisse principale'))
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { error: authErr } = await sb.auth.signInWithPassword({ email: loginToEmail(login), password })
      if (authErr) throw authErr
      const { data, error } = await sb.rpc('register_device', { p_name: name })
      if (error) throw error
      await sb.auth.signOut()
      toast.success(t('تم تسجيل الجهاز بنجاح ✅', 'Appareil enregistré ✅'))
      onRegistered({ id: data.id, secret: data.secret, name })
    } catch (err) {
      await sb.auth.signOut()
      toast.error(errorMessage(err, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy p-6">
      <div className="bg-grid absolute inset-0 opacity-30" />
      <div className="absolute -top-40 -start-40 size-[30rem] rounded-full bg-brand/25 blur-3xl" />
      <div className="absolute end-4 top-4">
        <LangToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <Card className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={48} />
            <div>
              <h1 className="text-xl font-bold">{t('تسجيل جهاز نقطة البيع', 'Enregistrer ce poste')}</h1>
              <p className="text-sm text-muted">{t('خطوة واحدة فقط، يقوم بها المالك', 'Étape unique, par le propriétaire')}</p>
            </div>
          </div>
          <div className="mb-6 flex items-start gap-3 rounded-xl bg-brand-50 p-3 text-sm">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" />
            {t('بعد التسجيل يستطيع الموظفون الدخول من هذا الجهاز برمزهم السري فقط.', 'Ensuite, les employés se connectent ici avec leur code PIN.')}
          </div>
          <form onSubmit={submit} className="space-y-4">
            <Field label={t('اسم الجهاز', "Nom de l'appareil")}>
              <Input icon={<Monitor />} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label={t('بريد المالك أو اسم المستخدم', 'E-mail du propriétaire')}>
              <Input icon={<User />} value={login} onChange={(e) => setLogin(e.target.value)} required dir="ltr" autoComplete="username" />
            </Field>
            <Field label={t('كلمة السر', 'Mot de passe')}>
              <Input icon={<KeyRound />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" autoComplete="current-password" />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={busy}>
              {t('تسجيل الجهاز', 'Enregistrer')}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
