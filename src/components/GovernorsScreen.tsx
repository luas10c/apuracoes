'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from 'tailwind-variants'

import { OfficeMap, type OfficeUfDatum } from '#/components/OfficeMap'
import { GovernorStatePanel } from '#/components/GovernorStatePanel'
import type { MunicipalChoropleth } from '#/components/Map'
import { Scrollable } from '#/components/Scrollable'
import { UF_NAMES } from '#/components/RegionCard'
import { partyVivid } from '#/data/parties'
import type { Turno } from '#/data/election'

export type GovernorCandidate = {
  sq: string
  nmu: string
  sg: string
  n: string
  vap: number
}

export type GovernorsSnapshot = {
  meta: { fotos: string; atualizadoEm: string }
  ufs: Record<
    string,
    {
      elected: GovernorCandidate[]
      top: GovernorCandidate[]
      vv: number | null
      vb: number | null
      vn: number | null
      te: number | null
      abst: number | null
      hg: string | null
      sectionsPct: number | null
      decidido1T?: boolean
    }
  >
}

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct(vap: number, vv: number | null): string {
  if (!vv || vv <= 0) return '–'
  return `${((vap / vv) * 100).toFixed(1).replace('.', ',')}%`
}

function Avatar({ name, src }: { name: string; src: string }) {
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
        className="bg-woodsmoke-700 text-woodsmoke-200 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
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
      className="bg-woodsmoke-700 h-8 w-8 shrink-0 rounded-full object-cover"
    />
  )
}

