import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, MessageCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { siteTrackUrl } from '@/shared/lib/online'
import type { ServiceField } from '@/shared/lib/types'
import { cn, whatsappLink } from '@/shared/lib/utils'
import { sendWhatsApp } from '@/shared/lib/whatsapp'
import { Button, Checkbox, Field, Input, Textarea } from './primitives'
import { Sheet } from './overlay'
import { MoneyInput } from './pickers'

type Svc = { id: string; name_ar: string; name_fr: string; price: number; fields: ServiceField[]; required_documents: { name_ar: string; name_fr: string; required: boolean }[] }
export type StaffRequestPrefill = { service_id?: string | null; name?: string | null; phone?: string | null; help_id?: string | null; question?: string | null; from_request?: string | null }

/**
 * 3 · "We fill it for you": the employee creates the request while talking to
 * the customer; the customer receives a link to upload documents and follow it.
 */
export function StaffRequestSheet({ open, onClose, prefill }: { open: boolean; onClose: () => void; prefill?: StaffRequestPrefill }) {
  const { sb } = useAuth()
  const { t, pick, lang } = useLang()
  const qc = useQueryClient()
  const services = useQuery({
    queryKey: ['staff-req-services'],
    enabled: open,
    queryFn: async () => (await sb.from('services').select('id, name_ar, name_fr, price, fields, required_documents').eq('kind', 'admin').is('deleted_at', null).eq('is_active', true).order('sort')).data as Svc[],
  })
  const [svc, setSvc] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [f, setF] = useState({ name: '', phone: '', email: '', notes: '' })
  const [vals, setVals] = useState<Record<string, string>>({})
  const [price, setPrice] = useState<number | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ number: string; tracking_code: string; phone: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setSvc(prefill?.service_id ?? null)
    setF({ name: prefill?.name ?? '', phone: prefill?.phone ?? '', email: '', notes: prefill?.question ?? '' })
    setVals({})
    setConsent(false)
    setDone(null)
  }, [open, prefill])

  // "New identical request": copy the answers of the old request
  useEffect(() => {
    if (!open || !prefill?.from_request || !services.data) return
    sb.rpc('request_detail', { p_id: prefill.from_request }).then(({ data }) => {
      const old = data as { fields?: Record<string, string>; email?: string | null } | null
      const svc = services.data!.find((x) => x.id === prefill.service_id)
      if (!old || !svc) return
      setVals(Object.fromEntries(svc.fields.map((fl) => [fl.key, old.fields?.[fl.label_ar] ?? old.fields?.[fl.key] ?? '']).filter(([, v]) => v)))
      if (old.email) setF((x) => ({ ...x, email: old.email ?? '' }))
    })
  }, [open, prefill, services.data, sb])

  const s = services.data?.find((x) => x.id === svc)
  useEffect(() => setPrice(s?.price ?? null), [s])
  const list = useMemo(() => (services.data ?? []).filter((x) => !q || x.name_ar.includes(q) || x.name_fr.toLowerCase().includes(q.toLowerCase())), [services.data, q])

  const create = async () => {
    if (!s) return
    setBusy(true)
    const fields = Object.fromEntries(s.fields.map((fl) => [fl.label_ar, vals[fl.key] ?? '']).filter(([, v]) => v))
    const { data, error } = await sb.rpc('staff_create_request', { p: { service_id: s.id, ...f, fields, price, consent, help_id: prefill?.help_id ?? null } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    setDone(data as { number: string; tracking_code: string; phone: string })
    for (const k of [['requests'], ['pos-requests'], ['help'], ['help-counts']]) qc.invalidateQueries({ queryKey: k })
  }

  const link = done ? `${siteTrackUrl(done.tracking_code)}?p=${encodeURIComponent(done.phone)}` : ''
  const docs = (s?.required_documents ?? []).map((d) => `• ${d.name_ar}`).join('\n')
  const waText = done
    ? `مرحباً ${f.name} 👋\nسجّلنا لكم طلب «${s?.name_ar}» رقم ${done.number}.\n${docs ? `المرجو رفع هذه الوثائق (صور واضحة بالهاتف):\n${docs}\n` : ''}ارفعوها وتابعوا طلبكم من هنا:\n${link}\n— مكتبة سويت هاوس`
    : ''

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="max-w-2xl" title={t('نكمل الطلب عن الزبون', 'Créer la demande pour le client')} description={t('املأ المعلومات وأنت تتحدث معه، ثم أرسل له رابط رفع الوثائق', 'Remplissez avec le client puis envoyez-lui le lien')}>
      {done ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <div className="text-lg font-bold">
            {t('تم إنشاء الطلب', 'Demande créée')} <span className="num">{done.number}</span>
          </div>
          <div className="rounded-xl bg-surface-2 p-3 text-start text-sm whitespace-pre-line">{waText}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="success" onClick={() => sendWhatsApp(sb, done.phone, waText, lang)}>
              <MessageCircle />
              {t('إرسال الرابط على واتساب', 'Envoyer sur WhatsApp')}
            </Button>
            <Button variant="outline" onClick={() => (navigator.clipboard.writeText(waText), toast.success(t('تم النسخ', 'Copié')))}>
              <Copy />
              {t('نسخ', 'Copier')}
            </Button>
          </div>
          <Button variant="ghost" asChild>
            <a href={whatsappLink(done.phone, waText)} target="_blank" rel="noreferrer">
              {t('فتح واتساب يدوياً', 'Ouvrir WhatsApp')}
            </a>
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          {!s ? (
            <div className="space-y-3">
              <Input icon={<Search />} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ابحث عن الخدمة…', 'Rechercher le service…')} autoFocus />
              <div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
                {list.map((x) => (
                  <button key={x.id} onClick={() => setSvc(x.id)} className="rounded-xl border border-border p-3 text-start text-sm hover:border-brand hover:bg-brand-50">
                    {pick(x, 'name')}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl bg-brand-50 p-3">
                <span className="font-semibold">{pick(s, 'name')}</span>
                <button onClick={() => setSvc(null)} className="text-xs text-brand underline">
                  {t('تغيير', 'Changer')}
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('اسم الزبون', 'Nom du client')} required>
                  <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
                </Field>
                <Field label={t('هاتفه (واتساب)', 'Téléphone (WhatsApp)')} required>
                  <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} dir="ltr" inputMode="tel" />
                </Field>
              </div>
              {s.fields.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {s.fields.map((fl) => (
                    <Field key={fl.key} label={pick(fl, 'label')} className={cn(fl.type === 'textarea' && 'sm:col-span-2')}>
                      {fl.type === 'textarea' ? (
                        <Textarea value={vals[fl.key] ?? ''} onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })} />
                      ) : fl.type === 'select' ? (
                        <select value={vals[fl.key] ?? ''} onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })} className="h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-sm">
                          <option value="">—</option>
                          {(fl.options ?? []).map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <Input type={fl.type === 'number' ? 'number' : fl.type === 'date' ? 'date' : 'text'} value={vals[fl.key] ?? ''} onChange={(e) => setVals({ ...vals, [fl.key]: e.target.value })} />
                      )}
                    </Field>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t('السعر', 'Prix')}>
                  <MoneyInput value={price} onChange={setPrice} />
                </Field>
                <Field label={t('ملاحظات', 'Notes')}>
                  <Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
                </Field>
              </div>
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={consent} onCheckedChange={setConsent} />
                {t('وافق الزبون على أن نعالج معطياته ووثائقه لإنجاز هذا الطلب', 'Le client accepte le traitement de ses données pour cette demande')}
              </label>
              <Button size="lg" className="w-full" onClick={create} loading={busy} disabled={!consent || f.name.trim().length < 2 || f.phone.replace(/\D/g, '').length < 9}>
                {t('إنشاء الطلب', 'Créer la demande')}
              </Button>
            </>
          )}
        </div>
      )}
    </Sheet>
  )
}
