import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Check, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { callFn } from '@/shared/lib/fn'
import { money } from '@/shared/lib/money'
import { cn } from '@/shared/lib/utils'
import { Button, Spinner, Textarea } from '@/shared/ui/primitives'
import { Sheet } from '@/shared/ui/overlay'

type ApiMsg = { role: 'user' | 'assistant'; content: unknown }
type Proposal = { id: string; type: 'expense' | 'service_price'; amount_dh?: number; category?: string | null; category_id?: string | null; note?: string; spent_on?: string; paid_from?: 'bank' | 'owner'; service?: string; service_id?: string; old_price?: number; price_dh?: number }
type Bubble = { role: 'user' | 'assistant'; text: string; proposals?: Proposal[] }

const SUGGESTIONS: [string, string][] = [
  ['لخّص لي اليوم: المبيعات، الطلبات، وما يحتاج تدخّلي', 'Résume ma journée'],
  ['قارن مبيعات هذا الأسبوع بالأسبوع الماضي', 'Compare cette semaine à la précédente'],
  ['ما المنتجات التي قاربت على النفاد؟', 'Quels produits sont presque épuisés ?'],
  ['هل هناك طلبات خدمات متأخرة؟ ومن المكلف بها؟', 'Y a-t-il des demandes en retard ?'],
  ['كيف حال رصيد رياض؟', 'Où en est le solde Riyad ?'],
  ['من عليه أكبر دين؟', 'Qui a la plus grosse dette ?'],
]

/** **bold** and [label](/path) links, nothing else. */
function Rich({ text, onNav }: { text: string; onNav: () => void }) {
  const parts: ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((\/[a-z-]*)\)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    parts.push(text.slice(last, m.index))
    parts.push(
      m[1] ? (
        <strong key={m.index}>{m[1]}</strong>
      ) : (
        <Link key={m.index} to={m[3]} onClick={onNav} className="font-medium text-brand underline">
          {m[2]}
        </Link>
      ),
    )
    last = re.lastIndex
  }
  parts.push(text.slice(last))
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>
}

