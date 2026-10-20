import { useEffect, useState } from 'react'
import { Languages, Moon, Sun } from 'lucide-react'
import { useLang } from '@/shared/lib/i18n'
import { cn } from '@/shared/lib/utils'
import { Button } from './primitives'
import { Tooltip } from './overlay'

/** Sweet House mark: a house whose roof is an open book. */
export function LogoMark({ size = 36, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="12" fill="#0F172A" />
      <path d="M24 9 9 21.5h4V37a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V21.5h4L24 9Z" fill="#FF6B35" />
      <path d="M17 25.5c2.6-.9 5-.6 7 .9v9.1c-2-1.5-4.4-1.8-7-.9v-9.1Z" fill="#fff" />
      <path d="M31 25.5c-2.6-.9-5-.6-7 .9v9.1c2-1.5 4.4-1.8 7-.9v-9.1Z" fill="#FFE1D4" />
    </svg>
  )
}

export function Logo({ subtitle, className, invert }: { subtitle?: string; className?: string; invert?: boolean }) {
  const { t } = useLang()
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <div className={cn('font-latin text-[15px] font-extrabold tracking-tight', invert ? 'text-white' : 'text-text')}>
          Sweet <span className="text-brand">House</span>
        </div>
        <div className={cn('text-[11px]', invert ? 'text-white/60' : 'text-muted')}>{subtitle ?? t('مكتبة سويت هاوس', 'Librairie Sweet House')}</div>
      </div>
    </div>
  )
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('sh-theme', dark ? 'dark' : 'light')
    } catch {
      /* storage unavailable */
    }
  }, [dark])
  return { dark, toggle: () => setDark((d) => !d) }
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme()
  const { t } = useLang()
  return (
    <Tooltip content={dark ? t('الوضع الفاتح', 'Mode clair') : t('الوضع الداكن', 'Mode sombre')}>
      <Button variant="ghost" size="icon" onClick={toggle} aria-label="theme">
        {dark ? <Sun /> : <Moon />}
      </Button>
    </Tooltip>
  )
}

export function LangToggle({ compact }: { compact?: boolean }) {
  const { lang, setLang } = useLang()
  return (
    <Button variant="ghost" size={compact ? 'icon' : 'sm'} onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')} aria-label="language">
      <Languages />
      {!compact && <span className="font-latin text-xs font-semibold">{lang === 'ar' ? 'FR' : 'ع'}</span>}
    </Button>
  )
}
