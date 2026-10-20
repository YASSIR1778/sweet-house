import type { ReactNode } from 'react'
import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/utils'

export type Option = { value: string; label: ReactNode; hint?: ReactNode }

const NONE = '__none__'

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  allowEmpty,
  emptyLabel,
  disabled,
  className,
}: {
  value: string | null | undefined
  onValueChange: (v: string | null) => void
  options: Option[]
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <SelectPrimitive.Root
      value={value ?? (allowEmpty ? NONE : undefined)}
      onValueChange={(v) => onValueChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        className={cn(
          'flex h-10 w-full items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-3 text-sm text-text transition-colors focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60 data-[placeholder]:text-subtle',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface shadow-pop data-[state=open]:animate-[popIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {allowEmpty && <Item value={NONE}>{emptyLabel ?? '—'}</Item>}
            {options.map((o) => (
              <Item key={o.value} value={o.value} hint={o.hint}>
                {o.label}
              </Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

function Item({ value, children, hint }: { value: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={value}
      className="relative flex cursor-pointer items-center gap-2 rounded-lg py-2 ps-8 pe-2.5 text-sm outline-none data-[highlighted]:bg-surface-2"
    >
      <SelectPrimitive.ItemIndicator className="absolute start-2.5">
        <Check className="size-4 text-brand" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      {hint && <span className="ms-auto text-xs text-muted">{hint}</span>}
    </SelectPrimitive.Item>
  )
}
