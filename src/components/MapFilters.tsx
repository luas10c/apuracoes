'use client'

import { useState } from 'react'

import { cn } from 'tailwind-variants'

import { Dropdown } from '#/components/Dropdown'
import { Scrollable } from '#/components/Scrollable'
import type { MapView } from '#/components/Map'

export type FilterCandidate = {
  sq: string
  nmu: string
  sg: string
  n: string
  pct: number
  photo: string
}

function CandidateAvatar({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
    return (
      <span
        aria-hidden="true"
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      >
        {initials || '?'}
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className="bg-woodsmoke-700 h-7 w-7 shrink-0 rounded-full object-cover"
    />
  )
}

const TABS: { value: MapView; label: string }[] = [
  { value: 'municipios', label: 'Municípios' },
  { value: 'estados', label: 'Estados' },
  { value: 'vantagem', label: 'Vantagem' },
  { value: 'apurado', label: 'Apurado' }
]

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

export function MapFilters({
  view,
  onViewChange,
  candidates,
  candidateSq,
  onCandidateChange,
  className
}: {
  view: MapView
  onViewChange: (view: MapView) => void
  candidates: FilterCandidate[]
  candidateSq: string | null
  onCandidateChange: (sq: string) => void
  className?: string
}) {
  const selected = candidates.find((c) => c.sq === candidateSq) ?? null

  return (
    <div className={cn('relative z-30 flex items-center gap-1', className)}>
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onViewChange(t.value)}
          aria-pressed={view === t.value}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
            view === t.value
              ? 'border-woodsmoke-600 bg-woodsmoke-800 text-woodsmoke-50 border'
              : 'text-woodsmoke-400 hover:text-woodsmoke-200'
          )}
        >
          {t.label}
        </button>
      ))}

      <Dropdown.Root>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            onClick={() => {
              if (view !== 'candidato') onViewChange('candidato')
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition-colors',
              view === 'candidato'
                ? 'border-woodsmoke-600 bg-woodsmoke-800 text-woodsmoke-50 border'
                : 'text-woodsmoke-400 hover:text-woodsmoke-200'
            )}
          >
            {selected && (
              <CandidateAvatar name={toTitle(selected.nmu)} src={selected.photo} />
            )}
            <span>{selected ? toTitle(selected.nmu) : 'Candidato'}</span>
            <span aria-hidden="true" className="text-[10px]">
              ⌄
            </span>
          </button>
        </Dropdown.Trigger>
        <Dropdown.Content
          side="bottom"
          align="start"
          className="w-72 p-1.5"
        >
          <Dropdown.Label>Candidatos · Presidente 2026</Dropdown.Label>
          <Scrollable aria-label="Candidatos" className="max-h-72">
          {candidates.map((c) => (
            <Dropdown.Item
              key={c.sq}
              asChild
              onSelect={() => onCandidateChange(c.sq)}
            >
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                  c.sq === candidateSq
                    ? 'bg-woodsmoke-800'
                    : 'hover:bg-woodsmoke-800/60'
                )}
              >
                <CandidateAvatar name={toTitle(c.nmu)} src={c.photo} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="text-woodsmoke-50 block truncate text-sm font-semibold">
                    {toTitle(c.nmu)}
                  </span>
                  <span className="text-woodsmoke-400 block text-[11px]">
                    {c.sg} {c.n}
                  </span>
                </span>
                <span className="text-woodsmoke-200 text-xs font-bold tabular-nums">
                  {c.pct.toFixed(1).replace('.', ',')}%
                </span>
              </button>
            </Dropdown.Item>
          ))}
          </Scrollable>
        </Dropdown.Content>
      </Dropdown.Root>
    </div>
  )
}
