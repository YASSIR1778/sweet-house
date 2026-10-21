import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Banknote, Building2, Database, FileText, Hash, MonitorPlay, Printer, Receipt as ReceiptIcon, Save, Scale, Settings as SettingsIcon, Sparkles, Store } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { useAllSettings } from '@/shared/lib/settings'
import type { LegalSettings, ReceiptSettings, Sale, StoreSettings } from '@/shared/lib/types'
import { cn } from '@/shared/lib/utils'
import { Button, Card, CardHeader, Field, Input, Skeleton, SwitchRow, Textarea } from '@/shared/ui/primitives'
import { PageHeader } from '@/shared/ui/data'
import { MoneyInput } from '@/shared/ui/pickers'
import { ImageInput } from '@/shared/ui/media'
import { PrintTestTicket, Receipt } from '@/shared/ui/receipt'
import { DataSection } from './DataSection'
import { AiSection } from './AiSection'

type Cash = { opening_float: number; blind_count: boolean; diff_alert: number; auto_lock_minutes: number }
type Pos = { allow_negative_stock: boolean; sound: boolean; auto_print: boolean; quick_cash: number[] }
type Seq = { key: string; prefix: string; next_value: number; padding: number; yearly_reset: boolean }

const SECTIONS = [
  { id: 'store', ar: 'المكتبة', fr: 'Librairie', icon: Store },
  { id: 'legal', ar: 'المعلومات القانونية', fr: 'Mentions légales', icon: Scale },
  { id: 'cash', ar: 'الصندوق ونقطة البيع', fr: 'Caisse & POS', icon: Banknote },
  { id: 'receipt', ar: 'الوصل', fr: 'Ticket', icon: ReceiptIcon },
  { id: 'invoice', ar: 'الفواتير', fr: 'Factures', icon: FileText },
  { id: 'numbers', ar: 'الترقيم', fr: 'Numérotation', icon: Hash },
  { id: 'ai', ar: 'الذكاء الاصطناعي', fr: 'IA', icon: Sparkles },
  { id: 'data', ar: 'البيانات والنسخ', fr: 'Données & sauvegarde', icon: Database },
] as const

const DAYS = [
  ['الإثنين', 'Lundi', 1],
  ['الثلاثاء', 'Mardi', 2],
  ['الأربعاء', 'Mercredi', 3],
  ['الخميس', 'Jeudi', 4],
  ['الجمعة', 'Vendredi', 5],
  ['السبت', 'Samedi', 6],
  ['الأحد', 'Dimanche', 0],
] as const

const sampleSale: Sale = {
  id: '00000000-demo',
  number: 'T000123',
  status: 'completed',
  customer_id: null,
  employee_id: '',
  employee_name: 'أحمد',
  customer: null,
  subtotal: 4550,
  discount_total: 0,
  total: 4550,
  tax_total: 758,
  cash_received: 5000,
  change_given: 450,
  paid_cash: 4550,
  paid_card: 0,
  paid_credit: 0,
  note: null,
  void_reason: null,
  voided_at: null,
  created_at: new Date().toISOString(),
  items: [
    { line_no: 1, item_type: 'product', name_ar: 'دفتر 96 صفحة', name_fr: 'Cahier 96 pages', qty: 3, unit_price: 850, original_unit_price: 850, discount: 0, total: 2550, tax_rate: 20 },
    { line_no: 2, item_type: 'service', name_ar: 'نسخ A4 أبيض وأسود', name_fr: 'Copie A4 N&B', qty: 20, unit_price: 100, original_unit_price: 100, discount: 0, total: 2000, tax_rate: 20 },
  ],
}

