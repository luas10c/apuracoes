'use client'

import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'

import { cn } from 'tailwind-variants'

import { Scrollable } from '#/components/Scrollable'
import { Slot } from '#/components/Slot'

/* -------------------------------------------------------------------------- */
/*                                    Tipos                                   */
/* -------------------------------------------------------------------------- */

export type CommandPaletteItemData = {
  /** Valor único devolvido em `onPick` (ex.: código IBGE do município). */
  value: string
  /** Rótulo principal (ex.: nome do município). */
  label: string
  /** Texto auxiliar à direita (ex.: UF). */
  meta?: string
  /** Selo colorido à direita (ex.: sigla do partido + %). */
  hint?: string
  /** Cor do selo (ex.: azul/vermelho do vencedor). */
  accent?: string
  /** Texto extra pesquisável (ex.: código, partido, número). */
  keywords?: string
}

export type CommandPaletteFilter = (
  items: CommandPaletteItemData[],
  query: string,
  limit: number
) => CommandPaletteItemData[]

type CommandPaletteContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  query: string
  setQuery: (query: string) => void
  visible: CommandPaletteItemData[]
  total: number
  activeIndex: number
  setActiveIndex: (index: number) => void
  loading: boolean
  baseId: string
  rootRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLInputElement | null>
  pick: (value: string) => void
}

const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null)

function useCommandPaletteContext(component: string) {
  const ctx = use(CommandPaletteContext)
  if (!ctx) {
    throw new Error(
      `${component} deve ser utilizado dentro de <CommandPalette.Root>`
    )
  }
  return ctx
}

/* -------------------------------------------------------------------------- */
/*                           Normalização + filtro                            */
/* -------------------------------------------------------------------------- */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Pontua o item contra a query: nome > início de palavra > contém. */
function scoreItem(
  item: CommandPaletteItemData,
  q: string
): number {
  const label = normalize(item.label)
  const keywords = normalize(
    `${item.meta ?? ''} ${item.hint ?? ''} ${item.keywords ?? ''}`
  )
  if (label === q) return 100
  if (label.startsWith(q)) return 80
  const words = label.split(/\s+/)
  if (words.some((w) => w.startsWith(q))) return 60
  if (label.includes(q)) return 40
  if (keywords.includes(q)) return 20
  return -1
}

export const filterCommandItems: CommandPaletteFilter = (
  items,
  query,
  limit
) => {
  const q = normalize(query.trim())
  if (!q) return items.slice(0, limit)
  return items
    .map((item) => ({ item, score: scoreItem(item, q) }))
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.item)
}

/* -------------------------------------------------------------------------- */
/*                            CommandPalette.Root                             */
/* -------------------------------------------------------------------------- */

export type CommandPaletteRootProps = {
  items: CommandPaletteItemData[]
  onPick?: (value: string) => void
  filter?: CommandPaletteFilter
  limit?: number
  loading?: boolean
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  query?: string
  defaultQuery?: string
  onQueryChange?: (query: string) => void
  /** Limpa a busca ao escolher um item. */
  clearOnPick?: boolean
  className?: string
  children: React.ReactNode
}

export function CommandPaletteRoot({
  items,
  onPick,
  filter = filterCommandItems,
  limit = 8,
  loading = false,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  query: controlledQuery,
  defaultQuery = '',
  onQueryChange,
  clearOnPick = true,
  className,
  children
}: CommandPaletteRootProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const [uncontrolledQuery, setUncontrolledQuery] = useState(defaultQuery)
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const isControlledOpen = controlledOpen !== undefined
  const open = isControlledOpen ? (controlledOpen ?? false) : uncontrolledOpen
  const isControlledQuery = controlledQuery !== undefined
  const query = isControlledQuery ? (controlledQuery ?? '') : uncontrolledQuery

  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlledOpen) setUncontrolledOpen(next)
      onOpenChange?.(next)
    },
    [isControlledOpen, onOpenChange]
  )

  const setQuery = useCallback(
    (next: string) => {
      if (!isControlledQuery) setUncontrolledQuery(next)
      onQueryChange?.(next)
      setActiveIndex(0)
    },
    [isControlledQuery, onQueryChange]
  )

  const visible = useMemo(
    () => filter(items, query, limit),
    [items, query, limit, filter]
  )

  const total = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return items.length
    return items.filter((item) => scoreItem(item, q) >= 0).length
  }, [items, query])

  const pick = useCallback(
    (value: string) => {
      onPick?.(value)
      if (clearOnPick) setQuery('')
      setOpen(false)
      inputRef.current?.blur()
    },
    [onPick, clearOnPick, setQuery, setOpen]
  )

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      const el = rootRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, setOpen])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({
      open,
      setOpen,
      query,
      setQuery,
      visible,
      total,
      activeIndex,
      setActiveIndex,
      loading,
      baseId,
      rootRef,
      inputRef,
      pick
    }),
    [
      open,
      setOpen,
      query,
      setQuery,
      visible,
      total,
      activeIndex,
      loading,
      baseId,
      pick
    ]
  )

  return (
    <CommandPaletteContext value={value}>
      <div ref={rootRef} className={cn('relative', className)}>
        {children}
      </div>
    </CommandPaletteContext>
  )
}

