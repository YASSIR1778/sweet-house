import { useState } from 'react'
import { AuthProvider, useAuth } from '@/shared/lib/auth'
import { getSupabase } from '@/shared/lib/supabase'
import { Spinner } from '@/shared/ui/primitives'
import { LogoMark } from '@/shared/ui/brand'
import { deviceStore, type DeviceInfo } from './device'
import { DeviceSetup } from './DeviceSetup'
import { PinScreen } from './PinScreen'
import { SellScreen } from './SellScreen'

const sb = getSupabase('pos')

function Gate() {
  const { session, me, loading } = useAuth()
  const [device, setDevice] = useState<DeviceInfo | null>(deviceStore.get)

  if (!device) return <DeviceSetup onRegistered={(d) => (deviceStore.set(d), setDevice(d))} />
  if (loading)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-navy">
        <LogoMark size={64} className="animate-pulse" />
        <Spinner />
      </div>
    )
  if (!session || !me || !me.can_use_pos) return <PinScreen device={device} onDeviceLost={() => (deviceStore.clear(), setDevice(null))} />
  return <SellScreen device={device} />
}

export function App() {
  return (
    <AuthProvider sb={sb}>
      <Gate />
    </AuthProvider>
  )
}