/** Tela Governadores: mapa por UF + disputas (pleito 6259, cargo 0003). */
export function GovernorsScreen({
  data,
  loading,
  turno = 1,
  right
}: {
  data: GovernorsSnapshot | null
  loading: boolean
  turno?: Turno
  right: ReactNode
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [munData, setMunData] = useState<MunicipalChoropleth | null>(null)
  const [munLoading, setMunLoading] = useState(false)

  // Municípios do estado selecionado (cor por líder + popover no hover).
  useEffect(() => {
    if (!sel) {
      setMunData(null)
      return
    }
    let alive = true
    setMunLoading(true)
    fetch(`/api/elections/governor-municipalities?uf=${sel.toLowerCase()}&turno=${turno}`, {
      cache: 'no-store'
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!alive) return
        setMunData({
          uf: sel,
          fotos: String(d?.meta?.fotos ?? ''),
          candidatos: d?.candidatos ?? {},
          cidades: d?.cidades ?? {}
        })
        setMunLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setMunData(null)
        setMunLoading(false)
      })
    return () => {
      alive = false
    }
  }, [sel, turno])

  // Clique em município não troca a seleção (só hover com popover).
  const handleSelect = (s: string | null) => {
    if (!s) {
      setSel(null)
      return
    }
    if (data && s in data.ufs) setSel(s)
  }

  if (!data) {
    return (
      <p className="text-woodsmoke-400 py-8 text-center text-sm">
        {loading ? 'Carregando governadores…' : 'TSE indisponível no momento.'}
      </p>
    )
  }
  const fotos: string = data.meta.fotos
  const photoOf = (uf: string, sq: string) =>
    fotos.replace('{uf}', uf.toLowerCase()).replace('{sqcand}', sq)
  const pctOf = (vap: number, vv: number | null) =>
    vv && vv > 0 ? (vap / vv) * 100 : null
  const fmtPct2 = (v: number | null) =>
    v == null ? '–' : `${v.toFixed(2).replace('.', ',')}%`

  const ufs = Object.keys(data.ufs).sort()
  const decided = ufs.filter((uf) => data.ufs[uf].elected.length > 0)
  const decided1T = ufs.filter((uf) => data.ufs[uf].decidido1T)
  // No 2T, estados decididos no 1T saem da disputa (só contextualizam).
  const inPlay =
    turno === 2 ? ufs.filter((uf) => !data.ufs[uf].decidido1T) : ufs
  const runoff = inPlay.filter((uf) => data.ufs[uf].elected.length === 0)

  const officeData: Record<string, OfficeUfDatum> = {}
  const ledWins: Record<string, number> = {}
  for (const uf of ufs) {
    const g = data.ufs[uf]
    const lead = g.elected[0] ?? g.top[0]
    if (lead) ledWins[lead.sg] = (ledWins[lead.sg] ?? 0) + 1
    const p1 = g.top[0] ? pctOf(g.top[0].vap, g.vv) : null
    const runoff = g.elected.length === 0 && !g.decidido1T
    const photoCands = runoff ? g.top.slice(0, 2) : lead ? [lead] : []
    const [t1, t2] = g.top
    officeData[uf] = {
      fill: lead ? partyVivid(lead.sg) : undefined,
      split:
        runoff && t1 && t2 && t1.sg !== t2.sg
          ? [partyVivid(t1.sg), partyVivid(t2.sg)]
          : null,
      photos: photoCands.map((c) => photoOf(uf, c.sq)),
      sublabel: p1 != null ? `${Math.round(p1)}%` : undefined,
      ufName: UF_NAMES[uf] ?? uf,
      sections:
        g.sectionsPct != null
          ? `${Math.round(g.sectionsPct)}% das seções`
          : 'Apuração',
      totals: {
        validVotes: g.vv,
        brancos: g.vb,
        nulos: g.vn,
        abstencoes: g.abst
      },
      rows: g.top.slice(0, 2).map((c) => ({
        key: c.sq,
        name: toTitle(c.nmu),
        party: `${c.sg} ${c.n}`.trim(),
        accent: partyVivid(c.sg),
        photo: photoOf(uf, c.sq),
        votes: c.vap,
        pct: fmtPct2(pctOf(c.vap, g.vv))
      }))
    }
  }
  const ledRanking = Object.entries(ledWins).sort((a, b) => b[1] - a[1])
  const ledTop = ledRanking.slice(0, 4)
  const ledOutros = ledRanking.slice(4).reduce((s, [, v]) => s + v, 0)

  const duels = inPlay
    .map((uf) => {
      const g = data.ufs[uf]
      const [a, b] = g.top
      if (!a) return null
      const pa = pctOf(a.vap, g.vv)
      const pb = b ? pctOf(b.vap, g.vv) : null
      return {
        uf,
        a,
        b: b ?? null,
        pa,
        pb,
        margin: pa != null && pb != null ? pa - pb : pa ?? 999,
        decided: g.elected.length > 0
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((x, y) => x.margin - y.margin)
  const PER_PAGE = 7
  const pages = Math.max(1, Math.ceil(duels.length / PER_PAGE))
  const safePage = Math.min(page, pages - 1)
  const visibleDuels = duels.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE
  )

  const legend = (
    <div className="border-woodsmoke-700 bg-woodsmoke-900/90 ml-auto rounded-lg border px-2.5 py-1.5 shadow-xl backdrop-blur">
      <p className="flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap text-white tabular-nums">
        {ledTop.map(([sg, n]) => (
          <span key={sg} className="inline-flex items-center gap-1">
            <i
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: partyVivid(sg) }}
            />
            {sg} {n}
          </span>
        ))}
        {ledOutros > 0 && (
          <span className="text-woodsmoke-400">Outros {ledOutros}</span>
        )}
        <span className="text-woodsmoke-500 font-semibold">estados</span>
      </p>
    </div>
  )

  return (
    <div className="grid flex-1 items-start gap-3 xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-stretch">
      <div className="xl:min-h-0 xl:overflow-hidden">
        <Scrollable
          aria-label="Governadores"
          className="xl:h-full"
        >
          <div className="space-y-3">
            <section
              aria-label="Governadores"
              className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-woodsmoke-50 text-sm font-bold">
                  Governadores
                </h2>
                <p className="text-woodsmoke-400 text-[11px] tabular-nums">
                  {ufs.length} disputas
                </p>
              </div>
              <p className="mt-1.5 text-sm tabular-nums">
                <strong className="text-woodsmoke-50 text-xl">
                  {decided.length}
                </strong>{' '}
                <span className="text-woodsmoke-400 text-xs">eleitos · </span>
                <strong className="text-woodsmoke-50 text-xl">
                  {turno === 2 ? decided1T.length : runoff.length}
                </strong>{' '}
                <span className="text-woodsmoke-400 text-xs">
                  {turno === 2 ? 'decididos no 1º' : 'no 2º turno'}
                </span>
              </p>
              <ul className="mt-2 grid grid-cols-9 gap-1">
                {ufs.map((uf) => {
                  const lead =
                    data.ufs[uf].elected[0] ?? data.ufs[uf].top[0]
                  const old = turno === 2 && data.ufs[uf].decidido1T
                  return (
                    <li key={uf}>
                      <button
                        type="button"
                        title={`${uf} · ${UF_NAMES[uf] ?? uf}${old ? ' · Decidido no 1º turno' : ''}`}
                        onClick={() => {
                          setSel(sel === uf ? null : uf)
                        }}
                        className={cn(
                          'flex w-full items-center justify-center rounded py-1 text-[10px] font-bold text-white',
                          sel === uf && 'ring-2 ring-white',
                          old && 'opacity-50'
                        )}
                        style={{
                          backgroundColor: lead
                            ? partyVivid(lead.sg)
                            : '#27272a'
                        }}
                      >
                        {uf}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
            <section
              aria-label="Disputas mais apertadas"
              className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-woodsmoke-50 text-xs font-bold">
                  Disputas, das mais apertadas
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Anterior"
                    disabled={safePage <= 0}
                    onClick={() => setPage((v) => Math.max(0, v - 1))}
                    className="text-woodsmoke-400 hover:text-woodsmoke-100 disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <span className="text-woodsmoke-400 text-[11px] tabular-nums">
                    {safePage + 1}/{pages}
                  </span>
                  <button
                    type="button"
                    aria-label="Próxima"
                    disabled={safePage >= pages - 1}
                    onClick={() =>
                      setPage((v) => Math.min(pages - 1, v + 1))
                    }
                    className="text-woodsmoke-400 hover:text-woodsmoke-100 disabled:opacity-30"
                  >
                    ›
                  </button>
                </div>
              </div>
              <ul className="mt-2 space-y-3">
                {visibleDuels.map((d) => (
                  <li key={d.uf}>
                    {[
                      { c: d.a, second: false },
                      ...(d.b ? [{ c: d.b, second: true }] : [])
                    ].map(({ c, second }) => (
                      <div
                        key={c.sq}
                        className="flex items-center gap-2 py-0.5"
                      >
                        {!second ? (
                          <span
                            className="flex w-8 shrink-0 items-center justify-center rounded py-1 text-[10px] font-bold text-white"
                            style={{
                              backgroundColor: partyVivid(c.sg)
                            }}
                          >
                            {d.uf}
                          </span>
                        ) : (
                          <span className="text-woodsmoke-500 w-8 shrink-0 text-center text-[10px]">
                            {d.decided ? 'eleito' : '2º turno'}
                          </span>
                        )}
                        <Avatar name={toTitle(c.nmu)} src={photoOf(d.uf, c.sq)} />
                        <p className="text-woodsmoke-50 min-w-0 flex-1 truncate text-[13px] font-semibold">
                          {toTitle(c.nmu)}
                        </p>
                        <span
                          className="text-[13px] font-bold tabular-nums"
                          style={{ color: partyVivid(c.sg) }}
                        >
                          {fmtPct2(second ? d.pb : d.pa)}
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </Scrollable>
      </div>
      <div className="relative xl:min-h-0">
        <OfficeMap
          data={officeData}
          legend={legend}
          selected={sel}
          onSelect={handleSelect}
          municipalData={sel ? munData : null}
          className="xl:h-full"
        />
        {munLoading && sel && (
          <p className="text-woodsmoke-400 pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/55 px-2.5 py-1 text-xs whitespace-nowrap">
            Carregando municípios…
          </p>
        )}
      </div>
      <div className="xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        {sel ? (
          <GovernorStatePanel
            key={sel}
            uf={sel}
            ufs={ufs}
            turno={turno}
            onSelect={setSel}
            onClose={() => setSel(null)}
          />
        ) : (
          right
        )}
      </div>
    </div>
  )
}
