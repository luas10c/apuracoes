'use client'

import { useEffect, useState } from 'react'

import { cn } from 'tailwind-variants'

import type { ExteriorSnapshot, TseCandidate } from '#/components/Map'
import { partyColor } from '#/data/parties'
import type { Turno } from '#/data/election'

function toTitle(name: string): string {
  return name
    .toLowerCase()
    .replace(/(?:^|\s|-|')(.)/g, (m) => m.toUpperCase())
}

function fmtPct1(vap: number, vv: number | null): string {
  if (!vv || vv <= 0) return '–'
  return `${((vap / vv) * 100).toFixed(1).replace('.', ',')}%`
}

function fmtEleitores(v: number | null): string {
  if (v == null) return '–'
  if (v >= 1_000_000) {
    return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi eleitores`
  }
  return `${Math.round(v / 1000)} mil eleitores`
}

type PastRow = { name: string; sg: string; pct: number }

let pastRowsPromise: Promise<PastRow[]> | null = null

/** 2022 agregado do exterior por partido (PL 22 × PT 13). */
function loadPastRows(): Promise<PastRow[]> {
  if (!pastRowsPromise) {
    pastRowsPromise = fetch('/maps/ele2022-1t-presidente-top2.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d) => {
        const ext = (d as { exterior?: Record<string, { top: { nmu: string; sg: string; n: string; vap: number }[]; vv: number }> })?.exterior ?? {}
        const sums = new Map<string, { nmu: string; sg: string; vap: number }>()
        let vv = 0
        for (const entry of Object.values(ext)) {
          vv += entry.vv ?? 0
          for (const p of entry.top) {
            if (p.n !== '22' && p.n !== '13') continue
            const s = sums.get(p.n) ?? { nmu: p.nmu, sg: p.sg, vap: 0 }
            s.vap += p.vap
            sums.set(p.n, s)
          }
        }
        if (vv <= 0) return []
        return [...sums.values()]
          .sort((a, b) => b.vap - a.vap)
          .map((s) => ({
            name: toTitle(s.nmu).split(' ').slice(-1)[0],
            sg: s.sg,
            pct: Math.round((s.vap / vv) * 1000) / 10
          }))
      })
      .catch(() => [] as PastRow[])
  }
  return pastRowsPromise
}

/** Card "Exterior": agregado, ranking e 2022 do voto fora do Brasil. */
export function ExteriorSummaryCard({
  exterior,
  turno = 1,
  onClose,
  className
}: {
  exterior: ExteriorSnapshot | null
  turno?: Turno
  onClose?: () => void
  className?: string
}) {
  const [past, setPast] = useState<PastRow[]>([])
  useEffect(() => {
    // Comparativo 2022 existe só para o 1º turno (fase 2 cobre o 2T).
    if (turno !== 1) return
    let alive = true
    loadPastRows().then((rows) => {
      if (alive) setPast(rows)
    })
    return () => {
      alive = false
    }
  }, [turno])

  if (!exterior) {
    return (
      <p className="text-woodsmoke-400 py-8 text-center text-sm">
        Carregando exterior…
      </p>
    )
  }
  const total = exterior.total
  const top: TseCandidate[] = total.top.slice(0, 3)
  const done = (total.pst ?? 0) >= 100

  return (
    <section
      aria-label="Voto no exterior"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border p-3',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="border-woodsmoke-700 bg-woodsmoke-800 text-woodsmoke-200 flex h-10 w-10 items-center justify-center rounded-full border text-lg"
          >
            🌐
          </span>
          <div className="leading-tight">
            <h2 className="text-woodsmoke-50 text-lg font-bold">Exterior</h2>
            <p className="text-woodsmoke-400 text-[11px] tabular-nums">
              {total.pst != null ? `${Math.round(total.pst)}% das seções` : '–'} ·{' '}
              {fmtEleitores(total.te)}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            aria-label="Fechar painel do exterior"
            onClick={onClose}
            className="text-woodsmoke-400 hover:text-woodsmoke-100 text-lg leading-none"
          >
            ×
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-woodsmoke-400 text-xs">Presidente no exterior</p>
        <p
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
            done
              ? 'bg-woodsmoke-800 text-woodsmoke-200'
              : 'bg-amber-500/15 text-amber-400'
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-1.5 w-1.5 rounded-full',
              done ? 'bg-woodsmoke-100' : 'bg-amber-400'
            )}
          />
          {done ? 'Apurado' : 'Apurando'}
        </p>
      </div>
      <ul className="mt-1 divide-y divide-woodsmoke-800">
        {top.map((c) => (
          <li key={c.sq} className="flex items-center gap-2.5 py-2">
            <CandidatePhoto
              name={toTitle(c.nmu)}
              src={exterior.meta.fotos.replace('{sqcand}', c.sq)}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-woodsmoke-50 truncate text-sm font-bold">
                {toTitle(c.nmu)}
              </p>
              <p
                className="text-[11px] font-semibold"
                style={{ color: partyColor(c.sg) }}
              >
                {c.sg} {c.n}
              </p>
            </div>
            <span
              className="text-sm font-bold tabular-nums"
              style={{ color: partyColor(c.sg) }}
            >
              {fmtPct1(c.vap, total.vv)}
            </span>
          </li>
        ))}
      </ul>
      {turno === 1 && past.length > 0 && (
        <p className="text-woodsmoke-400 mt-1 flex items-center gap-2 text-[11px] tabular-nums">
          <span className="font-semibold">2022</span>
          {past.map((p) => (
            <span key={p.sg} className="inline-flex items-center gap-1">
              <i
                className="inline-block h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: partyColor(p.sg) }}
              />
              {p.name} {p.pct.toFixed(1).replace('.', ',')}%
            </span>
          ))}
        </p>
      )}
    </section>
  )
}

function CandidatePhoto({ name, src }: { name: string; src: string }) {
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
