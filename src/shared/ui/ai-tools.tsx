import { useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Camera, Copy, IdCard as IdIcon, PenLine, Printer, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { aiWrite, readIdCard, type IdCard } from '@/shared/lib/ai'
import { cn } from '@/shared/lib/utils'
import { Button, Card, Field, Input, Spinner, Textarea } from './primitives'
import { Sheet } from './overlay'
import { PrintArea } from './receipt'

// ---------------------------------------------------------------------
// 17 · National ID card reader
// ---------------------------------------------------------------------
const ID_ROWS: [keyof IdCard, string, string][] = [
  ['cin', 'رقم البطاقة', 'N° CIN'],
  ['last_name_fr', 'النسب (فرنسية)', 'Nom'],
  ['first_name_fr', 'الاسم (فرنسية)', 'Prénom'],
  ['last_name_ar', 'النسب (عربية)', 'Nom (ar)'],
  ['first_name_ar', 'الاسم (عربية)', 'Prénom (ar)'],
  ['birth_date', 'تاريخ الازدياد', 'Date de naissance'],
  ['birth_place_fr', 'مكان الازدياد', 'Lieu de naissance'],
  ['birth_place_ar', 'مكان الازدياد (عربية)', 'Lieu (ar)'],
  ['sex', 'الجنس', 'Sexe'],
  ['expiry_date', 'صالحة إلى', 'Valable jusqu’au'],
  ['father_name', 'اسم الأب', 'Père'],
  ['mother_name', 'اسم الأم', 'Mère'],
  ['address', 'العنوان', 'Adresse'],
  ['civil_number', 'رقم الحالة المدنية', 'N° état civil'],
]

const fmtDate = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v)

