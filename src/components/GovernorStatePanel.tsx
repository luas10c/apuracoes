'use client'

import { useEffect, useState } from 'react'

import { cn } from 'tailwind-variants'

import { Scrollable } from '#/components/Scrollable'
import { UF_NAMES } from '#/components/RegionCard'
import { partyVivid } from '#/data/parties'
import type { Turno } from '#/data/election'

type StateCand = {
  id: number
  name: string
  sg: string
  party_number: string
  image_url: string
  pvap: string
  status: string
  elected: boolean
  votes: number
}

type StatePayload = {
  sections: { total: number | null; done: number | null; pct: number | null }
  general: {
    eleitores: number | null
    comparecimento: number | null
    abstencoes: number | null
    brancos: number | null
    nulos: number | null
    validos: number | null
  }
  cand: StateCand[]
}

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPctShare(vap: number, base: number | null): string {
  if (base == null || base <= 0) return '–'
  return `${((vap / base) * 100).toFixed(1).replace('.', ',')}%`
}

function fmtPct2(v: number | null): string {
  if (v == null) return '–'
  return `${v.toFixed(2).replace('.', ',')}%`
}

function fmtEleitores(v: number | null): string {
  if (v == null) return '–'
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1).replace('.', ',')} milhões de eleitores`
  }
  if (v >= 1000) return `${Math.round(v / 1000)} mil eleitores`
  return `${v.toLocaleString('pt-BR')} eleitores`
}

function fmtMil(v: number): string {
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`
  }
  if (v >= 1000) return `${Math.round(v / 1000)} mil`
  return v.toLocaleString('pt-BR')
}

function Avatar({ name, src, lg }: { name: string; src: string; lg?: boolean }) {
  const [failed, setFailed] = useState(false)
  const cls = lg ? 'h-10 w-10 text-xs' : 'h-8 w-8 text-[10px]'
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

function useStateCargo(uf: string | null, cargo: string, turno: Turno) {
  const [data, setData] = useState<StatePayload | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!uf) {
      setData(null)
      return
    }
    let alive = true
    setLoading(true)
    fetch(
      `/api/elections/state?uf=${uf.toLowerCase()}&cargo=${cargo}&turno=${turno}`,
      { cache: 'no-store' }
    )
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        if (!alive) return
        const raw = d as StatePayload
        const norm = (v: unknown) => {
          const n = Number(v)
          return Number.isFinite(n) ? n : 0
        }
        setData({
          ...raw,
          cand: (raw.cand ?? []).map((c) => ({ ...c, votes: norm(c.votes) }))
        })
        setLoading(false)
      })
      .catch(() => {
        if (!alive) return
        setData(null)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [uf, cargo, turno])
  return { data, loading }
}

function ExpandList({
  open,
  onToggle,
  total,
  label,
  children
}: {
  open: boolean
  onToggle: () => void
  total: number
  label: string
  children: React.ReactNode
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="text-woodsmoke-300 mt-1 text-xs font-semibold underline decoration-woodsmoke-600 underline-offset-2 hover:text-woodsmoke-100"
      >
        {open ? 'Mostrar menos' : `Todos os ${total} candidatos`}
      </button>
      {open && <ul className="mt-1 space-y-1.5">{children}</ul>}
    </>
  )
}

function CandRow({
  c,
  base,
  badge
}: {
  c: StateCand
  base: number | null
  badge?: string
}) {
  return (
    <li className="flex items-center gap-2 py-0.5">
      <Avatar name={toTitle(c.name)} src={c.image_url} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-woodsmoke-50 truncate text-[13px] font-semibold">
          {toTitle(c.name)}
        </p>
        <p
          className="text-[11px] font-semibold"
          style={{ color: partyVivid(c.sg) }}
        >
          {c.sg} {c.party_number}
          {badge && (
            <span className="text-woodsmoke-200 ml-1.5 rounded border border-woodsmoke-700 bg-woodsmoke-800 px-1 text-[10px]">
              {badge}
            </span>
          )}
        </p>
      </div>
      <span
        className="shrink-0 text-[13px] font-bold tabular-nums"
        style={{ color: partyVivid(c.sg) }}
      >
        {fmtPctShare(c.votes, base)}
      </span>
    </li>
  )
}

