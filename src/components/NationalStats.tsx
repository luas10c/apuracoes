'use client'

import { cn } from 'tailwind-variants'

export type NationalStatsData = {
  validos: number | null
  brancos: number | null
  nulos: number | null
  abstencoes: number | null
  /** Base do % de abstenções (eleitores aptos). */
  eleitores?: number | null
}

function fmtInt(v: number | null): string {
  if (v == null) return '–'
  return v.toLocaleString('pt-BR')
}

function fmtPct(part: number | null, total: number | null | undefined): string {
  if (part == null || total == null || total <= 0) return '–'
  return `${((part / total) * 100).toFixed(1).replace('.', ',')}%`
}

/**
 * Faixa nacional da apuração: válidos, brancos, nulos e abstenções.
 * Sem estado próprio — recebe os números do snapshot ativo
 * (Brasil → `nacional`, Exterior → `total`) e anuncia atualizações
 * do polling via `aria-live`.
 */
export function NationalStats({
  data,
  className
}: {
  data: NationalStatsData | null
  className?: string
}) {
  if (!data) return null

  const apurados =
    (data.validos ?? 0) + (data.brancos ?? 0) + (data.nulos ?? 0)

  const cards = [
    { label: 'Votos válidos', value: data.validos, pct: fmtPct(data.validos, apurados > 0 ? apurados : null) },
    { label: 'Brancos', value: data.brancos, pct: fmtPct(data.brancos, apurados > 0 ? apurados : null) },
    { label: 'Nulos', value: data.nulos, pct: fmtPct(data.nulos, apurados > 0 ? apurados : null) },
    { label: 'Abstenções', value: data.abstencoes, pct: fmtPct(data.abstencoes, data.eleitores) }
  ]

  return (
    <section
      aria-live="polite"
      aria-label="Totais nacionais da apuração"
      className={cn('grid grid-cols-2 gap-2 sm:grid-cols-4', className)}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="border-woodsmoke-800 bg-woodsmoke-900/80 rounded-xl border px-3 py-2"
        >
          <p className="text-woodsmoke-400 text-[11px] font-semibold tracking-wide uppercase">
            {c.label}
          </p>
          <p className="text-woodsmoke-50 text-lg leading-tight font-bold tabular-nums">
            {fmtInt(c.value)}{' '}
            <span className="text-woodsmoke-400 text-xs font-semibold">
              {c.pct}
            </span>
          </p>
        </div>
      ))}
    </section>
  )
}