function ProposalCard({ p }: { p: Proposal }) {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'cancelled'>('idle')
  const run = async () => {
    setState('busy')
    const { error } =
      p.type === 'expense'
        ? await sb.rpc('add_expense', { p: { amount: Math.round((p.amount_dh ?? 0) * 100), category_id: p.category_id ?? null, note: p.note ?? null, spent_on: p.spent_on ?? null, paid_from: p.paid_from ?? 'bank' } })
        : await sb.from('services').update({ price: Math.round((p.price_dh ?? 0) * 100) }).eq('id', p.service_id!)
    if (error) {
      setState('idle')
      return toast.error(errorMessage(error, lang))
    }
    setState('done')
    toast.success(t('تم التنفيذ ✅', 'Fait ✅'))
    qc.invalidateQueries()
  }
  return (
    <div className="mt-2 rounded-xl border border-brand/30 bg-surface p-3 text-sm">
      {p.type === 'expense' ? (
        <div className="space-y-0.5">
          <div className="font-semibold">{t('تسجيل مصروف', 'Nouvelle dépense')}</div>
          <div className="num text-lg font-bold">{money(Math.round((p.amount_dh ?? 0) * 100))}</div>
          <div className="text-muted">
            {p.category ?? t('بدون فئة', 'Sans catégorie')} · {p.spent_on ?? t('اليوم', "Aujourd'hui")} · {p.paid_from === 'owner' ? t('من جيب المالك', 'Payé par le propriétaire') : t('من البنك', 'Banque')}
          </div>
          {p.note && <div className="text-muted">{p.note}</div>}
        </div>
      ) : (
        <div className="space-y-0.5">
          <div className="font-semibold">{t('تغيير سعر خدمة', 'Changer un prix')}</div>
          <div>{p.service}</div>
          <div className="num">
            <span className="text-muted line-through">{money(p.old_price ?? 0)}</span> ← <span className="font-bold">{money(Math.round((p.price_dh ?? 0) * 100))}</span>
          </div>
        </div>
      )}
      {state === 'done' ? (
        <div className="mt-2 flex items-center gap-1.5 text-success">
          <Check className="size-4" />
          {t('تم', 'Fait')}
        </div>
      ) : state === 'cancelled' ? (
        <div className="mt-2 text-muted">{t('أُلغي', 'Annulé')}</div>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={run} loading={state === 'busy'}>
            <Check />
            {t('تأكيد', 'Confirmer')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState('cancelled')}>
            <X />
            {t('إلغاء', 'Annuler')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Owner's smart assistant: answers from the shop's real data, proposes changes for confirmation. */
export function AssistantButton() {
  const { me, sb } = useAuth()
  const { t, lang } = useLang()
  const [open, setOpen] = useState(false)
  const [api, setApi] = useState<ApiMsg[]>([])
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [bubbles, busy])
  if (!me?.is_owner) return null

  const ask = async (q: string) => {
    q = q.trim()
    if (!q || busy) return
    setInput('')
    const next: ApiMsg[] = [...api, { role: 'user', content: q }]
    setBubbles((b) => [...b, { role: 'user', text: q }])
    setBusy(true)
    try {
      // keep the conversation short: the last ~30 turns
      const trimmed = next.length > 60 ? next.slice(next.findIndex((m, i) => i >= next.length - 60 && m.role === 'user' && typeof m.content === 'string')) : next
      const r = await callFn<{ messages: ApiMsg[]; text: string; proposals: Proposal[] }>(sb, 'assistant', { messages: trimmed })
      setApi([...trimmed, ...r.messages])
      setBubbles((b) => [...b, { role: 'assistant', text: r.text, proposals: r.proposals }])
    } catch (e) {
      setBubbles((b) => [...b, { role: 'assistant', text: '⚠️ ' + errorMessage(e, lang) }])
    } finally {
      setBusy(false)
    }
  }
  const reset = () => (setApi([]), setBubbles([]))

  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)} title={t('المساعد الذكي', 'Assistant')} className="text-brand">
        <Sparkles />
      </Button>
      <Sheet open={open} onOpenChange={setOpen} width="max-w-xl" title={t('المساعد الذكي', 'Assistant intelligent')} description={t('اسألني عن المبيعات، المخزون، الطلبات، رياض، الديون… أو كيف تستعمل النظام', 'Ventes, stock, demandes, Riyad, crédits… ou comment utiliser le système')}>
        <div className="flex h-[calc(100dvh-9rem)] flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto pb-3">
            {!bubbles.length && (
              <div className="grid gap-2">
                {SUGGESTIONS.map(([ar, fr]) => (
                  <button key={ar} onClick={() => ask(t(ar, fr))} className="rounded-xl border border-border p-3 text-start text-sm hover:border-brand hover:bg-brand-50">
                    {t(ar, fr)}
                  </button>
                ))}
              </div>
            )}
            {bubbles.map((b, i) => (
              <div key={i} className={cn('flex', b.role === 'user' ? 'justify-start' : 'justify-end')}>
                <div className={cn('max-w-[90%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap', b.role === 'user' ? 'bg-brand text-white' : 'bg-surface-2')}>
                  {b.role === 'assistant' ? <Rich text={b.text} onNav={() => setOpen(false)} /> : b.text}
                  {b.proposals?.map((p) => <ProposalCard key={p.id} p={p} />)}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-end">
                <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-4 py-2.5 text-sm text-muted">
                  <Spinner className="size-4" />
                  {t('أبحث في بيانات المحل…', 'Je consulte les données…')}
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <div className="flex items-end gap-2 border-t border-border pt-3">
            {bubbles.length > 0 && (
              <Button variant="ghost" size="icon" onClick={reset} title={t('محادثة جديدة', 'Nouvelle conversation')}>
                <RotateCcw />
              </Button>
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), ask(input))
              }}
              rows={2}
              placeholder={t('اكتب سؤالك… (Enter للإرسال)', 'Votre question… (Entrée)')}
              className="flex-1 resize-none"
            />
            <Button size="icon" onClick={() => ask(input)} disabled={!input.trim() || busy}>
              <Send />
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
