'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'

import { motion } from 'motion/react'
import { cn } from 'tailwind-variants'

import { Map, type MunicipalChoropleth } from '#/components/Map'
import { Popover } from '#/components/Popover'

export type OfficeUfPopoverRow = {
  key: string
  name: string
  party: string
  accent: string
  photo: string
  votes: number | null
  pct: string
}

export type OfficeUfDatum = {
  /** Cor sólida da UF. */
  fill?: string
  /** Apurando (cor clara). */
  soft?: boolean
  /** Divisão diagonal [corBase, corOverlay] p/ 2 eleitos. */
  split?: [string, string] | null
  /** Fotos dos eleitos centralizadas na UF. */
  photos?: string[]
  /** Sub-rótulo sob a sigla (ex.: %). */
  sublabel?: string
  ufName: string
  sections: string
  rows: OfficeUfPopoverRow[]
  totals?: {
    validVotes: number | null
    brancos: number | null
    nulos: number | null
    abstencoes: number | null
  }
}

function fmtInt(v: number | null): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function RowPhoto({ name, src, large }: { name: string; src: string; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const cls = large ? 'h-10 w-10 text-xs' : 'h-8 w-8 text-[10px]'
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
        className={cn(
          'bg-woodsmoke-700 text-woodsmoke-200 flex shrink-0 items-center justify-center rounded-full font-bold',
          cls
        )}
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
      className={cn('bg-woodsmoke-700 shrink-0 rounded-full object-cover', cls)}
    />
  )
}

/** Popover da UF: eleitos com foto, votos e %. */
function OfficeUfCard({
  uf,
  ufName,
  sections,
  rows,
  totals
}: {
  uf: string
  ufName: string
  sections: string
  rows: OfficeUfPopoverRow[]
  totals?: OfficeUfDatum['totals']
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className="w-[300px] overflow-hidden"
    >
      <Popover.Header>
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="bg-woodsmoke-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          >
            {uf}
          </span>
          <div className="leading-tight">
            <Popover.Title className="text-[15px] font-bold text-white">
              {ufName}
            </Popover.Title>
            <Popover.Description>{sections}</Popover.Description>
          </div>
        </div>
      </Popover.Header>
      <Popover.Body className="space-y-2.5 pt-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5">
            <RowPhoto large name={r.name} src={r.photo} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-bold text-white">{r.name}</p>
              <p
                className="text-xs font-semibold"
                style={{ color: r.accent }}
              >
                {r.party}
              </p>
            </div>
            <p className="text-right leading-tight tabular-nums">
              <span className="block text-sm font-bold text-white">
                {r.pct}
              </span>
              <span className="text-woodsmoke-400 block text-[11px]">
                {fmtInt(r.votes)} votos
              </span>
            </p>
          </div>
        ))}
        {totals && (
          <div className="border-woodsmoke-800 grid grid-cols-2 gap-x-3 gap-y-1 border-t pt-2 text-[11px] tabular-nums">
            <p className="text-woodsmoke-400">
              Válidos{' '}
              <strong className="text-woodsmoke-200 font-semibold">
                {fmtInt(totals.validVotes)}
              </strong>
            </p>
            <p className="text-woodsmoke-400">
              Brancos{' '}
              <strong className="text-woodsmoke-200 font-semibold">
                {fmtInt(totals.brancos)}
              </strong>
            </p>
            <p className="text-woodsmoke-400">
              Nulos{' '}
              <strong className="text-woodsmoke-200 font-semibold">
                {fmtInt(totals.nulos)}
              </strong>
            </p>
            <p className="text-woodsmoke-400">
              Abstenções{' '}
              <strong className="text-woodsmoke-200 font-semibold">
                {fmtInt(totals.abstencoes)}
              </strong>
            </p>
          </div>
        )}
      </Popover.Body>
    </motion.div>
  )
}

/**
 * Mapa coroplético por UF reutilizável (Senado, Deputados…): pinta os
 * estados, centraliza as fotos dos eleitos e abre o popover da UF —
 * tudo sobre o componente Map (zoom, pan, badges, seleção).
 */
export function OfficeMap({
  data,
  legend,
  selected,
  onSelect,
  filters = null,
  municipalData = null,
  className
}: {
  data: Record<string, OfficeUfDatum>
  legend?: ReactNode
  selected?: string | null
  onSelect?: (selection: string | null) => void
  filters?: ReactNode
  municipalData?: MunicipalChoropleth | null
  className?: string
}) {
  const fills: Record<string, string> = {}
  const soft: string[] = []
  const split: Record<string, [string, string]> = {}
  const photos: Record<string, string[]> = {}
  const labels: Record<string, string> = {}
  for (const [uf, d] of Object.entries(data)) {
    if (d.fill) fills[uf] = d.fill
    if (d.soft) soft.push(uf)
    if (d.split) split[uf] = d.split
    if (d.photos && d.photos.length > 0) photos[uf] = d.photos
    if (d.sublabel) labels[uf] = d.sublabel
  }
  return (
    <Map
      mode="brasil"
      mapView="estados"
      results={null}
      selected={selected}
      onSelect={onSelect}
      className={className}
      filters={filters}
      choropleth={{ fills, soft, split, photos, labels, legend }}
      suppressPopover
      municipalChoropleth={municipalData}
      statePopover={(sigla) => {
        const d = data[sigla]
        if (!d || d.rows.length === 0) return null
        return (
          <OfficeUfCard
            uf={sigla}
            ufName={d.ufName}
            sections={d.sections}
            rows={d.rows}
            totals={d.totals}
          />
        )
      }}
    />
  )
}
