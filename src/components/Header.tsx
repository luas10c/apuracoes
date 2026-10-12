import { useEffect, useState } from 'react'

import type { ExteriorSnapshot, MapMode } from '#/components/Map'
import { CommandPalette } from '#/components/CommandPalette'
import type { CommandPaletteItemData } from '#/components/CommandPalette'
import type { TseSnapshot } from '#/components/Map'
import { OfficeTabs, type Office } from '#/components/OfficeTabs'
import {
  PLEITO_PRES_2T_PUBLICADO,
  turnoLabel,
  type Turno
} from '#/data/election'

const CARGO_LABEL: Record<Office, string> = {
  presidente: 'Presidente',
  governadores: 'Governadores',
  senado: 'Senado',
  deputados: 'Deputados'
}

function fmtHourMin(iso: string | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '–'
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtSections(pst: number | null | undefined): string {
  if (pst == null) return '–'
  const rounded = Math.round(pst * 10) / 10
  const str = Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',')
  return `${str}% das seções`
}

export function Header({
  handleSelected,
  items,
  results,
  loading,
  mode = 'brasil',
  exterior = null,
  searchQuery,
  onSearchQueryChange,
  searchOpen,
  onSearchOpenChange,
  onModeChange,
  cargo = 'presidente',
  onCargoChange,
  showSearch = true,
  turno = 1,
  onTurnoChange
}: {
  handleSelected: (value: string) => void
  items: CommandPaletteItemData[]
  results: TseSnapshot | null
  loading: boolean
  mode?: MapMode
  exterior?: ExteriorSnapshot | null
  searchQuery?: string
  onSearchQueryChange?: (query: string) => void
  searchOpen?: boolean
  onSearchOpenChange?: (open: boolean) => void
  onModeChange: (mode: MapMode) => void
  cargo?: Office
  onCargoChange?: (cargo: Office) => void
  showSearch?: boolean
  turno?: Turno
  onTurnoChange?: (turno: '1' | '2') => void
}) {
  const exteriorMode = mode === 'exterior'
  const showTurnoToggle =
    !!onTurnoChange && (cargo === 'presidente' || cargo === 'governadores')
  const turno2Enabled =
    cargo === 'governadores' || PLEITO_PRES_2T_PUBLICADO
  // Hora local só após o mount: evita mismatch de hidratação (SSR × cliente).
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  const sharePage = async () => {
    const url = window.location.href
    const data = { title: 'Apurações 2026', url }
    try {
      if (navigator.share) {
        await navigator.share(data)
      } else {
        await navigator.clipboard.writeText(url)
      }
    } catch {}
  }
  const toggleFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        void document.exitFullscreen()
      } else {
        void document.documentElement.requestFullscreen()
      }
    } catch {}
  }
  const updatedAt = exteriorMode
    ? exterior?.meta.atualizadoEm
    : results?.meta.atualizadoEm
  const sectionsPct = exteriorMode
    ? (exterior?.total.pst ?? null)
    : (results?.nacional.pst ?? null)
  return (
    <header className="py-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-woodsmoke-400 text-[11px]">
          TSE 2026 · {turnoLabel(turno)} · {CARGO_LABEL[cargo]}{exterior ? ' · Exterior' : ''}
        </p>
        <div className="flex items-center gap-2">
          <p
            aria-live="polite"
            className="text-woodsmoke-400 inline-flex items-center gap-1.5 text-[11px] tabular-nums"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
            </span>
            {(updatedAt || sectionsPct != null) && mounted && (
              <span className="text-woodsmoke-500">
                {updatedAt ? `Atualizado às ${fmtHourMin(updatedAt)}` : null}
                {updatedAt && sectionsPct != null ? ' · ' : null}
                {sectionsPct != null ? fmtSections(sectionsPct) : null}
              </span>
            )}
          </p>
          <button
            type="button"
            aria-pressed={exteriorMode}
            onClick={() => onModeChange(exteriorMode ? 'brasil' : 'exterior')}
            className={
              exteriorMode
                ? 'border-woodsmoke-600 bg-woodsmoke-800 text-woodsmoke-50 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold'
                : 'text-woodsmoke-400 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold hover:text-woodsmoke-200'
            }
          >
            <span aria-hidden="true">🌐</span>
            Exterior
          </button>
          <button
            type="button"
            aria-label="Compartilhar página"
            title="Compartilhar"
            onClick={sharePage}
            className="border-woodsmoke-700 text-woodsmoke-300 hidden h-7 w-7 items-center justify-center rounded-full border hover:text-woodsmoke-100 sm:inline-flex"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M10 2.5 13.5 6 10 9.5M13.5 6H6.5a3.5 3.5 0 0 0-3.5 3.5V13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Tela cheia"
            title="Tela cheia"
            onClick={toggleFullscreen}
            className="border-woodsmoke-700 text-woodsmoke-300 hidden h-7 w-7 items-center justify-center rounded-full border hover:text-woodsmoke-100 sm:inline-flex"
          >
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {onCargoChange && (
            <OfficeTabs value={cargo} onChange={onCargoChange} />
          )}
          {showTurnoToggle && (
            <div
              role="tablist"
              aria-label="Turno da apuração"
              className="border-woodsmoke-800 bg-woodsmoke-900/90 flex items-center gap-1 self-start rounded-full border px-1 py-1 shadow-xl backdrop-blur"
            >
              {(['1', '2'] as const).map((t) => {
                const active = turno === Number(t)
                const disabled = t === '2' && !turno2Enabled
                return (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    disabled={disabled}
                    title={disabled ? '2º turno a partir de 25/out' : undefined}
                    onClick={() => onTurnoChange(t)}
                    className={
                      active
                        ? 'border-woodsmoke-600 bg-woodsmoke-800 text-woodsmoke-50 rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap'
                        : 'text-woodsmoke-400 rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap hover:text-woodsmoke-200 disabled:opacity-40'
                    }
                  >
                    {t}º turno
                  </button>
                )
              })}
            </div>
          )}
        </div>
        {showSearch && (
        <CommandPalette.Root
        items={items}
        loading={loading}
        limit={8}
        onPick={handleSelected}
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        className="w-full lg:w-80 lg:shrink-0"
      >
        <CommandPalette.Input
          placeholder={
            exterior
              ? 'Buscar cidade, país, partido… (Ctrl K)'
              : 'Buscar município, cidade, partido… (Ctrl K)'
          }
        />
        <CommandPalette.Content className="lg:right-0 lg:left-auto lg:w-[26rem]">
          <CommandPalette.Empty>
            {exterior
              ? 'Nenhuma cidade encontrada para essa busca.'
              : 'Nenhum município encontrado para essa busca.'}
          </CommandPalette.Empty>
          <CommandPalette.Group heading={exterior ? 'Cidades no exterior' : 'Municípios'}>
            <CommandPalette.List />
          </CommandPalette.Group>
          <CommandPalette.Footer />
        </CommandPalette.Content>
      </CommandPalette.Root>
        )}
      </div>
    </header>
  )
}
