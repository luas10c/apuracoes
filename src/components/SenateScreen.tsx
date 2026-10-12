'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { cn } from 'tailwind-variants'

import { OfficeMap, type OfficeUfDatum } from '#/components/OfficeMap'
import { Scrollable } from '#/components/Scrollable'
import { Hemicycle } from '#/components/DeputiesScreen'
import { UF_NAMES } from '#/components/RegionCard'
import { partyBloc, partyVivid, BLOC_COLORS, PARTIES } from '#/data/parties'
import type { SenatorsSnapshot } from '#/components/LatestUpdates'

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct1(vap: number, vv: number | null | undefined): string {
  if (!vv || vv <= 0) return '–'
  return `${((vap / vv) * 100).toFixed(2).replace('.', ',')}%`
}

function displaySg(sg: string): string {
  return PARTIES[sg.trim().toUpperCase()]?.sigla ?? sg
}

function Avatar({ name, src, large }: { name: string; src: string; large?: boolean }) {
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

const BLOC_ORDER = ['esquerda', 'centro', 'direita'] as const
const BLOC_COLOR: Record<string, string> = BLOC_COLORS

/** Tela Senado: composição, mapa por UF e disputa pela 2ª vaga. */
export function SenateScreen({
  senators,
  right
}: {
  senators: SenatorsSnapshot | null
  right: ReactNode
}) {
  const [sel, setSel] = useState<string | null>(null)
  const [duelIdx, setDuelIdx] = useState(0)

  const model = useMemo(() => {
    if (!senators) return null
    const fotos = String(senators.meta.fotos)
    const ufs = Object.keys(senators.ufs).sort()
    const perUf = ufs.map((uf) => {
      const d = senators.ufs[uf]
      const elected = d.elected
      const runner = (d.top ?? []).find(
        (t) => !elected.some((e) => e.sq === t.sq)
      )
      return {
        uf,
        elected,
        runner,
        vv: d.vv ?? null,
        pst: d.sectionsPct ?? null,
        top: d.top ?? []
      }
    })
    const decided = perUf.flatMap((u) => u.elected)
    const seatCounts: Record<string, number> = {}
    for (const e of decided) {
      seatCounts[e.sg] = (seatCounts[e.sg] ?? 0) + 1
    }
    const ranking = Object.entries(seatCounts).sort((a, b) => b[1] - a[1])
    const blocCount: Record<string, number> = { esquerda: 0, centro: 0, direita: 0 }
    for (const [sg, n] of ranking) blocCount[partyBloc(sg)] += n
    const undecided = 54 - decided.length
    const duels = perUf.filter(
      (u) => u.elected.length === 1 && u.runner
    )
    return { fotos, ufs, perUf, decided, ranking, blocCount, undecided, duels }
  }, [senators])

  if (!model) {
    return (
      <p className="text-woodsmoke-400 py-8 text-center text-sm">
        Carregando senadores…
      </p>
    )
  }

  const photoOf = (uf: string, sq: string) =>
    model.fotos.replace('{uf}', uf.toLowerCase()).replace('{sqcand}', sq)

  const officeData = useMemo<Record<string, OfficeUfDatum>>(() => {
    const out: Record<string, OfficeUfDatum> = {}
    for (const u of model.perUf) {
      const [e1, e2] = u.elected
      const list = u.elected.length > 0 ? u.elected : u.top.slice(0, 2)
      out[u.uf] = {
        fill: e1 ? partyVivid(e1.sg) : undefined,
        soft: u.elected.length < 2,
        split:
          e1 && e2 && e1.sg !== e2.sg
            ? [partyVivid(e1.sg), partyVivid(e2.sg)]
            : null,
        photos: u.elected.map((e) => photoOf(u.uf, e.sq)),
        ufName: UF_NAMES[u.uf] ?? u.uf,
        sections:
          u.pst != null ? `${Math.round(u.pst)}% das seções` : 'Apuração do Senado',
        rows: list.map((c) => ({
          key: c.sq,
          name: toTitle(c.nmu),
          party: `${c.sg} ${c.n}`.trim(),
          accent: partyVivid(c.sg),
          photo: photoOf(u.uf, c.sq),
          votes: c.vap,
          pct: fmtPct1(c.vap, u.vv)
        }))
      }
    }
    return out
  }, [model, photoOf])

  const hemiSeats = [
    ...model.decided.map((e) => ({ sg: e.sg, color: partyVivid(e.sg) })),
    ...Array.from({ length: model.undecided }, () => ({
      sg: 'A definir',
      color: '#3f3f46'
    }))
  ]
  const topSeats = model.ranking.slice(0, 4)
  const outrosSeats =
    model.ranking.slice(4).reduce((s, [, v]) => s + v, 0) + model.undecided
  const duelCount = model.duels.length
  const goDuel = (dir: 1 | -1) => {
    if (duelCount === 0) return
    const next =
      (Math.min(duelIdx, Math.max(0, duelCount - 1)) + dir + duelCount) %
      duelCount
    setDuelIdx(next)
    setSel(model.duels[next].uf)
  }

  const legend = (
    <div className="border-woodsmoke-700 bg-woodsmoke-900/90 ml-auto rounded-lg border px-2.5 py-1.5 shadow-xl backdrop-blur">
      <p className="flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap text-white tabular-nums">
        {topSeats.map(([sg, n]) => (
          <span key={sg} className="inline-flex items-center gap-1">
            <i
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{ backgroundColor: partyVivid(sg) }}
            />
            {displaySg(sg)} {n}
          </span>
        ))}
        <span className="text-woodsmoke-400">Outros {outrosSeats} vagas</span>
        <span className="text-woodsmoke-500 font-semibold">
          claro: apurando · forte: eleitos
        </span>
      </p>
    </div>
  )

  return (
    <div className="grid flex-1 items-start gap-3 xl:min-h-0 xl:grid-cols-[300px_minmax(0,1fr)_300px] xl:items-stretch">
      <div className="xl:min-h-0 xl:overflow-hidden">
        <Scrollable aria-label="Senado" className="xl:h-full">
          <div className="space-y-3">
            <section
              aria-label="Senado"
              className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-woodsmoke-50 text-sm font-bold">Senado</h2>
                <p className="text-woodsmoke-400 text-[11px]">
                  Duas vagas por estado
                </p>
              </div>
              <p className="mt-2 flex items-baseline justify-between text-xs tabular-nums">
                <span className="text-woodsmoke-400">
                  Esquerda{' '}
                  <strong className="text-woodsmoke-50 text-sm">
                    {model.blocCount.esquerda}
                  </strong>
                </span>
                <span className="text-woodsmoke-400">
                  Centrão{' '}
                  <strong className="text-woodsmoke-50 text-sm">
                    {model.blocCount.centro}
                  </strong>
                </span>
                <span className="text-woodsmoke-400">
                  <strong className="text-woodsmoke-50 text-sm">
                    {model.blocCount.direita}
                  </strong>{' '}
                  Direita
                </span>
              </p>
              <div
                className="relative mt-1 flex h-1.5 overflow-visible rounded-full"
                role="img"
                aria-label={`Esquerda ${model.blocCount.esquerda}, Centrão ${model.blocCount.centro}, Direita ${model.blocCount.direita}`}
              >
                {BLOC_ORDER.map((b) => (
                  <div
                    key={b}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(model.blocCount[b] / 54) * 100}%`,
                      backgroundColor: BLOC_COLOR[b]
                    }}
                  />
                ))}
                {model.undecided > 0 && (
                  <div
                    className="bg-woodsmoke-800 h-full flex-1 rounded-r-full"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                  style={{ left: `${(41 / 81) * 100}%` }}
                />
              </div>
              <p className="text-woodsmoke-500 mt-1 text-center text-[10px]">
                maioria 41 · Centrão:{' '}
                {model.ranking
                  .filter(([sg]) => partyBloc(sg) === 'centro')
                  .slice(0, 5)
                  .map(([sg]) => PARTIES[sg.trim().toUpperCase()]?.nome ?? sg)
                  .join(', ')}
              </p>
              <div className="relative mt-1">
                <Hemicycle seats={hemiSeats} />
                <p className="pointer-events-none absolute inset-x-0 bottom-1 text-center leading-none tabular-nums">
                  <span className="text-woodsmoke-50 block text-2xl font-bold">
                    {model.decided.length}
                  </span>
                  <span className="text-woodsmoke-400 text-[10px]">
                    de 54 definidas
                  </span>
                </p>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-semibold tabular-nums">
                {model.ranking.slice(0, 5).map(([sg, n]) => (
                  <span
                    key={sg}
                    className="inline-flex items-center gap-1 text-woodsmoke-200"
                  >
                    <i
                      className="inline-block h-2 w-2 rounded-[2px]"
                      style={{ backgroundColor: partyVivid(sg) }}
                    />
                    {displaySg(sg)} {n}
                  </span>
                ))}
                <span className="text-woodsmoke-400">
                  Outros {model.ranking.slice(5).reduce((s, [, v]) => s + v, 0)}
                </span>
                <span className="text-woodsmoke-500">
                  ◇ Em disputa {model.undecided}
                </span>
              </p>
            </section>
            <section
              aria-label="Vagas por estado"
              className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
            >
              <p className="text-woodsmoke-50 text-xs font-bold">
                {model.perUf.filter((u) => u.elected.length === 2).length} com
                as duas vagas
              </p>
              <ul className="mt-2 grid grid-cols-9 gap-1">
                {model.perUf.map((u) => {
                  const [e1, e2] = u.elected
                  const c1 = e1 ? partyVivid(e1.sg) : '#27272a'
                  const c2 = e2 && e2.sg !== e1?.sg ? partyVivid(e2.sg) : c1
                  return (
                    <li key={u.uf}>
                      <button
                        type="button"
                        title={`${u.uf} · ${UF_NAMES[u.uf] ?? u.uf}`}
                        onClick={() => setSel(sel === u.uf ? null : u.uf)}
                        className={cn(
                          'flex w-full items-center justify-center rounded py-1 text-[10px] font-bold text-white',
                          sel === u.uf && 'ring-2 ring-white'
                        )}
                        style={{
                          background: `linear-gradient(135deg, ${c1} 50%, ${c2} 50%)`
                        }}
                      >
                        {u.uf}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
            {duelCount > 0 && (
              <section
                aria-label="Disputa pela segunda vaga"
                className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-woodsmoke-50 text-xs font-bold">
                    A disputa pela 2ª vaga
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Anterior"
                      disabled={duelCount === 0}
                      onClick={() => goDuel(-1)}
                      className="text-woodsmoke-400 hover:text-woodsmoke-100 disabled:opacity-30"
                    >
                      ‹
                    </button>
                    <span className="text-woodsmoke-400 text-[11px] tabular-nums">
                      {duelCount === 0 ? '0/0' : `${Math.min(duelIdx, Math.max(0, duelCount - 1)) + 1}/${duelCount}`}
                    </span>
                    <button
                      type="button"
                      aria-label="Próxima"
                      disabled={duelCount === 0}
                      onClick={() => goDuel(1)}
                      className="text-woodsmoke-400 hover:text-woodsmoke-100 disabled:opacity-30"
                    >
                      ›
                    </button>
                  </div>
                </div>
                <ul className="mt-2 space-y-2">
                  {model.duels.map((d) => (
                    <li key={d.uf} className="space-y-2">
                      {[
                        { c: d.elected[0], badge: 'eleito' as const },
                        { c: d.runner!, badge: null }
                      ].map(({ c, badge }) => (
                    <div key={c.sq} className="flex items-center gap-2">
                      <span
                        className="flex w-8 shrink-0 items-center justify-center rounded py-1 text-[10px] font-bold text-white"
                        style={{
                          backgroundColor: partyVivid(
                            d.elected[0]?.sg ?? c.sg
                          )
                        }}
                      >
                        {d.uf}
                      </span>
                      <Avatar
                        name={toTitle(c.nmu)}
                        src={photoOf(d.uf, c.sq)}
                      />
                      <div className="min-w-0 flex-1 leading-tight">
                        <p className="text-woodsmoke-50 truncate text-[13px] font-semibold">
                          {toTitle(c.nmu)}
                        </p>
                        {badge && (
                          <p className="text-woodsmoke-500 text-[10px]">
                            {badge}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-xs font-bold tabular-nums"
                        style={{ color: partyVivid(c.sg) }}
                      >
                        {fmtPct1(c.vap, d.vv)}
                      </span>
                    </div>
                  ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Scrollable>
      </div>
      <div className="xl:min-h-0">
        <OfficeMap
          data={officeData}
          legend={legend}
          selected={sel}
          onSelect={setSel}
          className="xl:h-full"
        />
      </div>
      <div className="xl:flex xl:min-h-0 xl:flex-col xl:overflow-hidden">
        {right}
      </div>
    </div>
  )
}
