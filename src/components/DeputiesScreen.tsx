'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from 'tailwind-variants'

import { OfficeMap, type OfficeUfDatum } from '#/components/OfficeMap'
import { Scrollable } from '#/components/Scrollable'
import { UF_NAMES } from '#/components/RegionCard'
import { partyBloc, partyVivid, PARTIES } from '#/data/parties'

export type DeputyCandidate = {
  sq: string
  nmu: string
  sg: string
  n: string
  vap: number
  elected: boolean
  uf: string
}

export type DeputiesCargoData = {
  vagas: number | null
  totalEleitos: number
  totalCandidatos: number
  partidos: { sg: string; eleitos: number }[]
  ufs: Record<
    string,
    {
      seats: { sg: string; eleitos: number }[]
      top: DeputyCandidate[]
      totalEleitos: number
      totalCandidatos: number
      vv: number | null
      sectionsPct: number | null
    }
  >
  ranking: DeputyCandidate[]
  all?: DeputyCandidate[]
}

export type DeputiesSnapshot = {
  meta: { fotos: string; atualizadoEm: string }
  federal: DeputiesCargoData
  estadual: DeputiesCargoData
}

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtInt(v: number | null | undefined): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function Avatar({ name, src, large }: { name: string; src: string; large?: boolean }) {
  const [failed, setFailed] = useState(false)
  const cls = large ? 'h-9 w-9 text-xs' : 'h-8 w-8 text-[10px]'
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

const BLOC_ORDER = ['esquerda', 'centro', 'direita'] as const
const BLOC_COLOR: Record<string, string> = {
  esquerda: '#ef4444',
  centro: '#a8a29e',
  direita: '#3b82f6'
}

/** Hemiciclo: 1 ponto por eleito, ordenado por bloco. */
export function Hemicycle({ seats }: { seats: { sg: string; color: string }[] }) {
  const dots = useMemo(() => {
    const total = seats.length
    if (total === 0) return []
    const ROWS = 11
    const R0 = 48
    const R1 = 128
    const radii = Array.from(
      { length: ROWS },
      (_, i) => R0 + ((R1 - R0) * i) / (ROWS - 1)
    )
    const weight = radii.reduce((s, r) => s + r, 0)
    const counts = radii.map((r) => Math.max(1, Math.round((total * r) / weight)))
    let diff = total - counts.reduce((s, v) => s + v, 0)
    let i = ROWS - 1
    while (diff !== 0) {
      counts[i % ROWS] += Math.sign(diff)
      diff -= Math.sign(diff)
      i += diff > 0 ? -1 : 1
    }
    const pts: { x: number; y: number; color: string }[] = []
    const CX = 150
    const CY = 148
    let k = 0
    counts.forEach((n, ri) => {
      for (let j = 0; j < n && k < total; j++, k++) {
        const theta = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (n - 1)
        pts.push({
          x: CX + radii[ri] * Math.cos(theta),
          y: CY - radii[ri] * Math.sin(theta),
          color: seats[k].color
        })
      }
    })
    return pts
  }, [seats])
  return (
    <svg
      viewBox="0 0 300 152"
      role="img"
      aria-label={`${seats.length} eleitos por partido`}
      className="block w-full"
    >
      {dots.map((d, idx) => (
        <circle key={idx} cx={d.x} cy={d.y} r={3.1} fill={d.color} />
      ))}
    </svg>
  )
}

/** Tela Deputados: composição, mapa por UF e mais votados. */
export function DeputiesScreen({
  data,
  loading,
  senators
}: {
  data: {
    meta: { fotos: string }
    federal: DeputiesCargoData
    estadual: DeputiesCargoData
  } | null
  loading: boolean
  senators: ReactNode
}) {
  const [level, setLevel] = useState<'federal' | 'estadual'>('federal')
  const [filterUf, setFilterUf] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [fullData, setFullData] = useState<{
    federal: DeputiesCargoData
    estadual: DeputiesCargoData
  } | null>(null)
  const [loadingFull, setLoadingFull] = useState(false)
  const [fullQuery, setFullQuery] = useState('')

  const openFull = () => {
    setShowAll(true)
    if (fullData || loadingFull) return
    setLoadingFull(true)
    fetch(`/api/elections/deputies?full=1`, { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((snap: { federal: DeputiesCargoData; estadual: DeputiesCargoData }) => {
        setFullData(snap)
        setLoadingFull(false)
      })
      .catch(() => setLoadingFull(false))
  }

  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const fullFiltered = useMemo(() => {
    const base = fullData?.[level]?.all ?? []
    const q = norm(fullQuery.trim())
    if (!q) return base.slice(0, 500)
    return base
      .filter(
        (c) =>
          norm(c.nmu).includes(q) ||
          norm(c.sg).includes(q) ||
          norm(c.uf).includes(q) ||
          c.n.includes(q)
      )
      .slice(0, 500)
  }, [fullData, fullQuery, level])

  if (!data) {
    return (
      <p className="text-woodsmoke-400 py-8 text-center text-sm">
        {loading ? 'Carregando deputados…' : 'TSE indisponível no momento.'}
      </p>
    )
  }
  const cargo = data[level]
  const metaFotos = data.meta.fotos
  const isFederal = level === 'federal'
  const vagas = cargo.vagas ?? cargo.totalEleitos
  const ordered = [...cargo.partidos].sort((a, b) => {
    const bo =
      BLOC_ORDER.indexOf(partyBloc(a.sg)) - BLOC_ORDER.indexOf(partyBloc(b.sg))
    return bo !== 0 ? bo : b.eleitos - a.eleitos
  })
  const colored = ordered.flatMap((p) =>
    Array.from({ length: p.eleitos }, () => ({
      sg: p.sg,
      color: partyVivid(p.sg)
    }))
  )
  const blocCount: Record<string, number> = { esquerda: 0, centro: 0, direita: 0 }
  for (const p of cargo.partidos) blocCount[partyBloc(p.sg)] += p.eleitos
  const maioria = Math.floor(vagas / 2) + 1
  const topParties = cargo.partidos.slice(0, 5)
  const outrosSeats = cargo.partidos.slice(5).reduce((s, p) => s + p.eleitos, 0)
  const officeData: Record<string, OfficeUfDatum> = {}
  const stateWins: Record<string, number> = {}
  for (const [uf, g] of Object.entries(cargo.ufs)) {
    const top = g.seats[0]
    if (top) stateWins[top.sg] = (stateWins[top.sg] ?? 0) + 1
    officeData[uf] = {
      fill: top ? partyVivid(top.sg) : undefined,
      soft: (g.sectionsPct ?? 0) < 100,
      split: null,
      photos: [],
      ufName: UF_NAMES[uf] ?? uf,
      sections:
        g.sectionsPct != null
          ? `${Math.round(g.sectionsPct)}% das seções`
          : 'Apuração',
      rows: g.top.map((c) => ({
        key: c.sq,
        name: toTitle(c.nmu),
        party: `${c.sg} ${c.n}`.trim(),
        accent: partyVivid(c.sg),
        photo: photoOf(c),
        votes: c.vap,
        pct:
          g.vv && g.vv > 0
            ? `${((c.vap / g.vv) * 100).toFixed(2).replace('.', ',')}%`
            : '–'
      }))
    }
  }
  function photoOf(c: DeputyCandidate) {
    return String(metaFotos)
      .replace('{uf}', c.uf.toLowerCase())
      .replace('{sqcand}', c.sq)
  }
  const stateRanking = Object.entries(stateWins).sort((a, b) => b[1] - a[1])
  const stateTopParties = stateRanking.slice(0, 4)
  const stateOutros = stateRanking.slice(4).reduce((s, [, v]) => s + v, 0)
  const list = filterUf
    ? (cargo.ufs[filterUf]?.top ?? [])
    : cargo.ranking.slice(0, 7)

  return (
    <div className="grid flex-1 items-start gap-3 xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-stretch">
      <div className="xl:min-h-0 xl:overflow-hidden">
        <Scrollable aria-label="Composição" className="xl:h-full">
          <div className="space-y-3">
        <section
          aria-label={isFederal ? 'Câmara dos Deputados' : 'Assembleias Legislativas'}
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-woodsmoke-50 text-sm font-bold">
              {isFederal ? 'Câmara dos Deputados' : 'Assembleias Legislativas'}
            </h2>
            {isFederal && (
              <p className="text-woodsmoke-400 text-[11px] tabular-nums">
                {vagas} vagas
              </p>
            )}
          </div>
          <div
            role="tablist"
            aria-label="Esfera"
            className="border-woodsmoke-800 bg-woodsmoke-900 mt-2 flex items-center gap-1 rounded-full border p-0.5"
          >
            {(
              [
                { value: 'federal', label: 'Federais' },
                { value: 'estadual', label: 'Estaduais' }
              ] as const
            ).map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={level === t.value}
                onClick={() => {
                  setLevel(t.value)
                  setFilterUf(null)
                }}
                className={cn(
                  'flex-1 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
                  level === t.value
                    ? 'bg-woodsmoke-700 text-woodsmoke-50'
                    : 'text-woodsmoke-400 hover:text-woodsmoke-200'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 flex items-baseline justify-between text-xs tabular-nums">
            <span className="text-woodsmoke-400">
              Esquerda{' '}
              <strong className="text-woodsmoke-50 text-sm">
                {blocCount.esquerda}
              </strong>
            </span>
            <span className="text-woodsmoke-400">
              Centrão{' '}
              <strong className="text-woodsmoke-50 text-sm">
                {blocCount.centro}
              </strong>
            </span>
            <span className="text-woodsmoke-400">
              <strong className="text-woodsmoke-50 text-sm">
                {blocCount.direita}
              </strong>{' '}
              Direita
            </span>
          </p>
          <div
            className="relative mt-1 flex h-1.5 overflow-visible rounded-full"
            role="img"
            aria-label={`Esquerda ${blocCount.esquerda}, Centrão ${blocCount.centro}, Direita ${blocCount.direita}`}
          >
            {BLOC_ORDER.map((b) => (
              <div
                key={b}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{
                  width: `${(blocCount[b] / Math.max(1, cargo.totalEleitos)) * 100}%`,
                  backgroundColor: BLOC_COLOR[b]
                }}
              />
            ))}
            <span
              aria-hidden="true"
              className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
              style={{ left: `${(maioria / Math.max(1, vagas)) * 100}%` }}
            />
          </div>
          <p className="text-woodsmoke-500 mt-1 text-center text-[10px]">
            maioria {maioria} · Centrão:{' '}
            {cargo.partidos
              .filter((p) => partyBloc(p.sg) === 'centro')
              .slice(0, 5)
              .map((p) => PARTIES[p.sg.trim().toUpperCase()]?.nome ?? p.sg)
              .join(', ')}
          </p>
          <div className="relative mt-1">
            <Hemicycle seats={colored} />
            <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center leading-none tabular-nums">
              <span className="text-woodsmoke-50 block text-2xl font-bold">
                {cargo.totalEleitos}
              </span>
              <span className="text-woodsmoke-400 text-[10px]">
                eleitos de {vagas}
              </span>
            </p>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold tabular-nums">
            {topParties.map((p) => (
              <span
                key={p.sg}
                className="inline-flex items-center gap-1 text-woodsmoke-200"
              >
                <i
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: partyVivid(p.sg) }}
                />
                {PARTIES[p.sg.trim().toUpperCase()]?.sigla ?? p.sg}{' '}
                {p.eleitos}
              </span>
            ))}
            {outrosSeats > 0 && (
              <span className="text-woodsmoke-400">
                Outros {outrosSeats}
              </span>
            )}
          </p>
        </section>
        <section
          aria-label="Mais votados"
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-woodsmoke-50 text-sm font-bold">
              Mais votados{filterUf ? ` · ${filterUf}` : ' do Brasil'}
            </h2>
            {filterUf ? (
              <button
                type="button"
                onClick={() => setFilterUf(null)}
                className="text-woodsmoke-300 text-[11px] font-semibold underline decoration-woodsmoke-600 underline-offset-2 hover:text-woodsmoke-100"
              >
                Ver todos
              </button>
            ) : (
              <p className="text-woodsmoke-400 text-[11px] tabular-nums">
                {cargo.totalEleitos} eleitos
              </p>
            )}
          </div>
          <Scrollable
            aria-label="Mais votados"
            className="mt-1 max-h-72 xl:max-h-none"
          >
            <ol>
              {list.map((c, idx) => (
                <li
                  key={`${c.uf}-${c.sq}`}
                  className="border-woodsmoke-800 flex items-center gap-2 border-b py-1.5 last:border-0"
                >
                  {!filterUf && (
                    <span className="text-woodsmoke-500 w-4 shrink-0 text-[11px] tabular-nums">
                      {idx + 1}
                    </span>
                  )}
                  <Avatar name={toTitle(c.nmu)} src={photoOf(c)} />
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="text-woodsmoke-50 truncate text-[13px] font-semibold">
                      {toTitle(c.nmu)}
                    </p>
                    <p
                      className="text-[11px] font-semibold"
                      style={{ color: partyVivid(c.sg) }}
                    >
                      {c.sg} · {c.uf}
                      {c.elected && (
                        <span className="text-woodsmoke-200 ml-1.5 rounded border border-woodsmoke-700 px-1 text-[10px]">
                          eleito
                        </span>
                      )}
                    </p>
                  </div>
                  <span className="text-woodsmoke-200 shrink-0 text-xs font-bold tabular-nums">
                    {fmtInt(c.vap)}
                  </span>
                </li>
              ))}
            </ol>
          </Scrollable>
          {!filterUf && (
            <button
              type="button"
              onClick={openFull}
              className="text-woodsmoke-300 mt-1 w-full rounded-lg border border-woodsmoke-700 py-1.5 text-xs font-semibold hover:text-woodsmoke-100"
            >
              {`Ver todos os ${fmtInt(cargo.totalCandidatos)} candidatos`}
            </button>
          )}
          <p className="text-woodsmoke-500 mt-1 text-center text-[10px]">
            ou clique num estado no mapa para ver só os dele
          </p>
        </section>
          </div>
        </Scrollable>
      </div>
      <div className="xl:min-h-0">
        <OfficeMap
          data={officeData}
          legend={
            <div className="border-woodsmoke-800 bg-woodsmoke-900/80 ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl border px-3 py-2 text-[11px] font-bold tabular-nums">
              {stateTopParties.map(([sg, n]) => (
                <span key={sg} className="inline-flex items-center gap-1 text-woodsmoke-200">
                  <i
                    className="inline-block h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: partyVivid(sg) }}
                  />
                  {PARTIES[sg.trim().toUpperCase()]?.sigla ?? sg} {n}
                </span>
              ))}
              {stateOutros > 0 && (
                <span className="text-woodsmoke-400">Outros {stateOutros}</span>
              )}
              <span className="text-woodsmoke-500 font-semibold">estados</span>
            </div>
          }
          selected={filterUf}
          onSelect={setFilterUf}
          className="xl:h-full"
        />
      </div>
      <div className="xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">{senators}</div>
      {showAll && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Todos os candidatos"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setShowAll(false)}
        >
          <div
            className="border-woodsmoke-800 bg-woodsmoke-900 flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2">
              <h2 className="text-woodsmoke-50 text-sm font-bold">
                Todos os candidatos ·{' '}
                {isFederal ? 'Federal' : 'Estadual'}
              </h2>
              <button
                type="button"
                aria-label="Fechar lista"
                onClick={() => setShowAll(false)}
                className="text-woodsmoke-400 hover:text-woodsmoke-100 text-lg leading-none"
              >
                ×
              </button>
            </div>
            <input
              type="text"
              value={fullQuery}
              onChange={(e) => setFullQuery(e.target.value)}
              placeholder="Filtrar por nome, número ou UF…"
              aria-label="Filtrar candidatos por nome, número ou UF"
              className="border-woodsmoke-700 bg-woodsmoke-800 text-woodsmoke-50 placeholder:text-woodsmoke-500 mt-2 w-full shrink-0 rounded-lg border px-2.5 py-1.5 text-xs outline-none"
            />
            <Scrollable aria-label="Candidatos" className="mt-2 min-h-0 flex-1">
              {loadingFull ? (
                <p className="text-woodsmoke-400 py-6 text-center text-xs">
                  Carregando {fmtInt(cargo.totalCandidatos)} candidaturas…
                </p>
              ) : (
                <ol>
                  {fullFiltered.map((c) => (
                    <li
                      key={`${c.uf}-${c.sq}`}
                      className="border-woodsmoke-800 flex items-center gap-2 border-b py-1.5 last:border-0"
                    >
                      <Avatar name={toTitle(c.nmu)} src={photoOf(c)} />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="text-woodsmoke-50 truncate text-[13px] font-semibold">
                          {toTitle(c.nmu)}
                        </p>
                        <p
                          className="text-[11px] font-semibold"
                          style={{ color: partyVivid(c.sg) }}
                        >
                          {c.sg} {c.n} · {c.uf}
                          {c.elected && (
                            <span className="text-woodsmoke-200 ml-1.5 rounded border border-woodsmoke-700 px-1 text-[10px]">
                              eleito
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="text-woodsmoke-200 shrink-0 text-xs font-bold tabular-nums">
                        {fmtInt(c.vap)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Scrollable>
            <p className="text-woodsmoke-500 mt-1 shrink-0 text-center text-[10px]">
              mostrando {fullFiltered.length} de {fmtInt(cargo.totalCandidatos)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
