import type { ExteriorSnapshot, MapMode } from '#/components/Map'
import { CommandPalette } from '#/components/CommandPalette'
import type { CommandPaletteItemData } from '#/components/CommandPalette'
import type { TseSnapshot } from '#/components/Map'

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
  onSearchOpenChange
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
}) {
  const exteriorMode = mode === 'exterior'
  const updatedAt = exteriorMode
    ? exterior?.meta.atualizadoEm
    : results?.meta.atualizadoEm
  const sectionsPct = exteriorMode
    ? (exterior?.total.pst ?? null)
    : (results?.nacional.pst ?? null)
  return (
    <header className="py-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-woodsmoke-400 text-xs">
          TSE 2026 · 1º turno · Presidente{exterior ? ' · Exterior' : ''}
        </p>
        <p
          aria-live="polite"
          className="text-woodsmoke-400 inline-flex items-center gap-1.5 text-xs tabular-nums"
        >
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
          </span>
          {(updatedAt || sectionsPct != null) && (
            <span className="text-woodsmoke-500">
              {updatedAt ? `Atualizado às ${fmtHourMin(updatedAt)}` : null}
              {updatedAt && sectionsPct != null ? ' · ' : null}
              {sectionsPct != null ? fmtSections(sectionsPct) : null}
            </span>
          )}
        </p>
      </div>
      <CommandPalette.Root
        items={items}
        loading={loading}
        limit={8}
        onPick={handleSelected}
        query={searchQuery}
        onQueryChange={onSearchQueryChange}
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
      >
        <CommandPalette.Input
          placeholder={
            exterior
              ? 'Buscar cidade, país, partido… (Ctrl K)'
              : 'Buscar município, cidade, partido… (Ctrl K)'
          }
        />
        <CommandPalette.Content>
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
    </header>
  )
}
