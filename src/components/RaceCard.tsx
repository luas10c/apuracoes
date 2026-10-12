'use client'

import { useState } from 'react'

import { cn } from 'tailwind-variants'

import { Scrollable } from '#/components/Scrollable'
import { partyColor } from '#/data/parties'
import { turnoLabel, type Turno } from '#/data/election'
import type { TseSnapshot } from '#/components/Map'

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct(v: number): string {
  return `${v.toFixed(2).replace('.', ',')}%`
}

function fmtPct1(v: number): string {
  return `${v.toFixed(1).replace('.', ',')}%`
}

function fmtInt(v: number | null): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function fmtMilhoes(votes: number): string {
  const mi = votes / 1_000_000
  return `${mi.toFixed(1).replace('.', ',')} milhões de votos`
}

function fmtHourMin(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`
}

function CandidateAvatar({
  name,
  src,
  size = 'sm'
}: {
  name: string
  src: string
  size?: 'sm' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const cls =
    size === 'lg'
      ? 'h-10 w-10 rounded-lg text-xs'
      : 'h-8 w-8 rounded-full text-[10px]'
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
          'bg-woodsmoke-700 text-woodsmoke-200 flex shrink-0 items-center justify-center font-bold',
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
      className={cn('bg-woodsmoke-700 shrink-0 object-cover', cls)}
    />
  )
}

/** Cor do partido pela sigla (módulo central `#/data/parties`). */
function accentOfSg(sg: string): string {
  return partyColor(sg)
}

/** Card da disputa nacional: resumo (top-2 lado a lado) ou lista completa. */
export function RaceCard({
  results,
  turno = 1,
  className
}: {
  results: TseSnapshot | null
  turno?: Turno
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)

  if (!results || results.nacional.top.length < 2) return null

  const [first, second] = results.nacional.top
  const vv = results.nacional.vv
  const pctOf = (vap: number) =>
    vv ? Math.round((vap / vv) * 10000) / 100 : 0
  const p1 = pctOf(first.vap)
  const p2 = pctOf(second.vap)
  // 1T: decide acima de 50% (vai ao 2º turno caso contrário).
  // 2T: só a maioria absoluta elege; abaixo disso, duelo em aberto.
  const decided = turno === 2 ? p1 > 50 : p1 >= 50

  const infoOf = (sq: string) => results.candidatos?.[sq]
  const i1 = infoOf(first.sq)
  const i2 = infoOf(second.sq)
  const photoOf = (sq: string) => results.meta.fotos.replace('{sqcand}', sq)
  const definedAt = fmtHourMin(
    (results.meta as Record<string, unknown>)?.atualizadoEm
  )

  const diffPts = Math.round(Math.abs(p1 - p2) * 100) / 100
  const diffVotes = Math.abs(first.vap - second.vap)

  const full = (results.nacional.full ?? []).map((c) => ({
    ...c,
    info: infoOf(c.sq),
    pct: pctOf(c.vap)
  }))
  const all = [...full].sort((a, b) => b.vap - a.vap)
  const rest = all.filter((c) => c.sq !== first.sq && c.sq !== second.sq)
  const visibleRest = rest.slice(0, 3)
  const hiddenRest = rest.slice(3)
  const hiddenPct = hiddenRest.reduce((s, c) => s + c.pct, 0)
  const totalCount = all.length

  if (expanded) {
    return (
      <section
        aria-label="Todos os candidatos a presidente"
        className={cn(
          'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3',
          className
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-woodsmoke-400 text-xs">
            Presidente · Brasil · {totalCount} candidatos
          </p>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-woodsmoke-200 text-xs font-semibold underline decoration-woodsmoke-600 underline-offset-2 hover:text-woodsmoke-100"
          >
            Voltar
          </button>
        </div>
        <Scrollable aria-label="Candidatos" className="mt-1 max-h-80">
          <ul className="divide-y divide-woodsmoke-800">
            {all.map((c) => (
              <li key={c.sq} className="flex items-center gap-2.5 py-1.5">
                <CandidateAvatar
                  name={toTitle(c.info?.nmu ?? '')}
                  src={photoOf(c.sq)}
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-woodsmoke-50 truncate text-sm font-bold">
                    {toTitle(c.info?.nmu ?? c.sq)}
                  </p>
                  <p
                    className="text-[11px] font-semibold"
                    style={{ color: accentOfSg(c.info?.sg ?? '') }}
                  >
                    {c.info?.sg} {c.info?.n}
                  </p>
                </div>
                <p className="text-right leading-tight tabular-nums">
                  <span className="text-woodsmoke-50 text-sm font-bold">
                    {fmtPct1(c.pct)}
                  </span>
                  <br />
                  <span className="text-woodsmoke-400 text-[11px]">
                    {fmtInt(c.vap)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Scrollable>
      </section>
    )
  }

  const duo = [
    { c: first, info: i1, pct: p1 },
    { c: second, info: i2, pct: p2 }
  ]
  const duoSum = p1 + p2
  const redShare = duoSum > 0 ? (p1 / duoSum) * 100 : 50

  return (
    <section
      aria-label="Disputa nacional para presidente"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3',
        className
      )}
    >
      <p className="flex items-center gap-2 text-[10px] font-semibold whitespace-nowrap">
        <span className="text-woodsmoke-500">Presidente · Brasil</span>
        <span className="text-woodsmoke-300 inline-flex items-center gap-2 rounded-full border border-woodsmoke-700 bg-woodsmoke-800 px-2.5 py-1">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-woodsmoke-100" />
          {decided ? `Decidido no ${turnoLabel(turno)}` : '2º turno'}
          {definedAt ? ` · definido às ${definedAt}` : null}
        </span>
      </p>

      <h2 className="mt-2 font-literata text-xl leading-tight font-normal">
        {!decided ? (
          <>
            <span style={{ color: accentOfSg(i1?.sg ?? '') }}>
              {toTitle(i1?.nmu ?? first.sq)}
            </span>{' '}
            <span className="text-woodsmoke-100 font-semibold">e</span>
            <br />
            <span style={{ color: accentOfSg(i2?.sg ?? '') }}>
              {toTitle(i2?.nmu ?? second.sq)}
            </span>{' '}
            <span className="text-woodsmoke-100 font-semibold">
              {turno === 2 ? 'disputam o 2º turno' : 'vão ao 2º turno'}
            </span>
          </>
        ) : (
          <>
            <span style={{ color: accentOfSg(i1?.sg ?? '') }}>
              {toTitle(i1?.nmu ?? first.sq)}
            </span>{' '}
            <span className="text-woodsmoke-100 font-semibold">
              eleito presidente
            </span>
          </>
        )}
      </h2>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {duo.map(({ c, info, pct }) => (
          <div key={c.sq}>
            <div className="flex items-center gap-2">
              <CandidateAvatar
                size="lg"
                name={toTitle(info?.nmu ?? '')}
                src={photoOf(c.sq)}
              />
              <div className="min-w-0 leading-tight">
                <p className="text-woodsmoke-50 truncate text-sm font-bold">
                  {toTitle(info?.nmu ?? c.sq)}
                </p>
                <p
                  className="text-[11px] font-semibold"
                  style={{ color: accentOfSg(info?.sg ?? '') }}
                >
                  {info?.sg} {info?.n}
                </p>
              </div>
            </div>
            <p className="mt-1.5 font-literata leading-none font-normal tabular-nums">
              <span
                className="text-3xl font-bold"
                style={{ color: accentOfSg(info?.sg ?? '') }}
              >
                {fmtPct(pct).replace('%', '')}
              </span>
              <span
                className="text-lg font-bold"
                style={{ color: accentOfSg(info?.sg ?? '') }}
              >
                %
              </span>
            </p>
            <p className="text-woodsmoke-400 mt-1 text-[11px] tabular-nums">
              {fmtInt(c.vap)} votos
            </p>
          </div>
        ))}
      </div>

      <div
        className="bg-woodsmoke-800 relative mt-2 flex h-1.5 overflow-visible rounded-full"
        role="img"
        aria-label={`Vantagem: ${i1?.sg} ${fmtPct(p1)} contra ${i2?.sg} ${fmtPct(p2)}`}
      >
        <div
          className="h-full rounded-l-full"
          style={{
            width: `${redShare}%`,
            backgroundColor: accentOfSg(i1?.sg ?? '')
          }}
        />
        <div
          className="h-full flex-1 rounded-r-full"
          style={{ backgroundColor: accentOfSg(i2?.sg ?? '') }}
        />
        <span
          aria-hidden="true"
          className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
          style={{ left: '50%' }}
        />
      </div>

      <dl className="mt-3 space-y-2 text-[11px]">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-woodsmoke-500">Diferença</dt>
          <dd className="text-woodsmoke-400 tabular-nums">
            {diffPts.toFixed(2).replace('.', ',')} pontos ·{' '}
            {fmtMilhoes(diffVotes)}
          </dd>
        </div>
        {turno === 1 && !decided && (
          <div className="flex items-center justify-between gap-2">
            <dt className="text-woodsmoke-500">2º turno</dt>
            <dd className="text-woodsmoke-400">
              Em 25 de outubro
            </dd>
          </div>
        )}
      </dl>

      <div className="border-woodsmoke-800 mt-2 border-t pt-1">
        {visibleRest.map((c) => (
          <div key={c.sq} className="flex items-center gap-2 py-1">
            <CandidateAvatar
              name={toTitle(c.info?.nmu ?? '')}
              src={photoOf(c.sq)}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-woodsmoke-50 truncate text-xs font-semibold">
                {toTitle(c.info?.nmu ?? c.sq)}
              </p>
              <p
                className="text-[11px] font-semibold"
                style={{ color: accentOfSg(c.info?.sg ?? '') }}
              >
                {c.info?.sg} {c.info?.n}
              </p>
            </div>
            <span className="text-woodsmoke-200 text-xs font-bold tabular-nums">
              {fmtPct1(c.pct)}
            </span>
          </div>
        ))}
        {hiddenRest.length > 0 && (
          <p className="text-woodsmoke-400 py-0.5 text-[11px]">
            Mais {hiddenRest.length}{' '}
            {hiddenRest.length === 1 ? 'candidatura soma' : 'candidaturas somam'}{' '}
            {fmtPct1(hiddenPct)}
          </p>
        )}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={expanded}
          className="text-woodsmoke-300 mt-0.5 text-[11px] font-semibold underline decoration-woodsmoke-600 underline-offset-2 hover:text-woodsmoke-100"
        >
          Todos os {totalCount} candidatos
        </button>
      </div>
    </section>
  )
}
