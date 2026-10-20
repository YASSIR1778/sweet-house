import { storage } from '@/shared/lib/utils'

export type DeviceInfo = { id: string; secret: string; name: string }

export const deviceStore = storage<DeviceInfo | null>('sh-pos-device', null)

let ctx: AudioContext | null = null
/** Short beep feedback for scans / errors (no audio files needed). */
export function beep(kind: 'ok' | 'error' | 'success' = 'ok') {
  try {
    ctx ??= new AudioContext()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g)
    g.connect(ctx.destination)
    const now = ctx.currentTime
    const f = kind === 'error' ? 220 : kind === 'success' ? 880 : 1200
    o.frequency.setValueAtTime(f, now)
    if (kind === 'success') o.frequency.setValueAtTime(1320, now + 0.09)
    g.gain.setValueAtTime(0.08, now)
    g.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'success' ? 0.25 : 0.12))
    o.start(now)
    o.stop(now + 0.3)
  } catch {
    /* audio not available */
  }
}
