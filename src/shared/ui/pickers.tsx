import { Check } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { COLORS, ICONS } from './icon'
import { parseMoney, toInput } from '@/shared/lib/money'
import { Input } from './primitives'
import { useEffect, useState } from 'react'

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110', value === c && 'ring-2 ring-text')}
          style={{ background: c }}
        >
          {value === c && <Check className="size-4 text-white" />}
        </button>
      ))}
    </div>
  )
}

export function IconPicker({ value, onChange, color = '#FF6B35' }: { value: string | null; onChange: (i: string) => void; color?: string }) {
  return (
    <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
      {Object.entries(ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          className={cn('flex aspect-square items-center justify-center rounded-lg border border-border transition-colors hover:bg-surface-2', value === name && 'border-transparent text-white')}
          style={value === name ? { background: color } : undefined}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  )
}

/** Amount input in dirhams that stores centimes. */
export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
}: {
  value: number | null | undefined
  onChange: (cents: number | null) => void
  placeholder?: string
  className?: string
  autoFocus?: boolean
}) {
  const [text, setText] = useState(toInput(value))
  useEffect(() => {
    if (parseMoney(text) !== (value ?? null)) setText(toInput(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className={cn('relative', className)}>
      <Input
        inputMode="decimal"
        dir="ltr"
        value={text}
        autoFocus={autoFocus}
        placeholder={placeholder ?? '0.00'}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.,]/g, '')
          setText(v)
          onChange(parseMoney(v))
        }}
        className="num pe-12 text-end"
      />
      <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-xs font-medium text-subtle">DH</span>
    </div>
  )
}
