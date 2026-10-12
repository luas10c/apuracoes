'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

import { cn } from 'tailwind-variants'

import { Slot } from '#/components/Slot'

type PopoverContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  baseId: string
  triggerRef: React.RefObject<HTMLElement | null>
  anchorRef: React.RefObject<HTMLElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
  const ctx = use(PopoverContext)
  if (!ctx) {
    throw new Error(`${component} deve ser utilizado dentro de <Popover.Root>`)
  }
  return ctx
}

export type PopoverRootProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

export function PopoverRoot({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children
}: PopoverRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? (controlledOpen ?? false) : uncontrolledOpen
  const baseId = useId()

  const triggerRef = useRef<HTMLElement | null>(null)
  const anchorRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  return (
    <PopoverContext
      value={{ open, setOpen, baseId, triggerRef, anchorRef, contentRef }}
    >
      {children}
    </PopoverContext>
  )
}

export type PopoverTriggerProps = React.ComponentProps<'button'> & {
  asChild?: boolean
}

export function PopoverTrigger({
  asChild = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onKeyDown,
  children,
  ...props
}: PopoverTriggerProps) {
  const { open, setOpen, baseId, triggerRef } = usePopoverContext('Popover.Trigger')
  const Component = asChild ? Slot : 'button'

  const setRefs = (node: HTMLElement | null) => {
    triggerRef.current = node
  }

  return (
    <Component
      ref={setRefs as React.Ref<HTMLButtonElement>}
      type={asChild ? undefined : 'button'}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={`${baseId}-content`}
      data-state={open ? 'open' : 'closed'}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        if (e.defaultPrevented) return
        setOpen(!open)
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
        onMouseEnter?.(e as React.MouseEvent<HTMLButtonElement>)
      }}
      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => {
        onMouseLeave?.(e as React.MouseEvent<HTMLButtonElement>)
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(e as React.KeyboardEvent<HTMLButtonElement>)
        if (e.key === 'Escape') setOpen(false)
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverAnchorProps = React.ComponentProps<'span'> & {
  asChild?: boolean
  virtualX?: number
  virtualY?: number
}

export function PopoverAnchor({
  asChild = false,
  virtualX,
  virtualY,
  children,
  style,
  ...props
}: PopoverAnchorProps) {
  const { anchorRef } = usePopoverContext('Popover.Anchor')
  const Component = asChild ? Slot : 'span'

  if (virtualX !== undefined || virtualY !== undefined) {
    return (
      <span
        aria-hidden="true"
        data-popover-anchor="virtual"
        className="pointer-events-none absolute h-0 w-0"
        style={{ left: virtualX ?? 0, top: virtualY ?? 0, ...style }}
        {...props}
      />
    )
  }

  return (
    <Component
      ref={anchorRef as React.Ref<HTMLSpanElement>}
      data-popover-anchor=""
      style={{ display: 'contents', ...style }}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left'
export type PopoverAlign = 'start' | 'center' | 'end'

export type PopoverContentProps = React.ComponentProps<'div'> & {
  asChild?: boolean
  side?: PopoverSide
  align?: PopoverAlign
  sideOffset?: number
  alignOffset?: number
  avoidCollisions?: boolean
  /** Posição virtual (ex.: cursor sobre o mapa). Quando definida, ignora o anchor. */
  x?: number
  y?: number
  /** Largura/altura do container relativo para clamp + flip automático. */
  clampWidth?: number
  clampHeight?: number
}

const CONTENT_WIDTH = 300
const CONTENT_HEIGHT = 260
/** Margem mínima entre o popover e as bordas do container. */
const POPOVER_MARGIN = 8

export function PopoverContent({
  asChild = false,
  side = 'top',
  align = 'center',
  sideOffset = 8,
  alignOffset = 0,
  avoidCollisions = true,
  x,
  y,
  clampWidth,
  clampHeight,
  className,
  children,
  onMouseEnter,
  onMouseLeave,
  style,
  ...props
}: PopoverContentProps) {
  const { open, setOpen, baseId, triggerRef, anchorRef, contentRef } =
    usePopoverContext('Popover.Content')
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(
    null
  )
  const [resolvedSide, setResolvedSide] = useState<PopoverSide>(side)
  // Altura máxima p/ o card nunca estourar o container (com rolagem interna).
  const [maxHeight, setMaxHeight] = useState<number | null>(null)

  useEffect(() => {
    setResolvedSide(side)
  }, [side])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      const el = contentRef.current
      const trigger = triggerRef.current
      const anchor = anchorRef.current
      const target = e.target as Node | null
      if (
        target &&
        ((el && el.contains(target)) ||
          (trigger && trigger.contains(target)) ||
          (anchor && anchor.contains(target)))
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
  }, [open, setOpen, contentRef, triggerRef, anchorRef])

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      setMaxHeight(null)
      return
    }

    if (x !== undefined || y !== undefined) {
      const px = x ?? 0
      const py = y ?? 0
      const m = POPOVER_MARGIN

      // Mede o conteúdo real (ex.: card do exterior é mais alto que o
      // fallback) e ancora o cálculo na interseção entre o container
      // (offsetParent, que pode cortar com overflow hidden) e a viewport —
      // nunca só no tamanho passado por prop, que pode estar defasado.
      const measure = () => {
        const el = contentRef.current
        const host = (el?.offsetParent as HTMLElement | null) ?? null
        const w = host?.clientWidth ?? clampWidth ?? window.innerWidth
        const h = host?.clientHeight ?? clampHeight ?? window.innerHeight
        const cw = el?.offsetWidth || CONTENT_WIDTH
        // scrollHeight ignora o maxHeight aplicado: sem loop de ajuste.
        // Soma a borda (offsetHeight - clientHeight), que o scrollHeight
        // não inclui, para a altura bater com a caixa renderizada.
        const borderY = el ? el.offsetHeight - el.clientHeight : 0
        const ch = (el?.scrollHeight || CONTENT_HEIGHT) + (el ? borderY : 0)

        // Faixa visível do container, em coords relativas a ele.
        let visTop = 0
        let visBottom = h
        let visLeft = 0
        let visRight = w
        if (host) {
          const pr = host.getBoundingClientRect()
          visTop = Math.max(0, -pr.top)
          visBottom = Math.min(h, window.innerHeight - pr.top)
          visLeft = Math.max(0, -pr.left)
          visRight = Math.min(w, window.innerWidth - pr.left)
        }

        // Se nem na área visível cabe, limita com rolagem interna
        // mantendo a margem em cima e embaixo.
        const visH = visBottom - visTop
        const capped = ch > visH - m * 2 ? Math.max(visH - m * 2, 0) : null
        setMaxHeight(capped)
        const effCh = capped ?? ch

        const fitVertically = (raw: number) => {
          const lo = visTop + m
          const hi = visBottom - effCh - m
          if (hi < lo) return Math.max(m, Math.min(raw, h - effCh - m))
          return Math.min(Math.max(raw, lo), hi)
        }
        const fitHorizontally = (raw: number) => {
          const lo = visLeft + m
          const hi = visRight - cw - m
          if (hi < lo) return Math.max(m, Math.min(raw, w - cw - m))
          return Math.min(Math.max(raw, lo), hi)
        }

        // `side` explícito tem prioridade sobre o flip.
        if (side === 'left' || side === 'right') {
          const left =
            side === 'left' ? px - cw - sideOffset : px + sideOffset
          setResolvedSide(side)
          setCoords({
            left: avoidCollisions ? fitHorizontally(left) : left,
            top: fitVertically(py - effCh / 2)
          })
          return
        }

        const placeLeft = px > visRight - cw - 24
        const placeAbove = py > visBottom - effCh - 24

        let left = placeLeft ? px - cw - 12 : px + 16
        let top = placeAbove ? py - effCh - 12 : py + 16

        if (avoidCollisions) {
          left = fitHorizontally(left)
          top = fitVertically(top)
        }

        setResolvedSide(placeAbove ? 'top' : 'bottom')
        setCoords({ left, top })
      }

      measure()
      window.addEventListener('resize', measure)
      const el = contentRef.current
      const ro =
        el && typeof ResizeObserver !== 'undefined'
          ? new ResizeObserver(measure)
          : null
      if (el && ro) ro.observe(el)
      return () => {
        window.removeEventListener('resize', measure)
        ro?.disconnect()
      }
    }

    const anchorEl =
      anchorRef.current ?? triggerRef.current
    if (!anchorEl) return

    const measure = () => {
      const rect = anchorEl.getBoundingClientRect()
      const el = contentRef.current
      const cw = el?.offsetWidth || CONTENT_WIDTH
      const ch = el?.offsetHeight || CONTENT_HEIGHT

      let s: PopoverSide = side
      if (avoidCollisions) {
        const space = {
          top: rect.top,
          bottom: window.innerHeight - rect.bottom,
          left: rect.left,
          right: window.innerWidth - rect.right
        }
        if (s === 'top' && space.top < ch + sideOffset) s = 'bottom'
        else if (s === 'bottom' && space.bottom < ch + sideOffset) s = 'top'
        else if (s === 'left' && space.left < cw + sideOffset) s = 'right'
        else if (s === 'right' && space.right < cw + sideOffset) s = 'left'
      }
      setResolvedSide(s)

      let left = 0
      let topPos = 0
      if (s === 'top' || s === 'bottom') {
        topPos =
          s === 'top' ? rect.top - ch - sideOffset : rect.bottom + sideOffset
        if (align === 'start') left = rect.left + alignOffset
        else if (align === 'end')
          left = rect.right - cw - alignOffset
        else left = rect.left + rect.width / 2 - cw / 2 + alignOffset
        left = Math.max(
          POPOVER_MARGIN,
          Math.min(left, window.innerWidth - cw - POPOVER_MARGIN)
        )
      } else {
        left = s === 'left' ? rect.left - cw - sideOffset : rect.right + sideOffset
        if (align === 'start') topPos = rect.top + alignOffset
        else if (align === 'end') topPos = rect.bottom - ch - alignOffset
        else topPos = rect.top + rect.height / 2 - ch / 2 + alignOffset
        topPos = Math.max(
          POPOVER_MARGIN,
          Math.min(topPos, window.innerHeight - ch - POPOVER_MARGIN)
        )
      }
      setCoords({ left, top: topPos })
    }

    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [
    open,
    x,
    y,
    clampWidth,
    clampHeight,
    side,
    align,
    sideOffset,
    alignOffset,
    avoidCollisions,
    anchorRef,
    triggerRef,
    contentRef
  ])

  if (!open) return null

  const isVirtual = x !== undefined || y !== undefined
  const Component = asChild ? Slot : 'div'

  return (
    <Component
      ref={contentRef as React.Ref<HTMLDivElement>}
      id={`${baseId}-content`}
      role="dialog"
      aria-modal="false"
      data-state={open ? 'open' : 'closed'}
      data-side={resolvedSide}
      data-align={align}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'border-woodsmoke-700 bg-woodsmoke-900 text-woodsmoke-100 z-50 w-[300px] rounded-xl border p-0 shadow-2xl shadow-black/60 outline-none',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className
      )}
      style={{
        position: isVirtual ? 'absolute' : 'fixed',
        ...(coords ? { left: coords.left, top: coords.top } : { visibility: 'hidden' as const }),
        ...(maxHeight != null
          ? { maxHeight, overflowY: 'auto' as const }
          : null),
        ...style
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverHeaderProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function PopoverHeader({
  asChild = false,
  className,
  children,
  ...props
}: PopoverHeaderProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      className={cn('flex flex-col gap-0.5 px-4 pt-3.5 pb-1', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverTitleProps = React.ComponentProps<'h2'> & {
  asChild?: boolean
}

export function PopoverTitle({
  asChild = false,
  className,
  children,
  ...props
}: PopoverTitleProps) {
  const Component = asChild ? Slot : 'h2'
  return (
    <Component
      className={cn('text-sm leading-none font-semibold tracking-tight', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverDescriptionProps = React.ComponentProps<'p'> & {
  asChild?: boolean
}

export function PopoverDescription({
  asChild = false,
  className,
  children,
  ...props
}: PopoverDescriptionProps) {
  const Component = asChild ? Slot : 'p'
  return (
    <Component
      className={cn('text-woodsmoke-400 text-xs', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverBodyProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function PopoverBody({
  asChild = false,
  className,
  children,
  ...props
}: PopoverBodyProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component className={cn('px-4 py-2', className)} {...props}>
      {children}
    </Component>
  )
}

export type PopoverFooterProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function PopoverFooter({
  asChild = false,
  className,
  children,
  ...props
}: PopoverFooterProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      className={cn('border-woodsmoke-800 flex items-center gap-2 border-t px-4 py-2.5', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

export type PopoverCloseProps = React.ComponentProps<'button'> & {
  asChild?: boolean
}

export function PopoverClose({
  asChild = false,
  onClick,
  children,
  ...props
}: PopoverCloseProps) {
  const { setOpen } = usePopoverContext('Popover.Close')
  const Component = asChild ? Slot : 'button'
  return (
    <Component
      type={asChild ? undefined : 'button'}
      onClick={(e: React.MouseEvent<HTMLElement>) => {
        onClick?.(e as React.MouseEvent<HTMLButtonElement>)
        if (e.defaultPrevented) return
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </Component>
  )
}

export const Popover = {
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
  Anchor: PopoverAnchor,
  Content: PopoverContent,
  Header: PopoverHeader,
  Title: PopoverTitle,
  Description: PopoverDescription,
  Body: PopoverBody,
  Footer: PopoverFooter,
  Close: PopoverClose
}
