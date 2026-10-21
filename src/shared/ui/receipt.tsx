import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import type { LegalSettings, ReceiptSettings, Sale, StoreSettings } from '@/shared/lib/types'
import { money, qty } from '@/shared/lib/money'
import QRCode from 'qrcode'
import { storage } from '@/shared/lib/utils'

// Same cache as useReceiptConfig: printing must work offline too.
const cfgCache = storage<{ receipt?: Partial<ReceiptSettings> } | null>('sh-receipt-cfg', null)

/** Roll printer geometry from Settings → receipt (defaults fit 80mm printers like the K200). */
export function rollGeometry(r?: Partial<ReceiptSettings>) {
  const g = r ?? cfgCache.get()?.receipt ?? {}
  const paper = g.paper_mm ?? 80
  return { paper, width: g.print_width_mm ?? (paper === 58 ? 48 : 72), offset: g.offset_mm ?? 0, font: g.font_size ?? 12 }
}

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
    <div className="receipt" style={{ width: `${rollGeometry(r).width}mm`, maxWidth: '100%', fontFamily: "'IBM Plex Sans Arabic', 'Inter', sans-serif", fontSize: rollGeometry(r).font, color: '#000', lineHeight: 1.35, direction: 'rtl' }}>
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
      {sale.number.startsWith('TR-') && <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, margin: '4px 0', border: '2px dashed #000', padding: 4 }}>*** {L('تدريب — ليس وصلاً حقيقياً', 'FORMATION — NON VALABLE')} ***</div>}
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
        {r.show_qr && r.qr_url && (
          <div style={{ marginTop: 8 }}>
            <QrSvg text={r.qr_url} />
            {(r.qr_label_ar || r.qr_label_fr) && <div style={{ fontSize: 10, marginTop: 3 }}>{ar ? r.qr_label_ar : r.qr_label_fr}</div>}
          </div>
        )}
        <div style={{ fontSize: 9, marginTop: 6, fontFamily: 'Inter', opacity: 0.7 }}>Sweet House · {sale.id.slice(0, 8)}</div>
      </div>
    </div>
  )
}


/** Synchronous QR (SVG) so it is ready before printing starts. */
export function QrSvg({ text, size = 90 }: { text: string; size?: number }) {
  const q = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = q.modules.size
  const cells: string[] = []
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) cells.push(`M${x} ${y}h1v1h-1z`)
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} style={{ display: 'block', margin: '0 auto' }} shapeRendering="crispEdges">
      <rect x={-1} y={-1} width={n + 2} height={n + 2} fill="#fff" />
      <path d={cells.join('')} fill="#000" />
    </svg>
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

/** Renders children into a print-only area, opens the print dialog once, then calls onDone. */
export function PrintArea({ children, onDone, page, margin, geo: geoOverride }: { children: React.ReactNode; onDone: () => void; page?: string; margin?: string; geo?: Partial<ReceiptSettings> }) {
  // Roll (ticket) prints: exact printable width, anchored to the paper's left
  // edge (where thermal printers start), whatever the page direction.
  const roll = !page || !/A4|A5|letter/i.test(page)
  const geo = rollGeometry(geoOverride)
  page = roll ? `${geo.paper}mm auto` : page
  margin = roll ? '0' : (margin ?? '10mm')
  const done = useRef(onDone)
  done.current = onDone
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const style = document.createElement('style')
    style.textContent = `@page { size: ${page}; margin: ${margin}; } @media print { html, body { background: #fff !important; } }`
    document.head.appendChild(style)
    const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-area img'))
    Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(() => {
      setTimeout(() => {
        window.print()
        style.remove()
        done.current()
      }, 50)
    })
  }, [page, margin])

  return createPortal(
    <div className="print-area" aria-hidden style={{ position: 'fixed', left: -10000, top: 0, direction: 'ltr' }}>
      {roll ? <div style={{ width: `${geo.width}mm`, marginLeft: `${geo.offset}mm`, marginRight: 'auto', overflow: 'hidden' }}>{children}</div> : children}
    </div>,
    document.body,
  )
}

/** With Chrome started using --kiosk-printing the print is silent. */
export function PrintReceipt({ sale, cfg, onDone }: { sale: Sale; cfg: ReceiptConfig; onDone: () => void }) {
  return (
    <PrintArea onDone={onDone}>
      <Receipt sale={sale} cfg={cfg} />
    </PrintArea>
  )
}

/** Calibration ticket: shows the printed width with edge marks and a mm ruler. */
export function PrintTestTicket({ geo, onDone }: { geo?: Partial<ReceiptSettings>; onDone: () => void }) {
  const g = rollGeometry(geo)
  const ticks = Array.from({ length: Math.floor(g.width / 5) + 1 }, (_, i) => i * 5)
  return (
    <PrintArea onDone={onDone} geo={geo}>
      <div style={{ fontFamily: "'Inter', sans-serif", color: '#000', fontSize: 11, direction: 'ltr' }}>
        <div style={{ border: '2px solid #000', padding: '2mm', textAlign: 'center', fontWeight: 700 }}>
          ◀ TEST {g.width}mm ▶
          <div style={{ fontWeight: 400, direction: 'rtl', fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>يجب أن يظهر الإطار كاملاً من الجهتين</div>
        </div>
        <div style={{ position: 'relative', height: '9mm', marginTop: '2mm', borderBottom: '1px solid #000' }}>
          {ticks.map((mm) => (
            <div key={mm} style={{ position: 'absolute', left: `${mm}mm`, bottom: 0, width: 1, height: mm % 10 === 0 ? '4mm' : '2mm', background: '#000' }}>
              {mm % 10 === 0 && <span style={{ position: 'absolute', bottom: '4.5mm', left: -3, fontSize: 8 }}>{mm}</span>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: '2mm', fontSize: 10 }}>paper {g.paper}mm · width {g.width}mm · offset {g.offset}mm</div>
      </div>
    </PrintArea>
  )
}
