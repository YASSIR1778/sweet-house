import { format } from 'date-fns'
import { money, qty } from '@/shared/lib/money'
import { amountInWords } from '@/shared/lib/words'
import type { LegalSettings, StoreSettings } from '@/shared/lib/types'

export type InvoiceData = {
  id: string
  number: string
  kind: 'invoice' | 'credit_note'
  status: 'issued' | 'credited'
  client_name: string
  client_ice: string | null
  client_address: string | null
  client_city: string | null
  issued_on: string
  subtotal_ht: number
  tax_total: number
  total_ttc: number
  payment_method: string | null
  notes: string | null
  reason: string | null
  original_number: string | null
  credit_note_number: string | null
  sale_number: string | null
  items: { line_no: number; description_ar: string; description_fr: string; qty: number; unit_price_ttc: number; tax_rate: number; total_ttc: number; total_ht: number; tax: number }[]
  by_rate: { rate: number; ht: number; tax: number; ttc: number }[]
}

export type InvoiceCfg = { store: Partial<StoreSettings>; legal: Partial<LegalSettings>; invoice: { notes_fr?: string; bank_name?: string; rib?: string; payment_terms_fr?: string } }

const PAY: Record<string, string> = { cash: 'Espèces', card: 'Carte bancaire', credit: 'À crédit', transfer: 'Virement', cheque: 'Chèque' }

/** A4 invoice in French (standard for Moroccan invoices) with Arabic header. */
export function InvoiceDocument({ inv, cfg }: { inv: InvoiceData; cfg: InvoiceCfg }) {
  const l = cfg.legal
  const s = cfg.store
  const credit = inv.kind === 'credit_note'
  const legal = [l.company_name, l.ice && `ICE : ${l.ice}`, l.if && `IF : ${l.if}`, l.rc && `RC : ${l.rc}`, l.patente && `Patente : ${l.patente}`, l.cnss && `CNSS : ${l.cnss}`].filter(Boolean)
  return (
    <div style={{ width: '190mm', minHeight: '270mm', fontFamily: "'Inter', 'IBM Plex Sans Arabic', sans-serif", fontSize: 11, color: '#0F172A', direction: 'ltr', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #FF6B35', paddingBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <img src={s.logo_url || `${import.meta.env.BASE_URL}logo.svg`} alt="" style={{ width: 54, height: 54, objectFit: 'contain' }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{s.name_fr}</div>
            <div style={{ fontFamily: "'IBM Plex Sans Arabic'", fontSize: 13 }}>{s.name_ar}</div>
            <div style={{ color: '#475569', marginTop: 2 }}>{s.address_fr}</div>
            <div style={{ color: '#475569' }}>
              {s.phone} {s.email && `· ${s.email}`}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: credit ? '#DC2626' : '#FF6B35', letterSpacing: 1 }}>{credit ? 'AVOIR' : 'FACTURE'}</div>
          <div style={{ fontFamily: "'IBM Plex Sans Arabic'", color: '#475569' }}>{credit ? 'فاتورة مضادة' : 'فاتورة'}</div>
          <div style={{ marginTop: 8, fontWeight: 700, fontSize: 13 }}>N° {inv.number}</div>
          <div>Date : {format(new Date(inv.issued_on), 'dd/MM/yyyy')}</div>
          {credit && inv.original_number && <div>Réf. facture : {inv.original_number}</div>}
          {inv.sale_number && <div style={{ color: '#475569' }}>Ticket : {inv.sale_number}</div>}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <div style={{ width: '48%', border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F8FAFC' }}>
          <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Client</div>
          <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>{inv.client_name}</div>
          {inv.client_ice && <div>ICE : {inv.client_ice}</div>}
          {inv.client_address && <div>{inv.client_address}</div>}
          {inv.client_city && <div>{inv.client_city}</div>}
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
        <thead>
          <tr style={{ background: '#0F172A', color: '#fff' }}>
            {['#', 'Désignation', 'Qté', 'P.U. TTC', 'TVA', 'Total HT', 'Total TTC'].map((h, i) => (
              <th key={h} style={{ padding: '7px 8px', textAlign: i === 1 ? 'left' : 'right', fontWeight: 600, fontSize: 10 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {inv.items.map((it, i) => (
            <tr key={it.line_no} style={{ background: i % 2 ? '#F8FAFC' : '#fff', borderBottom: '1px solid #E2E8F0' }}>
              <td style={{ padding: '6px 8px', textAlign: 'right', color: '#475569' }}>{it.line_no}</td>
              <td style={{ padding: '6px 8px' }}>{it.description_fr}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{qty(it.qty)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(it.unit_price_ttc, { currency: false })}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{Number(it.tax_rate)}%</td>
              <td style={{ padding: '6px 8px', textAlign: 'right' }}>{money(it.total_ht, { currency: false })}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600 }}>{money(it.total_ttc, { currency: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 16 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 10, alignSelf: 'flex-start' }}>
          <thead>
            <tr style={{ color: '#475569' }}>
              {['Taux TVA', 'Base HT', 'Montant TVA'].map((h) => (
                <th key={h} style={{ padding: '4px 10px', borderBottom: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 600 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.by_rate.map((r) => (
              <tr key={r.rate}>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>{Number(r.rate)}%</td>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>{money(r.ht, { currency: false })}</td>
                <td style={{ padding: '4px 10px', textAlign: 'right' }}>{money(r.tax, { currency: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ width: '42%' }}>
          {[
            ['Total HT', inv.subtotal_ht],
            ['Total TVA', inv.tax_total],
          ].map(([k, v]) => (
            <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #E2E8F0' }}>
              <span>{k}</span>
              <span>{money(v as number)}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', marginTop: 6, background: credit ? '#DC2626' : '#FF6B35', color: '#fff', borderRadius: 6, fontWeight: 800, fontSize: 14 }}>
            <span>Total TTC</span>
            <span>{money(inv.total_ttc)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, padding: 10, border: '1px dashed #CBD5E1', borderRadius: 6 }}>
        {credit ? 'Arrêté le présent avoir' : 'Arrêtée la présente facture'} à la somme de : <b>{amountInWords(inv.total_ttc)}</b> TTC.
      </div>
      {inv.payment_method && <div style={{ marginTop: 8 }}>Mode de règlement : {PAY[inv.payment_method] ?? inv.payment_method}</div>}
      {credit && inv.reason && <div style={{ marginTop: 4 }}>Motif : {inv.reason}</div>}
      {inv.notes && <div style={{ marginTop: 4 }}>{inv.notes}</div>}
      {cfg.invoice.payment_terms_fr && !credit && <div style={{ marginTop: 4, color: '#475569' }}>{cfg.invoice.payment_terms_fr}</div>}
      {cfg.invoice.rib && <div style={{ marginTop: 4, color: '#475569' }}>{cfg.invoice.bank_name} · RIB : {cfg.invoice.rib}</div>}
      {cfg.invoice.notes_fr && <div style={{ marginTop: 4, color: '#475569' }}>{cfg.invoice.notes_fr}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 30 }}>
        <div style={{ width: 200, height: 70, border: '1px solid #E2E8F0', borderRadius: 6, padding: 6, fontSize: 9, color: '#475569' }}>Cachet et signature</div>
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #E2E8F0', textAlign: 'center', fontSize: 9, color: '#475569' }}>{legal.join(' · ')}</div>
    </div>
  )
}
