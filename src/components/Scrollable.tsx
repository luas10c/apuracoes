'use client'

import { useRef, useEffect } from 'react'

import { OverlayScrollbars, ClickScrollPlugin } from 'overlayscrollbars'
import 'overlayscrollbars/overlayscrollbars.css'

import { Slot } from '#/components/atoms/slot'

import { cn } from '#/utils/cn'

// OverlayScrollbars plugins are registered globally and should only be set up once.
OverlayScrollbars.plugin(ClickScrollPlugin)

export function Scrollable({
  asChild,
  className,
  children,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & {
  asChild?: boolean
  orientation?: 'vertical' | 'horizontal' | 'both'
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = ref.current

    if (!element) return

    const overflowX = orientation === 'vertical' ? 'hidden' : 'scroll'
    const overflowY = orientation === 'horizontal' ? 'hidden' : 'scroll'

    const instance = OverlayScrollbars(element, {
      scrollbars: {
        theme: 'os-theme-dark scrollbar',
        autoHide: 'scroll',
        autoHideDelay: 900,
        autoHideSuspend: false,
        clickScroll: true
      },
      paddingAbsolute: false,
      overflow: {
        x: overflowX,
        y: overflowY
      }
    })

    return () => {
      instance.destroy()
    }
  }, [orientation])

  const Component = asChild ? Slot : 'div'

  return (
    <Component
      ref={ref}
      role="region"
      aria-label="Scrollable"
      className={cn('relative isolate min-h-0 min-w-0 overflow-hidden pr-1', className, 'overflow-hidden')}
      {...props}
    >
      <div className="min-h-0 min-w-0">{children}</div>
    </Component>
  )
}
