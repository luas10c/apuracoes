'use client'

import { useEffect, useState } from 'react'

type Sections = { total: number | null; done: number | null; pct: number | null } | null

export function TotalizationProgress() {
  const [sections, setSections] = useState<Sections>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/elections/results')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setSections(d.sections ?? null)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  const pct = sections?.pct ?? 0
  const done = sections?.done ?? 0
  const total = sections?.total ?? 0

  return (
    <>
      <p className="text-muted-foreground text-muted-ftext-[11px] tracippepcasp">
        Eleições Gerais 2026 · 1º turno · Brasil
      </p>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-primary text-2xl font-bold tabular-nums md:text-3xl">
            {pct.toLocaleString('pt-BR', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
            %
          </p>
          <p className="text-muted-foreground text-xs">
            das seções totalizadas
          </p>
        </div>
        <p className="text-muted-foreground text-right text-xs tabular-nums">
          {done.toLocaleString('pt-BR')} de {total.toLocaleString('pt-BR')}{' '}
          seções
        </p>
      </div>
      <div className="bg-woodsmoke-800 mt-2 h-1 w-full">
        <div
          className="bg-royal-purple-500 h-full"
          style={{ width: `${Math.min(100, pct)}%` }}
        ></div>
      </div>
    </>
  )
}
