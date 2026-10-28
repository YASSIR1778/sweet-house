// All amounts are integers in centimes: 1250 = 12,50 DH.

const fmt = new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtShort = new Intl.NumberFormat('fr-MA', { maximumFractionDigits: 2 })

export function money(cents: number | null | undefined, opts: { currency?: boolean; short?: boolean } = {}) {
  const v = (cents ?? 0) / 100
  const s = (opts.short ? fmtShort : fmt).format(v).replace(/ | /g, ' ')
  return opts.currency === false ? s : `${s} DH`
}

/**
 * Parse an amount typed the way screens show it into centimes: "12,5" / "12.50" / "1 200" / "14,816.00" /
 * "14.816,00" / "1.500" (= 1500: a mark before exactly three digits groups thousands). Returns null when invalid.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null
  if (typeof input === 'number') return Number.isFinite(input) ? Math.round(input * 100) : null
  const s = input.replace(/\s/g, '')
  const sign = s.startsWith('-') ? -1 : 1
  let int = sign < 0 ? s.slice(1) : s
  let dec = ''
  // the last mark is the decimal point, unless it groups thousands ("1.250.000", "14,816")
  const m = /^(.*)([.,])(\d*)$/.exec(int)
  if (m && !(m[3].length === 3 && (m[1].includes(m[2]) || /^[1-9]\d{0,2}$/.test(m[1])))) {
    if (m[1].includes(m[2])) return null
    int = m[1]
    dec = m[3]
  }
  // marks left in the integer part group thousands, by threes
  if (/[.,]/.test(int) && !/^\d{1,3}([.,]\d{3})+$/.test(int)) return null
  int = int.replace(/[.,]/g, '')
  if (!/^\d*$/.test(int) || (int === '' && dec === '')) return null
  return sign * Math.round(Number(`${int || '0'}.${dec || '0'}`) * 100)
}

/** Centimes → editable string ("12.5"). */
export function toInput(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return ''
  return String(cents / 100)
}

export function qty(n: number | string | null | undefined) {
  return fmtShort.format(Number(n ?? 0))
}