/** Painel do estado selecionado (governador + senado + presidente). */
export function GovernorStatePanel({
  uf,
  ufs,
  turno,
  onSelect,
  onClose
}: {
  uf: string
  ufs: string[]
  turno: Turno
  onSelect: (uf: string | null) => void
  onClose: () => void
}) {
  const [showAllGov, setShowAllGov] = useState(false)
  const [showAllSen, setShowAllSen] = useState(false)
  const [showAllPres, setShowAllPres] = useState(false)
  const gov = useStateCargo(uf, 'governador', turno)
  const sen = useStateCargo(uf, 'senador', turno)
  const pres = useStateCargo(uf, 'presidente', turno)

  const idx = ufs.indexOf(uf)
  const go = (dir: 1 | -1) => {
    if (ufs.length === 0) return
    onSelect(ufs[(idx + dir + ufs.length) % ufs.length])
  }

  const govList = gov.data?.cand ?? []
  const [g1, g2, g3] = govList
  const govBase = gov.data?.general.validos ?? null
  const govDone = gov.data?.sections.pct != null && gov.data.sections.pct >= 99.5
  const anulados =
    (gov.data?.general.brancos ?? 0) + (gov.data?.general.nulos ?? 0)
  const govDiff = g1 && g2 ? g1.votes - g2.votes : null
  const govRest = govList.length - 2
  const govRestPct =
    govBase && govBase > 0 && g1 && g2
      ? Math.max(0, 100 - (g1.votes / govBase) * 100 - (g2.votes / govBase) * 100)
      : null
  const govShare =
    govBase && govBase > 0 && g1 && g2 && g1.votes + g2.votes > 0
      ? (g1.votes / (g1.votes + g2.votes)) * 100
      : 50

  const senList = sen.data?.cand ?? []
  const senElected = senList.filter((c) => c.elected)

  const presList = pres.data?.cand ?? []
  const presBase = pres.data?.general.validos ?? null

  const ufName = UF_NAMES[uf] ?? uf
  const leadSg = g1?.sg ?? ''
  const loading = gov.loading || sen.loading || pres.loading

  return (
    <Scrollable aria-label={`Detalhe de ${ufName}`} className="xl:h-full">
      <div className="space-y-3">
        <section
          aria-label={ufName}
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
              style={{ backgroundColor: partyVivid(leadSg) || '#3f3f46' }}
            >
              {uf}
            </span>
            <h2 className="text-woodsmoke-50 min-w-0 flex-1 text-lg leading-tight font-bold">
              {ufName}
            </h2>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Estado anterior"
                onClick={() => go(-1)}
                className="text-woodsmoke-400 hover:text-woodsmoke-100"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label="Próximo estado"
                onClick={() => go(1)}
                className="text-woodsmoke-400 hover:text-woodsmoke-100"
              >
                ›
              </button>
              <button
                type="button"
                aria-label="Fechar painel"
                onClick={onClose}
                className="text-woodsmoke-400 hover:text-woodsmoke-100 text-lg leading-none"
              >
                ×
              </button>
            </div>
          </div>
          <p className="text-woodsmoke-400 mt-1 text-[11px] tabular-nums">
            {gov.data?.sections.pct != null
              ? `${Math.round(gov.data.sections.pct)}% das seções`
              : loading
                ? 'Carregando…'
                : '–'}
            <br />
            {fmtEleitores(gov.data?.general.eleitores ?? null)}
          </p>

          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-woodsmoke-400 text-xs">Governador</p>
            <p className="bg-woodsmoke-800 text-woodsmoke-200 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-woodsmoke-100"
              />
              {senElected.length > 0 || (g1 && govDone) || govList.some((c) => c.elected)
                ? 'Eleito'
                : '2º turno'}
            </p>
          </div>
          {g1 && g2 ? (
            <>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {[g1, g2].map((c) => (
                  <div key={c.id}>
                    <div className="flex items-center gap-2">
                      <Avatar lg name={toTitle(c.name)} src={c.image_url} />
                      <div className="min-w-0 leading-tight">
                        <p className="text-woodsmoke-50 truncate text-sm font-bold">
                          {toTitle(c.name)}
                        </p>
                        <p
                          className="text-xs font-semibold"
                          style={{ color: partyVivid(c.sg) }}
                        >
                          {c.sg} {c.party_number}
                        </p>
                      </div>
                    </div>
                    <p className="mt-1.5 leading-none tabular-nums">
                      <span
                        className="font-literata text-3xl font-normal"
                        style={{ color: partyVivid(c.sg) }}
                      >
                        {fmtPctShare(c.votes, govBase).replace('%', '')}
                      </span>
                      <span
                        className="text-lg font-bold"
                        style={{ color: partyVivid(c.sg) }}
                      >
                        %
                      </span>
                    </p>
                  </div>
                ))}
              </div>
              <div
                className="bg-woodsmoke-800 relative mt-2 flex h-1.5 overflow-visible rounded-full"
                role="img"
                aria-label={`Vantagem no ${uf}`}
              >
                <div
                  className="h-full rounded-l-full"
                  style={{
                    width: `${govShare}%`,
                    backgroundColor: partyVivid(g1.sg)
                  }}
                />
                <div
                  className="h-full flex-1 rounded-r-full"
                  style={{ backgroundColor: partyVivid(g2.sg) }}
                />
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
                  style={{ left: '50%' }}
                />
              </div>
            </>
          ) : (
            <p className="text-woodsmoke-400 mt-2 text-xs">
              {gov.loading ? 'Carregando…' : 'Sem dados.'}
            </p>
          )}
          {g3 && (
            <div className="mt-2 flex items-center gap-2">
              <Avatar name={toTitle(g3.name)} src={g3.image_url} />
              <p className="text-woodsmoke-50 min-w-0 flex-1 truncate text-[13px] font-semibold">
                {toTitle(g3.name)}
              </p>
              <p className="text-woodsmoke-400 shrink-0 text-[11px] tabular-nums">
                Votos anulados{' '}
                <strong className="text-woodsmoke-200">
                  {anulados.toLocaleString('pt-BR')}
                </strong>
              </p>
            </div>
          )}
          <dl className="mt-2 space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-woodsmoke-500">Vantagem</dt>
              <dd className="text-woodsmoke-200 font-semibold tabular-nums">
                {govDiff != null ? `${fmtMil(govDiff)} votos` : '–'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-woodsmoke-500">
                Outras {Math.max(0, govList.length - 2)} candidaturas
              </dt>
              <dd className="text-woodsmoke-400 tabular-nums">
                {govRestPct != null
                  ? `${govRestPct.toFixed(1).replace('.', ',')}%`
                  : '–'}
              </dd>
            </div>
          </dl>
          <ExpandList
            open={showAllGov}
            onToggle={() => setShowAllGov((v) => !v)}
            total={govList.length}
            label="candidatos"
          >
            {govList.map((c) => (
              <CandRow key={c.id} c={c} base={govBase} />
            ))}
          </ExpandList>
        </section>

        <section
          aria-label="Senado"
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-woodsmoke-400 text-xs">
              Senado <span className="text-woodsmoke-500">· duas vagas</span>
            </p>
            {senElected.length > 0 && (
              <p className="bg-woodsmoke-800 text-woodsmoke-200 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-woodsmoke-100"
                />
                Eleitos
              </p>
            )}
          </div>
          <ul className="mt-1.5 space-y-1.5">
            {senElected.map((c) => (
              <CandRow key={c.id} c={c} base={sen.data?.general.validos ?? null} badge="Eleito" />
            ))}
            {senElected.length === 0 && (
              <p className="text-woodsmoke-400 text-xs">
                {sen.loading ? 'Carregando…' : 'Apuração em andamento…'}
              </p>
            )}
          </ul>
          {senList.length > 0 && (
            <ExpandList
              open={showAllSen}
              onToggle={() => setShowAllSen((v) => !v)}
              total={senList.length}
              label="candidatos"
            >
              {senList.map((c) => (
                <CandRow
                  key={c.id}
                  c={c}
                  base={sen.data?.general.validos ?? null}
                  badge={c.elected ? 'Eleito' : undefined}
                />
              ))}
            </ExpandList>
          )}
        </section>

        <section
          aria-label={`Presidente no ${ufName}`}
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3"
        >
          <p className="text-woodsmoke-400 text-xs">
            Presidente no {ufName}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {presList.slice(0, 3).map((c) => (
              <CandRow
                key={c.id}
                c={c}
                base={pres.data?.general.validos ?? null}
              />
            ))}
            {presList.length === 0 && (
              <p className="text-woodsmoke-400 text-xs">
                {pres.loading ? 'Carregando…' : 'Sem dados.'}
              </p>
            )}
          </ul>
          {presList.length > 3 && (
            <ExpandList
              open={showAllPres}
              onToggle={() => setShowAllPres((v) => !v)}
              total={presList.length}
              label="candidatos"
            >
              {presList.slice(3).map((c) => (
                <CandRow
                  key={c.id}
                  c={c}
                  base={pres.data?.general.validos ?? null}
                />
              ))}
            </ExpandList>
          )}
        </section>
      </div>
    </Scrollable>
  )
}
