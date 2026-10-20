import { useState, type ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertPrimitive from '@radix-ui/react-alert-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { useLang } from '@/shared/lib/i18n'
import { Button } from './primitives'

// ---------------------------------------------------------------- Dialog
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
}) {
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-6xl' }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_150ms]" />
        <DialogPrimitive.Content
          className={cn(
            'fixed start-1/2 top-1/2 z-50 flex max-h-[92vh] w-[calc(100vw-2rem)] -translate-y-1/2 flex-col rounded-2xl border border-border bg-surface shadow-pop outline-none ltr:-translate-x-1/2 rtl:translate-x-1/2',
            'data-[state=open]:animate-[popIn_180ms_cubic-bezier(0.16,1,0.3,1)]',
            widths[size],
            className,
          )}
          aria-describedby={undefined}
        >
          {title && (
            <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
                {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>}
              </div>
              <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text">
                <X className="size-4" />
              </DialogPrimitive.Close>
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface-2/40 px-6 py-3.5">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ---------------------------------------------------------------- Sheet (side panel)
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'max-w-xl',
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  width?: string
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px] data-[state=open]:animate-[fadeIn_150ms]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            'fixed inset-y-0 end-0 z-50 flex w-full flex-col border-s border-border bg-bg shadow-pop outline-none',
            'ltr:data-[state=open]:animate-[slideInRight_260ms_cubic-bezier(0.16,1,0.3,1)] rtl:data-[state=open]:animate-[slideInLeft_260ms_cubic-bezier(0.16,1,0.3,1)]',
            width,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border bg-surface px-6 py-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
              {description && <DialogPrimitive.Description className="mt-1 text-sm text-muted">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-text">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-3.5">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// ---------------------------------------------------------------- Confirm
export function useConfirm() {
  const { t } = useLang()
  const [state, setState] = useState<{
    title: string
    description?: string
    confirmLabel?: string
    danger?: boolean
    resolve: (v: boolean) => void
  } | null>(null)

  const confirm = (opts: { title: string; description?: string; confirmLabel?: string; danger?: boolean }) =>
    new Promise<boolean>((resolve) => setState({ ...opts, resolve }))

  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }

  const node = (
    <AlertPrimitive.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-navy/40 backdrop-blur-[2px]" />
        <AlertPrimitive.Content className="fixed start-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-y-1/2 rounded-2xl border border-border bg-surface p-6 shadow-pop ltr:-translate-x-1/2 rtl:translate-x-1/2 data-[state=open]:animate-[popIn_180ms_cubic-bezier(0.16,1,0.3,1)]">
          <div className="flex gap-4">
            <div className={cn('flex size-11 shrink-0 items-center justify-center rounded-full', state?.danger ? 'bg-danger/10 text-danger' : 'bg-brand-50 text-brand')}>
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0">
              <AlertPrimitive.Title className="text-lg font-semibold">{state?.title}</AlertPrimitive.Title>
              {state?.description && <AlertPrimitive.Description className="mt-1.5 text-sm text-muted">{state.description}</AlertPrimitive.Description>}
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)}>
              {t('إلغاء', 'Annuler')}
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
              {state?.confirmLabel ?? t('تأكيد', 'Confirmer')}
            </Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  )

  return { confirm, confirmNode: node }
}

// ---------------------------------------------------------------- Dropdown
export const Dropdown = DropdownPrimitive.Root
export const DropdownTrigger = DropdownPrimitive.Trigger

export function DropdownContent({ children, align = 'end' }: { children: ReactNode; align?: 'start' | 'end' | 'center' }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={6}
        className="z-50 min-w-48 rounded-xl border border-border bg-surface p-1.5 shadow-pop data-[state=open]:animate-[popIn_150ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function DropdownItem({
  children,
  onSelect,
  danger,
  icon,
}: {
  children: ReactNode
  onSelect?: () => void
  danger?: boolean
  icon?: ReactNode
}) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      className={cn(
        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors data-[highlighted]:bg-surface-2 [&_svg]:size-4',
        danger ? 'text-danger' : 'text-text',
      )}
    >
      {icon}
      {children}
    </DropdownPrimitive.Item>
  )
}

export function DropdownSeparator() {
  return <DropdownPrimitive.Separator className="my-1 h-px bg-border" />
}

// ---------------------------------------------------------------- Tooltip
export const TooltipProvider = TooltipPrimitive.Provider

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-lg bg-navy px-2.5 py-1.5 text-xs text-white shadow-pop dark:bg-white dark:text-navy">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