/* -------------------------------------------------------------------------- */
/*                            CommandPalette.Input                            */
/* -------------------------------------------------------------------------- */

export type CommandPaletteInputProps = React.ComponentProps<'input'> & {
  asChild?: boolean
}

export function CommandPaletteInput({
  asChild = false,
  onFocus,
  onChange,
  onKeyDown,
  placeholder = 'Buscar município, cidade, partido…',
  className,
  ...props
}: CommandPaletteInputProps) {
  const { query, setQuery, setOpen, baseId, inputRef } =
    useCommandPaletteContext('CommandPalette.Input')
  const Component = asChild ? Slot : 'input'

  // Ctrl/⌘+K foca a busca de qualquer lugar da página.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [inputRef, setOpen])

  return (
    <span
      className={cn(
        'border-woodsmoke-700 bg-woodsmoke-900 focus-within:border-woodsmoke-500 flex items-center gap-2 rounded-xl border px-3 transition-colors',
        className
      )}
    >
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="text-woodsmoke-500 shrink-0"
      >
        <circle
          cx="7"
          cy="7"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <line
          x1="10.5"
          y1="10.5"
          x2="14"
          y2="14"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <Component
        ref={inputRef as React.Ref<HTMLInputElement>}
        role="combobox"
        aria-expanded={undefined}
        aria-controls={`${baseId}-listbox`}
        aria-autocomplete="list"
        type="text"
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        onFocus={(e: React.FocusEvent<HTMLInputElement>) => {
          onFocus?.(e)
          setOpen(true)
        }}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          onChange?.(e)
          setQuery(e.target.value)
          setOpen(true)
        }}
        onKeyDown={onKeyDown}
        className="text-woodsmoke-100 placeholder:text-woodsmoke-500 h-10 w-full bg-transparent text-sm outline-none"
        {...props}
      />
      <kbd className="border-woodsmoke-700 bg-woodsmoke-800 text-woodsmoke-400 hidden shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] sm:block">
        Ctrl K
      </kbd>
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*                           CommandPalette.Content                           */
/* -------------------------------------------------------------------------- */

