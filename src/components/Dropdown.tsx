'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react'

import { cn } from 'tailwind-variants'

import { Slot } from '#/components/Slot'

/* -------------------------------------------------------------------------- */
/*                                   Context                                  */
/* -------------------------------------------------------------------------- */

type DropdownContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  baseId: string
  triggerRef: React.RefObject<HTMLElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

const DropdownContext = createContext<DropdownContextValue | null>(null)

function useDropdownContext(component: string) {
  const ctx = use(DropdownContext)
  if (!ctx) {
    throw new Error(
      `${component} deve ser utilizado dentro de <Dropdown.Root>`
    )
  }
  return ctx
}

function focusables(content: HTMLElement | null): HTMLElement[] {
  if (!content) return []
  return Array.from(
    content.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    )
  )
}

/* -------------------------------------------------------------------------- */
/*                                Dropdown.Root                               */
/* -------------------------------------------------------------------------- */

export type DropdownRootProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
  children: React.ReactNode
}

export function DropdownRoot({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  children
}: DropdownRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? (controlledOpen ?? false) : uncontrolledOpen
  const baseId = useId()

  const triggerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <DropdownContext
      value={{ open, setOpen, baseId, triggerRef, contentRef }}
    >
      <div className={cn('relative inline-block', className)}>{children}</div>
    </DropdownContext>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Dropdown.Trigger                              */
/* -------------------------------------------------------------------------- */

export type DropdownTriggerProps = React.ComponentProps<'button'> & {
  asChild?: boolean
}

export function DropdownTrigger({
  asChild = false,
  onClick,
  onKeyDown,
  children,
  ...props
}: DropdownTriggerProps) {
  const { open, setOpen, baseId, triggerRef, contentRef } =
    useDropdownContext('Dropdown.Trigger')
  const Component = asChild ? Slot : 'button'

  const setRefs = (node: HTMLElement | null) => {
    triggerRef.current = node
  }

  const openAndFocusFirst = () => {
    setOpen(true)
    requestAnimationFrame(() => {
      focusables(contentRef.current)[0]?.focus()
    })
  }

  return (
    <Component
      ref={setRefs as React.Ref<HTMLButtonElement>}
      id={`${baseId}-trigger`}
      type={asChild ? undefined : 'button'}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={`${baseId}-content`}
      data-state={open ? 'open' : 'closed'}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        if (e.defaultPrevented) return
        setOpen(!open)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(e as React.KeyboardEvent<HTMLButtonElement>)
        if (e.defaultPrevented) return
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!open) openAndFocusFirst()
        }
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                              Dropdown.Content                              */
/* -------------------------------------------------------------------------- */

export type DropdownSide = 'top' | 'bottom'
export type DropdownAlign = 'start' | 'center' | 'end'

export type DropdownContentProps = React.ComponentProps<'div'> & {
  asChild?: boolean
  side?: DropdownSide
  align?: DropdownAlign
}

const sideClasses: Record<DropdownSide, string> = {
  top: 'bottom-full mb-1.5 origin-bottom',
  bottom: 'top-full mt-1.5 origin-top'
}

const alignClasses: Record<DropdownAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0'
}

export function DropdownContent({
  asChild = false,
  side = 'bottom',
  align = 'start',
  onKeyDown,
  className,
  children,
  ...props
}: DropdownContentProps) {
  const { open, setOpen, baseId, triggerRef, contentRef } =
    useDropdownContext('Dropdown.Content')
  const Component = asChild ? Slot : 'div'

  // Fecha com Escape / Tab / clique fora; Escape devolve o foco ao trigger.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        setOpen(false)
        if (e.key === 'Escape') triggerRef.current?.focus()
      }
    }
    const onPointer = (e: PointerEvent) => {
      const el = contentRef.current
      const trigger = triggerRef.current
      const target = e.target as Node | null
      if (
        target &&
        ((el && el.contains(target)) ||
          (trigger && trigger.contains(target)))
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, setOpen, contentRef, triggerRef])

  if (!open) return null

  return (
    <Component
      ref={contentRef as React.Ref<HTMLDivElement>}
      id={`${baseId}-content`}
      role="menu"
      aria-labelledby={`${baseId}-trigger`}
      data-state={open ? 'open' : 'closed'}
      data-side={side}
      data-align={align}
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(e as React.KeyboardEvent<HTMLDivElement>)
        if (e.defaultPrevented) return
        const items = focusables(contentRef.current)
        if (items.length === 0) return
        const current = items.indexOf(document.activeElement as HTMLElement)
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          items[(current + 1) % items.length]?.focus()
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          items[(current - 1 + items.length) % items.length]?.focus()
        } else if (e.key === 'Home') {
          e.preventDefault()
          items[0]?.focus()
        } else if (e.key === 'End') {
          e.preventDefault()
          items[items.length - 1]?.focus()
        }
      }}
      className={cn(
        'border-woodsmoke-700 bg-woodsmoke-900 text-woodsmoke-100 absolute z-50 min-w-36 overflow-hidden rounded-md border p-1 shadow-xl',
        sideClasses[side],
        alignClasses[align],
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                                Dropdown.Item                               */
/* -------------------------------------------------------------------------- */

export type DropdownItemProps = React.ComponentProps<'div'> & {
  asChild?: boolean
  disabled?: boolean
  onSelect?: (event: Event) => void
}

export function DropdownItem({
  asChild = false,
  disabled = false,
  onSelect,
  onClick,
  onKeyDown,
  className,
  children,
  ...props
}: DropdownItemProps) {
  const { setOpen, triggerRef } = useDropdownContext('Dropdown.Item')
  const Component = asChild ? Slot : 'div'

  const select = () => {
    if (disabled) return
    const event = new Event('dropdown.select', { bubbles: true })
    onSelect?.(event)
    if (event.defaultPrevented) return
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <Component
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-disabled={disabled || undefined}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        onClick?.(e as React.MouseEvent<HTMLDivElement>)
        if (e.defaultPrevented) return
        select()
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(e as React.KeyboardEvent<HTMLDivElement>)
        if (e.defaultPrevented) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          select()
        }
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
        if (!disabled) e.currentTarget.focus({ preventScroll: true })
      }}
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
        'focus:bg-woodsmoke-800 focus:text-woodsmoke-50',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                               Dropdown.Label                               */
/* -------------------------------------------------------------------------- */

export type DropdownLabelProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function DropdownLabel({
  asChild = false,
  className,
  children,
  ...props
}: DropdownLabelProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      className={cn(
        'text-woodsmoke-400 px-2 py-1.5 text-xs font-semibold',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                             Dropdown.Separator                             */
/* -------------------------------------------------------------------------- */

export type DropdownSeparatorProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function DropdownSeparator({
  asChild = false,
  className,
  ...props
}: DropdownSeparatorProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      role="separator"
      aria-orientation="horizontal"
      className={cn('bg-woodsmoke-700 -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Exports                                  */
/* -------------------------------------------------------------------------- */

export const Dropdown = {
  Root: DropdownRoot,
  Trigger: DropdownTrigger,
  Content: DropdownContent,
  Item: DropdownItem,
  Label: DropdownLabel,
  Separator: DropdownSeparator
}
