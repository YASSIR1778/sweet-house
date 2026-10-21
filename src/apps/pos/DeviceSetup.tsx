import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { CheckCircle2, ChevronDown, KeyRound, Monitor, RefreshCw, ShieldCheck, User, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { loginToEmail } from '@/shared/lib/supabase'
import { storage } from '@/shared/lib/utils'
import { Button, Card, Field, Input, Spinner } from '@/shared/ui/primitives'
import { LangToggle, LogoMark } from '@/shared/ui/brand'
import type { DeviceInfo } from './device'

type Pending = { id: string; secret: string; code: string; name: string }
const pendingStore = storage<Pending | null>('sh-pos-device-pending', null)

/** "Chrome · Windows" style label so the owner recognises the computer. */
function deviceLabel() {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navigateur'
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : ''
  return [browser, os, `${screen.width}×${screen.height}`].filter(Boolean).join(' · ')
}

/**
 * Pair this computer as a POS terminal: it asks to connect and shows a code;
 * the owner approves it from the dashboard (Devices). No password typed here.
 */
export function DeviceSetup({ onRegistered }: { onRegistered: (d: DeviceInfo) => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [name, setName] = useState(t('صندوق المحل', 'Caisse principale'))
  const [pending, setPending] = useState<Pending | null>(pendingStore.get)
  const [state, setState] = useState<'idle' | 'waiting' | 'rejected'>(pendingStore.get() ? 'waiting' : 'idle')
  const [busy, setBusy] = useState(false)
  const [ownerMode, setOwnerMode] = useState(false)

  const request = async () => {
    setBusy(true)
    const { data, error } = await sb.rpc('device_request', { p_name: name, p_info: deviceLabel() })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    const p = { ...(data as { id: string; secret: string; code: string }), name }
    pendingStore.set(p)
    setPending(p)
    setState('waiting')
  }

  // Wait for the owner's approval
  useEffect(() => {
    if (state !== 'waiting' || !pending) return
    let stop = false
    const check = async () => {
      const { data } = await sb.rpc('device_status', { p_device: pending.id, p_secret: pending.secret })
      if (stop) return
      const st = (data as { status: string; name: string } | null)?.status
      if (st === 'approved') {
        pendingStore.clear()
        toast.success(t('تمت الموافقة على الجهاز ✅', 'Appareil approuvé ✅'))
        onRegistered({ id: pending.id, secret: pending.secret, name: (data as { name: string }).name })
      } else if (!data || st === 'rejected') {
        pendingStore.clear()
        setState('rejected')
      }
    }
    check()
    const iv = setInterval(check, 3000)
    return () => ((stop = true), clearInterval(iv))
  }, [state, pending, sb, onRegistered, t])

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy p-6">
      <div className="bg-grid absolute inset-0 opacity-30" />
      <div className="absolute -start-40 -top-40 size-[30rem] rounded-full bg-brand/25 blur-3xl" />
      <div className="absolute end-4 top-4">
        <LangToggle />
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="relative w-full max-w-md">
        <Card className="p-8">
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={48} />
            <div>
              <h1 className="text-xl font-bold">{t('ربط هذا الجهاز بنقطة البيع', 'Connecter ce poste')}</h1>
              <p className="text-sm text-muted">{t('مرة واحدة فقط لكل حاسوب', 'Une seule fois par ordinateur')}</p>
            </div>
          </div>

          {state === 'waiting' && pending ? (
            <div className="space-y-5 text-center">
              <div className="text-sm text-muted">{t('رمز هذا الجهاز', 'Code de cet appareil')}</div>
              <div className="num text-6xl font-extrabold tracking-[0.3em] text-brand" dir="ltr">
                {pending.code}
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted">
                <Spinner className="size-4" />
                {t('في انتظار موافقة المالك…', 'En attente de l’accord du propriétaire…')}
              </div>
              <div className="rounded-xl bg-brand-50 p-4 text-start text-sm">
                {t('افتح لوحة التحكم ← «أجهزة نقطة البيع»، ستجد طلب هذا الجهاز بنفس الرمز. اضغط «موافقة» وتنتهي العملية هنا تلقائياً.', 'Ouvrez le tableau de bord → « Appareils POS » et approuvez la demande portant ce code.')}
              </div>
              <Button variant="ghost" size="sm" onClick={() => (pendingStore.clear(), setPending(null), setState('idle'))}>
                {t('إلغاء الطلب', 'Annuler')}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {state === 'rejected' && (
                <div className="flex items-center gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger">
                  <XCircle className="size-5 shrink-0" />
                  {t('رُفض الطلب أو انتهت صلاحيته. يمكنك إرسال طلب جديد.', 'Demande refusée ou expirée.')}
                </div>
              )}
              <Field label={t('اسم هذا الجهاز', 'Nom de cet appareil')} hint={t('يمكنك تغييره لاحقاً من لوحة التحكم', 'Modifiable ensuite')}>
                <Input icon={<Monitor />} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Button size="lg" className="w-full" onClick={request} loading={busy}>
                {state === 'rejected' ? <RefreshCw /> : <CheckCircle2 />}
                {t('طلب الاتصال', 'Demander l’accès')}
              </Button>
              <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3 text-xs text-muted">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />
                {t('يظهر الطلب للمالك في لوحة التحكم، وبعد موافقته يدخل الموظفون من هنا برمزهم السري.', 'La demande apparaît au propriétaire ; après accord, les employés se connectent par PIN.')}
              </div>
              <button onClick={() => setOwnerMode((o) => !o)} className="flex w-full items-center justify-center gap-1 pt-2 text-xs text-muted hover:text-text">
                {t('أنا المالك وأريد الموافقة من هنا مباشرة', 'Je suis le propriétaire : approuver ici')}
                <ChevronDown className={`size-3.5 transition-transform ${ownerMode ? 'rotate-180' : ''}`} />
              </button>
              {ownerMode && <OwnerLogin name={name} onRegistered={onRegistered} />}
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  )
}

/** Fallback: the owner signs in on this computer once. */
function OwnerLogin({ name, onRegistered }: { name: string; onRegistered: (d: DeviceInfo) => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
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
      toast.success(t('تم تسجيل الجهاز ✅', 'Appareil enregistré ✅'))
      onRegistered({ id: data.id, secret: data.secret, name })
    } catch (err) {
      await sb.auth.signOut()
      toast.error(errorMessage(err, lang))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3 border-t border-border pt-4">
      <Field label={t('بريد المالك أو اسم المستخدم', 'E-mail du propriétaire')}>
        <Input icon={<User />} value={login} onChange={(e) => setLogin(e.target.value)} required dir="ltr" autoComplete="username" />
      </Field>
      <Field label={t('كلمة السر', 'Mot de passe')}>
        <Input icon={<KeyRound />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required dir="ltr" autoComplete="current-password" />
      </Field>
      <Button type="submit" variant="outline" className="w-full" loading={busy}>
        {t('تسجيل الجهاز', 'Enregistrer')}
      </Button>
    </form>
  )
}
