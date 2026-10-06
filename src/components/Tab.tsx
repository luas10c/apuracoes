'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type Ref
} from 'react'

import { cn } from 'tailwind-variants'

/* -------------------------------------------------------------------------- */
/*                                    Types                                   */
/* -------------------------------------------------------------------------- */

export type TabsOrientation = 'horizontal' | 'vertical'
export type TabsActivationMode = 'automatic' | 'manual'
export type TabsSize = 'sm' | 'md' | 'lg'

export type TabIndicatorVariant
  = | 'bottom'
    | 'underline'
    | 'top'
    | 'border'
    | 'outline'
    | 'pill'
    | 'fill'
    | 'left'
    | 'right'

export type IndicatorRect = {
  left: number
  top: number
  width: number
  height: number
  ready: boolean
}

type TabsContextValue = {
  value: string
  onSelect: (val: string) => void
  orientation: TabsOrientation
  activationMode: TabsActivationMode
  size: TabsSize
  baseId: string
  listRef: React.RefObject<HTMLDivElement | null>
  indicatorRect: IndicatorRect | null
  registerTab: (value: string, element: HTMLButtonElement | null) => void
  unregisterTab: (value: string) => void
  tabElementsRef: React.RefObject<Map<string, HTMLButtonElement>>
}

type TabItemContextValue = {
  value: string
  isActive: boolean
  disabled: boolean
}

/* -------------------------------------------------------------------------- */
/*                                   Context                                  */
/* -------------------------------------------------------------------------- */

const TabsContext = createContext<TabsContextValue | null>(null)
const TabItemContext = createContext<TabItemContextValue | null>(null)

export function useTabsContext() {
  const context = use(TabsContext)
  if (!context) {
    throw new Error('Componentes Tabs.* ou Tab.* devem ser utilizados dentro de um Tabs.Root ou Tab.Root')
  }
  return context
}

export function useOptionalTabItemContext() {
  return use(TabItemContext)
}

/* -------------------------------------------------------------------------- */
/*                                    Sizes                                   */
/* -------------------------------------------------------------------------- */

const itemSizes: Record<TabsSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4 text-sm',
  lg: 'h-10 px-5 text-base'
}

/* -------------------------------------------------------------------------- */
/*                                  Tabs.Root                                 */
/* -------------------------------------------------------------------------- */

export type TabsRootProps = {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  orientation?: TabsOrientation
  activationMode?: TabsActivationMode
  size?: TabsSize
  className?: string
  children: React.ReactNode
}

