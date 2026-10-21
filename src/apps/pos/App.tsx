import { useEffect, useState } from 'react'
import { AuthProvider, useAuth } from '@/shared/lib/auth'
import { getSupabase } from '@/shared/lib/supabase'
import { Spinner } from '@/shared/ui/primitives'
import { LogoMark } from '@/shared/ui/brand'
import { deviceStore, type DeviceInfo } from './device'
import { DeviceSetup } from './DeviceSetup'
import { PinScreen } from './PinScreen'
import { SellScreen } from './SellScreen'
import { ForeignShiftScreen, OpenShiftScreen, useShift } from './shift'

const sb = getSupabase('pos')

function Gate() {
  const { session, me, loading } = useAuth()
  const [device, setDevice] = useState<DeviceInfo | null>(deviceStore.get)
  const [disabled, setDisabled] = useState(false)

  // Disabled devices wait; removed / rejected ones go back to pairing.
  const lost = async () => {
    if (!device) return
    const st = (await sb.rpc('device_status', { p_device: device.id, p_secret: device.secret })).data as { status: string } | null
    if (st?.status === 'disabled' || st?.status === 'pending') setDisabled(true)
    else (deviceStore.clear(), setDevice(null))
  }

  // Heartbeat: lets the dashboard show this device online and who uses it.
  // A device removed or disabled from the dashboard goes back to pairing.
  useEffect(() => {
    if (!device) return
    const ping = async () => {
      const { data, error } = await sb.rpc('device_ping', { p_device: device.id, p_secret: device.secret })
      if (error || data !== false) return setDisabled(false)
      lost()
    }
    ping()
    const iv = setInterval(ping, 60_000)
    return () => clearInterval(iv)
  }, [device, session?.user.id])

  if (device && disabled)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy p-6 text-center text-white">
        <LogoMark size={56} />
        <div className="text-xl font-bold">هذا الجهاز موقوف مؤقتاً من لوحة التحكم</div>
        <div className="text-sm text-white/60">Cet appareil est désactivé depuis le tableau de bord</div>
        <div className="text-xs text-white/40">{device.name}</div>
      </div>
    )
  if (!device) return <DeviceSetup onRegistered={(d) => (deviceStore.set(d), setDevice(d))} />
  if (loading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-navy">
        <LogoMark size={64} className="animate-pulse" />
        <Spinner />
      </div>
    )
  if (!session || !me || !me.can_use_pos) return <PinScreen device={device} onDeviceLost={lost} />
  return <ShiftGate device={device} />
}

function ShiftGate({ device }: { device: DeviceInfo }) {
  const shift = useShift(device)
  if (shift.isLoading || !shift.data)
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy">
        <Spinner />
      </div>
    )
  const s = shift.data
  if (!s.open) return <OpenShiftScreen device={device} status={s} onOpened={() => shift.refetch()} />
  if (!s.mine) return <ForeignShiftScreen device={device} status={s} onClosed={() => shift.refetch()} />
  return <SellScreen device={device} shift={s} onShiftChange={() => shift.refetch()} />
}

export function App() {
  return (
    <AuthProvider sb={sb}>
      <Gate />
    </AuthProvider>
  )
}
