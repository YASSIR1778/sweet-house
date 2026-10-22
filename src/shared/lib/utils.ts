import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uuid() {
  return crypto.randomUUID()
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
}

export function storage<T>(key: string, fallback: T) {
  return {
    get(): T {
      try {
        const v = localStorage.getItem(key)
        return v ? (JSON.parse(v) as T) : fallback
      } catch {
        return fallback
      }
    },
    set(v: T) {
      try {
        localStorage.setItem(key, JSON.stringify(v))
      } catch {
        /* storage unavailable */
      }
    },
    clear() {
      try {
        localStorage.removeItem(key)
      } catch {
        /* storage unavailable */
      }
    },
  }
}

/** Search text the way people type it: no diacritics, أ/إ/آ → ا, ة → ه, ى → ي, and the article «ال» ignored. */
export function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ًͯ-ٰٟـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .split(/[\s,،.()«»\-–/]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.startsWith('ال') ? w.slice(2) : w))
}

/** True when every word of the query appears somewhere in the texts. */
export function matchesSearch(q: string, ...texts: (string | null | undefined)[]) {
  const words = normalizeSearch(q)
  if (!words.length) return true
  const hay = normalizeSearch(texts.filter(Boolean).join(' ')).join(' ')
  return words.every((w) => hay.includes(w))
}

/** A server timestamp as a Date that is never in the future (device clocks drift). */
export function past(d: string | Date) {
  const t = new Date(d)
  return t.getTime() > Date.now() ? new Date() : t
}

export function normalizePhone(p: string) {
  let d = p.replace(/[^\d+]/g, '')
  if (d.startsWith('+')) d = d.slice(1)
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0') && d.length === 10) d = '212' + d.slice(1)
  return d
}

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`
}

export function fillTemplate(tpl: string, vars: Record<string, string | number | null | undefined>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''))
}