/** Shows the fields read from an ID photo, each with a copy button. */
export function IdCardResult({ data, onClose }: { data: IdCard; onClose?: () => void }) {
  const { t } = useLang()
  const rows = ID_ROWS.filter(([k]) => data[k])
  const copy = (v: string) => (navigator.clipboard.writeText(v), toast.success(t('تم النسخ', 'Copié')))
  if (!data.readable) return <div className="rounded-xl bg-warning/10 p-3 text-sm text-warning">{t('لم نتعرف على بطاقة تعريف في الصورة. صوّرها بوضوح وبدون انعكاس ضوء.', 'Carte non reconnue. Reprenez une photo nette.')}</div>
  const all = rows.map(([k, ar]) => `${ar}: ${k.includes('date') ? fmtDate(String(data[k])) : data[k]}`).join('\n')
  return (
    <Card className="overflow-hidden border-brand/30">
      <div className="flex items-center gap-2 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand">
        <IdIcon className="size-4" />
        {t('معلومات البطاقة', 'Données de la carte')} {data.side === 'back' ? t('(الظهر)', '(verso)') : data.side === 'front' ? t('(الوجه)', '(recto)') : ''}
        <button onClick={() => copy(all)} className="ms-auto flex items-center gap-1 text-xs hover:underline">
          <Copy className="size-3.5" />
          {t('نسخ الكل', 'Tout copier')}
        </button>
        {onClose && (
          <button onClick={onClose} className="text-xs text-muted hover:underline">
            {t('إخفاء', 'Masquer')}
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {rows.map(([k, ar, fr]) => {
          const v = k.includes('date') ? fmtDate(String(data[k])) : String(data[k])
          return (
            <div key={k} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-32 shrink-0 text-muted">{t(ar, fr)}</span>
              <span className="num flex-1 font-medium" dir="auto">{v}</span>
              <button onClick={() => copy(v)} className="text-subtle hover:text-brand">
                <Copy className="size-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      <p className="px-4 py-2 text-[11px] text-subtle">{t('قراءة آلية: راجع الأرقام مع البطاقة قبل استعمالها.', 'Lecture automatique : vérifiez avec la carte.')}</p>
    </Card>
  )
}

/** Button: take / choose a photo of an ID card and read it. */
export function IdCardScanButton({ sb, className, label }: { sb: SupabaseClient; className?: string; label?: string }) {
  const { t, lang } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<IdCard | null>(null)
  const run = async (f?: File | null) => {
    if (!f) return
    setBusy(true)
    try {
      setRes(await readIdCard(sb, f))
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={cn('space-y-3', className)}>
      <Button variant="outline" size="sm" onClick={() => ref.current?.click()} loading={busy}>
        <Camera />
        {label ?? t('تصوير بطاقة التعريف ✨', 'Scanner une CIN ✨')}
      </Button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (run(e.target.files?.[0]), (e.target.value = ''))} />
      {res && <IdCardResult data={res} onClose={() => setRes(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------
// 18 · Writing assistant (public writer service)
// ---------------------------------------------------------------------
const KINDS: [string, string, string][] = [
  ['request', 'طلب خطي', 'Demande'],
  ['complaint', 'شكاية', 'Plainte'],
  ['letter', 'رسالة إدارية', 'Lettre'],
  ['honor', 'تصريح بالشرف', 'Attestation sur l’honneur'],
  ['leave', 'طلب رخصة', 'Demande de congé'],
  ['resignation', 'استقالة', 'Démission'],
  ['job', 'طلب عمل', 'Candidature'],
  ['other', 'أخرى', 'Autre'],
]

export function WritingAssistant({ sb, open, onClose, sender = '' }: { sb: SupabaseClient; open: boolean; onClose: () => void; sender?: string }) {
  const { t, lang } = useLang()
  const [f, setF] = useState({ kind: 'request', lang: 'ar', sender, recipient: '', subject: '', city: 'تطوان', details: '' })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [print, setPrint] = useState(false)

  const gen = async () => {
    if (f.details.trim().length < 5 && !f.subject.trim()) return toast.error(t('اكتب الموضوع أو بضع كلمات عن الطلب', 'Indiquez l’objet ou quelques mots'))
    setBusy(true)
    try {
      setText((await aiWrite(sb, f)).text)
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} width="max-w-3xl" title={t('المساعد الكتابي ✨', 'Assistant de rédaction ✨')} description={t('اكتب بضع كلمات، ويكتب لك الطلب أو الشكاية بالصيغة الإدارية', 'Quelques mots suffisent pour une lettre administrative')}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([k, ar, fr]) => (
            <button key={k} onClick={() => setF({ ...f, kind: k })} className={cn('rounded-full border px-3 py-1.5 text-sm', f.kind === k ? 'border-brand bg-brand text-white' : 'border-border text-muted hover:bg-surface-2')}>
              {t(ar, fr)}
            </button>
          ))}
          <div className="ms-auto flex overflow-hidden rounded-lg border border-border text-sm">
            {(['ar', 'fr'] as const).map((l) => (
              <button key={l} onClick={() => setF({ ...f, lang: l })} className={cn('px-3 py-1.5', f.lang === l ? 'bg-navy text-white' : 'text-muted')}>
                {l === 'ar' ? 'العربية' : 'Français'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('المرسِل (الاسم، البطاقة، العنوان، الهاتف)', 'Expéditeur')}>
            <Textarea rows={2} value={f.sender} onChange={(e) => setF({ ...f, sender: e.target.value })} />
          </Field>
          <Field label={t('المرسَل إليه', 'Destinataire')}>
            <Textarea rows={2} value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} placeholder={t('السيد رئيس جماعة تطوان', 'Monsieur le Président de la commune')} />
          </Field>
          <Field label={t('الموضوع', 'Objet')}>
            <Input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
          </Field>
          <Field label={t('المدينة', 'Ville')}>
            <Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
          </Field>
        </div>
        <Field label={t('ماذا يريد الزبون؟ (بكلماته)', 'Ce que veut le client')}>
          <Textarea rows={3} value={f.details} onChange={(e) => setF({ ...f, details: e.target.value })} placeholder={t('مثلاً: انقطاع الماء في الحي منذ أسبوع، يطلب التدخل…', 'ex. coupure d’eau depuis une semaine…')} />
        </Field>
        <Button className="w-full" size="lg" onClick={gen} loading={busy}>
          {text ? <RefreshCw /> : <Sparkles />}
          {text ? t('إعادة الكتابة', 'Réécrire') : t('اكتب الوثيقة', 'Rédiger')}
        </Button>
        {busy && !text && (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        )}
        {text && (
          <>
            <Textarea rows={18} value={text} onChange={(e) => setText(e.target.value)} dir={f.lang === 'fr' ? 'ltr' : 'rtl'} className="font-[inherit] leading-relaxed" />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => (navigator.clipboard.writeText(text), toast.success(t('تم النسخ', 'Copié')))}>
                <Copy />
                {t('نسخ', 'Copier')}
              </Button>
              <Button onClick={() => setPrint(true)}>
                <Printer />
                {t('طباعة A4', 'Imprimer A4')}
              </Button>
            </div>
            <p className="text-xs text-muted">{t('راجع النص وعدّله قبل الطباعة. النقاط (.....) أماكن يملؤها الزبون.', 'Relisez avant d’imprimer. Les pointillés sont à compléter.')}</p>
          </>
        )}
      </div>
      {print && (
        <PrintArea page="A4" margin="22mm 20mm" onDone={() => setPrint(false)}>
          <div style={{ width: '170mm', fontFamily: f.lang === 'fr' ? "'Inter', sans-serif" : "'IBM Plex Sans Arabic', sans-serif", fontSize: 14, lineHeight: 1.9, whiteSpace: 'pre-wrap', direction: f.lang === 'fr' ? 'ltr' : 'rtl', color: '#000' }}>{text}</div>
        </PrintArea>
      )}
    </Sheet>
  )
}

export function WritingButton({ sb, sender, size = 'sm' }: { sb: SupabaseClient; sender?: string; size?: 'sm' | 'icon' }) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={size === 'icon' ? 'ghost' : 'outline'} size={size} onClick={() => setOpen(true)} title={t('المساعد الكتابي', 'Assistant de rédaction')}>
        <PenLine />
        {size !== 'icon' && t('كتابة طلب / شكاية ✨', 'Rédiger une lettre ✨')}
      </Button>
      {open && <WritingAssistant sb={sb} open={open} onClose={() => setOpen(false)} sender={sender} />}
    </>
  )
}
