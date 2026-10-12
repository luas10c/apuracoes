'use client'

import { useMemo, useState } from 'react'

import { cn } from 'tailwind-variants'

import type { ExteriorPlace, ExteriorSnapshot } from '#/components/Map'
import { Scrollable } from '#/components/Scrollable'
import { countryCode } from '#/data/countries'
import { partyColor } from '#/data/parties'

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct1(vap: number, vv: number | null): string {
  if (!vv || vv <= 0) return '–'
  return `${((vap / vv) * 100).toFixed(1).replace('.', ',')}%`
}

function fmtMil(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`
  return `${Math.round(v / 1000)} mil`
}

type CountryRow = {
  country: string
  iso: string
  cities: number
  eleitores: number
  topSg: string
  topSq: string
  topVap: number
  vv: number
}

/** Card "Por país": ranking de países do voto no exterior. */
export function CountriesCard({
  exterior,
  places,
  className
}: {
  exterior: ExteriorSnapshot | null
  places: ExteriorPlace[]
  className?: string
}) {
  const rows = useMemo<CountryRow[]>(() => {
    if (!exterior || places.length === 0) return []
    const countryOf = new Map(places.map((p) => [p.tse, p.country] as const))
    const byCountry = new Map<
      string,
      { cities: Set<string>; eleitores: number; vv: number; vapBySq: Map<string, { vap: number; sg: string; sq: string }> }
    >()
    for (const [tse, c] of Object.entries(exterior.cidades)) {
      const country = countryOf.get(tse)
      if (!country || !c || c.top.length === 0) continue
      let g = byCountry.get(country)
      if (!g) {
        g = { cities: new Set(), eleitores: 0, vv: 0, vapBySq: new Map() }
        byCountry.set(country, g)
      }
      g.cities.add(tse)
      g.eleitores += c.te ?? 0
      g.vv += c.vv ?? 0
      for (const t of c.top) {
        const s = g.vapBySq.get(t.sq) ?? { vap: 0, sg: t.sg, sq: t.sq }
        s.vap += t.vap
        g.vapBySq.set(t.sq, s)
      }
    }
    const out: CountryRow[] = []
    for (const [country, g] of byCountry) {
      const top = [...g.vapBySq.values()].sort((a, b) => b.vap - a.vap)[0]
      if (!top) continue
      out.push({
        country,
        iso: countryCode(country),
        cities: g.cities.size,
        eleitores: g.eleitores,
        topSg: top.sg,
        topSq: top.sq,
        topVap: top.vap,
        vv: g.vv
      })
    }
    return out.sort((a, b) => b.eleitores - a.eleitores)
  }, [exterior, places])

  if (!exterior) {
    return (
      <p className="text-woodsmoke-400 py-8 text-center text-sm">
        Carregando países…
      </p>
    )
  }

  return (
    <section
      aria-label="Voto por país"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 flex min-h-0 flex-1 flex-col rounded-xl border p-3',
        className
      )}
    >
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="text-woodsmoke-50 text-sm font-bold">Por país</h2>
        <p className="text-woodsmoke-400 text-[11px] tabular-nums">
          {rows.length} países
        </p>
      </div>
      <Scrollable aria-label="Países" className="mt-1 min-h-0 flex-1">
        <ul className="divide-y divide-woodsmoke-800">
          {rows.map((r) => (
            <li key={r.country} className="flex items-center gap-2.5 py-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
                style={{ backgroundColor: partyColor(r.topSg) }}
              >
                {r.iso}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-woodsmoke-50 truncate text-[13px] font-semibold">
                  {r.country === 'EUA' ? 'Estados Unidos' : toTitle(r.country)}
                </p>
                <p className="text-woodsmoke-400 text-[11px] tabular-nums">
                  {r.cities} {r.cities === 1 ? 'cidade' : 'cidades'} ·{' '}
                  {fmtMil(r.eleitores)} eleitores
                </p>
              </div>
              <CountryWinner
                name={r.country}
                src={exterior.meta.fotos.replace('{sqcand}', r.topSq)}
              />
              <span
                className="shrink-0 text-sm font-bold tabular-nums"
                style={{ color: partyColor(r.topSg) }}
              >
                {fmtPct1(r.topVap, r.vv)}
              </span>
            </li>
          ))}
        </ul>
      </Scrollable>
    </section>
  )
}

function CountryWinner({ name, src }: { name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
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
