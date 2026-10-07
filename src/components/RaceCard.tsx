'use client'

import { useState } from 'react'

import { cn } from 'tailwind-variants'

import type { TseSnapshot } from '#/components/Map'

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct(v: number): string {
  return `${v.toFixed(2).replace('.', ',')}%`
}

function fmtInt(v: number | null): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function fmtMilhoes(votes: number): string {
  const mi = votes / 1_000_000
  return `${mi.toFixed(1).replace('.', ',')} milhões de votos`
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
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
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
      className="bg-woodsmoke-700 h-9 w-9 shrink-0 rounded-full object-cover"
    />
  )
}

function accentOfSg(sg: string): string {
  if (sg === 'PL') return '#5b8def'
  if (sg === 'PT') return '#f87171'
  return '#9ca3af'
}

/**
 * Card da disputa nacional: 2º turno, top-2 com barras, diferença,
 * collapse dos demais candidatos e totais (tudo do agregado TSE ao vivo).
 */
export function RaceCard({
  results,
  className
}: {
  results: TseSnapshot | null
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

  const infoOf = (sq: string) => results.candidatos?.[sq]
  const i1 = infoOf(first.sq)
  const i2 = infoOf(second.sq)

  const diffPts = Math.round(Math.abs(p1 - p2) * 100) / 100
  const diffVotes = Math.abs(first.vap - second.vap)

  const rest = (results.nacional.full ?? [])
    .filter((c) => c.sq !== first.sq && c.sq !== second.sq)
    .map((c) => ({ ...c, info: infoOf(c.sq), pct: pctOf(c.vap) }))
  const visibleRest = expanded ? rest : rest.slice(0, 3)
  const hiddenRest = expanded ? [] : rest.slice(3)
  const hiddenPct = hiddenRest.reduce((s, c) => s + c.pct, 0)
  const totalCount =
    (results.nacional.full ?? results.nacional.top.map((c) => ({ sq: c.sq, vap: 0 }))).length

  return (
    <section
      aria-label="Disputa nacional para presidente"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-2xl border p-4',
        className
      )}
    >
      <p className="text-woodsmoke-300 inline-flex items-center gap-2 rounded-full border border-woodsmoke-700 bg-woodsmoke-800 px-2.5 py-1 text-[11px] font-semibold">
        Presidente · Brasil
        <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-woodsmoke-100" />
        {p1 < 50 ? '2º turno' : 'Decidido no 1º turno'}
      </p>

      <h2 className="mt-2 text-xl leading-snug font-bold">
        {p1 < 50 ? (
          <>
            <span style={{ color: accentOfSg(i1?.sg ?? '') }}>
              {toTitle(i1?.nmu ?? first.sq)}
            </span>{' '}
            <span className="text-woodsmoke-100 font-semibold">e</span>{' '}
            <br />
            <span style={{ color: accentOfSg(i2?.sg ?? '') }}>
              {toTitle(i2?.nmu ?? second.sq)}
            </span>{' '}
            <span className="text-woodsmoke-100 font-semibold">vão ao 2º turno</span>
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

      <ul className="mt-3 space-y-3">
        {[
          { c: first, info: i1, pct: p1 },
          { c: second, info: i2, pct: p2 }
        ].map(({ c, info, pct }) => (
          <li key={c.sq}>
            <div className="flex items-center gap-2.5">
              <CandidateAvatar
                name={toTitle(info?.nmu ?? '')}
                src={results.meta.fotos.replace('{sqcand}', c.sq)}
              />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-woodsmoke-50 truncate text-sm font-bold">
                  {toTitle(info?.nmu ?? c.sq)}
                </p>
                <p
                  className="text-xs font-semibold"
                  style={{ color: accentOfSg(info?.sg ?? '') }}
                >
                  {info?.sg} {info?.n}
                </p>
              </div>
              <p className="text-right leading-none tabular-nums">
                <span className="text-woodsmoke-50 text-2xl font-bold">
                  {fmtPct(pct).replace('%', '')}
                </span>
                <span className="text-woodsmoke-400 text-sm font-bold">%</span>
              </p>
            </div>
            <p className="text-woodsmoke-400 mt-0.5 text-right text-[11px] tabular-nums">
              {fmtInt(c.vap)} votos
            </p>
            <div
              className="bg-woodsmoke-800 mt-1 h-1.5 overflow-hidden rounded-full"
              role="img"
              aria-label={`${info?.sg} ${fmtPct(pct)} dos votos válidos`}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, pct))}%`,
                  backgroundColor: accentOfSg(info?.sg ?? '')
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-woodsmoke-400 mt-3 text-[11px] tabular-nums">
        Diferença{' '}
        <strong className="text-woodsmoke-200">
          {diffPts.toFixed(2).replace('.', ',')} pontos · {fmtMilhoes(diffVotes)}
        </strong>
      </p>
      {p1 < 50 && (
        <p className="text-woodsmoke-400 mt-1 text-[11px]">
          2º turno <strong className="text-woodsmoke-200">Em 25 de outubro</strong>
        </p>
      )}
      <div className="border-woodsmoke-800 mt-3 space-y-1 border-t pt-2">
        {visibleRest.map((c) => (
          <div key={c.sq} className="flex items-center gap-2.5 py-1">
            <CandidateAvatar
              name={toTitle(c.info?.nmu ?? '')}
              src={results.meta.fotos.replace('{sqcand}', c.sq)}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-woodsmoke-50 truncate text-sm font-semibold">
                {toTitle(c.info?.nmu ?? c.sq)}
              </p>
              <p className="text-woodsmoke-400 text-[11px]">
                {c.info?.sg} {c.info?.n}
              </p>
            </div>
            <span className="text-woodsmoke-200 text-xs font-bold tabular-nums">
              {c.pct.toFixed(1).replace('.', ',')}%
            </span>
          </div>
        ))}
        {!expanded && hiddenRest.length > 0 && (
          <p className="text-woodsmoke-400 py-1 text-[11px]">
            Mais {hiddenRest.length} candidatos somam{' '}
            {hiddenPct.toFixed(1).replace('.', ',')}%
          </p>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="text-woodsmoke-300 text-xs font-semibold underline decoration-woodsmoke-600 underline-offset-2 hover:text-woodsmoke-100"
        >
          {expanded
            ? 'Mostrar menos'
            : `Todos os ${totalCount} candidatos`}
        </button>
      </div>

      <RaceTotals results={results} />
    </section>
  )
}

function RaceTotals({ results }: { results: TseSnapshot }) {
  const n = results.nacional
  const tv = n.tv ?? (n.vv ?? 0) + (n.vb ?? 0) + (n.vn ?? 0)
  const comparecimento =
    n.te != null && n.te > 0 ? (tv / n.te) * 100 : null
  const brancosNulos =
    tv > 0 ? (((n.vb ?? 0) + (n.vn ?? 0)) / tv) * 100 : null
  const cells: { label: string; text: string }[] = [
    { label: 'Votos válidos', text: fmtInt(n.vv) },
    {
      label: 'Comparecimento',
      text:
        comparecimento != null
          ? `${comparecimento.toFixed(1).replace('.', ',')}%`
          : '–'
    },
    {
      label: 'Brancos e nulos',
      text:
        brancosNulos != null
          ? `${brancosNulos.toFixed(1).replace('.', ',')}%`
          : '–'
    }
  ]
  return (
    <dl className="border-woodsmoke-800 mt-3 grid grid-cols-3 gap-2 border-t pt-2.5">
      {cells.map((c) => (
        <div key={c.label}>
          <dt className="text-woodsmoke-400 text-[11px]">{c.label}</dt>
          <dd className="text-woodsmoke-50 text-sm font-bold tabular-nums">
            {c.text}
          </dd>
        </div>
      ))}
    </dl>
  )
}
