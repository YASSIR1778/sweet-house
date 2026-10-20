import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Lang = 'ar' | 'fr'

type LangCtx = {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (l: Lang) => void
  /** Pick the string for the current language: t('مرحبا', 'Bonjour') */
  t: (ar: string, fr: string) => string
  /** Pick a localized field from a row: pick(product, 'name') → name_ar | name_fr */
  pick: (row: Record<string, unknown> | null | undefined, field: string) => string
}

const Ctx = createContext<LangCtx | null>(null)

function readLang(): Lang {
  try {
    return localStorage.getItem('sh-lang') === 'fr' ? 'fr' : 'ar'
  } catch {
    return 'ar'
  }
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readLang)

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    try {
      localStorage.setItem('sh-lang', l)
    } catch {
      /* storage unavailable */
    }
  }, [])

  const value = useMemo<LangCtx>(
    () => ({
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      setLang,
      t: (ar, fr) => (lang === 'ar' ? ar : fr),
      pick: (row, field) => {
        if (!row) return ''
        const primary = row[`${field}_${lang}`]
        const fallback = row[`${field}_${lang === 'ar' ? 'fr' : 'ar'}`]
        return String(primary || fallback || '')
      },
    }),
    [lang, setLang],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLang() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useLang outside LangProvider')
  return c
}
