import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Landmark, Save } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/shared/lib/auth'
import { useLang } from '@/shared/lib/i18n'
import { errorMessage } from '@/shared/lib/errors'
import { Button, Card, CardHeader, Field, Input } from '@/shared/ui/primitives'

type Bank = { bank_name: string; account_holder: string; rib: string; bank_transfer: boolean; in_store: boolean; cod: boolean }

/** One place for the bank account: used on the website (transfers, abroad) and on invoices. */
export function BankSection() {
  const { sb } = useAuth()
  const { t, lang } = useLang()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['bank-account'], queryFn: async () => (await sb.from('settings').select('value').eq('key', 'online_payments').single()).data?.value as Bank })
  const [b, setB] = useState<Bank | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (q.data) setB({ ...q.data, bank_name: q.data.bank_name ?? '', account_holder: q.data.account_holder ?? '', rib: q.data.rib ?? '' })
  }, [q.data])
  if (!b) return null

  const digits = b.rib.replace(/\D/g, '')
  const ribOk = digits.length === 24
  const save = async () => {
    if (b.bank_transfer && !ribOk) return toast.error(t('الـ RIB المغربي يتكوّن من 24 رقماً', 'Le RIB marocain contient 24 chiffres'))
    setBusy(true)
    const { error } = await sb.rpc('save_bank_account', { p: { bank_name: b.bank_name, account_holder: b.account_holder, rib: digits.replace(/(\d{3})(\d{3})(\d{16})(\d{2})/, '$1 $2 $3 $4') } })
    setBusy(false)
    if (error) return toast.error(errorMessage(error, lang))
    toast.success(t('حُفظ الحساب البنكي — يظهر الآن في الموقع والفواتير ✅', 'Compte enregistré — visible sur le site et les factures ✅'))
    qc.invalidateQueries({ queryKey: ['bank-account'] })
    qc.invalidateQueries({ queryKey: ['launch-checklist'] })
  }

  return (
    <Card>
      <CardHeader title={t('الحساب البنكي وطرق الأداء', 'Compte bancaire et paiements')} description={t('يظهر للزبون عند اختيار التحويل البنكي (ولمغاربة العالم) وفي أسفل الفواتير', 'Affiché au client pour les virements et sur les factures')} icon={<Landmark />} />
      <div className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('اسم البنك', 'Banque')}>
            <Input value={b.bank_name} onChange={(e) => setB({ ...b, bank_name: e.target.value })} placeholder={t('مثلاً: البنك الشعبي', 'ex. Banque Populaire')} />
          </Field>
          <Field label={t('صاحب الحساب', 'Titulaire du compte')}>
            <Input value={b.account_holder} onChange={(e) => setB({ ...b, account_holder: e.target.value })} />
          </Field>
          <Field label={t('رقم الحساب RIB (24 رقماً)', 'RIB (24 chiffres)')} className="sm:col-span-2" hint={digits.length > 0 && !ribOk ? t(`عدد الأرقام الآن ${digits.length} من 24`, `${digits.length}/24 chiffres`) : undefined}>
            <Input value={b.rib} onChange={(e) => setB({ ...b, rib: e.target.value })} dir="ltr" className="num tracking-wider" placeholder="000 000 0000000000000000 00" inputMode="numeric" />
          </Field>
        </div>
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
          {t('طرق الأداء (التحويل، في المحل، عند الاستلام) تُفعَّل من محرر الموقع ← ⚙️ مشترك ← الأداء الأونلاين.', 'Les moyens de paiement se règlent dans Éditeur du site → Commun → Paiements.')}
        </p>
        <Button onClick={save} loading={busy}>
          <Save />
          {t('حفظ', 'Enregistrer')}
        </Button>
      </div>
    </Card>
  )
}
