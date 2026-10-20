// French amount in words for invoices: "Arrêtée la présente facture à la somme de …"
const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf']
const TENS = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt']

function below100(n: number): string {
  if (n < 20) return UNITS[n]
  const t = Math.floor(n / 10)
  let u = n % 10
  if (t === 7 || t === 9) u += 10
  let s = TENS[t]
  if (u === 0) return t === 8 ? 'quatre-vingts' : s
  if ((u === 1 || u === 11) && t !== 8 && t !== 9) s += ' et'
  return `${s}-${UNITS[u]}`.replace(' et-', ' et ')
}

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h === 0) return below100(r)
  const head = h === 1 ? 'cent' : `${UNITS[h]} cent${r === 0 ? 's' : ''}`
  return r === 0 ? head : `${head} ${below100(r)}`
}

export function frenchNumber(n: number): string {
  if (n === 0) return 'zéro'
  const parts: string[] = []
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  if (millions) parts.push(millions === 1 ? 'un million' : `${below1000(millions)} millions`)
  if (thousands) parts.push(thousands === 1 ? 'mille' : `${below1000(thousands).replace(/s$/, '')} mille`)
  if (rest) parts.push(below1000(rest))
  return parts.join(' ')
}

/** 12345 centimes → "cent vingt-trois dirhams et quarante-cinq centimes" */
export function amountInWords(cents: number) {
  const dh = Math.floor(Math.abs(cents) / 100)
  const c = Math.abs(cents) % 100
  const main = `${frenchNumber(dh)} dirham${dh > 1 ? 's' : ''}`
  return c ? `${main} et ${frenchNumber(c)} centime${c > 1 ? 's' : ''}` : main
}
