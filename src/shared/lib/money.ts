// All amounts are integers in centimes: 1250 = 12,50 DH.

const fmt = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShort = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 })

export function money(cents: number | null | undefined, opts: { currency?: boolean; short?: boolean } = {}) {
  const v = (cents ?? 0) / 100
  const s = (opts.short ? fmtShort : fmt).format(v).replace(/ | /g, ' ')
  return opts.currency === false ? s : `${s} DH`
}

/** Parse "12,5" / "12.50" / "1 200" into centimes. Returns null when invalid. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null
  const cleaned = input.replace(/\s/g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** Centimes → editable string ("12.5"). */
export function toInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return ''
  return String(cents / 100)
}

export function qty(n: number | string | null | undefined) {
  return fmtShort.format(Number(n ?? 0))
}
