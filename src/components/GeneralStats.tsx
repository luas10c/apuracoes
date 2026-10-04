'use client'

import { useEffect, useState } from 'react'

type General = {
  eleitores: number | null
  comparecimento: number | null
  abstencoes: number | null
  brancos: number | null
  nulos: number | null
  validos: number | null
} | null

const fmt = (n: number | null) => (n == null ? '0' : n.toLocaleString('pt-BR'))

export function GeneralStats() {
  const [general, setGeneral] = useState<General>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/elections/results')
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) setGeneral(d.general ?? null)
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

  const zeros = {
    eleitores: 0,
    comparecimento: 0,
    abstencoes: 0,
    brancos: 0,
    nulos: 0,
    validos: 0
  }
  const g = general ?? zeros

  const pct = (part: number | null, whole: number | null) => {
    if (part == null || whole == null || whole === 0) return '0,00%'
    return (
      (part / whole).toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + '%'
    )
  }

  return (
    <div className="space-y-4 py-4">
      <h2 className="text-woodsmoke-400 text-xs font-semibold uppercase">
        Dados gerais
      </h2>
      <div className="bg-woodsmoke-700 grid grid-cols-2 gap-0.5 md:grid-cols-3">
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Eleitores aptos
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.eleitores)}
          </p>
        </div>
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Comparecimento
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.comparecimento)}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {pct(g.comparecimento, g.eleitores)} do eleitorado
          </p>
        </div>
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Votos válidos
          </p>
          <p className="text-primary mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.validos)}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {pct(g.validos, g.comparecimento)} do comparecimento
          </p>
        </div>
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Brancos
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.brancos)}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {pct(g.brancos, g.comparecimento)}
          </p>
        </div>
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Nulos
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.nulos)}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {pct(g.nulos, g.comparecimento)}
          </p>
        </div>
        <div className="bg-woodsmoke-800 p-3">
          <p className="text-muted-foreground text-[11px] tracking-wide uppercase">
            Abstenções
          </p>
          <p className="text-foreground mt-0.5 text-sm font-semibold tabular-nums">
            {fmt(g.abstencoes)}
          </p>
          <p className="text-muted-foreground text-[11px] tabular-nums">
            {pct(g.abstencoes, g.eleitores)} do eleitorado
          </p>
        </div>
      </div>
    </div>
  )
}