export function TabsRoot({
  value,
  defaultValue = '',
  onValueChange,
  orientation = 'horizontal',
  activationMode = 'automatic',
  size = 'md',
  className,
  children
}: TabsRootProps) {
  const generatedId = useId()
  const isControlled = value !== undefined
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const resolvedValue = isControlled ? (value ?? '') : uncontrolledValue

  const listRef = useRef<HTMLDivElement | null>(null)
  const tabElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map())
  const [indicatorRect, setIndicatorRect] = useState<IndicatorRect | null>(null)

  const handleSelect = useCallback(
    (nextValue: string) => {
      if (!isControlled) {
        setUncontrolledValue(nextValue)
      }
      onValueChange?.(nextValue)
    },
    [isControlled, onValueChange]
  )

  const registerTab = useCallback((tabValue: string, el: HTMLButtonElement | null) => {
    if (el) {
      tabElementsRef.current.set(tabValue, el)
    } else {
      tabElementsRef.current.delete(tabValue)
    }
  }, [])

  const unregisterTab = useCallback((tabValue: string) => {
    tabElementsRef.current.delete(tabValue)
  }, [])

  // Update active tab indicator position
  useEffect(() => {
    const listEl = listRef.current
    if (!listEl) return

    let rafId: number | null = null

    function measure() {
      const activeEl = tabElementsRef.current.get(resolvedValue)
      if (!activeEl || !listEl) {
        listEl?.style.removeProperty('--tab-indicator-left')
        listEl?.style.removeProperty('--tab-indicator-top')
        listEl?.style.removeProperty('--tab-indicator-width')
        listEl?.style.removeProperty('--tab-indicator-height')
        listEl?.style.setProperty('--tab-indicator-opacity', '0')
        rafId = requestAnimationFrame(() => {
          setIndicatorRect(null)
        })
        return
      }

      const listBounds = listEl.getBoundingClientRect()
      const tabBounds = activeEl.getBoundingClientRect()

      const left = tabBounds.left - listBounds.left + listEl.scrollLeft
      const top = tabBounds.top - listBounds.top + listEl.scrollTop
      const width = tabBounds.width
      const height = tabBounds.height

      listEl.style.setProperty('--tab-indicator-left', `${left}px`)
      listEl.style.setProperty('--tab-indicator-top', `${top}px`)
      listEl.style.setProperty('--tab-indicator-width', `${width}px`)
      listEl.style.setProperty('--tab-indicator-height', `${height}px`)
      listEl.style.setProperty('--tab-indicator-opacity', '1')

      rafId = requestAnimationFrame(() => {
        setIndicatorRect({ left, top, width, height, ready: true })
      })
    }

    measure()

    listEl.addEventListener('scroll', measure, { passive: true })

    const ro = new ResizeObserver(() => measure())
    ro.observe(listEl)
    for (const el of tabElementsRef.current.values()) {
      ro.observe(el)
    }

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId)
      listEl.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [resolvedValue])

  const contextValue = useMemo<TabsContextValue>(
    () => ({
      value: resolvedValue,
      onSelect: handleSelect,
      orientation,
      activationMode,
      size,
      baseId: generatedId,
      listRef,
      indicatorRect,
      registerTab,
      unregisterTab,
      tabElementsRef
    }),
    [
      resolvedValue,
      handleSelect,
      orientation,
      activationMode,
      size,
      generatedId,
      indicatorRect,
      registerTab,
      unregisterTab
    ]
  )

  return (
    <TabsContext value={contextValue}>
      <div
        data-orientation={orientation}
        className={cn(
          'flex w-full',
          orientation === 'horizontal' ? 'flex-col' : 'flex-row gap-4',
          className
        )}
      >
        {children}
      </div>
    </TabsContext>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Tabs.List                                 */
/* -------------------------------------------------------------------------- */

export type TabsListProps = ComponentProps<'div'> & {
  variant?: 'line' | 'pills' | 'bordered'
  wrap?: boolean
  ref?: Ref<HTMLDivElement>
}

export function TabsList({
  className,
  variant = 'line',
  wrap = false,
  children,
  onKeyDown,
  ref,
  style,
  ...props
}: TabsListProps) {
  const { orientation, activationMode, value, onSelect, listRef, tabElementsRef }
    = useTabsContext()

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    const tabMap = tabElementsRef.current
    const tabEntries = Array.from(tabMap.entries())
    const enabledEntries = tabEntries.filter(([, el]) => !el.disabled)
    if (enabledEntries.length === 0) return

    const currentIndex = enabledEntries.findIndex(([val]) => val === value)
    let targetIndex = -1

    const isHorizontal = orientation === 'horizontal'
    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown'
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp'

    if (e.key === nextKey) {
      e.preventDefault()
      targetIndex = (currentIndex + 1) % enabledEntries.length
    } else if (e.key === prevKey) {
      e.preventDefault()
      targetIndex = (currentIndex - 1 + enabledEntries.length) % enabledEntries.length
    } else if (e.key === 'Home') {
      e.preventDefault()
      targetIndex = 0
    } else if (e.key === 'End') {
      e.preventDefault()
      targetIndex = enabledEntries.length - 1
    }

    if (targetIndex >= 0) {
      const [nextValue, nextElement] = enabledEntries[targetIndex]
      nextElement.focus()
      if (activationMode === 'automatic') {
        onSelect(nextValue)
      }
    }
  }

  const setMergedRef = (node: HTMLDivElement | null) => {
    listRef.current = node
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ref.current = node
    }
  }

  return (
    <div
      ref={setMergedRef}
      role="tablist"
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={cn(
        'relative flex items-center',
        orientation === 'horizontal'
          ? (wrap
              ? 'flex-row flex-wrap'
              : 'flex-row flex-nowrap overflow-x-auto overflow-y-hidden')
          : 'flex-col items-stretch',
        variant === 'line'
        && (orientation === 'horizontal'
          ? 'border-b border-woodsmoke-700'
          : 'border-r border-woodsmoke-700'),
        variant === 'pills'
        && 'rounded-field border border-woodsmoke-700 bg-woodsmoke-800 p-1',
        variant === 'bordered'
        && 'rounded-field border border-woodsmoke-700 p-1',
        className
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                  Tabs.Item                                 */
/* -------------------------------------------------------------------------- */

export type TabsItemProps = Omit<ComponentProps<'button'>, 'value'> & {
  value: string
  disabled?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function TabsItem({
  value,
  disabled = false,
  className,
  children,
  onClick,
  onKeyDown,
  ref,
  ...props
}: TabsItemProps) {
  const {
    value: activeValue,
    onSelect,
    size,
    baseId,
    orientation,
    activationMode,
    registerTab,
    unregisterTab
  } = useTabsContext()

  const itemRef = useRef<HTMLButtonElement | null>(null)
  const isActive = activeValue === value
  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  const setMergedRef = (node: HTMLButtonElement | null) => {
    itemRef.current = node
    registerTab(value, node)
    if (typeof ref === 'function') {
      ref(node)
    } else if (ref) {
      ref.current = node
    }
  }

  useEffect(() => {
    return () => {
      unregisterTab(value)
    }
  }, [value, unregisterTab])

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return
    onClick?.(e)
    onSelect(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return

    if (activationMode === 'manual' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onSelect(value)
    }
  }

  const itemContextValue = useMemo<TabItemContextValue>(
    () => ({
      value,
      isActive,
      disabled
    }),
    [value, isActive, disabled]
  )

  return (
    <TabItemContext value={itemContextValue}>
      { }
      <button
        ref={setMergedRef}
        id={tabId}
        type="button"
        role="tab"
        aria-selected={isActive}
        aria-controls={panelId}
        tabIndex={isActive ? 0 : -1}
        disabled={disabled}
        data-state={isActive ? 'active' : 'inactive'}
        data-disabled={disabled ? '' : undefined}
        data-orientation={orientation}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative inline-flex cursor-pointer items-center justify-center font-medium whitespace-nowrap transition-colors outline-none select-none',
          'focus-visible:ring-2 focus-visible:ring-royal-purple-500 focus-visible:ring-offset-2 focus-visible:ring-offset-woodsmoke-900 focus-visible:outline-none',
          'disabled:pointer-events-none disabled:opacity-50',
          isActive
            ? 'text-woodsmoke-50 font-semibold'
            : 'text-woodsmoke-400 hover:text-woodsmoke-50',
          itemSizes[size],
          className
        )}
        {...props}
      >
        <span className="z-10 inline-flex items-center gap-2">{children}</span>
      </button>
    </TabItemContext>
  )
}

/* -------------------------------------------------------------------------- */
/*                               Tabs.Indicator                               */
/* -------------------------------------------------------------------------- */

export type TabsIndicatorProps = ComponentProps<'div'> & {
  'variant'?: TabIndicatorVariant
  'color'?: string
  'thickness'?: number | string
  'data-testid'?: string
  'ref'?: Ref<HTMLDivElement>
}

export function TabsIndicator({
  className,
  variant = 'bottom',
  color,
  thickness = 2,
  style,
  'data-testid': testId = 'tab-indicator',
  ref,
  ...props
}: TabsIndicatorProps) {
  const itemContext = useOptionalTabItemContext()
  const { indicatorRect } = useTabsContext()

  // Format thickness string
  const thicknessVal
    = typeof thickness === 'number' ? `${thickness}px` : thickness

  // Normalize variant aliases
  const isBottom = variant === 'bottom' || variant === 'underline'
  const isTop = variant === 'top'
  const isBorder = variant === 'border' || variant === 'outline'
  const isPill = variant === 'pill' || variant === 'fill'
  const isLeft = variant === 'left'
  const isRight = variant === 'right'

  // Resolve custom color styles
  const customColorStyle: CSSProperties = {}
  if (color) {
    if (isBorder) {
      customColorStyle.borderColor = color
    } else if (isPill) {
      customColorStyle.backgroundColor = color
    } else {
      // line / border variants
      customColorStyle.backgroundColor = color
      customColorStyle.borderColor = color
    }
  }

  // If rendered inside a Tabs.Item
  if (itemContext) {
    if (!itemContext.isActive) return null

    return (
      <div
        ref={ref}
        aria-hidden="true"
        data-tabs-indicator
        data-testid={testId}
        data-variant={variant}
        className={cn(
          'pointer-events-none absolute transition-all duration-200',
          isBottom && 'inset-x-0 bottom-0',
          isTop && 'inset-x-0 top-0',
          isBorder
          && 'inset-0 rounded-field border border-royal-purple-500',
          isPill
          && 'inset-0 rounded-field bg-royal-purple-500/20 border border-royal-purple-500/40 shadow-xs',
          isLeft && 'inset-y-0 left-0',
          isRight && 'inset-y-0 right-0',
          !color
          && (isBottom || isTop || isLeft || isRight)
          && 'bg-royal-purple-500',
          className
        )}
        style={{
          ...(isBottom || isTop ? { height: thicknessVal } : {}),
          ...(isLeft || isRight ? { width: thicknessVal } : {}),
          ...(isBorder ? { borderWidth: thicknessVal } : {}),
          ...customColorStyle,
          ...style
        }}
        {...props}
      />
    )
  }

  // If rendered inside Tabs.List (floating/sliding indicator)
  const isReady = indicatorRect?.ready ?? false

  return (
    <div
      ref={ref}
      aria-hidden="true"
      data-tabs-indicator
      data-testid={testId}
      data-variant={variant}
      className={cn(
        'pointer-events-none absolute transition-all duration-200 ease-in-out',
        !isReady && 'opacity-0',
        className
      )}
      style={{
        left: 'var(--tab-indicator-left, 0)',
        top: 'var(--tab-indicator-top, 0)',
        width: 'var(--tab-indicator-width, 0)',
        height: 'var(--tab-indicator-height, 0)',
        opacity: isReady ? 'var(--tab-indicator-opacity, 1)' : 0,
        ...style
      }}
      {...props}
    >
      <div
        className={cn(
          'relative size-full transition-all duration-200',
          isBottom && 'flex items-end justify-center',
          isTop && 'flex items-start justify-center',
          isBorder
          && 'rounded-field border border-royal-purple-500',
          isPill
          && 'rounded-field bg-royal-purple-500/20 border border-royal-purple-500/40 shadow-xs',
          isLeft && 'flex items-center justify-start',
          isRight && 'flex items-center justify-end'
        )}
        style={{
          ...(isBorder ? { borderWidth: thicknessVal } : {}),
          ...(isBorder || isPill ? customColorStyle : {})
        }}
      >
        {(isBottom || isTop) && (
          <div
            data-tabs-indicator-bar
            data-testid="tab-indicator-bar"
            className={cn(
              'w-full',
              !color && 'bg-royal-purple-500'
            )}
            style={{
              height: thicknessVal,
              ...customColorStyle
            }}
          />
        )}
        {(isLeft || isRight) && (
          <div
            data-tabs-indicator-bar
            data-testid="tab-indicator-bar"
            className={cn(
              'h-full',
              !color && 'bg-royal-purple-500'
            )}
            style={{
              width: thicknessVal,
              ...customColorStyle
            }}
          />
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                 Tabs.Panel                                 */
/* -------------------------------------------------------------------------- */

export type TabsPanelProps = ComponentProps<'div'> & {
  value: string
  keepMounted?: boolean
  ref?: Ref<HTMLDivElement>
}

export function TabsPanel({
  value,
  keepMounted = false,
  className,
  children,
  ref,
  ...props
}: TabsPanelProps) {
  const { value: activeValue, baseId, orientation } = useTabsContext()
  const isActive = activeValue === value
  const tabId = `${baseId}-tab-${value}`
  const panelId = `${baseId}-panel-${value}`

  if (!isActive && !keepMounted) {
    return null
  }

  return (
    <div
      ref={ref}
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      hidden={!isActive}
      data-state={isActive ? 'active' : 'inactive'}
      data-orientation={orientation}
      className={cn(
        'mt-3 focus-visible:ring-2 focus-visible:ring-royal-purple-500 focus-visible:outline-none',
        !isActive && 'hidden',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Exports                                  */
/* -------------------------------------------------------------------------- */

export const Tabs = {
  Root: TabsRoot,
  List: TabsList,
  Item: TabsItem,
  Indicator: TabsIndicator,
  Panel: TabsPanel,
  Pannel: TabsPanel
}

export const Tab = Tabs

export const TabRoot = TabsRoot
export const TabList = TabsList
export const TabItem = TabsItem
export const TabIndicator = TabsIndicator
export const TabPanel = TabsPanel
export const TabPannel = TabsPanel
export const TabsPannel = TabsPanel