export type CommandPaletteContentProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function CommandPaletteContent({
  asChild = false,
  onKeyDown,
  className,
  children,
  ...props
}: CommandPaletteContentProps) {
  const {
    open,
    setOpen,
    visible,
    activeIndex,
    setActiveIndex,
    baseId,
    pick
  } = useCommandPaletteContext('CommandPalette.Content')
  const Component = asChild ? Slot : 'div'

  if (!open) return null

  return (
    <Component
      role="dialog"
      aria-label="Resultados da busca"
      onKeyDown={(e: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(e)
        if (e.defaultPrevented) return
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          setActiveIndex(
            visible.length === 0 ? 0 : (activeIndex + 1) % visible.length
          )
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setActiveIndex(
            visible.length === 0
              ? 0
              : (activeIndex - 1 + visible.length) % visible.length
          )
        } else if (e.key === 'Enter') {
          e.preventDefault()
          const item = visible[activeIndex]
          if (item) pick(item.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setOpen(false)
        }
      }}
      className={cn(
        'border-woodsmoke-700 bg-woodsmoke-900 absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-xl border shadow-2xl shadow-black/60',
        className
      )}
      {...props}
    >
      <div id={`${baseId}-listbox`}>{children}</div>
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                            CommandPalette.Group                            */
/* -------------------------------------------------------------------------- */

export type CommandPaletteGroupProps = React.ComponentProps<'div'> & {
  asChild?: boolean
  heading?: string
}

export function CommandPaletteGroup({
  asChild = false,
  heading,
  className,
  children,
  ...props
}: CommandPaletteGroupProps) {
  const Component = asChild ? Slot : 'div'
  return (
    <Component role="group" aria-label={heading} className={cn('py-1.5', className)} {...props}>
      {heading && (
        <p className="text-woodsmoke-500 px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider uppercase">
          {heading}
        </p>
      )}
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                            CommandPalette.List                             */
/* -------------------------------------------------------------------------- */

export type CommandPaletteListProps = Omit<
  React.ComponentProps<'ul'>,
  'children'
> & {
  renderItem?: (
    item: CommandPaletteItemData,
    state: { active: boolean; index: number }
  ) => React.ReactNode
}

export function CommandPaletteList({
  renderItem,
  className,
  ...props
}: CommandPaletteListProps) {
  const { visible, activeIndex, setActiveIndex, pick, baseId } =
    useCommandPaletteContext('CommandPalette.List')
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])

  useEffect(() => {
    rowRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return (
    <Scrollable
      aria-label="Municípios"
      className={cn('max-h-64', className)}
    >
      <ul
        role="listbox"
        aria-label="Municípios"
        aria-activedescendant={
          visible[activeIndex]
            ? `${baseId}-option-${visible[activeIndex].value}`
            : undefined
        }
        className="py-1"
        {...props}
      >
      {visible.map((item, index) => {
        const active = index === activeIndex
        return (
          <li
            key={item.value}
            id={`${baseId}-option-${item.value}`}
            ref={(node) => {
              rowRefs.current[index] = node
            }}
            role="option"
            aria-selected={active}
            data-active={active ? '' : undefined}
            onMouseEnter={() => setActiveIndex(index)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(item.value)}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
              active ? 'bg-woodsmoke-800' : 'bg-transparent'
            )}
          >
            {renderItem ? (
              renderItem(item, { active, index })
            ) : (
              <>
                <span className="text-woodsmoke-100 min-w-0 flex-1 truncate font-medium">
                  {item.label}
                </span>
                {item.meta && (
                  <span className="text-woodsmoke-400 shrink-0 text-xs font-semibold">
                    {item.meta}
                  </span>
                )}
                {item.hint && (
                  <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold tabular-nums"
                    style={
                      item.accent
                        ? { color: item.accent, backgroundColor: `${item.accent}1f` }
                        : undefined
                    }
                  >
                    {item.hint}
                  </span>
                )}
              </>
            )}
          </li>
        )
      })}
      </ul>
    </Scrollable>
  )
}

/* -------------------------------------------------------------------------- */
/*                            CommandPalette.Empty                            */
/* -------------------------------------------------------------------------- */

export type CommandPaletteEmptyProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function CommandPaletteEmpty({
  asChild = false,
  className,
  children = 'Nenhum município encontrado.',
  ...props
}: CommandPaletteEmptyProps) {
  const { visible, loading } = useCommandPaletteContext('CommandPalette.Empty')
  if (loading || visible.length > 0) return null
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      className={cn('text-woodsmoke-400 px-3 py-6 text-center text-sm', className)}
      {...props}
    >
      {children}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                           CommandPalette.Footer                            */
/* -------------------------------------------------------------------------- */

export type CommandPaletteFooterProps = React.ComponentProps<'div'> & {
  asChild?: boolean
}

export function CommandPaletteFooter({
  asChild = false,
  className,
  children,
  ...props
}: CommandPaletteFooterProps) {
  const { total, loading } = useCommandPaletteContext('CommandPalette.Footer')
  const Component = asChild ? Slot : 'div'
  return (
    <Component
      className={cn(
        'border-woodsmoke-800 text-woodsmoke-500 flex items-center justify-between border-t px-3 py-2 text-[11px]',
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <span>
            {loading
              ? 'Carregando dados…'
              : `${total} resultado${total === 1 ? '' : 's'}`}
          </span>
          <span className="hidden gap-2 sm:flex">
            <span>↑↓ navegar</span>
            <span>↵ selecionar</span>
            <span>esc fechar</span>
          </span>
        </>
      )}
    </Component>
  )
}

/* -------------------------------------------------------------------------- */
/*                                   Exports                                  */
/* -------------------------------------------------------------------------- */

export const CommandPalette = {
  Root: CommandPaletteRoot,
  Input: CommandPaletteInput,
  Content: CommandPaletteContent,
  Group: CommandPaletteGroup,
  List: CommandPaletteList,
  Empty: CommandPaletteEmpty,
  Footer: CommandPaletteFooter
}
