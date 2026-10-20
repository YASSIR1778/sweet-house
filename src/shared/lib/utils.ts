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