export function SettingsPage() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const all = useAllSettings(sb)
  const [section, setSection] = useState<(typeof SECTIONS)[number]['id']>('store')
  const [store, setStore] = useState<Partial<StoreSettings>>({})
  const [legal, setLegal] = useState<Partial<LegalSettings>>({})
  const [cash, setCash] = useState<Partial<Cash>>({})
  const [pos, setPos] = useState<Partial<Pos>>({})
  const [receipt, setReceipt] = useState<Partial<ReceiptSettings>>({})
  const [testPrint, setTestPrint] = useState(false)
  const [invoice, setInvoice] = useState<{ notes_fr?: string; bank_name?: string; rib?: string; payment_terms_fr?: string }>({})
  const [seqs, setSeqs] = useState<Seq[]>([])
  const [busy, setBusy] = useState(false)

  const sequences = useQuery({
    queryKey: ['sequences'],
    queryFn: async () => (await sb.from('document_sequences').select('*').order('key')).data as Seq[],
  })

  useEffect(() => {
    if (!all.data) return
    setStore(all.data.store as Partial<StoreSettings>)
    setLegal(all.data.legal as Partial<LegalSettings>)
    setCash(all.data.cash as Partial<Cash>)
    setPos(all.data.pos as Partial<Pos>)
    setReceipt(all.data.receipt as Partial<ReceiptSettings>)
    setInvoice((all.data.invoice ?? {}) as typeof invoice)
  }, [all.data])
  useEffect(() => {
    if (sequences.data) setSeqs(sequences.data)
  }, [sequences.data])

  const save = async () => {
    setBusy(true)
    try {
      const updates: [string, unknown][] =
        section === 'store' ? [['store', store]] : section === 'legal' ? [['legal', legal]] : section === 'cash' ? [['cash', cash], ['pos', pos]] : section === 'receipt' ? [['receipt', receipt]] : section === 'invoice' ? [['invoice', invoice]] : []
      for (const [key, value] of updates) {
        const { error } = await sb.from('settings').update({ value }).eq('key', key)
        if (error) throw error
      }
      if (section === 'numbers') {
        for (const s of seqs) {
          const { error } = await sb.from('document_sequences').update({ prefix: s.prefix, next_value: s.next_value, padding: s.padding }).eq('key', s.key)
          if (error) throw error
        }
      }
      toast.success(t('تم حفظ الإعدادات', 'Paramètres enregistrés'))
      qc.invalidateQueries({ queryKey: ['settings'] })
      qc.invalidateQueries({ queryKey: ['receipt-config'] })
      qc.invalidateQueries({ queryKey: ['sequences'] })
    } catch (e) {
      toast.error(errorMessage(e, lang))
    } finally {
      setBusy(false)
    }
  }

  const seqLabel: Record<string, [string, string]> = {
    receipt: ['الوصولات', 'Tickets'],
    invoice: ['الفواتير', 'Factures'],
    credit_note: ['الفواتير المضادة', 'Avoirs'],
    order: ['طلبات المتجر', 'Commandes'],
    request: ['طلبات الخدمات', 'Demandes'],
    purchase: ['المشتريات', 'Achats'],
  }

  return (
    <>
      <PageHeader
        icon={<SettingsIcon />}
        title={t('الإعدادات', 'Paramètres')}
        description={t('كل ما يخص المكتبة والصندوق والوصل', 'Tout sur la librairie, la caisse et le ticket')}
        actions={
          section !== 'data' && <Button onClick={save} loading={busy}>
            <Save />
            {t('حفظ', 'Enregistrer')}
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={cn('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors', section === s.id ? 'bg-surface text-brand shadow-card' : 'text-muted hover:bg-surface hover:text-text')}
            >
              <s.icon className="size-4" />
              {t(s.ar, s.fr)}
            </button>
          ))}
        </nav>

        {all.isLoading ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="space-y-5">
            {section === 'store' && (
              <>
                <Card>
                  <CardHeader title={t('هوية المكتبة', 'Identité')} icon={<Building2 />} />
                  <div className="grid gap-4 p-5 sm:grid-cols-[140px_1fr]">
                    <Field label={t('الشعار', 'Logo')}>
                      <ImageInput sb={sb} value={store.logo_url ?? null} folder="brand" onChange={(logo_url) => setStore({ ...store, logo_url })} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label={t('الاسم بالعربية', 'Nom (ar)')}>
                        <Input value={store.name_ar ?? ''} onChange={(e) => setStore({ ...store, name_ar: e.target.value })} />
                      </Field>
                      <Field label={t('الاسم بالفرنسية', 'Nom (fr)')}>
                        <Input value={store.name_fr ?? ''} onChange={(e) => setStore({ ...store, name_fr: e.target.value })} dir="ltr" />
                      </Field>
                      <Field label={t('الشعار النصي (ع)', 'Slogan (ar)')}>
                        <Input value={store.tagline_ar ?? ''} onChange={(e) => setStore({ ...store, tagline_ar: e.target.value })} />
                      </Field>
                      <Field label={t('الشعار النصي (ف)', 'Slogan (fr)')}>
                        <Input value={store.tagline_fr ?? ''} onChange={(e) => setStore({ ...store, tagline_fr: e.target.value })} dir="ltr" />
                      </Field>
                    </div>
                  </div>
                </Card>
                <Card>
                  <CardHeader title={t('التواصل والعنوان', 'Contact & adresse')} icon={<Store />} />
                  <div className="grid gap-4 p-5 sm:grid-cols-2">
                    <Field label={t('الهاتف', 'Téléphone')}>
                      <Input value={store.phone ?? ''} onChange={(e) => setStore({ ...store, phone: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label={t('واتساب', 'WhatsApp')} hint={t('بالصيغة الدولية: 2126XXXXXXXX', 'Format international : 2126XXXXXXXX')}>
                      <Input value={store.whatsapp ?? ''} onChange={(e) => setStore({ ...store, whatsapp: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label={t('البريد الإلكتروني', 'E-mail')}>
                      <Input value={store.email ?? ''} onChange={(e) => setStore({ ...store, email: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label={t('رابط Google Maps', 'Lien Google Maps')}>
                      <Input value={store.maps_url ?? ''} onChange={(e) => setStore({ ...store, maps_url: e.target.value })} dir="ltr" />
                    </Field>
                    <Field label={t('العنوان (ع)', 'Adresse (ar)')}>
                      <Textarea value={store.address_ar ?? ''} onChange={(e) => setStore({ ...store, address_ar: e.target.value })} />
                    </Field>
                    <Field label={t('العنوان (ف)', 'Adresse (fr)')}>
                      <Textarea value={store.address_fr ?? ''} onChange={(e) => setStore({ ...store, address_fr: e.target.value })} dir="ltr" />
                    </Field>
                  </div>
                </Card>
                <Card>
                  <CardHeader title={t('أوقات العمل', "Horaires d'ouverture")} />
                  <div className="divide-y divide-border">
                    {DAYS.map(([ar, fr, d]) => {
                      const h = store.hours?.find((x) => x.day === d) ?? { day: d, open: null, close: null }
                      const setH = (patch: Partial<typeof h>) => setStore({ ...store, hours: [...(store.hours ?? []).filter((x) => x.day !== d), { ...h, ...patch }] })
                      const closed = !h.open
                      return (
                        <div key={d} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <span className="w-24 text-sm font-medium">{t(ar, fr)}</span>
                          <Button size="sm" variant={closed ? 'danger-soft' : 'soft'} onClick={() => setH(closed ? { open: '09:00', close: '21:00' } : { open: null, close: null })}>
                            {closed ? t('مغلق', 'Fermé') : t('مفتوح', 'Ouvert')}
                          </Button>
                          {!closed && (
                            <div className="flex items-center gap-2" dir="ltr">
                              <Input type="time" value={h.open ?? ''} onChange={(e) => setH({ open: e.target.value })} className="num w-32" />
                              <span className="text-muted">→</span>
                              <Input type="time" value={h.close ?? ''} onChange={(e) => setH({ close: e.target.value })} className="num w-32" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </Card>
              </>
            )}

            {section === 'legal' && (
              <Card>
                <CardHeader title={t('المعلومات القانونية', 'Mentions légales')} description={t('تظهر في الوصولات والفواتير', 'Affichées sur tickets et factures')} icon={<Scale />} />
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label={t('الاسم القانوني للمقاولة', 'Raison sociale')} className="sm:col-span-2">
                    <Input value={legal.company_name ?? ''} onChange={(e) => setLegal({ ...legal, company_name: e.target.value })} />
                  </Field>
                  <Field label={t('رقم تصريح/إذن CNDP', 'N° de déclaration CNDP')} hint={t('يظهر في صفحة سياسة الخصوصية', 'Affiché dans la politique de confidentialité')}>
                    <Input value={legal.cndp ?? ''} onChange={(e) => setLegal({ ...legal, cndp: e.target.value })} dir="ltr" className="num" />
                  </Field>
                  {(['ice', 'if', 'rc', 'patente', 'cnss'] as const).map((k) => (
                    <Field key={k} label={k === 'patente' ? t('الضريبة المهنية (Patente)', 'Patente (TP)') : k.toUpperCase()}>
                      <Input value={(legal[k] as string) ?? ''} onChange={(e) => setLegal({ ...legal, [k]: e.target.value })} dir="ltr" className="num" />
                    </Field>
                  ))}
                  <Field label={t('نسبة الضريبة الافتراضية للمنتجات الجديدة', 'TVA par défaut')}>
                    <div className="flex gap-2">
                      {(legal.tax_rates ?? [0, 7, 10, 14, 20]).map((r) => (
                        <button key={r} onClick={() => setLegal({ ...legal, default_tax_rate: r })} className={cn('num rounded-lg border px-3 py-1.5 text-sm', legal.default_tax_rate === r ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                          {r}%
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </Card>
            )}

            {section === 'cash' && (
              <>
                <Card>
                  <CardHeader title={t('الصندوق', 'Caisse')} icon={<Banknote />} />
                  <div className="space-y-4 p-5">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label={t('مبلغ الدرج الثابت في بداية كل وردية', 'Fond fixe du tiroir')} hint={t('الباقي يذهب للخزنة عند الإغلاق', 'Le reste va au coffre')}>
                        <MoneyInput value={cash.opening_float} onChange={(v) => setCash({ ...cash, opening_float: v ?? 0 })} />
                      </Field>
                      <Field label={t('تنبيه عند فرق يتجاوز', 'Alerte si écart >')}>
                        <MoneyInput value={cash.diff_alert} onChange={(v) => setCash({ ...cash, diff_alert: v ?? 0 })} />
                      </Field>
                      <Field label={t('القفل التلقائي بعد (دقائق)', 'Verrouillage auto (min)')}>
                        <Input type="number" min={0} value={cash.auto_lock_minutes ?? 5} onChange={(e) => setCash({ ...cash, auto_lock_minutes: Number(e.target.value) })} className="num" />
                      </Field>
                    </div>
                    <SwitchRow label={t('العدّ الأعمى عند الإغلاق', 'Comptage à l’aveugle')} description={t('الموظف يكتب المبلغ المعدود قبل أن يرى المبلغ المتوقع', "L'employé saisit le montant compté avant de voir l'attendu")} checked={cash.blind_count ?? false} onCheckedChange={(blind_count) => setCash({ ...cash, blind_count })} />
                  </div>
                </Card>
                <Card>
                  <CardHeader title={t('نقطة البيع', 'Point de vente')} icon={<MonitorPlay />} />
                  <div className="space-y-3 p-5">
                    <SwitchRow label={t('طباعة الوصل تلقائياً بعد كل بيع', 'Impression auto du ticket')} checked={pos.auto_print ?? true} onCheckedChange={(auto_print) => setPos({ ...pos, auto_print })} />
                    <SwitchRow label={t('السماح بالبيع عند نفاد المخزون', 'Autoriser la vente sans stock')} checked={pos.allow_negative_stock ?? true} onCheckedChange={(allow_negative_stock) => setPos({ ...pos, allow_negative_stock })} />
                    <SwitchRow label={t('الأصوات', 'Sons')} checked={pos.sound ?? true} onCheckedChange={(sound) => setPos({ ...pos, sound })} />
                    <Field label={t('أزرار المبالغ السريعة', 'Montants rapides')} hint={t('تظهر في شاشة الأداء (بالدرهم، مفصولة بفاصلة)', 'Affichés au paiement (DH, séparés par virgule)')}>
                      <Input
                        defaultValue={(pos.quick_cash ?? []).map((c) => c / 100).join(', ')}
                        key={(pos.quick_cash ?? []).join()}
                        onBlur={(e) => setPos({ ...pos, quick_cash: e.target.value.split(/[,،]/).map((x) => Math.round(Number(x.trim()) * 100)).filter((x) => x > 0) })}
                        dir="ltr"
                        className="num"
                      />
                    </Field>
                  </div>
                </Card>
              </>
            )}

            {section === 'receipt' && (
              <div className="grid gap-5 xl:grid-cols-[1fr_auto]">
                <Card>
                  <CardHeader title={t('شكل الوصل', 'Mise en page du ticket')} icon={<ReceiptIcon />} />
                  <div className="space-y-3 p-5">
                    <div className="space-y-3 rounded-xl border border-border p-4">
                      <div className="text-sm font-semibold">{t('مقاس الطابعة', 'Format de l’imprimante')}</div>
                      <div className="flex gap-2">
                        {[80, 58].map((p) => (
                          <button key={p} onClick={() => setReceipt({ ...receipt, paper_mm: p, print_width_mm: p === 58 ? 48 : 72, offset_mm: 0 })} className={cn('num rounded-lg border px-3 py-1.5 text-sm', (receipt.paper_mm ?? 80) === p ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                            {p}mm
                          </button>
                        ))}
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <Field label={t('عرض الطباعة (مم)', 'Largeur (mm)')}>
                          <Input type="number" min={30} max={80} value={receipt.print_width_mm ?? ((receipt.paper_mm ?? 80) === 58 ? 48 : 72)} onChange={(e) => setReceipt({ ...receipt, print_width_mm: Number(e.target.value) })} className="num" />
                        </Field>
                        <Field label={t('إزاحة لليمين (مم)', 'Décalage (mm)')}>
                          <Input type="number" min={0} max={20} value={receipt.offset_mm ?? 0} onChange={(e) => setReceipt({ ...receipt, offset_mm: Number(e.target.value) })} className="num" />
                        </Field>
                        <Field label={t('حجم الخط', 'Taille du texte')}>
                          <Input type="number" min={9} max={16} value={receipt.font_size ?? 12} onChange={(e) => setReceipt({ ...receipt, font_size: Number(e.target.value) })} className="num" />
                        </Field>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setTestPrint(true)}>
                        <Printer />
                        {t('طباعة وصل تجريبي للمعايرة', 'Ticket de test')}
                      </Button>
                      <p className="text-xs text-muted">{t('إن قُطع جزء من اليسار: قلّل «عرض الطباعة» (مثلاً 70 ثم 68) أو زد «الإزاحة». احفظ ثم أعد التجربة. في نافذة الطباعة: المقياس 100% والهوامش «بلا».', 'Bord gauche coupé : réduisez la largeur ou augmentez le décalage, enregistrez puis refaites le test.')}</p>
                    </div>
                    <Field label={t('اللغة', 'Langue')}>
                      <div className="flex gap-2">
                        {(
                          [
                            ['both', 'العربية والفرنسية', 'Arabe + français'],
                            ['ar', 'العربية', 'Arabe'],
                            ['fr', 'الفرنسية', 'Français'],
                          ] as const
                        ).map(([v, a, f]) => (
                          <button key={v} onClick={() => setReceipt({ ...receipt, languages: v })} className={cn('rounded-lg border px-3 py-1.5 text-sm', (receipt.languages ?? 'both') === v ? 'border-brand bg-brand-50 text-brand' : 'border-border')}>
                            {t(a, f)}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <SwitchRow label={t('إظهار الشعار', 'Afficher le logo')} checked={receipt.show_logo ?? true} onCheckedChange={(show_logo) => setReceipt({ ...receipt, show_logo })} />
                    <SwitchRow label={t('إظهار المعلومات القانونية', 'Mentions légales')} checked={receipt.show_legal ?? true} onCheckedChange={(show_legal) => setReceipt({ ...receipt, show_legal })} />
                    <SwitchRow label={t('إظهار اسم البائع', 'Nom du vendeur')} checked={receipt.show_employee ?? true} onCheckedChange={(show_employee) => setReceipt({ ...receipt, show_employee })} />
                    <SwitchRow label={t('رمز QR في أسفل الوصل', 'QR code en bas du ticket')} description={t('مثلاً رابط تقييم المكتبة في Google Maps أو صفحة الموقع', 'Ex : lien d’avis Google Maps ou site')} checked={receipt.show_qr ?? false} onCheckedChange={(show_qr) => setReceipt({ ...receipt, show_qr })} />
                    {receipt.show_qr && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label={t('الرابط', 'Lien')} className="sm:col-span-2" hint={t('من Google Maps: صفحة المكتبة ← "طلب تقييمات" ← انسخ الرابط', 'Google Maps → Demander des avis → copier le lien')}>
                          <Input value={receipt.qr_url ?? ''} onChange={(e) => setReceipt({ ...receipt, qr_url: e.target.value })} dir="ltr" placeholder="https://g.page/r/..." />
                        </Field>
                        <Field label={t('النص تحت الرمز (ع)', 'Texte (ar)')}>
                          <Input value={receipt.qr_label_ar ?? ''} onChange={(e) => setReceipt({ ...receipt, qr_label_ar: e.target.value })} placeholder="قيّمنا على Google ⭐" />
                        </Field>
                        <Field label={t('النص تحت الرمز (ف)', 'Texte (fr)')}>
                          <Input value={receipt.qr_label_fr ?? ''} onChange={(e) => setReceipt({ ...receipt, qr_label_fr: e.target.value })} dir="ltr" placeholder="Notez-nous sur Google ⭐" />
                        </Field>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={t('نص أعلى الوصل (ع)', 'En-tête (ar)')}>
                        <Input value={receipt.header_ar ?? ''} onChange={(e) => setReceipt({ ...receipt, header_ar: e.target.value })} />
                      </Field>
                      <Field label={t('نص أعلى الوصل (ف)', 'En-tête (fr)')}>
                        <Input value={receipt.header_fr ?? ''} onChange={(e) => setReceipt({ ...receipt, header_fr: e.target.value })} dir="ltr" />
                      </Field>
                      <Field label={t('رسالة الختام (ع)', 'Pied de page (ar)')}>
                        <Input value={receipt.footer_ar ?? ''} onChange={(e) => setReceipt({ ...receipt, footer_ar: e.target.value })} />
                      </Field>
                      <Field label={t('رسالة الختام (ف)', 'Pied de page (fr)')}>
                        <Input value={receipt.footer_fr ?? ''} onChange={(e) => setReceipt({ ...receipt, footer_fr: e.target.value })} dir="ltr" />
                      </Field>
                    </div>
                  </div>
                </Card>
                <div>
                  <div className="mb-2 text-center text-xs font-medium text-muted">{t('معاينة حية', 'Aperçu en direct')}</div>
                  <div className="rounded-xl bg-white p-4 shadow-pop ring-1 ring-border">
                    <Receipt sale={sampleSale} cfg={{ store, legal, receipt }} />
                    {testPrint && <PrintTestTicket geo={receipt} onDone={() => setTestPrint(false)} />}
                  </div>
                </div>
              </div>
            )}

            {section === 'invoice' && (
              <Card>
                <CardHeader title={t('الفواتير الرسمية', 'Factures')} description={t('تظهر في أسفل كل فاتورة A4. المعلومات القانونية من قسم "المعلومات القانونية".', 'Affiché en bas de chaque facture')} icon={<FileText />} />
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <Field label={t('شروط الأداء', 'Conditions de paiement')}>
                    <Input value={invoice.payment_terms_fr ?? ''} onChange={(e) => setInvoice({ ...invoice, payment_terms_fr: e.target.value })} dir="ltr" />
                  </Field>
                  <Field label={t('اسم البنك', 'Banque')}>
                    <Input value={invoice.bank_name ?? ''} onChange={(e) => setInvoice({ ...invoice, bank_name: e.target.value })} dir="ltr" />
                  </Field>
                  <Field label="RIB" className="sm:col-span-2">
                    <Input value={invoice.rib ?? ''} onChange={(e) => setInvoice({ ...invoice, rib: e.target.value })} dir="ltr" className="num" />
                  </Field>
                  <Field label={t('ملاحظة أسفل الفاتورة', 'Mention en bas de facture')} className="sm:col-span-2">
                    <Textarea value={invoice.notes_fr ?? ''} onChange={(e) => setInvoice({ ...invoice, notes_fr: e.target.value })} dir="ltr" />
                  </Field>
                </div>
              </Card>
            )}

            {section === 'data' && <DataSection />}
            {section === 'ai' && <AiSection />}

            {section === 'numbers' && (
              <Card>
                <CardHeader title={t('ترقيم الوثائق', 'Numérotation des documents')} description={t('{YYYY} تُستبدل بالسنة الحالية', '{YYYY} est remplacé par l’année')} icon={<Hash />} />
                <div className="divide-y divide-border">
                  {seqs.map((s, i) => {
                    const preview = s.prefix.replace('{YYYY}', String(new Date().getFullYear())) + String(s.next_value).padStart(s.padding, '0')
                    const set = (patch: Partial<Seq>) => setSeqs(seqs.map((x, j) => (j === i ? { ...x, ...patch } : x)))
                    return (
                      <div key={s.key} className="grid items-end gap-3 px-5 py-4 sm:grid-cols-[1fr_1fr_8rem_6rem_1fr]">
                        <div className="text-sm font-medium">{t(...(seqLabel[s.key] ?? [s.key, s.key]))}</div>
                        <Field label={t('البادئة', 'Préfixe')}>
                          <Input value={s.prefix} onChange={(e) => set({ prefix: e.target.value })} dir="ltr" className="num" />
                        </Field>
                        <Field label={t('الرقم التالي', 'Prochain n°')}>
                          <Input type="number" min={1} value={s.next_value} onChange={(e) => set({ next_value: Number(e.target.value) })} className="num" />
                        </Field>
                        <Field label={t('الخانات', 'Chiffres')}>
                          <Input type="number" min={1} max={10} value={s.padding} onChange={(e) => set({ padding: Number(e.target.value) })} className="num" />
                        </Field>
                        <div className="num rounded-lg bg-surface-2 px-3 py-2.5 text-center text-sm font-semibold" dir="ltr">
                          {preview}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  )
}
