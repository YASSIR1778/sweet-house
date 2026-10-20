import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import type { LegalSettings, ReceiptSettings, Sale, StoreSettings } from '@/shared/lib/types'
import { money, qty } from '@/shared/lib/money'

export type ReceiptConfig = {
  store: Partial<StoreSettings>
  legal: Partial<LegalSettings>
  receipt: Partial<ReceiptSettings>
}

/** 80mm thermal receipt (≈ 72mm printable). Bilingual by default. */
export function Receipt({ sale, cfg }: { sale: Sale; cfg: ReceiptConfig }) {
  const r = cfg.receipt
  const langs = r.languages ?? 'both'
  const ar = langs !== 'fr'
  const fr = langs !== 'ar'
  const L = (a: string, f: string) => (ar && fr ? `${a} / ${f}` : ar ? a : f)
  const legalBits = [
    cfg.legal.ice && `ICE: ${cfg.legal.ice}`,
    cfg.legal.if && `IF: ${cfg.legal.if}`,
    cfg.legal.rc && `RC: ${cfg.legal.rc}`,
    cfg.legal.patente && `TP: ${cfg.legal.patente}`,
  ].filter(Boolean)

  return (
    <div className="receipt" style={{ width: '72mm', fontFamily: "'IBM Plex Sans Arabic', 'Inter', sans-serif", fontSize: 12, color: '#000', lineHeight: 1.35, direction: 'rtl' }}>
      <div style={{ textAlign: 'center' }}>
        {r.show_logo !== false && (
          <img src={cfg.store.logo_url || `${import.meta.env.BASE_URL}logo.svg`} alt="" style={{ width: 44, height: 44, margin: '0 auto 4px', filter: 'grayscale(1)' }} />
        )}
        <div style={{ fontWeight: 700, fontSize: 15 }}>{ar ? cfg.store.name_ar : cfg.store.name_fr}</div>
        {ar && fr && <div style={{ fontFamily: 'Inter', fontWeight: 600 }}>{cfg.store.name_fr}</div>}
        {(cfg.store.address_ar || cfg.store.address_fr) && <div>{ar ? cfg.store.address_ar : cfg.store.address_fr}</div>}
        {cfg.store.phone && <div style={{ direction: 'ltr' }}>{cfg.store.phone}</div>}
        {r.show_legal !== false && legalBits.length > 0 && <div style={{ fontSize: 10, direction: 'ltr' }}>{legalBits.join(' · ')}</div>}
        {(r.header_ar || r.header_fr) && <div style={{ marginTop: 4 }}>{ar ? r.header_ar : r.header_fr}</div>}
      </div>

      <Dash />
      <Row a={L('رقم الوصل', 'Ticket')} b={sale.number} bold />
      <Row a={L('التاريخ', 'Date')} b={format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm')} />
      {r.show_employee !== false && <Row a={L('البائع', 'Vendeur')} b={sale.employee_name} />}
      {sale.customer && <Row a={L('الزبون', 'Client')} b={sale.customer.full_name} />}
      {sale.status === 'voided' && <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 16, margin: '4px 0' }}>*** {L('ملغى', 'ANNULÉ')} ***</div>}
      <Dash />

      {sale.items.map((it) => (
        <div key={it.line_no} style={{ marginBottom: 4 }}>
          <div style={{ fontWeight: 600 }}>{ar ? it.name_ar : it.name_fr}</div>
          {ar && fr && it.name_fr !== it.name_ar && <div style={{ fontSize: 10, fontFamily: 'Inter', direction: 'ltr', textAlign: 'right' }}>{it.name_fr}</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'ltr', fontFamily: 'Inter' }}>
            <span>
              {qty(it.qty)} × {money(it.unit_price, { currency: false })}
              {it.discount > 0 && ` (-${money(it.discount, { currency: false })})`}
            </span>
            <span style={{ fontWeight: 600 }}>{money(it.total, { currency: false })}</span>
          </div>
        </div>
      ))}

      <Dash />
      {sale.discount_total > 0 && (
        <>
          <Row a={L('المجموع قبل التخفيض', 'Sous-total')} b={money(sale.subtotal)} />
          <Row a={L('التخفيض', 'Remise')} b={`-${money(sale.discount_total)}`} />
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 800, margin: '4px 0' }}>
        <span>{L('المجموع', 'TOTAL')}</span>
        <span style={{ fontFamily: 'Inter', direction: 'ltr' }}>{money(sale.total)}</span>
      </div>
      {sale.tax_total > 0 && <Row a={L('منها الضريبة', 'dont TVA')} b={money(sale.tax_total)} small />}
      <Dash />
      {sale.cash_received > 0 && <Row a={L('نقداً', 'Espèces')} b={money(sale.cash_received)} />}
      {sale.paid_card > 0 && <Row a={L('بطاقة', 'Carte')} b={money(sale.paid_card)} />}
      {sale.paid_credit > 0 && <Row a={L('دين', 'Crédit')} b={money(sale.paid_credit)} />}
      {sale.change_given > 0 && <Row a={L('الباقي', 'Rendu')} b={money(sale.change_given)} bold />}

      <Dash />
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        {ar && r.footer_ar && <div style={{ fontWeight: 600 }}>{r.footer_ar}</div>}
        {fr && r.footer_fr && <div style={{ fontFamily: 'Inter' }}>{r.footer_fr}</div>}
        <div style={{ fontSize: 9, marginTop: 6, fontFamily: 'Inter', opacity: 0.7 }}>Sweet House · {sale.id.slice(0, 8)}</div>
      </div>
    </div>
  )
}

function Row({ a, b, bold, small }: { a: string; b: string; bold?: boolean; small?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontWeight: bold ? 700 : 400, fontSize: small ? 10 : undefined }}>
      <span>{a}</span>
      <span style={{ fontFamily: 'Inter', direction: 'ltr' }}>{b}</span>
    </div>
  )
}

function Dash() {
  return <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
}

/**
 * Renders the receipt into a print-only area and opens the print dialog.
 * With Chrome started using --kiosk-printing the print is silent.
 */
export function PrintReceipt({ sale, cfg, onDone }: { sale: Sale; cfg: ReceiptConfig; onDone: () => void }) {
  const done = useRef(onDone)
  done.current = onDone
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const style = document.createElement('style')
    style.textContent = '@page { size: 80mm auto; margin: 3mm 4mm; } @media print { html, body { background: #fff !important; } }'
    document.head.appendChild(style)
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-area img'))
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(() => {
      setTimeout(() => {
        window.print()
        style.remove()
        done.current()
      }, 50)
    })
  }, [])

  return createPortal(
    <div className="print-area" aria-hidden style={{ position: 'fixed', insetInlineStart: -10000, top: 0 }}>
      <Receipt sale={sale} cfg={cfg} />
    </div>,
    document.body,
  )
}
