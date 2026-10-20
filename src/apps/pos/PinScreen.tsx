import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, Delete, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { cn } from '@/shared/lib/utils'
import { Avatar } from '@/shared/ui/primitives'
import { LangToggle, LogoMark } from '@/shared/ui/brand'
import { EmptyState } from '@/shared/ui/data'
import { beep, type DeviceInfo } from './device'

type Staff = { id: string; full_name: string; avatar_url: string | null; color: string; has_pin: boolean }

export function PinScreen({ device, onDeviceLost }: { device: DeviceInfo; onDeviceLost: () => void }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const [picked, setPicked] = useState<Staff | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(i)
  }, [])

  const staff = useQuery({
    queryKey: ['pos-staff', device.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc('pos_staff', { p_device: device.id, p_secret: device.secret })
      if (error) {
        if (error.message.includes('device_not_registered')) onDeviceLost()
        throw error
      }
      return data as Staff[]
    },
  })

  const submit = async (code: string) => {
    if (!picked) return
    setBusy(true)
    try {
      const res = await callFn<{ token_hash: string }>(sb, 'pin-login', { device_id: device.id, device_secret: device.secret, employee_id: picked.id, pin: code })
      const { error } = await sb.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' })
      if (error) throw error
      beep('success')
    } catch (e) {
      beep('error')
      setShake((s) => s + 1)
      setPin('')
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  const press = (d: string) => {
    if (busy) return
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) submit(next)
  }

  useEffect(() => {
    if (!picked) return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
      else if (e.key === 'Escape') (setPicked(null), setPin(''))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-navy text-white">
      <div className="bg-grid absolute inset-0 opacity-25" />
      <div className="absolute -bottom-40 -start-40 size-[34rem] rounded-full bg-brand/25 blur-3xl" />
      <div className="absolute -top-32 end-0 size-96 rounded-full bg-[#2563EB]/20 blur-3xl" />

      <header className="relative flex items-center justify-between px-8 py-6">
        <div className="flex items-center gap-3">
          <LogoMark size={44} />
          <div>
            <div className="font-latin text-lg font-extrabold">
              Sweet <span className="text-brand">House</span>
            </div>
            <div className="text-xs text-white/50">{device.name}</div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-end">
            <div className="num text-3xl font-light tracking-tight">{now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' })}</div>
            <div className="text-xs text-white/50">{now.toLocaleDateString(lang === 'ar' ? 'ar-MA' : 'fr-MA', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          </div>
          <div className="[&_button]:text-white [&_button:hover]:bg-white/10">
            <LangToggle />
          </div>
        </div>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-6 pb-12">
        <AnimatePresence mode="wait">
          {!picked ? (
            <motion.div key="pick" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="w-full max-w-4xl text-center">
              <h1 className="text-3xl font-bold">{t('من سيعمل الآن؟', 'Qui travaille maintenant ?')}</h1>
              <p className="mt-2 text-white/60">{t('اختر اسمك ثم أدخل رمزك السري', 'Choisissez votre nom puis entrez votre code')}</p>
              {staff.isLoading ? (
                <Loader2 className="mx-auto mt-12 size-8 animate-spin text-brand" />
              ) : !staff.data?.length ? (
                <div className="mt-10 rounded-2xl bg-white/5 p-6">
                  <EmptyState title={t('لا يوجد موظفون', 'Aucun employé')} description={t('أضف موظفين ورموزهم من لوحة التحكم', 'Ajoutez des employés dans le tableau de bord')} />
                </div>
              ) : (
                <div className="mt-10 flex flex-wrap justify-center gap-5">
                  {staff.data.map((s, i) => (
                    <motion.button
                      key={s.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -4 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => s.has_pin ? (setPicked(s), setPin('')) : toast.error(errorMessage('pin_not_set', lang))}
                      className="group flex w-40 flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-colors hover:border-brand/50 hover:bg-white/10"
                    >
                      <div className="rounded-full ring-4 ring-white/10 transition-all group-hover:ring-brand/40">
                        <Avatar name={s.full_name} color={s.color} src={s.avatar_url} size={72} />
                      </div>
                      <div className="font-semibold">{s.full_name}</div>
                      {!s.has_pin && <div className="text-[11px] text-warning">{t('بدون رمز', 'Sans PIN')}</div>}
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div key="pin" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} className="flex flex-col items-center">
              <button onClick={() => (setPicked(null), setPin(''))} className="mb-6 flex items-center gap-1.5 text-sm text-white/60 hover:text-white">
                <ArrowRight className="size-4 ltr:rotate-180" />
                {t('تغيير الموظف', "Changer d'employé")}
              </button>
              <Avatar name={picked.full_name} color={picked.color} src={picked.avatar_url} size={88} />
              <div className="mt-4 text-2xl font-bold">{picked.full_name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-white/50">
                <Lock className="size-3.5" />
                {t('أدخل رمزك السري', 'Entrez votre code PIN')}
              </div>
              <motion.div key={shake} animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : {}} transition={{ duration: 0.4 }} className="my-8 flex gap-4" dir="ltr">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={cn('size-4 rounded-full border-2 transition-all duration-150', i < pin.length ? 'scale-110 border-brand bg-brand' : 'border-white/30')} />
                ))}
              </motion.div>
              <div className="grid grid-cols-3 gap-3" dir="ltr">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) =>
                  k === '' ? (
                    <div key="empty" />
                  ) : (
                    <motion.button
                      key={k}
                      whileTap={{ scale: 0.92 }}
                      disabled={busy}
                      onClick={() => (k === 'del' ? setPin((p) => p.slice(0, -1)) : press(k))}
                      className="num flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl font-medium backdrop-blur transition-colors hover:bg-white/15 disabled:opacity-50"
                    >
                      {k === 'del' ? <Delete className="size-6" /> : busy && pin.length === 4 && k === '0' ? <Loader2 className="size-6 animate-spin" /> : k}
                    </motion.button>
                  ),
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}
