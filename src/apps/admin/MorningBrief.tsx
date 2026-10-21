import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Coffee } from 'lucide-react'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { Button, Card } from '@/shared/ui/primitives'

type Brief = { day: string; text: string; points: { avatar: string; text: string; link: string }[]; celebrate: boolean; seen_at: string | null }

/** A short emoji burst for good days. */
function Confetti() {
  const bits = useRef(Array.from({ length: 36 }, (_, i) => ({ e: ['🎉', '✨', '🥳', '⭐', '🎊'][i % 5], x: Math.random() * 100, d: Math.random() * 0.8, r: Math.random() * 360 })))
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setOn(false), 3200)
    return () => clearTimeout(id)
  }, [])
  if (!on) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      <style>{'@keyframes sh-fall{from{transform:translateY(-10vh) rotate(0)}to{transform:translateY(110vh) rotate(540deg)}}'}</style>
      {bits.current.map((b, i) => (
        <span key={i} style={{ position: 'absolute', left: `${b.x}%`, top: 0, fontSize: 22, animation: `sh-fall 2.6s ${b.d}s ease-in forwards`, transform: `rotate(${b.r}deg)` }}>
          {b.e}
        </span>
      ))}
    </div>
  )
}

/** ☕ Morning brief from the team: one card instead of ten notifications. */
export function MorningBrief() {
  const { sb, can } = useAuth()
  const { t } = useLang()
  const qc = useQueryClient()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Casablanca' })
  const q = useQuery({ queryKey: ['brief', today], enabled: can('owner'), queryFn: async () => (await sb.from('agent_briefs').select('*').eq('day', today).maybeSingle()).data as Brief | null })
  const b = q.data
  if (!b || b.seen_at) return null
  const seen = async () => {
    await sb.from('agent_briefs').update({ seen_at: new Date().toISOString() }).eq('day', b.day)
    qc.invalidateQueries({ queryKey: ['brief'] })
  }
  return (
    <>
      {b.celebrate && <Confetti />}
      <Card className="mb-5 overflow-hidden border-brand/30">
        <div className="flex items-start gap-3 bg-gradient-to-l from-brand-50 to-transparent p-5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand/15 text-2xl">☕</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-muted">
              <Coffee className="size-3.5" />
              {t('قهوة الصباح', 'Café du matin')}
            </div>
            <div className="mt-1 font-semibold">{b.text}</div>
            <ul className="mt-3 space-y-1.5">
              {b.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-base">{p.avatar}</span>
                  {p.link?.startsWith('/') ? (
                    <Link to={p.link} className="hover:text-brand hover:underline">
                      {p.text}
                    </Link>
                  ) : (
                    <span>{p.text}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <Button size="sm" variant="ghost" onClick={seen} title={t('شفتها', 'Vu')}>
            <Check />
            {t('شفتها', 'Vu')}
          </Button>
        </div>
      </Card>
    </>
  )
}

/** A different chime per agent when a new suggestion arrives (owner preference). */
export function AgentChime() {
  const { sb, can } = useAuth()
  const last = useRef<string | null>(null)
  const q = useQuery({
    queryKey: ['agent-latest'],
    enabled: can('owner'),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await sb.from('agent_suggestions').select('id, created_at, agents(tone_hz)').eq('status', 'new').order('created_at', { ascending: false }).limit(1).maybeSingle()
      const prefs = (await sb.from('settings').select('value').eq('key', 'agent_prefs').single()).data?.value as { sounds?: boolean } | undefined
      return { s: data as { id: string; agents: { tone_hz: number } | null } | null, sounds: prefs?.sounds !== false }
    },
  })
  useEffect(() => {
    const s = q.data?.s
    if (!s) return
    if (last.current && last.current !== s.id && q.data?.sounds) {
      try {
        const ctx = new AudioContext()
        const hz = s.agents?.tone_hz ?? 660
        ;[0, 0.16].forEach((at, i) => {
          const o = ctx.createOscillator()
          const g = ctx.createGain()
          o.frequency.value = hz * (i ? 1.5 : 1)
          g.gain.setValueAtTime(0.0001, ctx.currentTime + at)
          g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + at + 0.02)
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.3)
          o.connect(g).connect(ctx.destination)
          o.start(ctx.currentTime + at)
          o.stop(ctx.currentTime + at + 0.32)
        })
      } catch {
        /* audio not allowed yet */
      }
    }
    last.current = s.id
  }, [q.data])
  return null
}
